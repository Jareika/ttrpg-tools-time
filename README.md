# TTRPG Tools - Time

**TTRPG Tools - Time** is an Obsidian plugin for fantasy calendars, campaign events, timelines, moons, seasons, weather generation, Frontmatter-based event imports, and lightweight in-world time tracking.

All calendar, event, weather, tag-pack, and reference data is stored as readable JSON files inside your vault.

---

## Features

## Calendar system

- Week, month, and year calendar views
- Fully custom weekdays and months
- Custom weekday flow:
  - continuous across months
  - reset at the beginning of every month
- Custom eras with:
  - start dates
  - optional end dates
  - short labels
  - descriptions
- Named years
- Named calendar weeks
- Per-month accent colors
- Configurable start weekday
- Leap months
- Leap day blocks appended to months
- Named and intercalary days outside regular months
- Standalone named-day cards
- Inline named days rendered directly at the start or end of a month grid
- Optional weekday-free intercalary days
- Conditional intercalary leap days
- Year display options:
  - signed or absolute negative years
  - abbreviated large years
  - era-relative year numbers
- Optional exact fantasy-time system
- Per-calendar banner / rail images
- Bidirectional linked calendars

## Linked calendars

Calendars can be linked to one another. Links are automatically saved in both directions.

Linked calendars can be used to:

- switch to the next linked calendar from the calendar rail/banner
- switch calendars from the Controls pane
- switch calendars through the public **TTRPG Tools - Controls API**
- include selected linked calendars in the standalone Timeline View

The Timeline Filter pane provides calendar chips for linked calendars. Click a chip to add or remove that calendar from the standalone timeline.

---

## Views

The plugin provides the following views:

- Calendar side pane
- Day view side pane
- Event editor tab
- Event explorer modal
- Timeline view
- Timeline filter side pane
- Controls side pane

---

## Calendar View

The Calendar View supports week, month, and year modes.

### Calendar features

- Event dots for **all** events on a day
- Marker dots
- Season-color top borders
- Weather information in day-cell tooltips
- Today and selected-date highlighting
- Context actions for calendar days:
  - set as today
  - create event
  - open day view
- Scroll-to-selected-day behavior in year view
- Optional calendar week-number column
- Inline intercalary holidays with:
  - vault image
  - Obsidian icon
  - event dots
  - custom color

### Calendar rail / banner

The left calendar rail displays:

- selected day
- era label
- month name
- year
- optional banner image

Clicking the rail switches to the next linked calendar when linked calendars are configured.

---

## Day View

The Day View displays information for the selected calendar date.

### Day View features

- Configurable fantasy-date formatting
- Previous / next day navigation
- Weather summary with hover details
- Events for the selected day
- Event start and end times
- Manual markers
- Moon phases
- Day-specific weather editing
- Weather-pack application actions
- Event context menu:
  - open details
  - edit event
  - delete event

---

## Events

Events are stored as individual source JSON files and are indexed automatically for calendar and timeline rendering.

### Event features

- Single-day events
- Multi-day events
- Optional start and end time
- Description
- Event color
- Linked Markdown note
- Image attachment
- Tags from linked tag packs
- Weather-pack assignment
- Event presets
- Event explorer
- Frontmatter import and export
- Recurrence support

### Recurrence modes

#### Interval recurrence

- Daily
- Weekly
- Monthly
- Yearly
- Custom interval
- Never-ending recurrence
- End after occurrence count
- End at a specific date
- Excluded occurrences

#### Calendarium pattern recurrence

Pattern recurrence supports calendar-native rules such as:

- every month on a specific day
- every year on a specific day in a selected month
- every month in one selected year
- one exact calendar pattern date
- optional end date

This is useful for holidays, anniversaries, festivals, or calendar-specific repeating events.

---

## Event Explorer

The Event Explorer lets you browse and manage events.

Features:

- Browse events by year
- Filter the current result set by title or description
- Search event titles across all indexed years
- Edit events
- Delete events
- Delete one recurrence occurrence, following occurrences, or the full series

---

## Timeline system

The plugin provides standalone timelines and Markdown-embedded timelines.

### Standalone Timeline View

Features:

- Vertical cross timeline
- Horizontal mixed timeline
- Horizontal stacked timeline
- Horizontal Grid mode
- Tag include / exclude filters
- Linked-calendar inclusion
- Today jump button
- Event cards with:
  - title
  - date range
  - image
  - summary
  - linked-note hover preview
  - context actions
- Per-calendar timeline styling

### Per-calendar Timeline Styles

Each calendar can define its own timeline style.

Available settings include:

