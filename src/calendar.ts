import type {
  CalendarFile,
  CalendarState,
  CalendarViewMode,
  DayMarker,
  FantasyCalendarDefinition,
  FantasyTimeConfig,
  FantasyMonthDay,
  FantasyEra,
  FantasyDate,
  FantasyMonth,
  FantasyMoon,
  FantasyNamedYear,
  FantasySeason,
  MonthGrid,
  MonthGridCell,
  MoonPhaseImageDefinition,
  TagDefinition,
  TagPackFile,
  TtrpgToolsTimeSettings
} from "./types";

const DEFAULT_MONTHS: FantasyMonth[] = Array.from({ length: 12 }, (_, index) => ({
  id: `month-${index + 1}`,
  name: `Month ${index + 1}`,
  days: 30
}));

const DEFAULT_WEEKDAYS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];

const DEFAULT_SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];
const DEFAULT_SEASON_COLORS = ["#a7d36d", "#e2b35d", "#d98859", "#7fa8d8"];
const DEFAULT_MOON_PHASE_COUNT = 8;
const DEFAULT_MOON_SIZE = 28;
const DEFAULT_TIME_CONFIG: FantasyTimeConfig = {
  enabled: false,
  hoursPerDay: 24,
  minutesPerHour: 60
};

export const DEFAULT_CALENDAR_DEFINITION: FantasyCalendarDefinition = {
  id: "default-calendar",
  name: "Default Calendar",
  eraLabel: "Era",
  weekdays: [...DEFAULT_WEEKDAYS],
  months: cloneMonths(DEFAULT_MONTHS),
  moons: [],
  eras: buildDefaultEras("Era"),
  yearNames: [],
  startWeekdayIndex: 0,
  seasons: buildDefaultSeasons(DEFAULT_MONTHS),
  time: { ...DEFAULT_TIME_CONFIG }
};

export const DEFAULT_CALENDAR_FILE: CalendarFile = {
  version: 1,
  kind: "calendar",
  id: "default-calendar",
  name: "Default Calendar",
  definition: cloneCalendarDefinition(DEFAULT_CALENDAR_DEFINITION),
  state: {
    activeView: "year",
    todayDate: { year: 1, monthIndex: 0, day: 1 },
    cursorDate: { year: 1, monthIndex: 0, day: 1 }
  },
  linkedTagPackIds: [],
  linkedWeatherPackIds: [],
  defaultWeatherPackId: "general",
  markers: [],
  description: "Default calendar created on first launch."
};

export const DEFAULT_SETTINGS: TtrpgToolsTimeSettings = {
  dataFolder: "TTRPG/Time",
  activeCalendarId: DEFAULT_CALENDAR_FILE.id,
  openOnStartup: true,
  dayViewDateFormat: "D-M-YYYY",
  showCalendarWeekNumbers: false
};

export function normalizeSettings(raw: unknown): TtrpgToolsTimeSettings {
  const record = asRecord(raw);

  return {
    dataFolder: readString(record.dataFolder, DEFAULT_SETTINGS.dataFolder),
    activeCalendarId: readOptionalString(record.activeCalendarId),
    openOnStartup: readBoolean(record.openOnStartup, DEFAULT_SETTINGS.openOnStartup),
    dayViewDateFormat: readString(record.dayViewDateFormat, DEFAULT_SETTINGS.dayViewDateFormat),
    showCalendarWeekNumbers: readBoolean(record.showCalendarWeekNumbers, DEFAULT_SETTINGS.showCalendarWeekNumbers)
  };
}

export function normalizeCalendarFile(raw: unknown): CalendarFile {
  const record = asRecord(raw);
  const rawDefinition = asRecord(record.definition);
  const definition = normalizeDefinition({
    id: readString(rawDefinition.id, readString(record.id, DEFAULT_CALENDAR_FILE.definition.id)),
    name: readString(rawDefinition.name, readString(record.name, DEFAULT_CALENDAR_FILE.definition.name)),
    eraLabel: readString(rawDefinition.eraLabel, DEFAULT_CALENDAR_FILE.definition.eraLabel),
    weekdays: rawDefinition.weekdays,
    months: rawDefinition.months,
    eras: rawDefinition.eras,
    moons: rawDefinition.moons,
    yearNames: rawDefinition.yearNames,
    startWeekdayIndex: rawDefinition.startWeekdayIndex,
    seasons: rawDefinition.seasons,
	time: rawDefinition.time
  });

  const state = normalizeCalendarState(record.state, definition);

  return {
    version: 1,
    kind: "calendar",
    id: readString(record.id, definition.id),
    name: readString(record.name, definition.name),
    definition,
    state,
    linkedTagPackIds: readStringArray(record.linkedTagPackIds),
    linkedWeatherPackIds: readStringArray(record.linkedWeatherPackIds),
    defaultWeatherPackId:
      readOptionalString(record.defaultWeatherPackId) ??
      DEFAULT_CALENDAR_FILE.defaultWeatherPackId,
    markers: readMarkers(record.markers),
    description: readOptionalString(record.description)
  };
}

