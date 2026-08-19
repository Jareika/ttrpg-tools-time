Changelog
0.6.7
- Fixed TypeScript type-check errors.
- Fixed weekday progression after skipped intercalary days. Calendar precomputation now respects intercalary skip rules, preventing an incorrect extra weekday shift at cycle boundaries such as Gregorian year 400 → 401.
- Fixed open-ended eras being converted into concrete end dates after saving the calendar editor. Era normalization now ignores undefined optional end fields.
- New Style Settings for the day view.

0.6.4
- Improved Controls API stability and added extended navigation hooks for external plugins. Refined event‑creation callbacks and unified timeline‑filter triggers for more predictable cross‑plugin behavior.

0.6.3
- Added a versioned public Controls API exposing navigation, event, timeline, weather, Frontmatter, management, era‑description, and fantasy‑time actions without relying on internal views or modals.

0.6.2
- Fixed Calendar View week navigation at month boundaries by switching to row‑based movement instead of fixed week offsets.

0.6.1
- Fixed Calendar View week header always showing Week 1 by using the cursor date. Added named calendar‑year week support in Week View.

0.6.0
- Fixed last Era not staying open, corrected CJK font orientation in rail/banner, added relative Era‑YearNumber and EraYear‑Token, added Era description toggle, fixed event‑point wrapping and style settings, added weather on/off setting, added named weeks and WeekName‑Token.

0.5.12
- Fixed a calendar‑rail crash caused by an undefined currentMonth variable. The rail now resolves the cursor month before rendering.

0.5.11
- Fixed event markers for inline named/intercalary weekday cells and added event dots to standalone named/leap‑day cards. Expanded Style Settings with rail year size/color, rail month‑label size, rail color modes, and a status‑bar toggle.

0.5.10
- Fixed standalone named‑day and leap‑day navigation in year view. Added right‑click actions for standalone cards including setting today, opening day view, and creating events.

0.5.9
- Fixed rendering of inline named days and weekday‑based intercalary leap days so they appear as visible calendar‑grid cells.

0.5.8
- Fixed regressions from named‑day and leap‑rule rework. Restored leap‑day data saving and preserved named‑day display positions, colors, icons, and vault images.

0.5.7
- Reworked named/intercalary day handling for Shire‑style calendars. Added inline holiday rendering, standalone card improvements, split named/leap‑day workflows, migrated legacy leap‑day blocks, and expanded holiday Style Settings.

0.5.6
- Added configurable named/intercalary days outside months, including weekday‑free days and cycle exclusions. Added rendering and editor support for named days and removed an unused temperature‑unit import.

0.5.5
- Restored framed fantasy‑time button editor and calendar/tag‑pack/weather‑pack overview sections while keeping declarative settings.

0.5.4
- Migrated plugin settings to Obsidian 1.13 declarative definitions with search support. Reworked fantasy‑time buttons and replaced deprecated slider tooltips.

0.5.3
- Added optional moon‑phase display and configurable moon size. Expanded Style Settings for titles, banner/rail colors, and added per‑month custom colors.

0.5.2
- Replaced native DOM creation with Obsidian createEl helpers to satisfy lint requirements.

0.5.1
- Added Style Settings support for calendar‑view theming and per‑calendar banner image selection.

0.2.7
- Reworked event‑creator UI layout.