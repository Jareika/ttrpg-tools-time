import type {
  FantasyClockEntry,
  FantasyClockState,
  CalendarTimelineStyle,
  CalendarFile,
  CalendarState,
  CalendarViewMode,
  DayMarker,
  FantasyCalendarDefinition,
  FantasyLeapDayRule,
  FantasyLeapMonthRule,
  FantasyTimeConfig,
  FantasyWeatherProfileMapping,
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
  TimeAdvanceButtonConfig,
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

export const DEFAULT_WEATHER_PROFILE: FantasyWeatherProfileMapping = {
  mode: "calendar",
  climateYearLength: DEFAULT_MONTHS.reduce((sum, month) => sum + month.days, 0),
  baseOffsetDays: 0,
  cycleReset: "intercalation-cycle"
};

export const DEFAULT_CALENDAR_DEFINITION: FantasyCalendarDefinition = {
  id: "default-calendar",
  name: "Default Calendar",
  eraLabel: "Era",
  weekdays: [...DEFAULT_WEEKDAYS],
  months: cloneMonths(DEFAULT_MONTHS),
  leapMonths: [],
  leapDays: [],
  weatherProfile: { ...DEFAULT_WEATHER_PROFILE },
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
  autoGenerateLinkedWeatherReferences: false,
  description: "Default calendar created on first launch."
};

export const DEFAULT_SETTINGS: TtrpgToolsTimeSettings = {
  dataFolder: "TTRPG/Time",
  activeCalendarId: DEFAULT_CALENDAR_FILE.id,
  openOnStartup: true,
  dayViewDateFormat: "D-M-YYYY",
  showCalendarWeekNumbers: false,
  controlTimeButtons: []
};

export const DEFAULT_FANTASY_CLOCK_STATE: FantasyClockState = {
  byCalendarId: {}
};

export function normalizeSettings(raw: unknown): TtrpgToolsTimeSettings {
  const record = asRecord(raw);

  return {
    dataFolder: readString(record.dataFolder, DEFAULT_SETTINGS.dataFolder),
    activeCalendarId: readOptionalString(record.activeCalendarId),
    openOnStartup: readBoolean(record.openOnStartup, DEFAULT_SETTINGS.openOnStartup),
    dayViewDateFormat: readString(record.dayViewDateFormat, DEFAULT_SETTINGS.dayViewDateFormat),
    showCalendarWeekNumbers: readBoolean(record.showCalendarWeekNumbers, DEFAULT_SETTINGS.showCalendarWeekNumbers),
    controlTimeButtons: readTimeAdvanceButtons(record.controlTimeButtons)
  };
}

export function normalizeFantasyClockState(raw: unknown): FantasyClockState {
  const record = asRecord(raw);
  const source = asRecord(record.byCalendarId ?? raw);
  const byCalendarId: Record<string, FantasyClockEntry> = {};

  Object.entries(source).forEach(([calendarId, value]) => {
    const entry = asRecord(value);
    byCalendarId[calendarId] = {
      hour: Math.max(0, Math.trunc(readNumber(entry.hour, 0))),
      minute: Math.max(0, Math.trunc(readNumber(entry.minute, 0)))
    };
  });

  return {
    byCalendarId
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
    leapMonths: rawDefinition.leapMonths,
	leapDays: rawDefinition.leapDays,
    weatherProfile: rawDefinition.weatherProfile,
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
    autoGenerateLinkedWeatherReferences: readBoolean(
      record.autoGenerateLinkedWeatherReferences,
      DEFAULT_CALENDAR_FILE.autoGenerateLinkedWeatherReferences ?? false
    ),
	timeline: readTimelineStyle(record.timeline),
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
  const weatherProfile = readWeatherProfile(record.weatherProfile, normalizedMonths);
  const seasonCycleLength = getSeasonCycleLengthForMonths(weatherProfile, normalizedMonths);

  return {
    id: readString(record.id, DEFAULT_CALENDAR_DEFINITION.id),
    name: readString(record.name, DEFAULT_CALENDAR_DEFINITION.name),
    eraLabel: readString(record.eraLabel, DEFAULT_CALENDAR_DEFINITION.eraLabel),
    weekdays: normalizedWeekdays,
    months: normalizedMonths,
    leapMonths: readLeapMonths(record.leapMonths, normalizedMonths),
    leapDays: readLeapDays(record.leapDays, normalizedMonths),
    weatherProfile,
    eras: readEras(record.eras, readString(record.eraLabel, DEFAULT_CALENDAR_DEFINITION.eraLabel), normalizedMonths),
    moons: readMoons(record.moons),
    yearNames: readNamedYears(record.yearNames),
    startWeekdayIndex: mod(
      readNumber(record.startWeekdayIndex, DEFAULT_CALENDAR_DEFINITION.startWeekdayIndex),
      normalizedWeekdays.length
    ),
    seasons: Array.isArray(record.seasons)
      ? readSeasons(record.seasons, normalizedMonths, seasonCycleLength)
      : buildDefaultSeasons(normalizedMonths, seasonCycleLength),
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
      cycleDays: readPositiveNumber(record.cycleDays, 28),
      offsetDays: readNumber(record.offsetDays, 0),
	  cycleAnchor: readMoonCycleAnchor(record.cycleAnchor),
      color: readOptionalString(record.color),
      phaseCount,
      size: clampMoonSize(readNumber(record.size, DEFAULT_MOON_SIZE)),
      phaseImages: readMoonPhaseImages(record.phaseImages, phaseCount),
      phaseLabels: readPhaseLabels(record.phaseLabels, phaseCount)
    };
  });
}