export function normalizeTagPackFile(raw: unknown): TagPackFile {
  const record = asRecord(raw);
  const tagsRaw = Array.isArray(record.tags) ? record.tags : [];

  return {
    version: 1,
    kind: "tag-pack",
    id: readString(record.id, "default-tag-pack"),
    name: readString(record.name, "Tag Pack"),
    tags: tagsRaw.map((entry, index) => normalizeTag(entry, index)),
    description: readOptionalString(record.description)
  };
}

function normalizeTag(raw: unknown, index: number): TagDefinition {
  const record = asRecord(raw);
  const name = readString(record.name, `Tag ${index + 1}`);

  return {
    id: readString(record.id, slugify(name || `tag-${index + 1}`)),
    name,
    color: readOptionalString(record.color)
  };
}

function normalizeDefinition(raw: unknown): FantasyCalendarDefinition {
  const record = asRecord(raw);
  const weekdays = readStringArray(record.weekdays);
  const months = readMonths(record.months);
  const normalizedWeekdays = weekdays.length > 0 ? weekdays : [...DEFAULT_CALENDAR_DEFINITION.weekdays];
  const normalizedMonths = months.length > 0 ? months : cloneMonths(DEFAULT_MONTHS);

  return {
    id: readString(record.id, DEFAULT_CALENDAR_DEFINITION.id),
    name: readString(record.name, DEFAULT_CALENDAR_DEFINITION.name),
    eraLabel: readString(record.eraLabel, DEFAULT_CALENDAR_DEFINITION.eraLabel),
    weekdays: normalizedWeekdays,
    months: normalizedMonths,
    eras: readEras(record.eras, readString(record.eraLabel, DEFAULT_CALENDAR_DEFINITION.eraLabel), normalizedMonths),
    moons: readMoons(record.moons),
    yearNames: readNamedYears(record.yearNames),
    startWeekdayIndex: mod(
      readNumber(record.startWeekdayIndex, DEFAULT_CALENDAR_DEFINITION.startWeekdayIndex),
      normalizedWeekdays.length
    ),
    seasons: Array.isArray(record.seasons)
      ? readSeasons(record.seasons, normalizedMonths)
      : buildDefaultSeasons(normalizedMonths),
    time: readTimeConfig(record.time)
  };
}

function normalizeCalendarState(
  raw: unknown,
  definition: FantasyCalendarDefinition
): CalendarState {
  const record = asRecord(raw);
  const todayDate = clampDate(readFantasyDate(record.todayDate, DEFAULT_CALENDAR_FILE.state.todayDate), definition);
  const cursorDate = clampDate(readFantasyDate(record.cursorDate, todayDate), definition);

  return {
    activeView: normalizeViewMode(record.activeView),
    todayDate,
    cursorDate
  };
}

function readFantasyDate(raw: unknown, fallback: FantasyDate): FantasyDate {
  const record = asRecord(raw);

  return {
    year: readNumber(record.year, fallback.year),
    monthIndex: readNumber(record.monthIndex, fallback.monthIndex),
    day: readNumber(record.day, fallback.day)
  };
}

function readMonths(raw: unknown): FantasyMonth[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const name = readString(record.name, `Monat ${index + 1}`);

    return {
      id: readString(record.id, slugify(name || `month-${index + 1}`)),
      name,
      days: Math.max(1, Math.trunc(readNumber(record.days, 1)))
    };
  });
}

