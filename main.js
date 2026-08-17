const { Plugin, PluginSettingTab, Setting } = require("obsidian");

const DEFAULTS = {
    innerFontSize: "11px",
    innerFontWeight: "600",

    externalFontSize: "10px",
    externalFontWeight: "500",
    externalColor: "var(--text-normal)",

    externalGap: 12,
    externalMinRadiusRatio: 0.52,

    hideBelowPercent: 1,

    showPercentages: false,

    legendFontSize: "9px",

    rescanDelay: 80,
};

class TrackerPieCustomizer extends Plugin {
    async onload() {
        const saved = await this.loadData();

        this.settings = {
            ...DEFAULTS,
            ...saved,
        };

        this.observer = new MutationObserver(() => {
            this.scheduleScan();
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        this.scanTimer = null;

        this.addSettingTab(
            new TrackerPieCustomizerSettingTab(
                this.app,
                this
            )
        );

        this.scheduleScan();
    }

    onunload() {
        if (this.observer) {
            this.observer.disconnect();
        }

        if (this.scanTimer) {
            clearTimeout(this.scanTimer);
        }

        this.restoreStyles();
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.scheduleScan();
    }

    scheduleScan() {
        if (this.scanTimer) {
            clearTimeout(this.scanTimer);
        }

        this.scanTimer = setTimeout(
            () => this.scan(),
            this.settings.rescanDelay
        );
    }

    scan() {
        const labels = Array.from(
            document.querySelectorAll(
                "svg .tracker-pie-label"
            )
        );

        const bySvg = new Map();

        for (const label of labels) {
            const svg = label.closest("svg");

            if (!svg) {
                continue;
            }

            if (!bySvg.has(svg)) {
                bySvg.set(svg, []);
            }

            bySvg.get(svg).push(label);
        }

        for (const [svg, svgLabels] of bySvg) {
            this.customizePie(svg, svgLabels);
        }
    }

    customizePie(svg, labels) {
        const vb = svg.viewBox?.baseVal;

        const width =
            vb?.width ||
            parseFloat(svg.getAttribute("width")) ||
            svg.clientWidth;

        const height =
            vb?.height ||
            parseFloat(svg.getAttribute("height")) ||
            svg.clientHeight;

        if (!width || !height) {
            return;
        }

        /*
         * Получаем сектора в исходном порядке Tracker.
         */
        const sectors = Array.from(
            svg.querySelectorAll("g.sector")
        );

        const percentages = sectors.map(
            sector => {
                const path =
                    sector.querySelector("path");

                if (!path) {
                    return 0;
                }

                return this.getSectorPercentage(
                    path
                );
            }
        );

        /*
         * Получаем стрелочки.
         *
         * Порядок polyline.tracker-axis соответствует
         * порядку секторов.
         */
        const axes = Array.from(
            svg.querySelectorAll(
                "polyline.tracker-axis"
            )
        );

        /*
         * Очень важно:
         *
         * Tracker и наш плагин оба могут менять transform
         * внешних подписей.
         *
         * Поэтому перед каждой обработкой возвращаем
         * подписи в их исходные позиции Tracker.
         *
         * Это предотвращает накопление смещений после
         * переключения настроек.
         */
        this.restoreOriginalLabelPositions(
            labels
        );

        const radius =
            Math.min(width, height) / 2;

        const externalThreshold =
            radius *
            this.settings.externalMinRadiusRatio;

        const inner = [];
        const external = [];

        /*
         * Первые label Tracker обычно находятся внутри
         * диаграммы.
         *
         * Внешние label определяем по расстоянию от центра.
         *
         * При этом индекс внешнего label НЕ используем
         * как индекс сектора.
         *
         * Для внешних label сектор определяется отдельно
         * через соответствующую стрелочку.
         */
        for (const label of labels) {
            const pos =
                this.getTranslate(label);

            if (!pos) {
                continue;
            }

            const distance =
                Math.hypot(
                    pos.x,
                    pos.y
                );

            const isExternal =
                distance >=
                externalThreshold;

            if (isExternal) {
                external.push({
                    el: label,
                    x: pos.x,
                    y: pos.y,
                    sectorIndex:
                        this.findExternalSectorIndex(
                            label,
                            axes
                        ),
                    percent: 0,
                });
            } else {
                /*
                 * Внутренние label всё ещё соответствуют
                 * секторам по порядку.
                 *
                 * Но вместо общего индекса всех text
                 * используем только внутренние label.
                 */
                inner.push({
                    el: label,
                    x: pos.x,
                    y: pos.y,
                    percent: 0,
                    sectorIndex:
                        inner.length,
                });
            }
        }

        /*
         * Заполняем проценты внутренних label.
         */
        for (const item of inner) {
            item.percent =
                percentages[
                    item.sectorIndex
                ] ?? 0;
        }

        /*
         * Заполняем проценты внешних label.
         */
        for (const item of external) {
            item.percent =
                percentages[
                    item.sectorIndex
                ] ?? 0;
        }

        /*
         * Внутренние label.
         */
        for (const item of inner) {
            if (
                item.percent <
                this.settings.hideBelowPercent
            ) {
                this.hideLabel(item.el);
                continue;
            }

            this.showLabel(item.el);

            const textColor =
                this.getContrastingTextColor(
                    item.el
                );

            this.applyStyle(item.el, {
                fontSize:
                    this.settings.innerFontSize,

                fontWeight:
                    this.settings.innerFontWeight,

                fill:
                    textColor.color,

                stroke:
                    textColor.outline,

                strokeWidth:
                    "1.2px",

                paintOrder:
                    "stroke fill",

                strokeLinecap:
                    "round",

                strokeLinejoin:
                    "round",
            });
        }

        /*
         * Внешние label.
         */
        for (const item of external) {
            if (
                item.percent <
                this.settings.hideBelowPercent
            ) {
                this.hideLabel(item.el);
                continue;
            }

            this.showLabel(item.el);

            this.applyStyle(item.el, {
                fontSize:
                    this.settings.externalFontSize,

                fontWeight:
                    this.settings.externalFontWeight,

                fill:
                    this.settings.externalColor,
            });
        }

        /*
         * Стрелочки управляются отдельно,
         * но по тому же секторному проценту.
         */
        this.customizeAxes(
            axes,
            percentages
        );

        /*
         * Перераспределяем только видимые
         * внешние подписи.
         */
        const visibleExternal =
            external.filter(item => {
                return (
                    item.percent >=
                    this.settings.hideBelowPercent
                );
            });

        this.redistributeExternal(
            visibleExternal,
            height
        );

        /*
         * Легенда НИКОГДА не скрывает пункты
         * из-за hideBelowPercent.
         *
         * Даже 0.0% остаётся в легенде.
         */
        this.customizeLegend(
            svg,
            percentages
        );
    }

    /*
     * Возвращает все внешние label в исходные
     * координаты Tracker.
     *
     * Координаты сохраняются в dataset только один раз.
     */
    restoreOriginalLabelPositions(labels) {
        for (const label of labels) {
            const originalX =
                label.dataset
                    .trackerPieCustomizerOriginalX;

            const originalY =
                label.dataset
                    .trackerPieCustomizerOriginalY;

            if (
                originalX === undefined ||
                originalY === undefined
            ) {
                const current =
                    this.getTranslate(label);

                if (!current) {
                    continue;
                }

                label.dataset
                    .trackerPieCustomizerOriginalX =
                    String(current.x);

                label.dataset
                    .trackerPieCustomizerOriginalY =
                    String(current.y);

                continue;
            }

            this.setTranslate(
                label,
                parseFloat(originalX),
                parseFloat(originalY)
            );
        }
    }

    /*
     * Определяет сектор внешней подписи.
     *
     * В SVG Tracker внешняя подпись и конец её стрелочки
     * имеют одинаковую X-координату.
     *
     * Например:
     *
     * label Развлечения:
     * translate(-78.375, -51.120...)
     *
     * axis:
     * ... -78.375,-119
     *
     * Поэтому сопоставляем по X.
     *
     * Если по X найдено несколько вариантов,
     * используем ближайший.
     */
    findExternalSectorIndex(
        label,
        axes
    ) {
        const labelPos =
            this.getTranslate(label);

        if (!labelPos) {
            return -1;
        }

        let bestIndex = -1;
        let bestDistance =
            Infinity;

        for (
            let i = 0;
            i < axes.length;
            i++
        ) {
            const end =
                this.getAxisEndPoint(
                    axes[i]
                );

            if (!end) {
                continue;
            }

            const distance =
                Math.abs(
                    end.x -
                    labelPos.x
                );

            if (
                distance <
                bestDistance
            ) {
                bestDistance =
                    distance;

                bestIndex = i;
            }
        }

        /*
         * Tracker обычно даёт практически одинаковые
         * значения X. Но оставляем небольшой допуск,
         * чтобы не привязывать случайный label.
         */
        if (
            bestDistance > 2
        ) {
            return -1;
        }

        return bestIndex;
    }

    getAxisEndPoint(axis) {
        const points =
            axis.getAttribute(
                "points"
            );

        if (!points) {
            return null;
        }

        const numbers =
            points
                .trim()
                .split(/[\s,]+/)
                .map(Number)
                .filter(
                    value =>
                        Number.isFinite(
                            value
                        )
                );

        if (numbers.length < 2) {
            return null;
        }

        return {
            x:
                numbers[
                    numbers.length - 2
                ],

            y:
                numbers[
                    numbers.length - 1
                ],
        };
    }

    /*
     * Управляет стрелочками.
     */
    customizeAxes(
        axes,
        percentages
    ) {
        axes.forEach(
            (axis, index) => {
                const percent =
                    percentages[index] ??
                    0;

                if (
                    percent <
                    this.settings.hideBelowPercent
                ) {
                    axis.style.setProperty(
                        "display",
                        "none",
                        "important"
                    );

                    axis.dataset
                        .trackerPieCustomizerHidden =
                        "1";
                } else {
                    axis.style.removeProperty(
                        "display"
                    );

                    delete axis.dataset
                        .trackerPieCustomizerHidden;
                }
            }
        );
    }

    /*
     * Получает процент сектора по SVG path.
     */
    getSectorPercentage(path) {
        const d =
            path.getAttribute("d");

        if (!d) {
            return 0;
        }

        /*
         * Нулевой сектор выглядит так:
         *
         * M0,-105L0,0Z
         *
         * То есть Arc отсутствует.
         */
        const arcMatch =
            d.match(
                /A\s*([-\d.eE]+)[,\s]+([-\d.eE]+)[,\s]+([-\d.eE]+)[,\s]+([01])[,\s]+([01])[,\s]+([-\d.eE]+)[,\s]+([-\d.eE]+)/
            );

        if (!arcMatch) {
            return 0;
        }

        const moveMatch =
            d.match(
                /^M\s*([-\d.eE]+)[,\s]+([-\d.eE]+)/
            );

        if (!moveMatch) {
            return 0;
        }

        const startX =
            parseFloat(
                moveMatch[1]
            );

        const startY =
            parseFloat(
                moveMatch[2]
            );

        const largeArcFlag =
            parseInt(
                arcMatch[4],
                10
            );

        const sweepFlag =
            parseInt(
                arcMatch[5],
                10
            );

        const endX =
            parseFloat(
                arcMatch[6]
            );

        const endY =
            parseFloat(
                arcMatch[7]
            );

        const radius =
            Math.hypot(
                startX,
                startY
            );

        if (!radius) {
            return 0;
        }

        const startAngle =
            Math.atan2(
                startY,
                startX
            );

        const endAngle =
            Math.atan2(
                endY,
                endX
            );

        let angle;

        if (
            sweepFlag === 1
        ) {
            angle =
                endAngle -
                startAngle;

            while (
                angle < 0
            ) {
                angle +=
                    Math.PI * 2;
            }
        } else {
            angle =
                startAngle -
                endAngle;

            while (
                angle < 0
            ) {
                angle +=
                    Math.PI * 2;
            }
        }

        if (
            largeArcFlag === 1 &&
            angle < Math.PI
        ) {
            angle =
                Math.PI * 2 -
                angle;
        }

        if (
            largeArcFlag === 0 &&
            angle > Math.PI
        ) {
            angle =
                Math.PI * 2 -
                angle;
        }

        if (
            angle <
            0.000001
        ) {
            return 0;
        }

        return (
            (angle /
                (Math.PI * 2)) *
            100
        );
    }

    /*
     * Легенда.
     *
     * В отличие от подписей диаграммы,
     * маленькие категории здесь НЕ скрываются.
     */
    customizeLegend(
        svg,
        percentages
    ) {
        const legend =
            svg.querySelector(
                "#legend"
            );

        if (!legend) {
            return;
        }

        const legendLabels =
            Array.from(
                legend.querySelectorAll(
                    ".tracker-legend-label"
                )
            );

        const circles =
            Array.from(
                legend.querySelectorAll(
                    "circle"
                )
            );

        for (
            let i = 0;
            i < legendLabels.length;
            i++
        ) {
            const label =
                legendLabels[i];

            const percent =
                percentages[i] ?? 0;

            /*
             * ВАЖНО:
             *
             * Здесь больше НИКОГДА не применяем
             * hideBelowPercent.
             *
             * Все категории остаются в легенде.
             */
            label.style.removeProperty(
                "display"
            );

            delete label.dataset
                .trackerPieCustomizerLegend;

            if (circles[i]) {
                circles[i].style.removeProperty(
                    "display"
                );

                delete circles[i].dataset
                    .trackerPieCustomizerLegend;
            }

            /*
             * Сохраняем оригинальное название.
             */
            if (
                !label.dataset
                    .trackerPieCustomizerOriginalText
            ) {
                /*
                 * Если Tracker уже содержит проценты,
                 * сначала убираем их.
                 */
                const text =
                    label.textContent
                        .trim()
                        .replace(
                            /\s+\d+(?:\.\d+)?%$/,
                            ""
                        );

                label.dataset
                    .trackerPieCustomizerOriginalText =
                    text;
            }

            const originalText =
                label.dataset
                    .trackerPieCustomizerOriginalText;

            label.style.setProperty(
                "font-size",
                this.settings.legendFontSize,
                "important"
            );

            label.style.setProperty(
                "white-space",
                "nowrap",
                "important"
            );

            if (
                this.settings.showPercentages
            ) {
                label.textContent =
                    `${originalText} ${this.formatPercentage(percent)}%`;
            } else {
                label.textContent =
                    originalText;
            }
        }
    }

    formatPercentage(value) {
        return value.toFixed(1);
    }

    hideLabel(label) {
        label.style.setProperty(
            "display",
            "none",
            "important"
        );

        label.dataset
            .trackerPieCustomizerHidden =
            "1";
    }

    showLabel(label) {
        label.style.removeProperty(
            "display"
        );

        delete label.dataset
            .trackerPieCustomizerHidden;
    }

    getContrastingTextColor(
        label
    ) {
        const backgroundColor =
            this.getOriginalLabelColor(
                label
            );

        const rgb =
            this.parseColor(
                backgroundColor
            );

        if (!rgb) {
            return {
                color: "#ffffff",
                outline: "#000000",
            };
        }

        const luminance =
            this.getRelativeLuminance(
                rgb.r,
                rgb.g,
                rgb.b
            );

        const isDark =
            luminance < 0.52;

        if (isDark) {
            return {
                color: "#ffffff",
                outline: "#000000",
            };
        }

        return {
            color: "#000000",
            outline: "#ffffff",
        };
    }

    getOriginalLabelColor(
        label
    ) {
        const attributeFill =
            label.getAttribute(
                "fill"
            );

        if (
            this.isUsefulColor(
                attributeFill
            )
        ) {
            return attributeFill;
        }

        const inlineFill =
            label.style.getPropertyValue(
                "fill"
            );

        if (
            this.isUsefulColor(
                inlineFill
            )
        ) {
            return inlineFill;
        }

        let current =
            label.parentElement;

        while (
            current &&
            current.tagName?.toLowerCase() !==
                "svg"
        ) {
            const fill =
                current.getAttribute(
                    "fill"
                );

            if (
                this.isUsefulColor(
                    fill
                )
            ) {
                return fill;
            }

            const styleFill =
                current.style?.getPropertyValue(
                    "fill"
                );

            if (
                this.isUsefulColor(
                    styleFill
                )
            ) {
                return styleFill;
            }

            current =
                current.parentElement;
        }

        const computed =
            getComputedStyle(
                label
            ).fill;

        if (
            this.isUsefulColor(
                computed
            )
        ) {
            return computed;
        }

        return null;
    }

    isUsefulColor(value) {
        if (!value) {
            return false;
        }

        const normalized =
            value.trim().toLowerCase();

        if (
            normalized ===
                "none" ||
            normalized ===
                "transparent" ||
            normalized ===
                "currentcolor" ||
            normalized ===
                "inherit"
        ) {
            return false;
        }

        return true;
    }

    parseColor(value) {
        if (!value) {
            return null;
        }

        const normalized =
            value.trim();

        const rgbMatch =
            normalized.match(
                /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/
            );

        if (rgbMatch) {
            return {
                r: Number(
                    rgbMatch[1]
                ),
                g: Number(
                    rgbMatch[2]
                ),
                b: Number(
                    rgbMatch[3]
                ),
            };
        }

        if (
            /^#[0-9a-f]{3}$/i.test(
                normalized
            )
        ) {
            return {
                r: parseInt(
                    normalized[1] +
                        normalized[1],
                    16
                ),

                g: parseInt(
                    normalized[2] +
                        normalized[2],
                    16
                ),

                b: parseInt(
                    normalized[3] +
                        normalized[3],
                    16
                ),
            };
        }

        if (
            /^#[0-9a-f]{6}$/i.test(
                normalized
            )
        ) {
            return {
                r: parseInt(
                    normalized.slice(
                        1,
                        3
                    ),
                    16
                ),

                g: parseInt(
                    normalized.slice(
                        3,
                        5
                    ),
                    16
                ),

                b: parseInt(
                    normalized.slice(
                        5,
                        7
                    ),
                    16
                ),
            };
        }

        return null;
    }