- timeline title
- image alignment
- moon display
- moon size
- summary line count
- card width
- card height
- text-box height
- Grid row count:
  - 2 rows
  - 3 rows
  - 4 rows
- Grid tile height
- inner left and right spacing
- card background color
- border/accent color
- hover color
- title color
- date color
- optional custom month names

When multiple linked calendars are shown in the standalone timeline, each event keeps the Timeline Style configured for its originating calendar.

### Timeline Grid mode

Horizontal Grid mode renders:

- one-day events as portrait tiles
- event images as tile backgrounds where available
- a compact date overlay for one-day events
- multi-day events as range cards spanning multiple grid columns
- configurable Grid row counts
- configurable tile size through Timeline Style settings
- additional layout width only where overlapping ranges require it

---

## Timeline Filter Pane

The Timeline Filter pane supports tag filtering and linked-calendar selection.

### Tag filtering

- **Click** a tag to include it
- **Double-click** a tag to exclude it
- Excluded tags always take priority over included tags
- Use **Clear filters** to reset all tag filters

### Linked calendar filtering

When the active calendar has linked calendars, the pane also displays calendar chips.

- Click a linked calendar to add it to the standalone timeline
- Click it again to remove it
- The active calendar always remains included

---

## Embedded Timelines

Timelines can be rendered directly in Markdown notes through code blocks.

### Vertical timeline

````md
```time-timeline-cal
title: Campaign Timeline
calendars:
  - my-calendar
includeTags:
  - history
  - travel
excludeTags:
  - spoiler
jumpTo: today
```
````

### Horizontal timeline

````md
```time-timeline-h
title: Travel Log
calendar: my-calendar
includeTags:
  - travel
excludeTags:
  - downtime
jumpTo: today
mode: mixed
align: left
maxSummaryLines: 7
cardWidth: 200
cardHeight: 315
boxHeight: 289
sideGapLeft: 40
sideGapRight: 40
```
````

### Horizontal Grid timeline

````md
```time-timeline-h
title: Campaign Overview
calendar: my-calendar
jumpTo: today
mode: grid
cardWidth: 200
cardHeight: 315
boxHeight: 289
```
````

### Supported YAML options

- `title`  
  Optional heading displayed above the embedded timeline.

- `calendar` / `calendars`  
  One or more calendar ids.

- `includeTags`  
  Tags to include.

- `excludeTags`  
  Tags to exclude.

- `jumpTo: today`  
  Adds a Today button and automatically jumps to the configured current day.

- `mode`  
  Horizontal timelines only:
  - `mixed`
  - `stacked`
  - `grid`

- `align`
  - `left`
  - `right`

- `maxSummaryLines`

- `cardWidth`

- `cardHeight`

- `boxHeight`

- `sideGapLeft`

- `sideGapRight`

### Tag filter syntax

Tag filters accept either a full tag reference:

```text
locations:city
```

or a short tag id:

```text
city
```

Use full references when multiple tag packs contain the same tag id.

---

## Frontmatter import and export

The plugin can import event data from Markdown note Frontmatter and export event data back to linked Markdown notes.

Import is manual. Use the Controls pane or plugin commands to scan either:

- the active note
- the complete vault

### Frontmatter import features

- Configurable property mappings
- Optional title fallback to the note file name
- Dates, date ranges, times, tags, colors, images, weather packs, and recurrence data
- Configurable stable synchronization id
- Color mapping rules
- Calendar-aware month parsing
- Fantasy-calendar and intercalary-day support
- YAML list support for multiple independent event dates in one note

### `fc-date` as a YAML list

The configured start-date property can be a YAML list of concrete dates.

Each entry creates an independent event. All generated events retain the same linked Markdown note.

```yaml
fc-date:
  - 1456-Eleint-30
  - 1456-Hammer-12
  - 1457-HIG-01
```

A date list cannot be combined with:

- one shared end date
- interval recurrence fields

Use separate notes if each imported date needs its own date range or recurrence rule.

### Supported date formats

Numeric dates:

```yaml
fc-date: 1456-02-14
```

Regular month names:

```yaml
fc-date: 1456-Eleint-30
```

Month ids:

```yaml
fc-date: 1456-eleint-30
```

Unambiguous month-name or month-id prefixes with at least three characters:

```yaml
fc-date: 1456-HIG-01
```

Standalone intercalary-day ordinal:

```yaml
fc-date: 1456-SD-04
```

`SD` means: the fourth active standalone day in the specified year.

Standalone leap-day ordinal:

```yaml
fc-date: 1456-SL-01
```

`SL` means: the first active standalone day in the specified year which is **not** an annually recurring standalone named day.

