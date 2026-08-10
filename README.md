# TTRPG Tools - Time

**TTRPG Tools - Time** is an Obsidian plugin for fantasy calendars, event tracking, moons, seasons, generated weather, timeline views, embedded timelines, and lightweight in-world time control for tabletop RPG campaigns and worldbuilding.

> This plugin is still an early release. Expect rough edges, ongoing UI changes, and data formats that may still evolve.

---

## Features

### Calendar system

- Week, month, and year calendar views
- Custom weekdays
- Custom months
- Custom eras
- Named years
- Custom seasons
- Leap months
- Leap day blocks
- Named / intercalary days outside of months
- Inline named holidays in adjacent month grids
- Configurable start weekday
- Per-holiday icon or vault image
- Configurable holiday gradient via Style Settings
- Optional exact time system for fantasy calendars
- Style Settings Plugin options
- Weather-cycle mapping:
  - calendar-based weather years
  - fixed climate-cycle years
- Multiple moons with:
  - custom cycle length
  - custom phase count
  - custom phase labels
  - optional phase images
  - continuous cycles or month-reset cycles

### Views

- Calendar side pane
- Day view side pane
- Event editor tab
- Timeline view
- Timeline filter side pane
- **Control side pane**

### Control side pane

The control pane provides quick actions in a compact one-column button list.

Current actions:

- Open calendar
- Open timeline
- Insert timeline block
- Create event
- Plugin settings
- Edit calendar

It can also show a fantasy-time section with custom time-advance buttons if configured in plugin settings.

### Day view

- Formatted fantasy date
- Weather summary with hover details
- Event list for the selected day
- Marker list for the selected day
- Moon display for the selected day

### Events

- Single-day events
- Multi-day events
- Optional start and end time
- Optional recurrence:
  - daily
  - weekly
  - monthly
  - yearly
- Recurrence end modes:
  - never
  - after count
  - until date
- Description
- Linked note
- Image attachment
- Color marker
- Tag support via linked tag packs
- Event presets
- Optional weather-pack link for non-recurring events

### Timeline system

- Dedicated timeline view
- Dedicated timeline filter pane
- Vertical timeline layout
- Horizontal timeline layout
- Horizontal stacked mode for same-date grouping
- Tag include/exclude filtering
- Per-calendar timeline styling
- Embedded timeline rendering inside Markdown code blocks
- Event cards with:
  - title
  - date range
  - image
  - summary
  - linked note hover/open behavior
- **Insert timeline modal** for generating YAML code blocks directly from UI selections

### Embedded timeline insertion

The control pane can open a modal that generates a timeline embed block for the current note.

Configurable options:

- layout:
  - vertical
  - horizontal
- title / heading
- one or more calendars
- included tags
- excluded tags
- optional `jumpTo: today`

The generated YAML block is inserted into the last known Markdown editor cursor position.

### Fantasy time controls

The plugin can store a lightweight internal fantasy time in plugin data.

- Time is stored per calendar
- Time advances through custom buttons configured in plugin settings
- Buttons can define:
  - label
  - icon
  - hours
  - minutes
- Day rollover is automatic
- When time passes into the next day, the calendar updates its current day automatically

This is intended as a lightweight in-world time tracker, not yet a full simulation system.

### Weather system

- Weather packs
- Per-month climate profiles
- Generated weather reference years
- Generated day-view weather years
- Manual day weather editing
- Weather-day locking
- Apply weather packs:
  - to a single day
  - to a date range
  - from current day to year end
- Weather pack import/export
- Regenerate single reference years
- Regenerate all reference years for a pack
- Linked weather packs per calendar
- Default weather pack per calendar
- Optional auto-generation of linked weather references

### Storage

All plugin data is stored as JSON files inside your vault, so it can be inspected, backed up, and version-controlled.

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

3. Copy these files into that folder:

   ```text
   main.js
   styles.css
   manifest.json
   ```

4. Open Obsidian.
5. Go to **Settings → Community plugins**.
6. Disable **Restricted mode** if required.
7. Enable **TTRPG Tools - Time**.

---

## Development

Install dependencies:

```bash
npm install
```

Development build / watch mode:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Auto-fix lint issues:

```bash
npm run lint:fix
```

---

## Data storage

By default, plugin data is stored in:

```text
TTRPG/Time
```

The data folder can be changed in plugin settings.

Typical subfolders include:

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

Plugin-level settings and fantasy-time state are stored in the plugin data JSON via Obsidian’s plugin storage.

---

## Basic usage

### Create a calendar

1. Open the command palette.
2. Run **TTRPG Tools - Time: Create calendar JSON**.
3. Configure:
   - weekdays
   - months
   - eras
   - seasons
   - moons
   - leap rules
   - weather-cycle mapping
   - optional exact time system
4. Save the calendar.

