# TTRPG Tools - Time

**TTRPG Tools - Time** is an Obsidian plugin for managing fantasy calendars, campaign timelines (not implemented yet), day views, moons, seasons, events, and generated weather for tabletop roleplaying games.

> This plugin is currently an early release build. Expect rough edges and changing data formats.

## Features

- Fantasy calendar view with:
  - Week view
  - Month view
  - Year view
- Custom calendar definitions:
  - Custom weekdays
  - Custom months
  - Eras
  - Named years
  - Seasons
  - Leap months
  - Leap days
- Day view with:
  - Current fantasy date
  - Weather summary
  - Event list
  - Moon phase display
- Event system:
  - Single-day events
  - Multi-day events
  - Optional start and end time
  - Description
  - Linked note
  - Image attachment
  - Tag packs
  - Event presets
- Moon system:
  - Multiple moons
  - Custom cycle length
  - Custom phase count
  - Custom phase labels
  - Optional phase images
  - Continuous or month-reset moon cycles
- Weather system:
  - Weather packs
  - Generated weather reference years
  - Editable day-view weather
  - Manual weather overrides
  - Weather pack import/export
- Data is stored as JSON files inside your vault.

## Installation

### Easy installation

1. Install and activate it through the community plugin browser.

### Manual installation

1. Build or download the plugin files.
2. Create the following folder inside your Obsidian vault:

   ```text
   .obsidian/plugins/ttrpg-tools-time
   ```

3. Copy these files into that folder:

   ```text
   main.js
   styles.css
   manifest.json
   ```

4. Open Obsidian.
5. Go to **Settings → Community plugins**.
6. Disable **Restricted mode**, if needed.
7. Enable **TTRPG Tools - Time**.

## Data storage

By default, plugin data is stored in:

```text
TTRPG/Time
```

The data folder can be changed in the plugin settings.

The plugin creates several subfolders for different data types, such as:

```text
TTRPG/Time/calendars
TTRPG/Time/tag-packs
TTRPG/Time/weather-packs
TTRPG/Time/weather-reference
TTRPG/Time/weather-dayview
TTRPG/Time/event-details
TTRPG/Time/event-index
TTRPG/Time/event-presets
```

Most data is stored as JSON, so it can be inspected, backed up, or version-controlled together with your vault.

## Basic usage

### Create a calendar

1. Open the command palette.
2. Run **TTRPG Tools - Time: Create calendar JSON**.
3. Configure weekdays, months, eras, seasons, moons, and optional leap rules.
4. Save the calendar.

### Open the calendar view

Use one of the following options:

- Ribbon calendar icon
- Command palette: **TTRPG Tools - Time: Open side pane**
- Plugin settings: **Open calendar side pane**

### Open the day view

Use one of the following options:

- Ribbon sun icon
- Command palette: **TTRPG Tools - Time: Open day pane**
- Calendar menu: **Open day view**

### Create an event

1. Open the event editor from the ribbon or command palette.
2. Enter a title.
3. Choose start and end dates.
4. Optionally add:
   - Time
   - Description
   - Image
   - Linked note
   - Tags
   - Weather pack
5. Save the event.

### Configure weather packs

Weather packs define the baseline climate and weather behavior used to generate fantasy weather.

You can manage them through:

```text
Plugin settings → Manage weather packs
```

Weather packs can be:

- Created
- Edited
- Deleted
- Linked to calendars
- Set as default
- Exported
- Imported
- Regenerated for reference years

## Calendar concepts

### Eras

Eras provide labels for historical periods. Each era has:

- Name
- Short label
- Start year
- Start month
- Start day

### Leap months and leap days

Leap rules can insert additional months or day blocks into matching years.

Each rule has:

- Name
- Insert position
- Cycle length in years
- Active positions inside the cycle

Example: a 4-year cycle with position `4` means the leap rule applies every fourth year.

### Weather cycle mapping

Calendars can map weather and seasons in two ways:

1. **Calendar year/months**

   Weather follows the actual calendar year, including leap months and leap days.

2. **Fixed climate cycle**

   Weather follows a fixed day-length climate cycle, independent from the actual calendar year length.

### Moons

Moons can use two cycle anchors:

- **Continuous**

  The moon cycle is based on the absolute day count.

- **Month reset**

  The moon cycle restarts at the beginning of each month.

## Commands

The plugin registers commands for common actions:

- Open side pane
- Open day pane
- Open event editor
- Jump to today
- Create calendar JSON
- Edit active calendar JSON
- Create tag pack JSON
- Create weather pack JSON
- Manage calendars
- Manage tag packs
- Manage weather packs
- Reload JSON data

## Notes

This plugin is designed for campaign management and worldbuilding. It does not try to model real‑world astronomy or meteorology exactly, although you can still use a 29.514893617‑day cycle for moons. However, it will only show one moon phase per day, so you should not expect the new moon to appear exactly on day 1. The goal is to provide useful, configurable fantasy-calendar tooling for TTRPG play.

## License

MIT