function readMoons(raw: unknown): FantasyMoon[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const name = readString(record.name, `Mond ${index + 1}`);
    const phaseCount = Math.max(
      1,
      Math.trunc(readNumber(record.phaseCount, DEFAULT_MOON_PHASE_COUNT))
    );

    return {
      id: readString(record.id, slugify(name || `moon-${index + 1}`)),
      name,
      cycleDays: Math.max(1, Math.trunc(readNumber(record.cycleDays, 28))),
      offsetDays: Math.trunc(readNumber(record.offsetDays, 0)),
      color: readOptionalString(record.color),
      phaseCount,
      size: clampMoonSize(readNumber(record.size, DEFAULT_MOON_SIZE)),
      phaseImages: readMoonPhaseImages(record.phaseImages, phaseCount),
      phaseLabels: readPhaseLabels(record.phaseLabels, phaseCount)
    };
  });
}

function readMoonPhaseImages(
  raw: unknown,
  phaseCount: number
): MoonPhaseImageDefinition[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const deduped = new Map<number, MoonPhaseImageDefinition>();

  raw.forEach((entry) => {
    const record = asRecord(entry);
    const imageRef = readOptionalString(record.imageRef);

    if (!imageRef) {
      return;
    }

    const phaseIndex = clamp(
      Math.trunc(readNumber(record.phaseIndex, 0)),
      0,
      Math.max(0, phaseCount - 1)
    );

    deduped.set(phaseIndex, {
      phaseIndex,
      imageRef
    });
  });

  return [...deduped.values()].sort((left, right) => left.phaseIndex - right.phaseIndex);
}

function readPhaseLabels(raw: unknown, phaseCount: number): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .slice(0, phaseCount)
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""));
}

function readTimeConfig(raw: unknown): FantasyTimeConfig {
  const record = asRecord(raw);

  return {
    enabled: readBoolean(record.enabled, DEFAULT_TIME_CONFIG.enabled),
    hoursPerDay: clamp(
      Math.trunc(readNumber(record.hoursPerDay, DEFAULT_TIME_CONFIG.hoursPerDay)),
      1,
      240
    ),
    minutesPerHour: clamp(Math.trunc(readNumber(record.minutesPerHour, DEFAULT_TIME_CONFIG.minutesPerHour)), 1, 240)
  };
}

function readNamedYears(raw: unknown): FantasyNamedYear[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    return {
      year: Math.trunc(readNumber(record.year, index + 1)),
      name: readString(record.name, `Year ${index + 1}`)
    };
  });
}

function readEras(
  raw: unknown,
  fallbackLabel: string,
  months: FantasyMonth[]
): FantasyEra[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return buildDefaultEras(fallbackLabel);
  }

  return raw
    .map((entry, index) => {
      const record = asRecord(entry);
      const shortName = readString(record.shortName, fallbackLabel || `ERA${index + 1}`);
      const name = readString(record.name, `Era ${index + 1}`);
      const startMonthIndex = mod(
        Math.trunc(readNumber(record.startMonthIndex, 0)),
        months.length
      );
      const startDay = Math.min(
        Math.max(1, Math.trunc(readNumber(record.startDay, 1))),
        months[startMonthIndex]?.days ?? 1
      );

      return {
        id: readString(record.id, slugify(shortName || name || `era-${index + 1}`)),
        name,
        shortName,
        startYear: Math.trunc(readNumber(record.startYear, 0)),
        startMonthIndex,
        startDay
      };
    })
    .sort(compareEraStarts);
}

function readSeasons(raw: unknown, months: FantasyMonth[]): FantasySeason[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const name = readString(record.name, `Season ${index + 1}`);

    return {
      id: readString(record.id, slugify(name || `season-${index + 1}`)),
      name,
      start: readMonthDay(record.start, { monthIndex: 0, day: 1 }, months),
      end: readMonthDay(
        record.end,
        { monthIndex: months.length - 1, day: months[months.length - 1]?.days ?? 1 },
        months
      ),
      color: normalizeColor(readOptionalString(record.color), DEFAULT_SEASON_COLORS[index % DEFAULT_SEASON_COLORS.length])
    };
  });
}

function readMarkers(raw: unknown): DayMarker[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    return {
      id: readString(record.id, `marker-${index + 1}`),
      year: Math.trunc(readNumber(record.year, DEFAULT_CALENDAR_FILE.state.todayDate.year)),
      monthIndex: Math.trunc(readNumber(record.monthIndex, 0)),
      day: Math.max(1, Math.trunc(readNumber(record.day, 1))),
      tone: readTone(record.tone),
      label: readOptionalString(record.label)
    };
  });
}

function readTone(value: unknown): DayMarker["tone"] {
  if (value === "dark" || value === "pink" || value === "gold") {
    return value;
  }

  return undefined;
}