### Open the main views

Available ribbons / commands include:

- Open calendar side pane
- Open day pane
- Open event editor
- Open timeline view
- Open timeline filter pane
- Open control pane
- Jump to today

### Create tag packs

Tag packs are used for event categorization and timeline filtering.

Use:

- **Create tag pack JSON**
- **Manage tag packs**

### Create weather packs

Weather packs define climate behavior and weather generation.

Use:

- **Create weather pack JSON**
- **Manage weather packs**

### Create an event

1. Open the event editor.
2. Enter a title.
3. Choose start and end date.
4. Optionally add:
   - start and end time
   - description
   - image
   - linked note
   - tags
   - weather pack
   - recurrence
5. Save the event.

### Use the control pane

The control pane is meant as a quick-access side pane.

Typical workflow:

1. Open a Markdown note
2. Place the cursor where the timeline block should be inserted
3. Open the control pane
4. Click **Insert timeline**
5. Configure the embed
6. Insert the YAML block into the note

If fantasy-time buttons are configured and the active calendar has a time system enabled, the control pane also shows the current in-world time and your configured time-advance buttons.

---

## Timeline views

### Dedicated timeline view

The plugin includes a standalone timeline view that reads events from the active calendar.

Features:

- vertical or horizontal layout
- quick jump to today
- filter integration
- note/image cards
- tag-aware accent colors
- context actions for opening notes, day view, or editing events

### Timeline filter pane

The filter pane shows tags from the active calendar’s linked tag packs.

Interaction:

- **Click** a tag to **include** it
- **Double-click** a tag to **exclude** it
- Excluded tags take priority over included tags

---

## Embedded timeline blocks

The plugin can render timelines directly in Markdown via code blocks.

### Vertical / cross timeline

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

### Supported YAML options

- `title`  
  Optional title above the embed

- `calendar` / `calendars`  
  One or more calendar ids

- `includeTags`  
  Tags to include

- `excludeTags`  
  Tags to exclude

- `jumpTo: today`  
  Shows a **Today** button in the embed

- `mode`  
  Horizontal only:
  - `mixed`
  - `stacked`

- `align`
  - `left`
  - `right`

- `maxSummaryLines`
- `cardWidth`
- `cardHeight`
- `boxHeight`
- `sideGapLeft`
- `sideGapRight`

### Named weeks

Calendars can optionally assign names to calendar-year week numbers. These
names are available in the day-view format via the `WeekName` token.

### Tag filter syntax

Tag filters accept either:

- full tag refs like:

  ```text
  locations:city
  ```

- or short tag ids like:

  ```text
  city
  ```

If you want precise control, prefer full `packId:tagId` references.

---

## Calendar concepts

### Eras

Eras define labeled historical periods.

Each era has:

- name
- short label
- start year
- start month
- start day

### Leap months and leap days

Leap rules can insert extra month blocks or extra day blocks into matching years.

Each rule has:

- name
- insert position
- cycle length in years
- active positions in the cycle

Example:

- cycle = `4`
- positions = `4`

This means the leap rule triggers every fourth year.

### Named / intercalary days

Named days are one-day calendar entries that exist **outside normal months**.
They are useful for feast days, year-end days, epagomenal days, and special
leap days such as the Shire calendar's Overlithe.

Each named day supports:

- an insertion point before or after a base month
- a display order when multiple named days share that insertion point
- a display position:
  - standalone card
  - end of the previous month
  - start of the next month
- whether it participates in weekday progression
- optional Obsidian icon or vault image
- a cycle length and active positions
- optional exclusions for years divisible by one or more values

Named days that participate in weekday progression can be rendered directly in
an adjacent month grid. They use the holiday gradient and show an icon or image
instead of a day number.

For example, Shire-style Lithe days can be configured like this:

- **1 Lithe** → `End of previous month`
- **Midyear's Day** → `Standalone card`, `No weekday`
- **2 Lithe** → `Start of next month`

Example: Shire-style named days:

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

`skipYearsDivisibleBy: [100]` means that a day active every fourth year is
suppressed in years 100, 200, 300, and so on.

### Weather cycle mapping

Calendars can map climate/weather in two ways.

#### 1. Calendar mapping

Weather follows the actual calendar year and month structure, including leap months and leap day blocks.

#### 2. Fixed climate cycle

Weather follows a separate fixed-length climate year.

This is useful if your calendar structure and your climate cycle should not match exactly.

### Moons

Moons support two anchors:

#### Continuous

Moon phase is based on absolute day count.

#### Month reset

Moon phase starts over at the beginning of each month.

### Optional exact time system

A calendar can enable exact time with:

- hours per day
- minutes per hour

This is used for:

- optional event times
- moon phase timing in event/day detail contexts
- fantasy-time control rollover logic

---

## Weather generation overview