function readLeapMonths(raw: unknown, months: FantasyMonth[]): FantasyLeapMonthRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const monthRecord = asRecord(record.month);
    const name = readString(record.name, `Leap Month ${index + 1}`);
    const monthName = readString(monthRecord.name, name);
    const cycleYears = Math.max(1, Math.trunc(readNumber(record.cycleYears, 1)));
    const rawPositions = Array.isArray(record.leapYearPositions)
      ? record.leapYearPositions
      : [];
    const leapYearPositions = [...new Set(
      rawPositions
        .map((value) => Math.trunc(readNumber(value, 0)))
        .filter((value) => value >= 1 && value <= cycleYears)
    )].sort((left, right) => left - right);

    return {
      id: readString(record.id, slugify(name || `leap-month-${index + 1}`)),
      name,
      insertAfterMonthIndex: clamp(
        Math.trunc(readNumber(record.insertAfterMonthIndex, months.length - 1)),
        -1,
        Math.max(-1, months.length - 1)
      ),
      month: {
        id: readString(monthRecord.id, slugify(monthName || `leap-month-${index + 1}`)),
        name: monthName,
        days: Math.max(1, Math.trunc(readNumber(monthRecord.days, 30)))
      },
      cycleYears,
      leapYearPositions: leapYearPositions.length > 0 ? leapYearPositions : [cycleYears]
    };
  });
}

function readLeapDays(raw: unknown, months: FantasyMonth[]): FantasyLeapDayRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const name = readString(record.name, `Leap Day ${index + 1}`);
    const cycleYears = Math.max(1, Math.trunc(readNumber(record.cycleYears, 1)));
    const rawPositions = Array.isArray(record.leapYearPositions)
      ? record.leapYearPositions
      : [];
    const leapYearPositions = [...new Set(
      rawPositions
        .map((value) => Math.trunc(readNumber(value, 0)))
        .filter((value) => value >= 1 && value <= cycleYears)
    )].sort((left, right) => left - right);

    return {
      id: readString(record.id, slugify(name || `leap-day-${index + 1}`)),
      name,
      insertAfterMonthIndex: clamp(
        Math.trunc(readNumber(record.insertAfterMonthIndex, months.length - 1)),
        -1,
        Math.max(-1, months.length - 1)
      ),
      days: Math.max(1, Math.trunc(readNumber(record.days, 1))),
      cycleYears,
      leapYearPositions: leapYearPositions.length > 0 ? leapYearPositions : [cycleYears]
    };
  });
}