This is intended for calendars with conditional leap days or special intercalary days.

### Pattern recurrence from Frontmatter

The importer also supports Calendarium-style wildcard patterns through YAML objects.

```yaml
fc-date:
  month: Eleint
  day: 30
```

This creates a yearly pattern recurrence.

```yaml
fc-date:
  year: 1456
  day: 12
```

This creates a monthly recurrence restricted to year `1456`.

```yaml
fc-date:
  day: 1
```

This creates a monthly pattern recurrence for day `1`.

---

## Weather system

Weather is generated from reusable weather packs.

### Weather features

- Weather packs
- Per-month climate profiles
- Generated weather reference years
- Generated day-view weather years
- Manual weather editing per day
- Weather-day locking
- Apply a weather pack:
  - to one day
  - to a custom date range
  - from the selected date to year end
  - through a multi-range batch modal
- Import and export weather packs
- Regenerate one reference year
- Regenerate all known reference years for a weather pack
- Linked weather packs per calendar
- Default weather pack per calendar
- Optional automatic reference-year generation

### Weather pack configuration

Weather packs support:

- annual temperature range
- humidity
- precipitation
- storminess
- cloudiness
- fogginess
- windiness
- seasonality
- front frequency
- front strength
- volatility
- stable-weather duration
- front duration
- snow threshold
- per-month climate baselines

### Generated conditions

The weather generator can produce:

- clear
- mostly clear
- partly cloudy
- scattered clouds
- broken clouds
- overcast
- mist
- fog
- drizzle
- rain
- heavy rain
- thunderstorm
- sleet
- flurries
- snow
- blizzard

Weather generation is designed for useful campaign-facing weather rather than real-world meteorological simulation.

---

## Moons

Calendars can define multiple moons.

Each moon supports:

- custom name
- custom cycle length
- custom offset
- continuous absolute-day cycle
- month-reset cycle
- custom phase count
- custom phase labels
- optional phase images
- custom display size
- custom color

Moon phases are displayed in the Day View and can optionally be shown in the standalone Timeline header.

When exact time is enabled, event details can also show moon phase transitions occurring on that day.

---

## Named and intercalary days

Named days are calendar entries outside normal months.

They can be used for:

- feast days
- epagomenal days
- year-end holidays
- special leap days
- Shire-style Lithe days
- custom setting-specific holidays

Each named day supports:

- insertion before the first month or after a regular month
- display order
- standalone-card display
- rendering at the end of the previous month
- rendering at the start of the next month
- participation in weekday progression
- optional custom color
- Obsidian icon
- vault image
- cycle years
- active cycle positions
- skip rules for years divisible by configured values

Example:

```json
{
  "intercalaryDays": [
    {
      "id": "second-yule",
      "name": "2 Yule",
      "insertAfterMonthIndex": -1,
      "displayPosition": "standalone",
      "order": 10,
      "weekdayMode": "none",
      "cycleYears": 1,
      "activeYearPositions": [1],
      "skipYearsDivisibleBy": []
    },
    {
      "id": "first-lithe",
      "name": "1 Lithe",
      "insertAfterMonthIndex": 5,
      "displayPosition": "after-previous-month",
      "order": 10,
      "weekdayMode": "normal",
      "cycleYears": 1,
      "activeYearPositions": [1],
      "skipYearsDivisibleBy": []
    },
    {
      "id": "overlithe",
      "name": "Overlithe",
      "insertAfterMonthIndex": 5,
      "displayPosition": "standalone",
      "order": 30,
      "weekdayMode": "none",
      "cycleYears": 4,
      "activeYearPositions": [4],
      "skipYearsDivisibleBy": [100]
    }
  ]
}
```

---

## Fantasy time controls

The plugin stores a lightweight internal fantasy clock per calendar.

### Features

- Time stored per calendar
- Configurable hours per day
- Configurable minutes per hour
- Custom time-advance buttons
- Automatic day rollover
- Automatic update of calendar today date after day rollover
- Left-click a configured button to advance time
- Right-click a configured button to subtract time

Example buttons:

- `+30m`
- `+8h`
- `Long Rest`
- `Travel Watch`
- `Night Watch`

This system is intentionally lightweight and is not intended as a full simulation engine.

---

## Controls pane

The Controls pane provides compact quick actions.

Available actions include:

- Open calendar
- Switch to next linked calendar
- Open day view
- Jump to today
- Open timeline
- Open timeline filters
- Insert timeline block
- Create event
- Open event explorer
- Apply weather packs to date ranges
- Manage weather packs
- Manage Frontmatter mappings
- Scan active-note Frontmatter
- Scan whole-vault Frontmatter
- Manage tag packs
- Edit calendar
- Toggle era description
- Open plugin settings
- Advance fantasy time