Weather is generated from a **weather pack**.  
A weather pack does **not** directly assign one fixed weather type to each day. Instead, it defines climate tendencies and instability values that are used to generate daily results.

### Core climate values

These values define the overall regional climate:

- `temperatureMin` / `temperatureMax`  
  Overall annual temperature range

- `humidity`  
  General air moisture

- `precipitation`  
  General tendency toward wet weather

- `storminess`  
  Likelihood of strong storm fronts and thunderstorms

- `cloudiness`  
  General amount of cloud cover

- `fogginess`  
  Tendency toward mist and fog

- `windiness`  
  General wind strength tendency

- `seasonality`  
  Strength of temperature shifts across the year

- `frontFrequency`  
  How often unstable weather fronts appear

- `frontStrength`  
  How strong those fronts are

- `volatility`  
  How changeable the weather is overall

- `stableSpanMin` / `stableSpanMax`  
  Typical duration of stable weather phases in days

- `frontSpanMin` / `frontSpanMax`  
  Typical duration of front-driven weather phases in days

- `snowTemperature`  
  Threshold below which precipitation may turn into snow, sleet, flurries, or blizzard conditions

### Monthly climate profiles

Each month can define its own baseline values:

- `temperatureOffset`
- `humidity`
- `precipitation`
- `cloudiness`
- `fogginess`
- `windiness`
- `frontBias`

These values are interpolated across the year to shape seasonal weather behavior.

### Internal weather phases

Before a visible weather result is chosen, the generator first selects an internal phase:

- `clear`
- `cloudy`
- `wet-front`
- `storm-front`
- `fog-bank`
- `snow-front`
- `warm-spell`
- `cold-snap`

These phases influence:

- how long a weather pattern lasts
- how temperature shifts
- how cloudy it gets
- how windy it gets
- how likely precipitation becomes

### Final visible weather conditions

The generator then resolves the final visible day result into one of these conditions:

- `clear`
- `mostly-clear`
- `partly-cloudy`
- `scattered-clouds`
- `broken-clouds`
- `overcast`
- `mist`
- `fog`
- `drizzle`
- `rain`
- `heavy-rain`
- `thunderstorm`
- `sleet`
- `flurries`
- `snow`
- `blizzard`

### How conditions are influenced

#### Clear and cloudy skies

Cloud-based weather is mainly driven by:

- cloudiness
- humidity
- the active internal phase

Lower cloud cover tends toward:

- `clear`
- `mostly-clear`
- `partly-cloudy`

Higher cloud cover tends toward:

- `scattered-clouds`
- `broken-clouds`
- `overcast`

#### Mist and fog

Mist and fog are mainly influenced by:

- fogginess
- humidity
- low wind
- the `fog-bank` phase

Higher fogginess increases the chance of mist and fog.

#### Drizzle, rain, and heavy rain

Wet weather is mainly influenced by:

- precipitation
- humidity
- front frequency
- front strength

Typical progression:

- lower wetness → `drizzle`
- medium wetness → `rain`
- higher wetness → `heavy-rain`

#### Thunderstorms

Thunderstorms are mainly influenced by:

- storminess
- front frequency
- strong unstable fronts
- warm and wet conditions

Higher storminess makes thunderstorm results more likely.

#### Snow, sleet, flurries, and blizzards

Winter precipitation depends on:

- wetness from precipitation/fronts
- temperature
- `snowTemperature`
- wind strength

Typical progression:

- near freezing → `sleet`
- below snow threshold, lighter snow → `flurries`
- below snow threshold, stronger snow → `snow`
- strong snow plus high wind → `blizzard`

---

## Plugin settings

The settings tab lets you manage:

- data folder
- startup behavior
- day-view date format
- calendar week numbers
- calendars
- tag packs
- weather packs
- control pane access
- custom fantasy-time advance buttons

### Fantasy-time advance buttons

You can configure custom buttons for the control pane.

Each button can define:

- label
- icon
- hours
- minutes

Examples:

- `+8h`
- `+10h`
- `+30m`
- `Long Rest`
- `Travel Watch`

If no time buttons are configured, the fantasy-time section is hidden from the control pane.

---

## Commands

The plugin currently registers commands for:

- Open side pane
- Open day pane
- Open event editor
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

## Current limitations

- The plugin is still an early release.
- Some UI labels and workflows may still change.
- The fantasy-time system is intentionally lightweight and currently stores only the current in-world clock per calendar.
- The timeline insert modal inserts into the last known Markdown editor cursor position. If no Markdown editor is available, insertion is not possible until a note editor has been focused.

---

## Notes

This plugin is made for campaign management and fantasy worldbuilding.  
It does not try to model real-world astronomy or meteorology exactly. You can use realistic values if you want, but the plugin is optimized for useful, configurable game-facing results rather than scientific simulation.

---

## License

MIT