function readWeatherProfile(
  raw: unknown,
  months: FantasyMonth[]
): FantasyWeatherProfileMapping {
  const record = asRecord(raw);
  const fallbackLength = Math.max(
    1,
    months.reduce((sum, month) => sum + month.days, 0)
  );
  const mode =
    record.mode === "absolute-day-cycle"
      ? "absolute-day-cycle"
      : "calendar";

  return {
    mode,
    climateYearLength: Math.max(
      1,
      Math.trunc(readNumber(record.climateYearLength, fallbackLength))
    ),
    baseOffsetDays: Math.trunc(readNumber(record.baseOffsetDays, 0)),
    cycleReset:
      record.cycleReset === "none" || record.cycleReset === "intercalation-cycle"
        ? record.cycleReset
        : "intercalation-cycle"
  };
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
  if (!Array.isArray(raw)) {
    return buildDefaultEras(fallbackLabel);
  }
  
  if (raw.length === 0) {
    return [];
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

function readSeasons(
  raw: unknown,
  months: FantasyMonth[],
  seasonCycleLength: number
): FantasySeason[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const name = readString(record.name, `Season ${index + 1}`);
    const fallbackStartDay = monthDayToDayInMonths(
      months,
      readMonthDay(record.start, { monthIndex: 0, day: 1 }, months)
    );
    const fallbackEndDay = monthDayToDayInMonths(
      months,
      readMonthDay(
        record.end,
        { monthIndex: months.length - 1, day: months[months.length - 1]?.days ?? 1 },
        months
      )
    );

    return {
      id: readString(record.id, slugify(name || `season-${index + 1}`)),
      name,
      startDay: clamp(
        Math.trunc(readNumber(record.startDay, fallbackStartDay)),
        1,
        seasonCycleLength
      ),
      endDay: clamp(
        Math.trunc(readNumber(record.endDay, fallbackEndDay)),
        1,
        seasonCycleLength
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

function readMoonCycleAnchor(value: unknown): FantasyMoon["cycleAnchor"] {
  return value === "month" ? "month" : "absolute";
}

function readTimelineStyle(raw: unknown): CalendarTimelineStyle | undefined {
  const record = asRecord(raw);
  const colors = readTimelineStyleColors(record.colors);
  const monthNames = readTimelineMonthNames(record.monthNames ?? record.months);

  const result: CalendarTimelineStyle = {
    name: readOptionalString(record.name),
    align:
      record.align === "right"
        ? "right"
        : record.align === "left"
          ? "left"
          : undefined,
    maxSummaryLines: readOptionalInteger(record.maxSummaryLines),
    cardWidth: readOptionalInteger(record.cardWidth),
    cardHeight: readOptionalInteger(record.cardHeight),
    boxHeight: readOptionalInteger(record.boxHeight),
    sideGapLeft: readOptionalInteger(record.sideGapLeft),
    sideGapRight: readOptionalInteger(record.sideGapRight),
    colors,
    monthNames: monthNames.length > 0 ? monthNames : undefined
  };

  return hasTimelineStyleValues(result) ? result : undefined;
}

function readTimelineStyleColors(
  raw: unknown
): CalendarTimelineStyle["colors"] | undefined {
  const record = asRecord(raw);

  const colors: NonNullable<CalendarTimelineStyle["colors"]> = {
    bg: readOptionalString(record.bg),
    accent: readOptionalString(record.accent),
    hover: readOptionalString(record.hover),
    title: readOptionalString(record.title),
    date: readOptionalString(record.date)
  };

  return Object.values(colors).some((value) => typeof value === "string" && value.length > 0)
    ? colors
    : undefined;
}

function readTimelineMonthNames(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(/[,\n;]+/g)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return readStringArray(raw);
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;
}

function readTimeAdvanceButtons(raw: unknown): TimeAdvanceButtonConfig[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry, index) => {
      const record = asRecord(entry);
      const hours = Math.trunc(readNumber(record.hours, 0));
      const minutes = Math.trunc(readNumber(record.minutes, 0));
      const label = readString(
        record.label,
        buildTimeAdvanceButtonLabel(hours, minutes, index)
      );

      return {
        id: readString(record.id, slugify(`${label}-${index + 1}`)),
        label,
        icon: readOptionalString(record.icon),
        hours,
        minutes
      };
    })
    .filter((button) => button.hours !== 0 || button.minutes !== 0);
}

function buildTimeAdvanceButtonLabel(
  hours: number,
  minutes: number,
  index: number
): string {
  const parts: string[] = [];

  if (hours !== 0) {
    parts.push(`${hours >= 0 ? "+" : ""}${hours}h`);
  }

  if (minutes !== 0) {
    parts.push(`${minutes >= 0 ? "+" : ""}${minutes}m`);
  }

  return parts.join(" ").trim() || `Advance ${index + 1}`;
}

function hasTimelineStyleValues(value: CalendarTimelineStyle): boolean {
  return (
    typeof value.name === "string" ||
    typeof value.align === "string" ||
    typeof value.maxSummaryLines === "number" ||
    typeof value.cardWidth === "number" ||
    typeof value.cardHeight === "number" ||
    typeof value.boxHeight === "number" ||
    typeof value.sideGapLeft === "number" ||
    typeof value.sideGapRight === "number" ||
    (Array.isArray(value.monthNames) && value.monthNames.length > 0) ||
    Object.values(value.colors ?? {}).some((entry) => typeof entry === "string" && entry.length > 0)
  );
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

function readPositiveNumber(value: unknown, fallback: number): number {
  const parsed = readNumber(value, fallback);
  return parsed > 0 ? parsed : fallback;
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

function cloneTimelineStyle(style: CalendarTimelineStyle): CalendarTimelineStyle {
  return {
    ...style,
    colors: style.colors ? { ...style.colors } : undefined,
    monthNames: style.monthNames ? [...style.monthNames] : undefined
  };
}

export function cloneCalendarDefinition(
  definition: FantasyCalendarDefinition
): FantasyCalendarDefinition {
  return {
    ...definition,
    weekdays: [...definition.weekdays],
    months: cloneMonths(definition.months),
    leapMonths: definition.leapMonths.map((rule) => ({
      ...rule,
      month: { ...rule.month },
      leapYearPositions: [...rule.leapYearPositions]
    })),
    leapDays: definition.leapDays.map((rule) => ({
      ...rule,
      leapYearPositions: [...rule.leapYearPositions]
    })),
    weatherProfile: { ...definition.weatherProfile },
    eras: definition.eras.map((era) => ({ ...era })),
    moons: definition.moons.map((moon) => ({
      ...moon,
      phaseImages: moon.phaseImages.map((entry) => ({ ...entry })),
      phaseLabels: [...moon.phaseLabels]
    })),
    yearNames: definition.yearNames.map((entry) => ({ ...entry })),
    seasons: definition.seasons.map((season) => ({ ...season })),
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
    timeline: calendar.timeline ? cloneTimelineStyle(calendar.timeline) : undefined,
    markers: cloneMarkers(calendar.markers),
    autoGenerateLinkedWeatherReferences: calendar.autoGenerateLinkedWeatherReferences
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
  monthIndex: number,
  year?: number
) {
  const months = typeof year === "number"
    ? getMonthsForYear(definition, year)
    : definition.months;

  return months[mod(monthIndex, months.length)];
}

export function getDaysInMonth(
  definition: FantasyCalendarDefinition,
  monthIndex: number,
  year?: number
): number {
  return getMonth(definition, monthIndex, year).days;
}

export function getMonthsForYear(
  definition: FantasyCalendarDefinition,
  year: number
): FantasyMonth[] {
  const result: FantasyMonth[] = [];
  const activeInsertions = [
    ...definition.leapMonths
      .filter((rule) => isLeapCycleActive(rule, year))
      .map((rule) => ({
        insertAfterMonthIndex: rule.insertAfterMonthIndex,
        order: 0,
        name: rule.name,
        month: { ...rule.month }
      })),
    ...definition.leapDays
      .filter((rule) => isLeapCycleActive(rule, year))
      .map((rule) => ({
        insertAfterMonthIndex: rule.insertAfterMonthIndex,
        order: 1,
        name: rule.name,
        month: {
          id: rule.id,
          name: rule.name,
          days: rule.days
        }
      }))
  ]
    .sort((left, right) => {
      if (left.insertAfterMonthIndex !== right.insertAfterMonthIndex) {
        return left.insertAfterMonthIndex - right.insertAfterMonthIndex;
      }
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });

  const appendInsertionsAfter = (monthIndex: number): void => {
    activeInsertions
      .filter((entry) => entry.insertAfterMonthIndex === monthIndex)
      .forEach((entry) => {
        result.push({ ...entry.month });
      });
  };

  appendInsertionsAfter(-1);

  definition.months.forEach((month, index) => {
    result.push({ ...month });
    appendInsertionsAfter(index);
  });

  return result.length > 0 ? result : cloneMonths(definition.months);
}

function isLeapCycleActive(
  rule: Pick<FantasyLeapMonthRule | FantasyLeapDayRule, "cycleYears" | "leapYearPositions">,
  year: number
): boolean {
  const cycleYears = Math.max(1, Math.trunc(rule.cycleYears || 1));
  const cyclePosition = mod(year - 1, cycleYears) + 1;
  return rule.leapYearPositions.includes(cyclePosition);
}

export function getYearLength(
  definition: FantasyCalendarDefinition,
  year?: number
): number {
  const months = typeof year === "number"
    ? getMonthsForYear(definition, year)
    : definition.months;

  return months.reduce((sum, month) => sum + month.days, 0);
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
  year: number,
  dayOfYear: number
): FantasyMonthDay {
  const months = getMonthsForYear(definition, year);
  const yearLength = getYearLength(definition, year);
  let remaining = mod(Math.trunc(dayOfYear) - 1, yearLength) + 1;

  for (let monthIndex = 0; monthIndex < months.length; monthIndex++) {
    const month = months[monthIndex];
    if (remaining <= month.days) {
      return {
        monthIndex,
        day: remaining
      };
    }
    remaining -= month.days;
  }

  return {
    monthIndex: months.length - 1,
    day: months[months.length - 1]?.days ?? 1
  };
}

export function getSeasonForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): FantasySeason | null {
  const currentDay = getSeasonDayForDate(definition, date);

  for (const season of definition.seasons) {
    const startDay = season.startDay;
    const endDay = season.endDay;
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

export function getSeasonCycleLength(definition: FantasyCalendarDefinition): number {
  return getSeasonCycleLengthForMonths(definition.weatherProfile, definition.months);
}

export function getSeasonDayForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const cycleLength = getSeasonCycleLength(definition);
  const normalized = clampDate(date, definition);

  return getWeatherProfileDayOfYearForDate(
    definition,
    normalized,
    clamp(getDayOfYear(definition, normalized), 1, cycleLength)
  );
}

export function getWeatherProfileDayOfYearForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate,
  fallbackDayOfYear?: number
): number {
  const normalized = clampDate(date, definition);
  const mapping = definition.weatherProfile;

  if (mapping.mode !== "absolute-day-cycle") {
    return fallbackDayOfYear ?? getDayOfYear(definition, normalized);
  }

  const cycleLength = Math.max(1, Math.trunc(mapping.climateYearLength || 1));
  const baseOffsetDays = Math.trunc(mapping.baseOffsetDays || 0);
  const dayOffset =
    mapping.cycleReset === "intercalation-cycle"
      ? getAbsoluteDayWithIntercalationCycleReset(definition, normalized)
      : getAbsoluteDay(definition, normalized);

  return mod(dayOffset + baseOffsetDays, cycleLength) + 1;
}

function getAbsoluteDayWithIntercalationCycleReset(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const cycleYears = getIntercalationCycleYears(definition);

  if (!cycleYears) {
    return getAbsoluteDay(definition, date);
  }

  const cycleStartYear = getYearCycleStartYear(date.year, cycleYears);
  let total = 0;

  for (let year = cycleStartYear; year < date.year; year += 1) {
    total += getYearLength(definition, year);
  }

  return total + getDayOfYear(definition, date) - 1;
}

function getIntercalationCycleYears(
  definition: FantasyCalendarDefinition
): number | null {
  const cycleYears = [
    ...definition.leapMonths.map((rule) => Math.max(1, Math.trunc(rule.cycleYears || 1))),
    ...definition.leapDays.map((rule) => Math.max(1, Math.trunc(rule.cycleYears || 1)))
  ];

  if (cycleYears.length === 0) {
    return null;
  }

  return cycleYears.reduce((current, next) => leastCommonMultiple(current, next), 1);
}

function getYearCycleStartYear(year: number, cycleYears: number): number {
  return Math.floor((year - 1) / cycleYears) * cycleYears + 1;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));

  while (b !== 0) {
    const rest = a % b;
    a = b;
    b = rest;
  }

  return a || 1;
}

function leastCommonMultiple(left: number, right: number): number {
  const a = Math.max(1, Math.trunc(left));
  const b = Math.max(1, Math.trunc(right));

  return Math.min(10000, Math.trunc((a * b) / greatestCommonDivisor(a, b)));
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
  const eras = definition.eras;
  let active: FantasyEra | null = null;

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
      ?.shortName ?? ""
  );
}

export function clampDate(
  date: FantasyDate,
  definition: FantasyCalendarDefinition
): FantasyDate {
  const year = Math.trunc(Number(date.year) || 0);
  const months = getMonthsForYear(definition, year);
  const monthIndex = mod(Math.trunc(Number(date.monthIndex) || 0), months.length);
  const day = Math.min(
    Math.max(1, Math.trunc(Number(date.day) || 1)),
    months[monthIndex]?.days ?? 1
  );

  return {
    year,
    monthIndex,
    day
  };
}

export function getDayOfYear(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const months = getMonthsForYear(definition, date.year);
  let total = 0;
  for (let i = 0; i < date.monthIndex; i++) {
    total += months[i]?.days ?? 0;
  }
  return total + date.day;
}

export function getAbsoluteDay(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const normalized = clampDate(date, definition);
  let total = 0;

  if (normalized.year >= 0) {
    for (let year = 0; year < normalized.year; year += 1) {
      total += getYearLength(definition, year);
    }
  } else {
    for (let year = -1; year >= normalized.year; year -= 1) {
      total -= getYearLength(definition, year);
    }
  }

  return total + getDayOfYear(definition, normalized) - 1;
}

export function absoluteDayToDate(
  definition: FantasyCalendarDefinition,
  absoluteDay: number
): FantasyDate {
  let year = 0;
  let remaining = Math.trunc(absoluteDay);

  if (remaining >= 0) {
    while (remaining >= getYearLength(definition, year)) {
      remaining -= getYearLength(definition, year);
      year += 1;
    }
  } else {
    do {
      year -= 1;
      remaining += getYearLength(definition, year);
    } while (remaining < 0);
  }

  return {
    year,
    ...dayOfYearToMonthDay(definition, year, remaining + 1)
  };
}

export function getWeekdayIndex(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  return mod(
    definition.startWeekdayIndex + getAbsoluteDay(definition, date),
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
  const yearStartIndex = getWeekdayIndex(definition, {
    year: date.year,
    monthIndex: 0,
    day: 1
  });

  return Math.floor((yearStartIndex + getDayOfYear(definition, date) - 1) / definition.weekdays.length) + 1;
}

export function shiftDay(
  date: FantasyDate,
  delta: number,
  definition: FantasyCalendarDefinition
): FantasyDate {
  return absoluteDayToDate(definition, getAbsoluteDay(definition, date) + delta);
}

export function shiftMonth(
  date: FantasyDate,
  delta: number,
  definition: FantasyCalendarDefinition
): FantasyDate {
  let year = date.year;
  let monthIndex = date.monthIndex + delta;

  while (monthIndex >= getMonthsForYear(definition, year).length) {
    monthIndex -= getMonthsForYear(definition, year).length;
    year++;
  }

  while (monthIndex < 0) {
    year--;
    monthIndex += getMonthsForYear(definition, year).length;
  }
  
  const months = getMonthsForYear(definition, year);

  return {
    year,
    monthIndex,
    day: Math.min(date.day, months[monthIndex]?.days ?? 1)
  };
}

export function shiftYear(
  date: FantasyDate,
  delta: number,
  definition: FantasyCalendarDefinition
): FantasyDate {
  const year = date.year + delta;
  const months = getMonthsForYear(definition, year);
  const monthIndex = Math.min(date.monthIndex, Math.max(0, months.length - 1));

  return {
    year,
    monthIndex,
    day: Math.min(date.day, months[monthIndex]?.days ?? 1)
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
  const month = getMonth(definition, monthIndex, year);
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
  const eraLabel = getEraShortLabel(definition, date);
  return `${date.day}. ${getMonth(definition, date.monthIndex, date.year).name} ${formatYearLabel(definition, date.year)}${eraLabel ? ` ${eraLabel}` : ""}`;
}

export function formatDateWithPattern(
  date: FantasyDate,
  definition: FantasyCalendarDefinition,
  pattern: string
): string {
  const normalized = clampDate(date, definition);
  const month = getMonth(definition, normalized.monthIndex, normalized.year);
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

export function buildDefaultSeasons(
  months: FantasyMonth[],
  cycleLength = getMonthListLength(months)
): FantasySeason[] {
  if (months.length === 0) {
    return [];
  }

  const starts = [
    1,
    Math.floor(cycleLength / 4) + 1,
    Math.floor(cycleLength / 2) + 1,
    Math.floor((cycleLength * 3) / 4) + 1
  ];

  const seasons: FantasySeason[] = [];

  for (let index = 0; index < starts.length; index++) {
    const startDay = clamp(starts[index] ?? 1, 1, cycleLength);
    const nextStartDay = index === starts.length - 1
      ? cycleLength + 1
      : clamp(starts[index + 1] ?? cycleLength + 1, 1, cycleLength + 1);

    seasons.push({
      id: slugify(DEFAULT_SEASON_NAMES[index] ?? `season-${index + 1}`),
      name: DEFAULT_SEASON_NAMES[index] ?? `Season ${index + 1}`,
      startDay,
      endDay: clamp(nextStartDay - 1, 1, cycleLength),
      color: DEFAULT_SEASON_COLORS[index % DEFAULT_SEASON_COLORS.length]
    });
  }

  if (seasons.length === 0) {
    return [
      {
        id: "season-1",
        name: "Season 1",
        startDay: 1,
        endDay: cycleLength,
        color: DEFAULT_SEASON_COLORS[0]
      }
    ];
  }

  return seasons;
}

function getMonthListLength(months: FantasyMonth[]): number {
  return Math.max(1, months.reduce((sum, month) => sum + month.days, 0));
}

function getSeasonCycleLengthForMonths(
  mapping: FantasyWeatherProfileMapping,
  months: FantasyMonth[]
): number {
  if (mapping.mode === "absolute-day-cycle") {
    return Math.max(1, Math.trunc(mapping.climateYearLength || 1));
  }

  return getMonthListLength(months);
}

function monthDayToDayInMonths(
  months: FantasyMonth[],
  date: FantasyMonthDay
): number {
  const normalized = clampMonthDayToMonths(date, months);
  let total = 0;

  for (let index = 0; index < normalized.monthIndex; index += 1) {
    total += months[index]?.days ?? 0;
  }

  return total + normalized.day;
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