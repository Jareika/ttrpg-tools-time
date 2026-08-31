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
  FantasyIntercalaryDayRule,
  FantasyTimeConfig,
  FantasyWeatherProfileMapping,
  FantasyMonthDay,
  FantasyEra,
  FantasyDate,
  FantasyYearDisplayConfig,
  FantasyMonth,
  FantasyMoon,
  FantasyNamedYear,
  FantasySeason,
  FrontmatterColorMappingRule,
  FrontmatterExportSettings,
  FrontmatterImportSettings,
  MonthGrid,
  MonthGridCell,
  MoonPhaseImageDefinition,
  TagDefinition,
  TagPackFile,
  TimeAdvanceButtonConfig,
  TimelineFilterPaneSettings,
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

interface LeapRuleComputationSummary {
  cycleYears: number;
  residues: number[];
  extraDays: number;
  extraWeekdayDays: number;
  skipYearsDivisibleBy?: number[];
}

interface DefinitionComputationContext {
  baseYearLength: number;
  baseWeekdayLength: number;
  leapRuleSummaries: LeapRuleComputationSummary[];
}

interface YearComputationContext {
  year: number;
  months: FantasyMonth[];
  monthStartDays: number[];
  monthStartWeekdayOffsets: number[];
  yearLength: number;
  daysBeforeYear: number;
  yearStartWeekdayIndex: number;
}

const DEFINITION_CONTEXT_CACHE = new WeakMap<
  FantasyCalendarDefinition,
  DefinitionComputationContext
>();

const YEAR_CONTEXT_CACHE = new WeakMap<
  FantasyCalendarDefinition,
  Map<number, YearComputationContext>
>();

const DEFAULT_TIME_CONFIG: FantasyTimeConfig = {
  enabled: false,
  hoursPerDay: 24,
  minutesPerHour: 60
};

const DEFAULT_YEAR_DISPLAY: FantasyYearDisplayConfig = {
  negativeYearsMode: "signed",
  largeYearFormat: "plain",
  eraYearMode: "absolute"
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
  intercalaryDays: [],
  weatherProfile: { ...DEFAULT_WEATHER_PROFILE },
  moons: [],
  eras: buildDefaultEras("Era"),
  yearNames: [],
  namedWeeks: [],
  startWeekdayIndex: 0,
  monthWeekdayMode: "continuous",
  seasons: buildDefaultSeasons(DEFAULT_MONTHS),
  time: { ...DEFAULT_TIME_CONFIG },
  yearDisplay: { ...DEFAULT_YEAR_DISPLAY }
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
    cursorDate: { year: 1, monthIndex: 0, day: 1 },
    showEraDescription: false
  },
  linkedTagPackIds: [],
  linkedCalendarIds: [],
  linkedWeatherPackIds: [],
  weatherEnabled: true,
  defaultWeatherPackId: "general",
  frontmatterImportValues: [],
  markers: [],
  autoGenerateLinkedWeatherReferences: false,
  description: "Default calendar created on first launch."
};

export const DEFAULT_FRONTMATTER_IMPORT_SETTINGS: FrontmatterImportSettings = {
  enabled: false,
  fallbackTitleToFilename: true,
  colorMappings: []
};

export const DEFAULT_FRONTMATTER_EXPORT_SETTINGS: FrontmatterExportSettings = {
  enabled: false,
  clearMissingFields: true
};

export const DEFAULT_SETTINGS: TtrpgToolsTimeSettings = {
  dataFolder: "TTRPG/Time",
  activeCalendarId: DEFAULT_CALENDAR_FILE.id,
  dayViewDateFormat: "D-M-YYYY",
  showCalendarWeekNumbers: false,
  temperatureUnit: "c",
  controlTimeButtons: [],
  communityLibraryIndexUrl: "https://jareika.github.io/ttrpg-tools-time-library/index.json",
  frontmatterImport: cloneFrontmatterImportSettings(DEFAULT_FRONTMATTER_IMPORT_SETTINGS),
  frontmatterExport: cloneFrontmatterExportSettings(DEFAULT_FRONTMATTER_EXPORT_SETTINGS)
};

export const DEFAULT_FANTASY_CLOCK_STATE: FantasyClockState = {
  byCalendarId: {}
};

export function normalizeSettings(raw: unknown): TtrpgToolsTimeSettings {
  const record = asRecord(raw);

  return {
    dataFolder: readString(record.dataFolder, DEFAULT_SETTINGS.dataFolder),
    activeCalendarId: readOptionalString(record.activeCalendarId) ?? null,
    dayViewDateFormat: readString(record.dayViewDateFormat, DEFAULT_SETTINGS.dayViewDateFormat),
    showCalendarWeekNumbers: readBoolean(record.showCalendarWeekNumbers, DEFAULT_SETTINGS.showCalendarWeekNumbers),
    temperatureUnit: readTemperatureUnit(record.temperatureUnit),
	controlTimeButtons: readTimeAdvanceButtons(record.controlTimeButtons),
    communityLibraryIndexUrl: readString(
      record.communityLibraryIndexUrl,
      DEFAULT_SETTINGS.communityLibraryIndexUrl
    ),
    frontmatterImport: readFrontmatterImportSettings(record.frontmatterImport),
    frontmatterExport: readFrontmatterExportSettings(record.frontmatterExport)
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
	intercalaryDays: rawDefinition.intercalaryDays,
    weatherProfile: rawDefinition.weatherProfile,
    yearNames: rawDefinition.yearNames,
	namedWeeks: rawDefinition.namedWeeks,
    startWeekdayIndex: rawDefinition.startWeekdayIndex,
    seasons: rawDefinition.seasons,
    monthWeekdayMode: rawDefinition.monthWeekdayMode,
    yearDisplay: rawDefinition.yearDisplay,
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
	linkedCalendarIds: readStringArray(record.linkedCalendarIds),
    linkedWeatherPackIds: readStringArray(record.linkedWeatherPackIds),
	weatherEnabled: readBoolean(record.weatherEnabled, true),
	frontmatterImportValues: readFrontmatterImportValues(record.frontmatterImportValues),
    defaultWeatherPackId:
      readOptionalString(record.defaultWeatherPackId) ??
      DEFAULT_CALENDAR_FILE.defaultWeatherPackId,
    autoGenerateLinkedWeatherReferences: readBoolean(
      record.autoGenerateLinkedWeatherReferences,
      DEFAULT_CALENDAR_FILE.autoGenerateLinkedWeatherReferences ?? false
    ),
	timeline: readTimelineStyle(record.timeline),
	timelineFilter: readTimelineFilterPaneSettings(record.timelineFilter),
	bannerImageRef: readOptionalString(record.bannerImageRef),
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
  const leapDays = readLeapDays(record.leapDays, normalizedMonths);
  const configuredIntercalaryDays = readIntercalaryDays(
    record.intercalaryDays,
    normalizedMonths
  );
  const migratedStandaloneLeapDays = migrateStandaloneLeapDays(leapDays);
  const intercalaryDays = mergeIntercalaryDays(
    configuredIntercalaryDays,
    migratedStandaloneLeapDays
  );

  return {
    id: readString(record.id, DEFAULT_CALENDAR_DEFINITION.id),
    name: readString(record.name, DEFAULT_CALENDAR_DEFINITION.name),
    eraLabel: readString(record.eraLabel, DEFAULT_CALENDAR_DEFINITION.eraLabel),
    weekdays: normalizedWeekdays,
    months: normalizedMonths,
    leapMonths: readLeapMonths(record.leapMonths, normalizedMonths),
    leapDays: leapDays.filter((rule) => rule.placement === "append-to-month"),
    intercalaryDays,
    weatherProfile,
    eras: readEras(record.eras, readString(record.eraLabel, DEFAULT_CALENDAR_DEFINITION.eraLabel), normalizedMonths),
    moons: readMoons(record.moons),
    yearNames: readNamedYears(record.yearNames),
	namedWeeks: readNamedWeeks(record.namedWeeks),
	monthWeekdayMode: readMonthWeekdayMode(record.monthWeekdayMode),
    startWeekdayIndex: mod(
      readNumber(record.startWeekdayIndex, DEFAULT_CALENDAR_DEFINITION.startWeekdayIndex),
      normalizedWeekdays.length
    ),
	yearDisplay: readYearDisplay(record.yearDisplay),
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
    cursorDate,
    showEraDescription: readBoolean(record.showEraDescription, false)
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
      days: Math.max(1, Math.trunc(readNumber(record.days, 1))),
      color: readOptionalColor(record.color)
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
        days: Math.max(1, Math.trunc(readNumber(monthRecord.days, 30))),
        color: readOptionalColor(monthRecord.color)
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
	  placement: readLeapDayPlacement(record.placement),
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

function readIntercalaryDays(
  raw: unknown,
  months: FantasyMonth[]
): FantasyIntercalaryDayRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const name = readString(record.name, `Named Day ${index + 1}`);
    const cycleYears = Math.max(1, Math.trunc(readNumber(record.cycleYears, 1)));
    const rawPositions = Array.isArray(record.activeYearPositions)
      ? record.activeYearPositions
      : [];
    const activeYearPositions = [...new Set(
      rawPositions
        .map((value) => Math.trunc(readNumber(value, 0)))
        .filter((value) => value >= 1 && value <= cycleYears)
    )].sort((left, right) => left - right);

    return {
      id: readString(record.id, slugify(name || `named-day-${index + 1}`)),
      name,
      insertAfterMonthIndex: clamp(
        Math.trunc(readNumber(record.insertAfterMonthIndex, months.length - 1)),
        -1,
        Math.max(-1, months.length - 1)
      ),
      order: Math.trunc(readNumber(record.order, index)),
      weekdayMode: record.weekdayMode === "none" ? "none" : "normal",
      displayPosition: readIntercalaryDayDisplayPosition(
        record.displayPosition,
        record.weekdayMode
      ),
      cycleYears,
      activeYearPositions:
        activeYearPositions.length > 0
          ? activeYearPositions
          : [cycleYears],
      skipYearsDivisibleBy: readPositiveIntegerArray(record.skipYearsDivisibleBy),
      color: readOptionalColor(record.color),
      icon: readOptionalString(record.icon),
      imageRef: readOptionalString(record.imageRef)
    };
  });
}

function readPositiveIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((entry) => Math.trunc(readNumber(entry, 0)))
      .filter((entry) => entry > 0)
  )].sort((left, right) => left - right);
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

function readNamedWeeks(raw: unknown): FantasyCalendarDefinition["namedWeeks"] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const byWeek = new Map<number, string>();

  raw.forEach((entry) => {
    const record = asRecord(entry);
    const week = Math.max(1, Math.trunc(readNumber(record.week, 0)));
    const name = readOptionalString(record.name);

    if (name) {
      byWeek.set(week, name);
    }
  });

  return [...byWeek.entries()]
    .map(([week, name]) => ({ week, name }))
    .sort((left, right) => left.week - right.week);
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
      const startYear = Math.trunc(readNumber(record.startYear, 0));
	  const startMonthIndex = mod(
        Math.trunc(readNumber(record.startMonthIndex, 0)),
        months.length
      );
      const startDay = Math.min(
        Math.max(1, Math.trunc(readNumber(record.startDay, 1))),
        months[startMonthIndex]?.days ?? 1
      );
      const rawEndYear = readOptionalInteger(record.endYear);
      const rawEndMonthIndex = readOptionalInteger(record.endMonthIndex);
      const rawEndDay = readOptionalInteger(record.endDay);
      const hasEnd =
        rawEndYear !== undefined ||
        rawEndMonthIndex !== undefined ||
        rawEndDay !== undefined;
      const endMonthIndex = hasEnd
        ? clamp(
            rawEndMonthIndex ?? months.length - 1,
            0,
            Math.max(0, months.length - 1)
          )
        : 0;
      const endDay = hasEnd
        ? clamp(
            rawEndDay ?? (months[endMonthIndex]?.days ?? 1),
            1,
            months[endMonthIndex]?.days ?? 1
          )
        : 1;

      return {
        id: readString(record.id, slugify(shortName || name || `era-${index + 1}`)),
        name,
        shortName,
        description: readOptionalString(record.description),
        startYear,
        startMonthIndex,
        startDay,
        ...(hasEnd
          ? {
              endYear: rawEndYear ?? startYear,
              endMonthIndex,
              endDay
            }
          : {})
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

function readLeapDayPlacement(value: unknown): FantasyLeapDayRule["placement"] {
  return value === "append-to-month" ? "append-to-month" : "standalone";
}

function readIntercalaryDayDisplayPosition(
  value: unknown,
  weekdayMode: unknown
): FantasyIntercalaryDayRule["displayPosition"] {
  if (weekdayMode === "none") {
    return "standalone";
  }

  return value === "after-previous-month" || value === "before-next-month"
    ? value
    : "standalone";
}

function readMonthWeekdayMode(value: unknown): FantasyCalendarDefinition["monthWeekdayMode"] {
  return value === "reset" ? "reset" : "continuous";
}

function readYearDisplay(raw: unknown): FantasyYearDisplayConfig {
  const record = asRecord(raw);

  return {
    negativeYearsMode:
      record.negativeYearsMode === "absolute" ? "absolute" : DEFAULT_YEAR_DISPLAY.negativeYearsMode,
    largeYearFormat:
      record.largeYearFormat === "abbreviated" ? "abbreviated" : DEFAULT_YEAR_DISPLAY.largeYearFormat,
    eraYearMode:
      record.eraYearMode === "relative"
        ? "relative"
        : DEFAULT_YEAR_DISPLAY.eraYearMode
  };
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
    showMoons: record.showMoons === true ? true : undefined,
    hoverPreviewImageOnly:
      typeof record.hoverPreviewImageOnly === "boolean"
        ? record.hoverPreviewImageOnly : undefined,
    moonSize: readOptionalInteger(record.moonSize),
    maxSummaryLines: readOptionalInteger(record.maxSummaryLines),
    cardWidth: readOptionalInteger(record.cardWidth),
    cardHeight: readOptionalInteger(record.cardHeight),
    boxHeight: readOptionalInteger(record.boxHeight),
    gridRows: readTimelineGridRows(record.gridRows),
	gridColumns: readTimelineGridColumns(record.gridColumns),
    gridTileHeight: readOptionalPositiveInteger(record.gridTileHeight),
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

function readOptionalPositiveInteger(value: unknown): number | undefined {
  const parsed = readOptionalInteger(value);

  return typeof parsed === "number" && parsed > 0
    ? parsed
    : undefined;
}

function readTimelineGridRows(
  value: unknown
): CalendarTimelineStyle["gridRows"] {
  return value === 2 || value === 3 || value === 4
    ? value
    : undefined;
}

function readTimelineGridColumns(
  value: unknown
): CalendarTimelineStyle["gridColumns"] {
  return value === 2 || value === 3 || value === 4
    ? value
    : undefined;
}

function readTimelineFilterPaneSettings(
  raw: unknown
): TimelineFilterPaneSettings | undefined {
  const record = asRecord(raw);

  const hasExplicitSettings =
    typeof record.showYears === "boolean" ||
    typeof record.showMonths === "boolean" ||
    typeof record.showEras === "boolean" ||
    record.yearSelectorMode === "buttons" ||
    record.yearSelectorMode === "dropdown" ||
    record.monthSelectorMode === "buttons" ||
    record.monthSelectorMode === "dropdown" ||
    record.contentOrder === "dates-first" ||
    record.contentOrder === "tags-first";

  if (!hasExplicitSettings) {
    return undefined;
  }

  return {
    showYears: record.showYears !== false,
    showMonths:
      record.showYears !== false &&
      record.showMonths !== false,
    showEras: record.showEras !== false,
    yearSelectorMode:
      record.yearSelectorMode === "dropdown"
        ? "dropdown"
        : "buttons",
    monthSelectorMode:
      record.monthSelectorMode === "dropdown"
        ? "dropdown"
        : "buttons",
    contentOrder:
      record.contentOrder === "tags-first"
        ? "tags-first"
        : "dates-first"
  };
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

function readFrontmatterImportSettings(raw: unknown): FrontmatterImportSettings {
  const record = asRecord(raw);

  return {
    enabled: readBoolean(record.enabled, DEFAULT_FRONTMATTER_IMPORT_SETTINGS.enabled),
    titleProperty: readOptionalString(record.titleProperty),
    startDateProperty: readOptionalString(record.startDateProperty),
    endDateProperty: readOptionalString(record.endDateProperty),
    startHourProperty: readOptionalString(record.startHourProperty),
    startMinuteProperty: readOptionalString(record.startMinuteProperty),
    endHourProperty: readOptionalString(record.endHourProperty),
    endMinuteProperty: readOptionalString(record.endMinuteProperty),
    descriptionProperty: readOptionalString(record.descriptionProperty),
    imageProperty: readOptionalString(record.imageProperty),
    weatherPackProperty: readOptionalString(record.weatherPackProperty),
    tagProperty: readOptionalString(record.tagProperty),
	calendarProperty: readOptionalString(record.calendarProperty),
    syncIdProperty: readOptionalString(record.syncIdProperty),
    colorProperty: readOptionalString(record.colorProperty),
    recurrenceFrequencyProperty: readOptionalString(record.recurrenceFrequencyProperty),
    recurrenceIntervalProperty: readOptionalString(record.recurrenceIntervalProperty),
    recurrenceEndModeProperty: readOptionalString(record.recurrenceEndModeProperty),
    recurrenceCountProperty: readOptionalString(record.recurrenceCountProperty),
    recurrenceUntilProperty: readOptionalString(record.recurrenceUntilProperty),
    fallbackTitleToFilename: readBoolean(
      record.fallbackTitleToFilename,
      DEFAULT_FRONTMATTER_IMPORT_SETTINGS.fallbackTitleToFilename
    ),
    colorMappings: readFrontmatterColorMappings(record.colorMappings)
  };
}

function readFrontmatterExportSettings(raw: unknown): FrontmatterExportSettings {
  const record = asRecord(raw);

  return {
    enabled: readBoolean(record.enabled, DEFAULT_FRONTMATTER_EXPORT_SETTINGS.enabled),
    titleProperty: readOptionalString(record.titleProperty),
    startDateProperty: readOptionalString(record.startDateProperty),
    endDateProperty: readOptionalString(record.endDateProperty),
    startHourProperty: readOptionalString(record.startHourProperty),
    startMinuteProperty: readOptionalString(record.startMinuteProperty),
    endHourProperty: readOptionalString(record.endHourProperty),
    endMinuteProperty: readOptionalString(record.endMinuteProperty),
    descriptionProperty: readOptionalString(record.descriptionProperty),
    imageProperty: readOptionalString(record.imageProperty),
    weatherPackProperty: readOptionalString(record.weatherPackProperty),
    tagProperty: readOptionalString(record.tagProperty),
	calendarProperty: readOptionalString(record.calendarProperty),
    syncIdProperty: readOptionalString(record.syncIdProperty),
    colorProperty: readOptionalString(record.colorProperty),
    recurrenceFrequencyProperty: readOptionalString(record.recurrenceFrequencyProperty),
    recurrenceIntervalProperty: readOptionalString(record.recurrenceIntervalProperty),
    recurrenceEndModeProperty: readOptionalString(record.recurrenceEndModeProperty),
    recurrenceCountProperty: readOptionalString(record.recurrenceCountProperty),
    recurrenceUntilProperty: readOptionalString(record.recurrenceUntilProperty),
    clearMissingFields: readBoolean(
      record.clearMissingFields,
      DEFAULT_FRONTMATTER_EXPORT_SETTINGS.clearMissingFields
    )
  };
}

function readFrontmatterColorMappings(raw: unknown): FrontmatterColorMappingRule[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const property = readString(record.property, "");
    const value = readString(record.value, "");
    const color = normalizeColor(readOptionalString(record.color), "#d46b65");

    return {
      id: readString(record.id, slugify(`${property || "property"}-${value || index + 1}`)),
      property,
      value,
      color
    };
  }).filter((entry) => entry.property.length > 0 && entry.value.length > 0);
}

function cloneFrontmatterImportSettings(
  value: FrontmatterImportSettings
): FrontmatterImportSettings {
  return {
    ...value,
    colorMappings: value.colorMappings.map((entry) => ({ ...entry }))
  };
}

function cloneFrontmatterExportSettings(
  value: FrontmatterExportSettings
): FrontmatterExportSettings {
  return {
    ...value
  };
}

function hasTimelineStyleValues(value: CalendarTimelineStyle): boolean {
  return (
    typeof value.name === "string" ||
    typeof value.align === "string" ||
    value.showMoons === true ||
	typeof value.hoverPreviewImageOnly === "boolean" ||
    typeof value.moonSize === "number" ||
    typeof value.maxSummaryLines === "number" ||
    typeof value.cardWidth === "number" ||
    typeof value.cardHeight === "number" ||
    typeof value.boxHeight === "number" ||
    typeof value.gridRows === "number" ||
	typeof value.gridColumns === "number" ||
    typeof value.gridTileHeight === "number" ||
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

function readOptionalColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readTemperatureUnit(value: unknown): TtrpgToolsTimeSettings["temperatureUnit"] {
  return value === "f" ? "f" : "c";
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

function readFrontmatterImportValues(value: unknown): string[] {
  const seen = new Set<string>();

  return readStringArray(value).filter((entry) => {
    const normalized = entry.toLowerCase();

    if (seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
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
  return clamp(Math.trunc(value || DEFAULT_MOON_SIZE), 12, 300);
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

function cloneTimelineFilterPaneSettings(
  settings: TimelineFilterPaneSettings
): TimelineFilterPaneSettings {
  return { ...settings };
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
    intercalaryDays: definition.intercalaryDays.map((rule) => ({
      ...rule,
      activeYearPositions: [...rule.activeYearPositions],
      skipYearsDivisibleBy: [...rule.skipYearsDivisibleBy]
    })),
    eras: definition.eras.map((era) => ({ ...era })),
    moons: definition.moons.map((moon) => ({
      ...moon,
      phaseImages: moon.phaseImages.map((entry) => ({ ...entry })),
      phaseLabels: [...moon.phaseLabels]
    })),
    yearNames: definition.yearNames.map((entry) => ({ ...entry })),
	namedWeeks: definition.namedWeeks.map((entry) => ({ ...entry })),
    monthWeekdayMode: definition.monthWeekdayMode,
    yearDisplay: { ...definition.yearDisplay },
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
      cursorDate: cloneDate(calendar.state.cursorDate),
      showEraDescription: calendar.state.showEraDescription
    },
    linkedTagPackIds: [...calendar.linkedTagPackIds],
	linkedCalendarIds: [...calendar.linkedCalendarIds],
    linkedWeatherPackIds: [...calendar.linkedWeatherPackIds],
	weatherEnabled: calendar.weatherEnabled,
	frontmatterImportValues: [...(calendar.frontmatterImportValues ?? [])],
    defaultWeatherPackId: calendar.defaultWeatherPackId,
    timeline: calendar.timeline ? cloneTimelineStyle(calendar.timeline) : undefined,
    timelineFilter: calendar.timelineFilter
      ? cloneTimelineFilterPaneSettings(calendar.timelineFilter) : undefined,
	bannerImageRef: calendar.bannerImageRef,
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
  const months =
    typeof year === "number"
      ? getYearContext(definition, year).months
      : definition.months;

  return months[mod(monthIndex, months.length)];
}

export function isIntercalaryMonth(month: FantasyMonth): boolean {
  return month.kind === "intercalary-day";
}

export function isIntercalaryDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): boolean {
  return isIntercalaryMonth(getMonth(definition, date.monthIndex, date.year));
}

export function getIntercalaryDayRuleForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): FantasyIntercalaryDayRule | null {
  const month = getMonth(definition, date.monthIndex, date.year);

  if (!isIntercalaryMonth(month) || !month.intercalaryDayId) {
    return null;
  }

  return definition.intercalaryDays.find(
    (rule) => rule.id === month.intercalaryDayId
  ) ?? null;
}

export function isInlineIntercalaryDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): boolean {
  const rule = getIntercalaryDayRuleForDate(definition, date);

  return Boolean(
    rule &&
      rule.weekdayMode === "normal" &&
      rule.displayPosition !== "standalone"
  );
}

export function getInlineIntercalaryHostMonthIndex(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number | null {
  const rule = getIntercalaryDayRuleForDate(definition, date);

  if (
    !rule ||
    rule.weekdayMode !== "normal" ||
    rule.displayPosition === "standalone"
  ) {
    return null;
  }

  const months = getMonthsForYear(definition, date.year);

  if (rule.displayPosition === "after-previous-month") {
    for (let index = date.monthIndex - 1; index >= 0; index -= 1) {
      if (!isIntercalaryMonth(months[index] ?? { id: "", name: "", days: 1 })) {
        return index;
      }
    }
    return null;
  }

  for (let index = date.monthIndex + 1; index < months.length; index += 1) {
    if (!isIntercalaryMonth(months[index] ?? { id: "", name: "", days: 1 })) {
      return index;
    }
  }

  return null;
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
  return getYearContext(definition, year).months;
}

function buildMonthsForYear(
  definition: FantasyCalendarDefinition,
  year: number
): FantasyMonth[] {
  const baseMonths: FantasyMonth[] = cloneMonths(definition.months);
  const result: FantasyMonth[] = [];
  const maxMonthIndex = Math.max(-1, baseMonths.length - 1);

  definition.leapDays
    .filter((rule) => rule.placement === "append-to-month")
    .filter((rule) => isLeapCycleActive(rule, year))
    .forEach((rule) => {
      const targetMonthIndex = clamp(
        rule.insertAfterMonthIndex,
        0,
        Math.max(0, baseMonths.length - 1)
      );
      const targetMonth = baseMonths[targetMonthIndex];
      if (targetMonth) {
        baseMonths[targetMonthIndex] = { ...targetMonth, days: targetMonth.days + rule.days };
      }
    });

  const activeInsertions: Array<{
    insertAfterMonthIndex: number;
    category: number;
    order: number;
    name: string;
    month: FantasyMonth;
  }> = [
    ...definition.leapMonths
      .filter((rule) => isLeapCycleActive(rule, year))
      .map((rule, index) => ({
        insertAfterMonthIndex: rule.insertAfterMonthIndex,
        category: 0,
        order: index,
        name: rule.name,
        month: { ...rule.month }
      })),
    ...definition.leapDays
      .filter((rule) => rule.placement !== "append-to-month")
      .filter((rule) => isLeapCycleActive(rule, year))
      .map((rule, index) => ({
        insertAfterMonthIndex: rule.insertAfterMonthIndex,
        category: 1,
        order: index,
        name: rule.name,
        month: {
          id: rule.id,
          name: rule.name,
          days: rule.days
        }
      })),
    ...definition.intercalaryDays
      .filter((rule) => isIntercalaryDayActive(rule, year))
      .map((rule) => ({
        insertAfterMonthIndex: clamp(rule.insertAfterMonthIndex, -1, maxMonthIndex),
        category: 2,
        order: rule.order,
        name: rule.name,
        month: {
          id: `intercalary-${rule.id}`,
          name: rule.name,
          days: 1,
          color: rule.color,
          kind: "intercalary-day" as const,
          intercalaryDayId: rule.id,
          weekdayMode: rule.weekdayMode
        }
      }))
  ]
    .sort((left, right) => {
      if (left.insertAfterMonthIndex !== right.insertAfterMonthIndex) {
        return left.insertAfterMonthIndex - right.insertAfterMonthIndex;
      }
      if (left.category !== right.category) {
        return left.category - right.category;
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

  baseMonths.forEach((month, index) => {
    result.push({ ...month });
    appendInsertionsAfter(index);
  });

  return result.length > 0 ? result : baseMonths;
}

function isLeapCycleActive(
  rule: Pick<FantasyLeapMonthRule | FantasyLeapDayRule, "cycleYears" | "leapYearPositions">,
  year: number
): boolean {
  const cycleYears = Math.max(1, Math.trunc(rule.cycleYears || 1));
  const cyclePosition = mod(year - 1, cycleYears) + 1;
  return rule.leapYearPositions.includes(cyclePosition);
}

function isIntercalaryDayActive(
  rule: FantasyIntercalaryDayRule,
  year: number
): boolean {
  if (
    rule.skipYearsDivisibleBy.some(
      (divisor) => divisor > 0 && mod(year, divisor) === 0
    )
  ) {
    return false;
  }

  const cyclePosition = mod(year - 1, rule.cycleYears) + 1;
  return rule.activeYearPositions.includes(cyclePosition);
}

export function getYearLength(
  definition: FantasyCalendarDefinition,
  year?: number
): number {
  if (typeof year === "number") {
    return getYearContext(definition, year).yearLength;
  }

  return getDefinitionComputationContext(definition).baseYearLength;
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
  const context = getYearContext(definition, year);
  const months = context.months;
  const yearLength = context.yearLength;
  let remaining = mod(Math.trunc(dayOfYear) - 1, yearLength) + 1;

  for (let monthIndex = 0; monthIndex < months.length; monthIndex += 1) {
    const month = months[monthIndex];
    if (month && remaining <= month.days) {
      return { monthIndex, day: remaining };
    }
    remaining -= month?.days ?? 0;
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

export function getSeasonColorForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): string | undefined {
  const season = getSeasonForDate(definition, date);

  if (!season || definition.seasons.length < 2) {
    return season?.color;
  }

  const cycleLength = getSeasonCycleLength(definition);
  const orderedSeasons = [...definition.seasons].sort(
    (left, right) => left.startDay - right.startDay
  );
  const seasonIndex = orderedSeasons.findIndex(
    (candidate) => candidate === season || candidate.id === season.id
  );

  if (seasonIndex < 0) {
    return season.color;
  }

  const nextSeason =
    orderedSeasons[(seasonIndex + 1) % orderedSeasons.length];

  if (!nextSeason || nextSeason.color === season.color) {
    return season.color;
  }

  const currentDay = getSeasonDayForDate(definition, date);
  const seasonLength =
    mod(season.endDay - season.startDay, cycleLength) + 1;
  const elapsedDays = mod(currentDay - season.startDay, cycleLength);
  const progress = Math.min(
    1,
    Math.max(0, elapsedDays / Math.max(1, seasonLength))
  );
  const currentSeasonWeight = Math.round((1 - progress) * 100);

  if (currentSeasonWeight >= 100) {
    return season.color;
  }

  return `color-mix(in srgb, ${season.color} ${currentSeasonWeight}%, ${nextSeason.color})`;
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
  const total =
    getDaysBeforeYear(definition, date.year) -
    getDaysBeforeYear(definition, cycleStartYear);

  return total + getDayOfYear(definition, date) - 1;
}

function getIntercalationCycleYears(
  definition: FantasyCalendarDefinition
): number | null {
  const cycleYears = [
    ...definition.leapMonths.map((rule) => Math.max(1, Math.trunc(rule.cycleYears || 1))),
    ...definition.leapDays.map((rule) => Math.max(1, Math.trunc(rule.cycleYears || 1))),
    ...definition.intercalaryDays.map((rule) =>
      Math.max(1, Math.trunc(rule.cycleYears || 1))
    )
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
      endYear: undefined,
      endMonthIndex: undefined,
      endDay: undefined,
      startMonthIndex: 0,
      startDay: 1
    }
  ];
}

export function getEraForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): FantasyEra | null {
  for (let index = definition.eras.length - 1; index >= 0; index -= 1) {
    const era = definition.eras[index];
    if (!era) {
      continue;
    }

    const startsBeforeOrOn =
      compareDateParts(date, {
        year: era.startYear,
        monthIndex: era.startMonthIndex,
        day: era.startDay
      }) >= 0;

    if (!startsBeforeOrOn) {
      continue;
    }

    if (typeof era.endYear !== "number") {
      return era;
    }
    if (compareDateParts(date, buildEraEndDate(era, definition.months)) <= 0) {
      return era;
    }
  }
  return null;
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

export type YearDisplayVariant = "verbose" | "compact";

export function getEraYear(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const era = getEraForDate(definition, date);

  if (!era) {
    return date.year;
  }

  return date.year - era.startYear + 1;
}

export function getDisplayYearValue(
  definition: FantasyCalendarDefinition,
  input: FantasyDate | number
): number {
  const date =
    typeof input === "number"
      ? { year: input, monthIndex: 0, day: 1 }
      : input;

  return definition.yearDisplay.eraYearMode === "relative"
    ? getEraYear(definition, date)
    : date.year;
}

export function formatDisplayYear(
  definition: FantasyCalendarDefinition,
  input: FantasyDate | number,
  variant: YearDisplayVariant = "verbose"
): string {
  return formatConfiguredYearValue(
    definition,
    getDisplayYearValue(definition, input),
    variant
  );
}

export function formatEraYear(
  definition: FantasyCalendarDefinition,
  date: FantasyDate,
  variant: YearDisplayVariant = "verbose"
): string {
  return formatConfiguredYearValue(definition, getEraYear(definition, date), variant);
}

function formatAbsoluteYear(
  definition: FantasyCalendarDefinition,
  input: FantasyDate | number,
  variant: YearDisplayVariant
): string {
  const year = typeof input === "number" ? input : input.year;
  return formatConfiguredYearValue(definition, year, variant);
}

function formatConfiguredYearValue(
  definition: FantasyCalendarDefinition,
  year: number,
  variant: YearDisplayVariant
): string {
  const displayYear =
    definition.yearDisplay.negativeYearsMode === "absolute"
      ? Math.abs(year)
      : year;

  if (definition.yearDisplay.largeYearFormat !== "abbreviated") {
    return String(displayYear);
  }

  return abbreviateYear(displayYear, variant);
}

function abbreviateYear(value: number, variant: YearDisplayVariant): string {
  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);
  const scales = [
    { limit: 1_000_000_000_000, compact: "T", verbose: "Trillion" },
    { limit: 1_000_000_000, compact: "B", verbose: "Billion" },
    { limit: 1_000_000, compact: "M", verbose: "Million" }
  ];

  for (const scale of scales) {
    if (absoluteValue >= scale.limit) {
      const scaledValue = formatAbbreviatedNumber(absoluteValue / scale.limit);
      return variant === "compact"
        ? `${sign}${scaledValue} ${scale.compact}`
        : `${sign}${scaledValue} ${scale.verbose}`;
    }
  }

  return `${value}`;
}

function formatAbbreviatedNumber(value: number): string {
  const rounded =
    value >= 100
      ? Math.round(value)
      : value >= 10
        ? Math.round(value * 10) / 10
        : Math.round(value * 100) / 100;

  return String(rounded)
    .replace(/\.0+$/g, "")
    .replace(/(\.\d*[1-9])0+$/g, "$1");
}

export function getDayOfYear(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const normalized = clampDate(date, definition);
  const context = getYearContext(definition, normalized.year);
  return (context.monthStartDays[normalized.monthIndex] ?? 0) + normalized.day;
}

export function getAbsoluteDay(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const normalized = clampDate(date, definition);
  const context = getYearContext(definition, normalized.year);
  return context.daysBeforeYear + getDayOfYear(definition, normalized) - 1;
}

export function absoluteDayToDate(
  definition: FantasyCalendarDefinition,
  absoluteDay: number
): FantasyDate {
  const target = Math.trunc(absoluteDay);
  const estimatedYear = estimateYearFromAbsoluteDay(definition, target);
  const year = findYearForAbsoluteDay(definition, target, estimatedYear);
  const remaining = target - getDaysBeforeYear(definition, year);

  return {
    year,
    ...dayOfYearToMonthDay(definition, year, remaining + 1)
  };
}

export function getWeekdayIndex(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const normalized = clampDate(date, definition);
  return mod(getMonthStartWeekdayIndex(definition, normalized.year, normalized.monthIndex) + normalized.day - 1, definition.weekdays.length);
}

export function getWeekIndexInMonth(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const monthStartIndex = getMonthStartWeekdayIndex(definition, date.year, date.monthIndex);

  return Math.floor((monthStartIndex + date.day - 1) / definition.weekdays.length);
}

export function getWeekNumberInMonth(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  return getWeekIndexInMonth(definition, date) + 1;
}

export function getWeekOfYear(definition: FantasyCalendarDefinition, date: FantasyDate): number {
  if (definition.monthWeekdayMode === "reset") {
    let total = 0;
    for (let monthIndex = 0; monthIndex < date.monthIndex; monthIndex += 1) {
      total += getWeekCountInMonth(definition, date.year, monthIndex);
    }
    return total + getWeekNumberInMonth(definition, date);
  }

  const yearStartIndex = getWeekdayIndex(definition, {
    year: date.year,
    monthIndex: 0,
    day: 1
  });
  return Math.floor((yearStartIndex + getDayOfYear(definition, date) - 1) / definition.weekdays.length) + 1;
}

export function getNamedWeekForDate(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): string | null {
  const week = getWeekOfYear(definition, date);
  return definition.namedWeeks.find((entry) => entry.week === week)?.name ?? null;
}

function getWeekCountInMonth(
  definition: FantasyCalendarDefinition,
  year: number,
  monthIndex: number
): number {
  const month = getMonth(definition, monthIndex, year);
  const startWeekdayIndex = getMonthStartWeekdayIndex(definition, year, monthIndex);
  return Math.ceil((startWeekdayIndex + month.days) / definition.weekdays.length);
}

export function shiftDay(
  date: FantasyDate,
  delta: number,
  definition: FantasyCalendarDefinition
): FantasyDate {
  let current = clampDate(date, definition);
  let remaining = Math.trunc(delta);

  if (remaining === 0) {
    return current;
  }

  while (remaining > 0) {
    const months = getMonthsForYear(definition, current.year);
    const daysInMonth = months[current.monthIndex]?.days ?? 1;

    if (current.day < daysInMonth) {
      current = { ...current, day: current.day + 1 };
    } else if (current.monthIndex < months.length - 1) {
      current = { ...current, monthIndex: current.monthIndex + 1, day: 1 };
    } else {
      current = { year: current.year + 1, monthIndex: 0, day: 1 };
    }

    remaining -= 1;
  }

  while (remaining < 0) {
    if (current.day > 1) {
      current = { ...current, day: current.day - 1 };
    } else if (current.monthIndex > 0) {
      const prevMonthIndex = current.monthIndex - 1;
      const months = getMonthsForYear(definition, current.year);
      current = {
        ...current,
        monthIndex: prevMonthIndex,
        day: months[prevMonthIndex]?.days ?? 1
      };
    } else {
      const prevYear = current.year - 1;
      const prevMonths = getMonthsForYear(definition, prevYear);
      const prevMonthIndex = Math.max(0, prevMonths.length - 1);
      current = {
        year: prevYear,
        monthIndex: prevMonthIndex,
        day: prevMonths[prevMonthIndex]?.days ?? 1
      };
    }

    remaining += 1;
  }

  return current;
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
  const startWeekdayIndex = getMonthStartWeekdayIndex(definition, year, monthIndex);
  const columns = definition.weekdays.length;
  const baseMonthIndex = definition.months.findIndex(
    (candidate) => candidate.id === month.id
  );
  const leadingNamedDays = getInlineIntercalaryDaysForBaseMonth(
    definition,
    year,
    baseMonthIndex - 1,
    "before-next-month"
  );
  const trailingNamedDays = getInlineIntercalaryDaysForBaseMonth(
    definition,
    year,
    baseMonthIndex,
    "after-previous-month"
  );
  const leadingEmptyCells = mod(
    startWeekdayIndex - leadingNamedDays.length,
    columns
  );
  const cells: MonthGridCell[] = [];

  for (let index = 0; index < leadingEmptyCells; index += 1) {
    cells.push(createEmptyMonthGridCell());
  }

  leadingNamedDays.forEach((namedDay) => {
    cells.push(createIntercalaryMonthGridCell(
      definition,
      namedDay,
      cursorDate,
      todayDate,
      markers
    ));
  });

  for (let day = 1; day <= month.days; day += 1) {
    const date = { year, monthIndex, day };

    cells.push({
      day,
      date,
      isToday: sameDate(date, todayDate),
      isCursor: sameDate(date, cursorDate),
      markers: getMarkersForDate(markers, date),
      seasonColor: getSeasonColorForDate(definition, date)
    });
  }

  trailingNamedDays.forEach((namedDay) => {
    cells.push(createIntercalaryMonthGridCell(
      definition,
      namedDay,
      cursorDate,
      todayDate,
      markers
    ));
  });

  const rows: MonthGridCell[][] = [];
  const totalRows = Math.ceil(cells.length / columns);

  for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
    const row: MonthGridCell[] = [];

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      row.push(cells[rowIndex * columns + columnIndex] ?? createEmptyMonthGridCell());
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
  
  const matchingRow = monthGrid.rows.find((row) =>
    row.some((cell) => sameDate(cell.date, date))
  );

  if (matchingRow) {
    return matchingRow;
  }

  const rowIndex = getWeekIndexInMonth(definition, date);
  return monthGrid.rows[rowIndex] ?? [];
}

function createEmptyMonthGridCell(): MonthGridCell {
  return {
    day: null,
    date: null,
    isToday: false,
    isCursor: false,
    markers: []
  };
}

function createIntercalaryMonthGridCell(
  definition: FantasyCalendarDefinition,
  namedDay: {
    date: FantasyDate;
    rule: FantasyIntercalaryDayRule;
  },
  cursorDate: FantasyDate,
  todayDate: FantasyDate,
  markers: DayMarker[]
): MonthGridCell {
  return {
    day: null,
    date: namedDay.date,
    isToday: sameDate(namedDay.date, todayDate),
    isCursor: sameDate(namedDay.date, cursorDate),
    markers: getMarkersForDate(markers, namedDay.date),
    seasonColor: getSeasonColorForDate(definition, namedDay.date),
    intercalaryDay: {
      date: namedDay.date,
      name: namedDay.rule.name,
      color: namedDay.rule.color,
      icon: namedDay.rule.icon,
      imageRef: namedDay.rule.imageRef,
      weekdayMode: namedDay.rule.weekdayMode,
      displayPosition: namedDay.rule.displayPosition
    }
  };
}

function getInlineIntercalaryDaysForBaseMonth(
  definition: FantasyCalendarDefinition,
  year: number,
  insertAfterMonthIndex: number,
  displayPosition: FantasyIntercalaryDayRule["displayPosition"]
): Array<{ date: FantasyDate; rule: FantasyIntercalaryDayRule }> {
  if (insertAfterMonthIndex < -1 || insertAfterMonthIndex >= definition.months.length) {
    return [];
  }

  const months = getMonthsForYear(definition, year);

  return definition.intercalaryDays
    .filter((rule) => isIntercalaryDayActive(rule, year))
    .filter((rule) => rule.weekdayMode === "normal")
    .filter((rule) => rule.displayPosition === displayPosition)
    .filter((rule) => rule.insertAfterMonthIndex === insertAfterMonthIndex)
    .map((rule) => {
      const monthIndex = months.findIndex(
        (month) =>
          month.kind === "intercalary-day" &&
          month.intercalaryDayId === rule.id
      );

      return monthIndex >= 0
        ? {
            date: { year, monthIndex, day: 1 },
            rule
          }
        : null;
    })
    .filter(
      (entry): entry is { date: FantasyDate; rule: FantasyIntercalaryDayRule } =>
        entry !== null
    )
    .sort((left, right) => left.rule.order - right.rule.order);
}

function migrateStandaloneLeapDays(
  leapDays: FantasyLeapDayRule[]
): FantasyIntercalaryDayRule[] {
  return leapDays
    .filter((rule) => rule.placement === "standalone")
    .map((rule, index) => ({
      id: rule.id,
      name: rule.name,
      insertAfterMonthIndex: rule.insertAfterMonthIndex,
      displayPosition: "standalone" as const,
      order: index,
      weekdayMode: "normal" as const,
      cycleYears: rule.cycleYears,
      activeYearPositions: [...rule.leapYearPositions],
      skipYearsDivisibleBy: []
    }));
}

function mergeIntercalaryDays(
  configured: FantasyIntercalaryDayRule[],
  migrated: FantasyIntercalaryDayRule[]
): FantasyIntercalaryDayRule[] {
  const byId = new Map<string, FantasyIntercalaryDayRule>();

  migrated.forEach((rule) => byId.set(rule.id, rule));
  configured.forEach((rule) => byId.set(rule.id, rule));

  return [...byId.values()];
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
  input: FantasyDate | number,
  variant: YearDisplayVariant = "verbose"
): string {
  const absoluteYear =
    typeof input === "number"
      ? input
      : input.year;
  const namedYear = getNamedYear(definition, absoluteYear);

  if (!namedYear) {
    return formatDisplayYear(definition, input, variant);
  }

  return `${formatDisplayYear(definition, input, variant)} (${namedYear})`;
}

export function formatLongDate(
  date: FantasyDate,
  definition: FantasyCalendarDefinition
): string {
  const month = getMonth(definition, date.monthIndex, date.year);
  const eraLabel = getEraShortLabel(definition, date);

  if (isIntercalaryMonth(month)) {
    return `${month.name} ${formatYearLabel(definition, date, "verbose")}${eraLabel ? ` ${eraLabel}` : ""}`;
  }

  return `${date.day}. ${month.name} ${formatYearLabel(definition, date, "verbose")}${eraLabel ? ` ${eraLabel}` : ""}`;
}

export function formatDateWithPattern(
  date: FantasyDate,
  definition: FantasyCalendarDefinition,
  pattern: string,
  yearVariant: YearDisplayVariant = "verbose"
): string {
  const normalized = clampDate(date, definition);
  const template = pattern.trim().length > 0 ? pattern : DEFAULT_SETTINGS.dayViewDateFormat;
  const month = getMonth(definition, normalized.monthIndex, normalized.year);
  const isNamedDay = isIntercalaryMonth(month);

  if (isNamedDay && !template.includes("NamedDayName")) {
    const eraLabel = getEraShortLabel(definition, normalized);
    return `${month.name} ${formatDisplayYear(definition, normalized, yearVariant)}${eraLabel ? ` ${eraLabel}` : ""}`;
  }

  const weekdayIndex = getWeekdayIndex(definition, normalized);
  const weekdayName =
    month.weekdayMode === "none"
      ? ""
      : definition.weekdays[weekdayIndex] ?? `Day ${weekdayIndex + 1}`;
  const monthShort = month.name.slice(0, Math.min(3, month.name.length));
  const weekdayShort = weekdayName.slice(0, Math.min(3, weekdayName.length));
  const weekInMonth = getWeekNumberInMonth(definition, normalized);
  const weekInYear = getWeekOfYear(definition, normalized);
  const dayValue = isNamedDay ? "" : String(normalized.day);
  const monthValue = isNamedDay ? "" : String(normalized.monthIndex + 1);

  const replacements: Array<[string, string]> = [
    ["NamedDayName", isNamedDay ? month.name : ""],
	["EraYear", formatEraYear(definition, normalized, yearVariant)],
	["WeekdayName", weekdayName],
    ["WeekdayShort", weekdayShort],
	["WeekName", getNamedWeekForDate(definition, normalized) ?? ""],
    ["MonthName", month.name],
    ["MonthShort", monthShort],
    ["YYYY", formatAbsoluteYear(definition, normalized, yearVariant)],
    ["YY", String(Math.abs(normalized.year)).slice(-2).padStart(2, "0")],
    ["MM", monthValue.padStart(2, "0")],
    ["DD", dayValue.padStart(2, "0")],
    ["YW", String(weekInYear).padStart(2, "0")],
    ["WW", String(weekInMonth).padStart(2, "0")],
    ["ERA", getEraShortLabel(definition, normalized)],
    ["M", monthValue],
    ["D", dayValue]
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

function getDefinitionComputationContext(
  definition: FantasyCalendarDefinition
): DefinitionComputationContext {
  const cached = DEFINITION_CONTEXT_CACHE.get(definition);
  if (cached) {
    return cached;
  }

  const baseYearLength = getMonthListLength(definition.months);
  const baseWeekdayLength = baseYearLength;
  const leapRuleSummaries: LeapRuleComputationSummary[] = [
    ...definition.leapMonths.map((rule) => {
      const cycleYears = Math.max(1, Math.trunc(rule.cycleYears || 1));
      return {
        cycleYears,
        residues: [...new Set(rule.leapYearPositions.map((value) => mod(value, cycleYears)))],
        extraDays: Math.max(1, Math.trunc(rule.month.days || 1)),
        extraWeekdayDays: Math.max(1, Math.trunc(rule.month.days || 1)),
        skipYearsDivisibleBy: []
      };
    }),
    ...definition.leapDays.map((rule) => {
      const cycleYears = Math.max(1, Math.trunc(rule.cycleYears || 1));
      return {
        cycleYears,
        residues: [...new Set(rule.leapYearPositions.map((value) => mod(value, cycleYears)))],
        extraDays: Math.max(1, Math.trunc(rule.days || 1)),
        extraWeekdayDays: Math.max(1, Math.trunc(rule.days || 1)),
        skipYearsDivisibleBy: []
      };
    }),
    ...definition.intercalaryDays.map((rule) => {
      const cycleYears = Math.max(1, Math.trunc(rule.cycleYears || 1));
      return {
        cycleYears,
        residues: [...new Set(rule.activeYearPositions.map((value) => mod(value, cycleYears)))],
        extraDays: 1,
        extraWeekdayDays: rule.weekdayMode === "none" ? 0 : 1,
        skipYearsDivisibleBy: normalizeSkipYearDivisors(rule.skipYearsDivisibleBy)
      };
    })
  ];

  const context: DefinitionComputationContext = {
    baseYearLength,
	baseWeekdayLength,
    leapRuleSummaries
  };

  DEFINITION_CONTEXT_CACHE.set(definition, context);
  return context;
}

function getMonthStartWeekdayIndex(
  definition: FantasyCalendarDefinition,
  year: number,
  monthIndex: number
): number {
  if (definition.monthWeekdayMode === "reset") {
    return definition.startWeekdayIndex;
  }

  const context = getYearContext(definition, year);
  return mod(context.yearStartWeekdayIndex + (context.monthStartWeekdayOffsets[monthIndex] ?? 0), definition.weekdays.length);
}

function getYearContext(
  definition: FantasyCalendarDefinition,
  year: number
): YearComputationContext {
  const normalizedYear = Math.trunc(Number(year) || 0);
  let cache = YEAR_CONTEXT_CACHE.get(definition);

  if (!cache) {
    cache = new Map<number, YearComputationContext>();
    YEAR_CONTEXT_CACHE.set(definition, cache);
  }

  const cached = cache.get(normalizedYear);
  if (cached) {
    return cached;
  }

  const months = buildMonthsForYear(definition, normalizedYear);
  const monthStartDays: number[] = [];
  const monthStartWeekdayOffsets: number[] = [];
  let runningTotal = 0;
  let runningWeekdayTotal = 0;

  months.forEach((month) => {
    monthStartDays.push(runningTotal);
	monthStartWeekdayOffsets.push(runningWeekdayTotal);
    runningTotal += month.days;

    if (month.weekdayMode !== "none") {
      runningWeekdayTotal += month.days;
    }
  });

  const context: YearComputationContext = {
    year: normalizedYear,
    months,
    monthStartDays,
	monthStartWeekdayOffsets,
    yearLength: runningTotal,
    daysBeforeYear: getDaysBeforeYear(definition, normalizedYear),
    yearStartWeekdayIndex: mod(
      definition.startWeekdayIndex + getWeekdayDaysBeforeYear(definition, normalizedYear),
      definition.weekdays.length
    )
  };

  if (cache.size > 2048) {
    for (const oldestKey of cache.keys()) {
      cache.delete(oldestKey);
	  break;
    }
  }

  cache.set(normalizedYear, context);
  return context;
}

function getDaysBeforeYear(
  definition: FantasyCalendarDefinition,
  year: number
): number {
  const normalizedYear = Math.trunc(Number(year) || 0);

  if (normalizedYear === 0) {
    return 0;
  }

  const definitionContext = getDefinitionComputationContext(definition);
  let total = normalizedYear * definitionContext.baseYearLength;

  definitionContext.leapRuleSummaries.forEach((rule) => {
    total += rule.extraDays * countRuleOccurrencesBeforeYear(rule, normalizedYear);
  });

  return total;
}

function getWeekdayDaysBeforeYear(
  definition: FantasyCalendarDefinition,
  year: number
): number {
  const normalizedYear = Math.trunc(Number(year) || 0);

  if (normalizedYear === 0) {
    return 0;
  }

  const definitionContext = getDefinitionComputationContext(definition);
  let total = normalizedYear * definitionContext.baseWeekdayLength;

  definitionContext.leapRuleSummaries.forEach((rule) => {
    total += rule.extraWeekdayDays * countRuleOccurrencesBeforeYear(rule, normalizedYear);
  });

  return total;
}

function countRuleOccurrencesBeforeYear(
  rule: LeapRuleComputationSummary,
  year: number
): number {
  if (year > 0) {
    return countRuleOccurrencesInRange(rule, 0, year - 1);
  }

  if (year < 0) {
    return -countRuleOccurrencesInRange(rule, year, -1);
  }

  return 0;
}

function countRuleOccurrencesInRange(
  rule: LeapRuleComputationSummary,
  startInclusive: number,
  endInclusive: number
): number {
  return rule.residues.reduce((sum, residue) => {
    return sum + countResidueOccurrencesWithSkips(
      residue,
      rule.cycleYears,
      rule.skipYearsDivisibleBy ?? [],
      startInclusive,
      endInclusive
    );
  }, 0);
}

function countResidueOccurrencesWithSkips(
  residue: number,
  cycleYears: number,
  skipYearsDivisibleBy: number[],
  startInclusive: number,
  endInclusive: number
): number {
  const total = countIntegersInRangeByResidue(
    startInclusive,
    endInclusive,
    residue,
    cycleYears
  );

  if (skipYearsDivisibleBy.length === 0 || total === 0) {
    return total;
  }

  let skipped = 0;

  const visitCombinations = (
    startIndex: number,
    combinedDivisor: number,
    selectedCount: number
  ): void => {
    for (let index = startIndex; index < skipYearsDivisibleBy.length; index += 1) {
      const divisor = skipYearsDivisibleBy[index];

      if (!divisor) {
        continue;
      }

      const nextDivisor = leastCommonMultipleExact(combinedDivisor, divisor);
      const nextSelectedCount = selectedCount + 1;
      const matching = solveResidueWithDivisibility(
        residue,
        cycleYears,
        nextDivisor
      );

      if (matching) {
        const matchingCount = countIntegersInRangeByResidue(
          startInclusive,
          endInclusive,
          matching.residue,
          matching.modulus
        );

        skipped += nextSelectedCount % 2 === 1
          ? matchingCount
          : -matchingCount;
      }

      visitCombinations(index + 1, nextDivisor, nextSelectedCount);
    }
  };

  visitCombinations(0, 1, 0);
  return total - skipped;
}

function normalizeSkipYearDivisors(divisors: number[]): number[] {
  const unique = [...new Set(
    divisors
      .map((value) => Math.trunc(value))
      .filter((value) => value > 0)
  )].sort((left, right) => left - right);

  // Ist ein Jahr durch einen kleineren Divisor übersprungen, ist ein
  // zusätzliches Vielfaches davon redundant (z. B. 100 macht 200 redundant).
  return unique.filter((divisor) =>
    !unique.some(
      (other) => other !== divisor && divisor % other === 0
    )
  );
}

function solveResidueWithDivisibility(
  residue: number,
  modulus: number,
  divisor: number
): { residue: number; modulus: number } | null {
  const greatestDivisor = greatestCommonDivisor(modulus, divisor);

  if (mod(residue, greatestDivisor) !== 0) {
    return null;
  }

  const reducedModulus = modulus / greatestDivisor;
  const combinedModulus = leastCommonMultipleExact(modulus, divisor);

  if (reducedModulus === 1) {
    return {
      residue: 0,
      modulus: combinedModulus
    };
  }

  const inverse = modularInverse(
    divisor / greatestDivisor,
    reducedModulus
  );
  const multiplier = mod(
    (residue / greatestDivisor) * inverse,
    reducedModulus
  );

  return {
    residue: mod(divisor * multiplier, combinedModulus),
    modulus: combinedModulus
  };
}

function leastCommonMultipleExact(left: number, right: number): number {
  const a = Math.max(1, Math.trunc(left));
  const b = Math.max(1, Math.trunc(right));
  return Math.trunc((a * b) / greatestCommonDivisor(a, b));
}

function modularInverse(value: number, modulus: number): number {
  let previousCoefficient = 0;
  let coefficient = 1;
  let previousRemainder = modulus;
  let remainder = mod(value, modulus);

  while (remainder !== 0) {
    const quotient = Math.floor(previousRemainder / remainder);
    const nextCoefficient = previousCoefficient - quotient * coefficient;
    const nextRemainder = previousRemainder - quotient * remainder;

    previousCoefficient = coefficient;
    coefficient = nextCoefficient;
    previousRemainder = remainder;
    remainder = nextRemainder;
  }

  return mod(previousCoefficient, modulus);
}

function countIntegersInRangeByResidue(
  startInclusive: number,
  endInclusive: number,
  residue: number,
  modulus: number
): number {
  return (
    floorDiv(endInclusive - residue, modulus) -
    floorDiv(startInclusive - 1 - residue, modulus)
  );
}

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

function estimateYearFromAbsoluteDay(
  definition: FantasyCalendarDefinition,
  absoluteDay: number
): number {
  const baseYearLength = Math.max(
    1,
    getDefinitionComputationContext(definition).baseYearLength
  );

  return Math.floor(absoluteDay / baseYearLength);
}

function findYearForAbsoluteDay(
  definition: FantasyCalendarDefinition,
  absoluteDay: number,
  estimatedYear: number
): number {
  const estimateStart = getDaysBeforeYear(definition, estimatedYear);

  if (estimateStart > absoluteDay) {
    let high = estimatedYear;
    let step = 1;
    let low = estimatedYear - step;

    while (getDaysBeforeYear(definition, low) > absoluteDay) {
      high = low;
      step *= 2;
      low = estimatedYear - step;
    }

    return binarySearchYear(definition, absoluteDay, low, high);
  }

  let low = estimatedYear;
  let step = 1;
  let high = estimatedYear + step;

  while (getDaysBeforeYear(definition, high) <= absoluteDay) {
    low = high;
    step *= 2;
    high = estimatedYear + step;
  }

  return binarySearchYear(definition, absoluteDay, low, high);
}

function binarySearchYear(
  definition: FantasyCalendarDefinition,
  absoluteDay: number,
  lowYearInclusive: number,
  highYearExclusive: number
): number {
  let low = lowYearInclusive;
  let high = highYearExclusive;

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    const midStart = getDaysBeforeYear(definition, mid);

    if (midStart <= absoluteDay) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
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

function buildEraEndDate(
  era: FantasyEra,
  months: FantasyMonth[]
): Pick<FantasyDate, "year" | "monthIndex" | "day"> {
  const monthIndex = clamp(
    era.endMonthIndex ?? Math.max(0, months.length - 1),
    0,
    Math.max(0, months.length - 1)
  );

  return {
    year: era.endYear ?? era.startYear,
    monthIndex,
    day: clamp(era.endDay ?? (months[monthIndex]?.days ?? 1), 1, months[monthIndex]?.days ?? 1)
  };
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