function readMonthDay(
  raw: unknown,
  fallback: FantasyMonthDay,
  months: FantasyMonth[]
): FantasyMonthDay {
  const record = asRecord(raw);

  return clampMonthDayToMonths(
    {
      monthIndex: readNumber(record.monthIndex, fallback.monthIndex),
      day: readNumber(record.day, fallback.day)
    },
    months
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeViewMode(value: unknown): CalendarViewMode {
  const allowed: CalendarViewMode[] = ["week", "month", "year"];
  return allowed.includes(value as CalendarViewMode)
    ? (value as CalendarViewMode)
    : DEFAULT_CALENDAR_FILE.state.activeView;
}

function normalizeColor(value: string | undefined, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : fallback;
}

function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function clampMoonSize(value: number): number {
  return clamp(Math.trunc(value || DEFAULT_MOON_SIZE), 12, 96);
}

function cloneMonths(months: FantasyMonth[]): FantasyMonth[] {
  return months.map((month) => ({ ...month }));
}

function cloneMarker(marker: DayMarker): DayMarker {
  return { ...marker };
}

export function cloneMarkers(markers: DayMarker[]): DayMarker[] {
  return markers.map(cloneMarker);
}

export function cloneCalendarDefinition(
  definition: FantasyCalendarDefinition
): FantasyCalendarDefinition {
  return {
    ...definition,
    weekdays: [...definition.weekdays],
    months: cloneMonths(definition.months),
    eras: definition.eras.map((era) => ({ ...era })),
    moons: definition.moons.map((moon) => ({
      ...moon,
      phaseImages: moon.phaseImages.map((entry) => ({ ...entry })),
      phaseLabels: [...moon.phaseLabels]
    })),
    yearNames: definition.yearNames.map((entry) => ({ ...entry })),
    seasons: definition.seasons.map((season) => ({ ...season, start: { ...season.start }, end: { ...season.end } })),
    time: { ...definition.time }
  };
}

export function cloneCalendarFile(calendar: CalendarFile): CalendarFile {
  return {
    ...calendar,
    definition: cloneCalendarDefinition(calendar.definition),
    state: {
      activeView: calendar.state.activeView,
      todayDate: cloneDate(calendar.state.todayDate),
      cursorDate: cloneDate(calendar.state.cursorDate)
    },
    linkedTagPackIds: [...calendar.linkedTagPackIds],
    linkedWeatherPackIds: [...calendar.linkedWeatherPackIds],
    defaultWeatherPackId: calendar.defaultWeatherPackId,
    markers: cloneMarkers(calendar.markers)
  };
}

export function slugify(value: string): string {
  const compact = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return compact.length > 0 ? compact : "entry";
}

export function cloneDate(date: FantasyDate): FantasyDate {
  return { ...date };
}

export function sameDate(a: FantasyDate | null, b: FantasyDate | null): boolean {
  if (!a || !b) return false;
  return a.year === b.year && a.monthIndex === b.monthIndex && a.day === b.day;
}

export function getMonth(
  definition: FantasyCalendarDefinition,
  monthIndex: number
) {
  return definition.months[mod(monthIndex, definition.months.length)];
}

export function getDaysInMonth(
  definition: FantasyCalendarDefinition,
  monthIndex: number
): number {
  return getMonth(definition, monthIndex).days;
}

export function getYearLength(definition: FantasyCalendarDefinition): number {
  return definition.months.reduce((sum, month) => sum + month.days, 0);
}

function clampMonthDayToMonths(date: FantasyMonthDay, months: FantasyMonth[]): FantasyMonthDay {
  const monthIndex = mod(Math.trunc(Number(date.monthIndex) || 0), months.length);
  const day = Math.min(
    Math.max(1, Math.trunc(Number(date.day) || 1)),
    months[monthIndex]?.days ?? 1
  );

  return {
    monthIndex,
    day
  };
}

export function clampMonthDay(
  date: FantasyMonthDay,
  definition: FantasyCalendarDefinition
): FantasyMonthDay {
  return clampMonthDayToMonths(date, definition.months);
}

export function getDayOfYearForMonthDay(
  definition: FantasyCalendarDefinition,
  date: FantasyMonthDay
): number {
  const normalized = clampMonthDay(date, definition);

  return getDayOfYear(definition, {
    year: 0,
    monthIndex: normalized.monthIndex,
    day: normalized.day
  });
}

export function dayOfYearToMonthDay(
  definition: FantasyCalendarDefinition,
  dayOfYear: number
): FantasyMonthDay {
  const yearLength = getYearLength(definition);
  let remaining = mod(Math.trunc(dayOfYear) - 1, yearLength) + 1;

  for (let monthIndex = 0; monthIndex < definition.months.length; monthIndex++) {
    const month = definition.months[monthIndex];
    if (remaining <= month.days) {
      return {
        monthIndex,
        day: remaining
      };
    }
    remaining -= month.days;
  }

  return {
    monthIndex: definition.months.length - 1,
    day: definition.months[definition.months.length - 1]?.days ?? 1
  };
}

export function getSeasonForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): FantasySeason | null {
  const currentDay = getDayOfYear(definition, clampDate(date, definition));

  for (const season of definition.seasons) {
    const startDay = getDayOfYearForMonthDay(definition, season.start);
    const endDay = getDayOfYearForMonthDay(definition, season.end);
    const inRange =
      startDay <= endDay
        ? currentDay >= startDay && currentDay <= endDay
        : currentDay >= startDay || currentDay <= endDay;

    if (inRange) {
      return season;
    }
  }

  return null;
}

export function buildDefaultEras(label: string): FantasyEra[] {
  const shortName = label.trim().length > 0 ? label.trim() : "ERA";

  return [
    {
      id: slugify(shortName),
      name: "Era 1",
      shortName,
      startYear: 0,
      startMonthIndex: 0,
      startDay: 1
    }
  ];
}

export function getEraForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): FantasyEra | null {
  const eras = definition.eras.length > 0 ? definition.eras : buildDefaultEras(definition.eraLabel);
  let active = eras[0] ?? null;

  for (const era of eras) {
    if (
      compareDateParts(date, {
        year: era.startYear,
        monthIndex: era.startMonthIndex,
        day: era.startDay
      }) >= 0
    ) {
      active = era;
    } else {
      break;
    }
  }

  return active;
}

