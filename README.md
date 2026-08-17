# Tracker Pie Enchancer

An Obsidian plugin that improves the readability of pie charts created by the Tracker plugin.

It automatically adjusts pie chart labels and provides a few simple options for controlling how small categories and the legend are displayed.

## Features

- Makes labels inside pie chart sectors more readable
- Automatically chooses a contrasting text color for inner labels
- Moves external labels outside the chart when there is not enough space inside
- Automatically redistributes external labels to reduce overlapping
- Hides labels and arrows for categories below a configurable percentage
- Keeps the legend complete, including categories with 0% when small categories are hidden
- Optionally displays percentages in the legend
- Allows changing the legend font size

## Settings

### Hide small categories

When enabled, categories below the selected percentage threshold are hidden from the chart.

This affects their labels and connecting arrows, while the category remains visible in the legend.

### Minimum percentage

Sets the percentage threshold used when hiding small categories.

For example, with a value of `1`, categories below 1% are hidden from the chart.

### Show percentages in legend

Adds the percentage value after each category name in the legend.

For example:

`Work 31.3%`

### Legend font size

Controls the font size used for legend labels.

## Requirements

This plugin requires the [Tracker](https://github.com/pyrochlore/obsidian-tracker) plugin for Obsidian.

## Installation

The plugin is currently available for manual installation.

1. Download `main.js` and `manifest.json` from the latest release.
2. Create a folder named `tracker-pie-customizer` inside your Obsidian vault:

   `.obsidian/plugins/tracker-pie-customizer/`

3. Put the downloaded files into that folder.
4. Enable **Tracker Pie Customizer** in Obsidian under **Settings → Community plugins**.

## License

MIT