    getRelativeLuminance(
        r,
        g,
        b
    ) {
        const rs = r / 255;
        const gs = g / 255;
        const bs = b / 255;

        const R =
            rs <= 0.03928
                ? rs / 12.92
                : Math.pow(
                      (rs + 0.055) /
                          1.055,
                      2.4
                  );

        const G =
            gs <= 0.03928
                ? gs / 12.92
                : Math.pow(
                      (gs + 0.055) /
                          1.055,
                      2.4
                  );

        const B =
            bs <= 0.03928
                ? bs / 12.92
                : Math.pow(
                      (bs + 0.055) /
                          1.055,
                      2.4
                  );

        return (
            0.2126 * R +
            0.7152 * G +
            0.0722 * B
        );
    }

    redistributeExternal(
        items,
        svgHeight
    ) {
        if (items.length < 2) {
            return;
        }

        const left = [];
        const right = [];

        for (const item of items) {
            if (item.x >= 0) {
                right.push(item);
            } else {
                left.push(item);
            }
        }

        const distribute = side => {
            if (side.length < 1) {
                return;
            }

            side.sort(
                (a, b) =>
                    a.y - b.y
            );

            const gap =
                this.settings.externalGap;

            const boxes =
                side.map(item => {
                    let boxHeight = 12;

                    try {
                        const rect =
                            item.el.getBBox();

                        boxHeight =
                            Math.max(
                                rect.height,
                                12
                            );
                    } catch (e) {
                        boxHeight = 12;
                    }

                    return {
                        item,
                        height:
                            boxHeight,
                    };
                });

            /*
             * Разводим подписи.
             */
            for (
                let i = 1;
                i < boxes.length;
                i++
            ) {
                const previous =
                    boxes[i - 1];

                const current =
                    boxes[i];

                const minY =
                    previous.item.y +
                    previous.height +
                    gap;

                if (
                    current.item.y <
                    minY
                ) {
                    current.item.y =
                        minY;
                }
            }

            const centerY =
                svgHeight / 2;

            const localMin =
                -centerY + 14;

            const localMax =
                centerY - 14;

            let top =
                boxes[0].item.y;

            let bottom =
                boxes[
                    boxes.length - 1
                ].item.y +
                boxes[
                    boxes.length - 1
                ].height;

            /*
             * Сдвигаем группу вверх,
             * если она вышла за нижнюю границу.
             */
            if (
                bottom >
                localMax
            ) {
                const shift =
                    localMax -
                    bottom;

                for (
                    const box of boxes
                ) {
                    box.item.y +=
                        shift;
                }
            }

            top =
                boxes[0].item.y;

            /*
             * Сдвигаем группу вниз,
             * если она вышла за верхнюю границу.
             */
            if (
                top <
                localMin
            ) {
                const shift =
                    localMin -
                    top;

                for (
                    const box of boxes
                ) {
                    box.item.y +=
                        shift;
                }
            }

            for (
                const box of boxes
            ) {
                this.setTranslate(
                    box.item.el,
                    box.item.x,
                    box.item.y
                );
            }
        };

        distribute(left);
        distribute(right);
    }