---

## Public Controls API

For integration with **TTRPG Tools - Controls**, the plugin exposes:

```ts
plugin.controlsApi
```

The API is versioned and currently uses version `1`.

Available methods:

```ts
plugin.controlsApi.getActions();
plugin.controlsApi.executeAction(actionId);
```

The API provides actions for:

- calendar navigation
- linked-calendar switching
- day view
- event creation and exploration
- timeline views and insertion
- weather tools
- Frontmatter tools
- tag-pack and calendar management
- era descriptions
- plugin settings
- configured fantasy-time buttons

External plugins should use this public API instead of accessing internal views or modal classes.

---

## Style Settings

The plugin includes Style Settings metadata in `styles.css`.

Available styling options include:

- calendar accent color
- panel radius
- calendar grid gap
- day-cell radius
- calendar title color and size
- year-title color and size
- calendar rail colors
- banner image opacity and fit
- month-label color source
- holiday gradient colors
- holiday icon size
- event-marker size and spacing
- Day View date color and size
- Day View section-title color
- weather badge background
- status-bar visibility

---

## Installation

### Requirements

- Obsidian **1.13.0** or newer

### Manual installation

1. Build or download the plugin files.
2. Create this folder inside your vault:

   ```text
   .obsidian/plugins/ttrpg-tools-time
   ```

3. Copy these files into the folder:

   ```text
   main.js
   manifest.json
   styles.css
   ```

4. Open Obsidian.
5. Open **Settings → Community plugins**.
6. Disable Restricted mode if necessary.
7. Enable **TTRPG Tools - Time**.

---

## Basic usage

### Create a calendar

1. Open the Command Palette.
2. Run **TTRPG Tools - Time: Create calendar JSON**.
3. Configure:
   - weekdays
   - months
   - eras
   - seasons
   - named years and weeks
   - leap rules
   - named / intercalary days
   - moons
   - weather mapping
   - optional exact time
4. Save the calendar.

### Link calendars

1. Open the Calendar Editor.
2. Choose **Linked calendars**.
3. Select one or more calendars.
4. Save the calendar.

The links are synchronized in both directions.

### Create an event

1. Open the Event Editor.
2. Enter a title.
3. Select start and end dates.
4. Optionally configure:
   - exact time
   - description
   - image
   - linked note
   - color
   - tags
   - weather pack
   - recurrence
5. Save the event.

### Import events from Frontmatter

1. Open **Manage Frontmatter**.
2. Enable Frontmatter import.
3. Configure at least the start-date property.
4. Optionally configure title, tags, times, color, image, weather, and recurrence properties.
5. Use:
   - **Scan active note frontmatter**
   - **Scan whole vault frontmatter**

### Use the Controls pane

1. Open a Markdown note.
2. Place the editor cursor where a timeline should be inserted.
3. Open the Controls pane.
4. Select **Insert timeline**.
5. Configure the timeline.
6. Insert the generated YAML code block.

---

## Commands

The plugin currently registers commands for:

- Open side pane
- Open day pane
- Open event editor
- Open event explorer
- Open control pane
- Open timeline view
- Open timeline filter pane
- Jump to today
- Create calendar JSON
- Edit active calendar JSON
- Create tag pack JSON
- Create weather pack JSON
- Manage calendars
- Manage tag packs
- Manage weather packs
- Reload JSON data

---

## Data storage

By default, plugin data is stored in:

```text
TTRPG/Time
```

The data folder can be changed in plugin settings.

Typical folders include:

```text
TTRPG/Time/calendars
TTRPG/Time/tag-packs
TTRPG/Time/weather-packs
TTRPG/Time/weather-reference
TTRPG/Time/weather-dayview
TTRPG/Time/event-source
TTRPG/Time/event-index
TTRPG/Time/event-presets
```

Legacy yearly event files may be migrated automatically into source-event storage and archived in:

```text
TTRPG/Time/event-details-legacy-backup
```

Plugin-level settings and fantasy-clock state are stored through Obsidian plugin storage.

---

## Current limitations

- The plugin is still under active development.
- UI labels and workflows may change between releases.
- The fantasy-time system stores only the current clock value per calendar.
- Timeline insertion requires an active Markdown editor.
- Frontmatter import is manual and does not continuously synchronize notes.
- A Frontmatter date list creates independent events only; it cannot define a shared range or shared interval recurrence.
- Weather generation is designed for configurable worldbuilding utility, not scientific meteorological accuracy.

---

## License

MIT