export function getEraForYear(
  definition: FantasyCalendarDefinition,
  year: number
): FantasyEra | null {
  return getEraForDate(definition, { year, monthIndex: 0, day: 1 });
}

export function getEraShortLabel(
  definition: FantasyCalendarDefinition,
  input: FantasyDate | number
): string {
  return (
    (typeof input === "number" ? getEraForYear(definition, input) : getEraForDate(definition, input))
      ?.shortName ?? definition.eraLabel
  );
}

export function clampDate(
  date: FantasyDate,
  definition: FantasyCalendarDefinition
): FantasyDate {
  const monthIndex = mod(Math.trunc(Number(date.monthIndex) || 0), definition.months.length);
  const day = Math.min(
    Math.max(1, Math.trunc(Number(date.day) || 1)),
    getDaysInMonth(definition, monthIndex)
  );

  return {
    year: Math.trunc(Number(date.year) || 0),
    monthIndex,
    day
  };
}

export function getDayOfYear(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  let total = 0;
  for (let i = 0; i < date.monthIndex; i++) {
    total += definition.months[i].days;
  }
  return total + date.day;
}

export function getWeekdayIndex(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  return mod(
    definition.startWeekdayIndex + getDayOfYear(definition, date) - 1,
    definition.weekdays.length
  );
}

export function getWeekIndexInMonth(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const monthStartIndex = getWeekdayIndex(definition, {
    year: date.year,
    monthIndex: date.monthIndex,
    day: 1
  });

  return Math.floor((monthStartIndex + date.day - 1) / definition.weekdays.length);
}

export function getWeekNumberInMonth(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  return getWeekIndexInMonth(definition, date) + 1;
}

export function getWeekOfYear(definition: FantasyCalendarDefinition, date: FantasyDate): number {
  return Math.floor((definition.startWeekdayIndex + getDayOfYear(definition, date) - 1) / definition.weekdays.length) + 1;
}

export function shiftDay(
  date: FantasyDate,
  delta: number,
  definition: FantasyCalendarDefinition
): FantasyDate {
  let year = date.year;
  let monthIndex = date.monthIndex;
  let day = date.day + delta;

  while (day > getDaysInMonth(definition, monthIndex)) {
    day -= getDaysInMonth(definition, monthIndex);
    monthIndex++;
    if (monthIndex >= definition.months.length) {
      monthIndex = 0;
      year++;
    }
  }

  while (day < 1) {
    monthIndex--;
    if (monthIndex < 0) {
      monthIndex = definition.months.length - 1;
      year--;
    }
    day += getDaysInMonth(definition, monthIndex);
  }

  return { year, monthIndex, day };
}