    getTranslate(el) {
        const transform =
            el.getAttribute(
                "transform"
            ) || "";

        const match =
            transform.match(
                /translate\(\s*([-\d.eE]+)(?:[,\s]+)([-\d.eE]+)\s*\)/
            );

        if (!match) {
            return null;
        }

        return {
            x: parseFloat(
                match[1]
            ),

            y: parseFloat(
                match[2]
            ),
        };
    }

    setTranslate(
        el,
        x,
        y
    ) {
        el.setAttribute(
            "transform",
            `translate(${x},${y})`
        );
    }

    applyStyle(
        el,
        styles
    ) {
        for (
            const [key, value]
            of Object.entries(styles)
        ) {
            el.style.setProperty(
                this.camelToKebab(
                    key
                ),
                value,
                "important"
            );
        }

        el.dataset
            .trackerPieCustomizer =
            "1";
    }

    camelToKebab(value) {
        return value.replace(
            /[A-Z]/g,
            m =>
                "-" +
                m.toLowerCase()
        );
    }

    restoreStyles() {
        const labels =
            document.querySelectorAll(
                "svg .tracker-pie-label"
            );

        for (
            const label of labels
        ) {
            /*
             * Восстанавливаем исходную позицию.
             */
            const originalX =
                label.dataset
                    .trackerPieCustomizerOriginalX;

            const originalY =
                label.dataset
                    .trackerPieCustomizerOriginalY;

            if (
                originalX !== undefined &&
                originalY !== undefined
            ) {
                this.setTranslate(
                    label,
                    parseFloat(
                        originalX
                    ),
                    parseFloat(
                        originalY
                    )
                );

                delete label.dataset
                    .trackerPieCustomizerOriginalX;

                delete label.dataset
                    .trackerPieCustomizerOriginalY;
            }

            if (
                label.dataset
                    .trackerPieCustomizer
            ) {
                label.style.removeProperty(
                    "font-size"
                );

                label.style.removeProperty(
                    "font-weight"
                );

                label.style.removeProperty(
                    "fill"
                );

                label.style.removeProperty(
                    "stroke"
                );

                label.style.removeProperty(
                    "stroke-width"
                );

                label.style.removeProperty(
                    "paint-order"
                );

                label.style.removeProperty(
                    "stroke-linecap"
                );

                label.style.removeProperty(
                    "stroke-linejoin"
                );

                label.style.removeProperty(
                    "display"
                );

                delete label.dataset
                    .trackerPieCustomizer;
            }

            if (
                label.dataset
                    .trackerPieCustomizerHidden
            ) {
                label.style.removeProperty(
                    "display"
                );

                delete label.dataset
                    .trackerPieCustomizerHidden;
            }
        }

        /*
         * Восстанавливаем стрелочки.
         */
        const axes =
            document.querySelectorAll(
                "svg polyline.tracker-axis"
            );

        for (
            const axis of axes
        ) {
            axis.style.removeProperty(
                "display"
            );

            delete axis.dataset
                .trackerPieCustomizerHidden;
        }

        /*
         * Восстанавливаем легенду.
         */
        const legendLabels =
            document.querySelectorAll(
                "svg .tracker-legend-label"
            );

        for (
            const label of legendLabels
        ) {
            label.style.removeProperty(
                "display"
            );

            label.style.removeProperty(
                "font-size"
            );

            label.style.removeProperty(
                "white-space"
            );

            if (
                label.dataset
                    .trackerPieCustomizerOriginalText
            ) {
                label.textContent =
                    label.dataset
                        .trackerPieCustomizerOriginalText;

                delete label.dataset
                    .trackerPieCustomizerOriginalText;
            }

            delete label.dataset
                .trackerPieCustomizerLegend;
        }

        const legendCircles =
            document.querySelectorAll(
                "svg #legend circle"
            );

        for (
            const circle of legendCircles
        ) {
            circle.style.removeProperty(
                "display"
            );

            delete circle.dataset
                .trackerPieCustomizerLegend;
        }
    }
}