export function shiftMonth(
  date: FantasyDate,
  delta: number,
  definition: FantasyCalendarDefinition
): FantasyDate {
  let year = date.year;
  let monthIndex = date.monthIndex + delta;

  while (monthIndex >= definition.months.length) {
    monthIndex -= definition.months.length;
    year++;
  }

  while (monthIndex < 0) {
    monthIndex += definition.months.length;
    year--;
  }

  return {
    year,
    monthIndex,
    day: Math.min(date.day, getDaysInMonth(definition, monthIndex))
  };
}

export function shiftYear(
  date: FantasyDate,
  delta: number,
  definition: FantasyCalendarDefinition
): FantasyDate {
  return {
    year: date.year + delta,
    monthIndex: date.monthIndex,
    day: Math.min(date.day, getDaysInMonth(definition, date.monthIndex))
  };
}

export function getMarkersForDate(
  markers: DayMarker[],
  date: FantasyDate
): DayMarker[] {
  return markers.filter(
    (marker) =>
      marker.year === date.year &&
      marker.monthIndex === date.monthIndex &&
      marker.day === date.day
  );
}

export function buildMonthGrid(
  definition: FantasyCalendarDefinition,
  year: number,
  monthIndex: number,
  cursorDate: FantasyDate,
  todayDate: FantasyDate,
  markers: DayMarker[]
): MonthGrid {
  const month = getMonth(definition, monthIndex);
  const startWeekdayIndex = getWeekdayIndex(definition, {
    year,
    monthIndex,
    day: 1
  });

  const rows: MonthGridCell[][] = [];
  const columns = definition.weekdays.length;
  const totalCells = startWeekdayIndex + month.days;
  const totalRows = Math.ceil(totalCells / columns);

  for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
    const row: MonthGridCell[] = [];

    for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
      const flatIndex = rowIndex * columns + columnIndex;
      const day = flatIndex - startWeekdayIndex + 1;

      const monthStartDate = { year, monthIndex, day: 1 };
      const monthEndDate = { year, monthIndex, day: month.days };

      if (day < 1 || day > month.days) {
        const boundarySeason = getSeasonForDate(
          definition,
          day < 1
            ? monthStartDate
            : monthEndDate
        );
        row.push({
          day: null,
          date: null,
          isToday: false,
          isCursor: false,
          markers: [],
          seasonColor: boundarySeason?.color
        });
        continue;
      }

      const date = { year, monthIndex, day };

      row.push({
        day,
        date,
        isToday: sameDate(date, todayDate),
        isCursor: sameDate(date, cursorDate),
        markers: getMarkersForDate(markers, date),
        seasonColor: getSeasonForDate(definition, date)?.color
      });
    }

    rows.push(row);
  }

  return {
    monthIndex,
    monthName: month.name,
    startWeekdayIndex,
    rows
  };
}

export function getWeekRow(
  definition: FantasyCalendarDefinition,
  date: FantasyDate,
  cursorDate: FantasyDate,
  todayDate: FantasyDate,
  markers: DayMarker[]
): MonthGridCell[] {
  const monthGrid = buildMonthGrid(
    definition,
    date.year,
    date.monthIndex,
    cursorDate,
    todayDate,
    markers
  );

  const rowIndex = getWeekIndexInMonth(definition, date);
  return monthGrid.rows[rowIndex] ?? [];
}

export function formatShortDate(date: FantasyDate): string {
  return `${date.day}-${date.monthIndex + 1}-${date.year}`;
}

export function getNamedYear(
  definition: FantasyCalendarDefinition,
  year: number
): string | null {
  const entry = definition.yearNames.find((candidate) => candidate.year === year);
  return entry?.name ?? null;
}

export function formatYearLabel(
  definition: FantasyCalendarDefinition,
  year: number
): string {
  const namedYear = getNamedYear(definition, year);

  if (!namedYear) {
    return `${year}`;
  }

  return `${year} (${namedYear})`;
}

export function formatLongDate(
  date: FantasyDate,
  definition: FantasyCalendarDefinition
): string {
  return `${date.day}. ${getMonth(definition, date.monthIndex).name} ${formatYearLabel(definition, date.year)} ${getEraShortLabel(definition, date)}`;
}