class TrackerPieCustomizerSettingTab
    extends PluginSettingTab {

    constructor(
        app,
        plugin
    ) {
        super(
            app,
            plugin
        );

        this.plugin =
            plugin;
    }

    display() {
        const {
            containerEl,
        } = this;

        containerEl.empty();

        containerEl.createEl(
            "h2",
            {
                text:
                    "Tracker Pie Customizer",
            }
        );

        new Setting(containerEl)
            .setName(
                "Скрывать маленькие пункты"
            )
            .setDesc(
                "Пункты круговой диаграммы меньше указанного процента не будут иметь внутренних и внешних подписей и стрелочек. В легенде пункты всегда остаются."
            )
            .addToggle(toggle =>
                toggle
                    .setValue(
                        this.plugin
                            .settings
                            .hideBelowPercent >
                            0
                    )
                    .onChange(
                        async value => {
                            this.plugin
                                .settings
                                .hideBelowPercent =
                                value
                                    ? 1
                                    : 0;

                            await this.plugin
                                .saveSettings();
                        }
                    )
            );

        new Setting(containerEl)
            .setName(
                "Минимальный процент"
            )
            .setDesc(
                "Порог, ниже которого пункт считается слишком маленьким."
            )
            .addText(text =>
                text
                    .setPlaceholder(
                        "1"
                    )
                    .setValue(
                        String(
                            this.plugin
                                .settings
                                .hideBelowPercent
                        )
                    )
                    .onChange(
                        async value => {
                            const number =
                                parseFloat(
                                    value
                                );

                            if (
                                Number.isNaN(
                                    number
                                ) ||
                                number < 0
                            ) {
                                return;
                            }

                            this.plugin
                                .settings
                                .hideBelowPercent =
                                number;

                            await this.plugin
                                .saveSettings();
                        }
                    )
            );

        new Setting(containerEl)
            .setName(
                "Показывать проценты в легенде"
            )
            .setDesc(
                "Добавляет процент каждого пункта после его названия."
            )
            .addToggle(toggle =>
                toggle
                    .setValue(
                        this.plugin
                            .settings
                            .showPercentages
                    )
                    .onChange(
                        async value => {
                            this.plugin
                                .settings
                                .showPercentages =
                                value;

                            await this.plugin
                                .saveSettings();
                        }
                    )
            );

        new Setting(containerEl)
            .setName(
                "Размер шрифта легенды"
            )
            .setDesc(
                "Размер текста легенды."
            )
            .addText(text =>
                text
                    .setPlaceholder(
                        "9px"
                    )
                    .setValue(
                        this.plugin
                            .settings
                            .legendFontSize
                    )
                    .onChange(
                        async value => {
                            const trimmed =
                                value.trim();

                            if (
                                !trimmed
                            ) {
                                return;
                            }

                            this.plugin
                                .settings
                                .legendFontSize =
                                trimmed;

                            await this.plugin
                                .saveSettings();
                        }
                    )
            );
    }
}

module.exports =
    TrackerPieCustomizer;