export function formatDateWithPattern(
  date: FantasyDate,
  definition: FantasyCalendarDefinition,
  pattern: string
): string {
  const normalized = clampDate(date, definition);
  const month = getMonth(definition, normalized.monthIndex);
  const weekdayIndex = getWeekdayIndex(definition, normalized);
  const weekdayName = definition.weekdays[weekdayIndex] ?? `Day ${weekdayIndex + 1}`;
  const monthShort = month.name.slice(0, Math.min(3, month.name.length));
  const weekdayShort = weekdayName.slice(0, Math.min(3, weekdayName.length));
  const weekInMonth = getWeekNumberInMonth(definition, normalized);
  const weekInYear = getWeekOfYear(definition, normalized);
  const template = pattern.trim().length > 0 ? pattern : DEFAULT_SETTINGS.dayViewDateFormat;

  const replacements: Array<[string, string]> = [
    ["WeekdayName", weekdayName],
    ["WeekdayShort", weekdayShort],
    ["MonthName", month.name],
    ["MonthShort", monthShort],
    ["YYYY", String(normalized.year)],
    ["YY", String(normalized.year).slice(-2)],
    ["MM", String(normalized.monthIndex + 1).padStart(2, "0")],
    ["DD", String(normalized.day).padStart(2, "0")],
    ["YW", String(weekInYear).padStart(2, "0")],
    ["WW", String(weekInMonth).padStart(2, "0")],
    ["ERA", getEraShortLabel(definition, normalized)],
    ["M", String(normalized.monthIndex + 1)],
    ["D", String(normalized.day)]
  ];

  let result = template;
  const placeholders = new Map<string, string>();

  replacements.forEach(([token, value], index) => {
    const placeholder = `\u0000time-format-${index}\u0000`;
    if (result.includes(token)) {
      result = result.split(token).join(placeholder);
      placeholders.set(placeholder, value);
    }
  });

  placeholders.forEach((value, placeholder) => {
    result = result.split(placeholder).join(value);
  });

  return result;
}

export function buildDefaultSeasons(months: FantasyMonth[]): FantasySeason[] {
  if (months.length === 0) {
    return [];
  }

  const starts = [
    0,
    Math.floor(months.length / 4),
    Math.floor(months.length / 2),
    Math.floor((months.length * 3) / 4)
  ];

  const seasons: FantasySeason[] = [];

  for (let index = 0; index < starts.length; index++) {
    const startMonthIndex = Math.min(starts[index], months.length - 1);
    const nextStartMonthIndex =
      index === starts.length - 1
        ? months.length
        : Math.min(starts[index + 1], months.length);

    if (seasons.some((season) => season.start.monthIndex === startMonthIndex)) {
      continue;
    }

    const endMonthIndex = Math.max(
      startMonthIndex,
      Math.min(nextStartMonthIndex - 1, months.length - 1)
    );

    seasons.push({
      id: slugify(DEFAULT_SEASON_NAMES[index] ?? `season-${index + 1}`),
      name: DEFAULT_SEASON_NAMES[index] ?? `Season ${index + 1}`,
      start: {
        monthIndex: startMonthIndex,
        day: 1
      },
      end: {
        monthIndex: endMonthIndex,
        day: months[endMonthIndex]?.days ?? 1
      },
      color: DEFAULT_SEASON_COLORS[index % DEFAULT_SEASON_COLORS.length]
    });
  }

  if (seasons.length === 0) {
    return [
      {
        id: "season-1",
        name: "Season 1",
        start: { monthIndex: 0, day: 1 },
        end: { monthIndex: months.length - 1, day: months[months.length - 1]?.days ?? 1 },
        color: DEFAULT_SEASON_COLORS[0]
      }
    ];
  }

  return seasons;
}

function compareDateParts(
  left: Pick<FantasyDate, "year" | "monthIndex" | "day">,
  right: Pick<FantasyDate, "year" | "monthIndex" | "day">
): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }
  if (left.monthIndex !== right.monthIndex) {
    return left.monthIndex - right.monthIndex;
  }
  return left.day - right.day;
}

function compareEraStarts(left: FantasyEra, right: FantasyEra): number {
  return compareDateParts(
    {
      year: left.startYear,
      monthIndex: left.startMonthIndex,
      day: left.startDay
    },
    {
      year: right.startYear,
      monthIndex: right.startMonthIndex,
      day: right.startDay
    }
  );
}