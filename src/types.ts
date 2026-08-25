export type CalendarViewMode = "week" | "month" | "year";
export type WeatherCondition =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "scattered-clouds"
  | "broken-clouds"
  | "overcast"
  | "mist"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "thunderstorm"
  | "sleet"
  | "flurries"
  | "snow"
  | "blizzard";

export type WeatherSourceType = "pack" | "event" | "manual";
export type WeatherProfileCycleReset = "none" | "intercalation-cycle";
export type MoonCycleAnchor = "absolute" | "month";
export type TimelineAlign = "left" | "right";
export type IntercalaryDayWeekdayMode = "normal" | "none";
export type MonthWeekdayMode = "continuous" | "reset";
export type LeapDayPlacement = "standalone" | "append-to-month";
export type IntercalaryDayDisplayPosition =
  | "standalone"
  | "after-previous-month"
  | "before-next-month";
export type TimelineGridRowCount = 2 | 3 | 4;
export type NegativeYearDisplayMode = "signed" | "absolute";
export type LargeYearFormat = "plain" | "abbreviated";
export type EraYearDisplayMode = "absolute" | "relative";
export type TemperatureUnit = "c" | "f";

export type EventRecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type EventRecurrenceEndMode = "never" | "count" | "until";
export type EventDeleteMode = "single" | "following" | "all";

export interface FrontmatterColorMappingRule {
  id: string;
  property: string;
  value: string;
  color: string;
}

export interface FrontmatterImportSettings {
  enabled: boolean;
  titleProperty?: string;
  startDateProperty?: string;
  endDateProperty?: string;
  startHourProperty?: string;
  startMinuteProperty?: string;
  endHourProperty?: string;
  endMinuteProperty?: string;
  descriptionProperty?: string;
  imageProperty?: string;
  weatherPackProperty?: string;
  tagProperty?: string;
  syncIdProperty?: string;
  colorProperty?: string;
  recurrenceFrequencyProperty?: string;
  recurrenceIntervalProperty?: string;
  recurrenceEndModeProperty?: string;
  recurrenceCountProperty?: string;
  recurrenceUntilProperty?: string;
  fallbackTitleToFilename: boolean;
  colorMappings: FrontmatterColorMappingRule[];
}

export interface FrontmatterExportSettings {
  enabled: boolean;
  titleProperty?: string;
  startDateProperty?: string;
  endDateProperty?: string;
  startHourProperty?: string;
  startMinuteProperty?: string;
  endHourProperty?: string;
  endMinuteProperty?: string;
  descriptionProperty?: string;
  imageProperty?: string;
  weatherPackProperty?: string;
  tagProperty?: string;
  syncIdProperty?: string;
  colorProperty?: string;
  recurrenceFrequencyProperty?: string;
  recurrenceIntervalProperty?: string;
  recurrenceEndModeProperty?: string;
  recurrenceCountProperty?: string;
  recurrenceUntilProperty?: string;
  clearMissingFields: boolean;
}

export interface FrontmatterEventImportSource {
  kind: "frontmatter";
  syncKey: string;
  notePath: string;
  importedAt: string;
  explicitSyncId?: string;
  multiDate?: boolean;
}

export interface FantasyTimeConfig {
  enabled: boolean;
  hoursPerDay: number;
  minutesPerHour: number;
}

export interface FantasyYearDisplayConfig {
  negativeYearsMode: NegativeYearDisplayMode;
  largeYearFormat: LargeYearFormat;
  eraYearMode: EraYearDisplayMode;
}

export interface TimelineStyleColors {
  bg?: string;
  accent?: string;
  hover?: string;
  title?: string;
  date?: string;
}

export interface CalendarTimelineStyle {
  name?: string;
  align?: TimelineAlign;
  showMoons?: boolean;
  moonSize?: number;
  maxSummaryLines?: number;
  cardWidth?: number;
  cardHeight?: number;
  boxHeight?: number;
  gridRows?: TimelineGridRowCount;
  gridTileHeight?: number;
  sideGapLeft?: number;
  sideGapRight?: number;
  colors?: TimelineStyleColors;
  monthNames?: string[];
}

export interface FantasyTimeOfDay {
  hour: number;
  minute: number;
}

export interface FantasyMonth {
  id: string;
  name: string;
  days: number;
  color?: string;
  kind?: "month" | "intercalary-day";
  intercalaryDayId?: string;
  weekdayMode?: IntercalaryDayWeekdayMode;
}

export interface FantasyLeapMonthRule {
  id: string;
  name: string;
  insertAfterMonthIndex: number;
  month: FantasyMonth;
  cycleYears: number;
  leapYearPositions: number[];
}

export interface FantasyLeapDayRule {
  id: string;
  name: string;
  placement: LeapDayPlacement;
  insertAfterMonthIndex: number;
  days: number;
  cycleYears: number;
  leapYearPositions: number[];
}

export interface FantasyIntercalaryDayRule {
  id: string;
  name: string;
  insertAfterMonthIndex: number;
  displayPosition: IntercalaryDayDisplayPosition;
  order: number;
  weekdayMode: IntercalaryDayWeekdayMode;
  cycleYears: number;
  activeYearPositions: number[];
  skipYearsDivisibleBy: number[];
  color?: string;
  icon?: string;
  imageRef?: string;
}

export interface FantasyWeatherProfileMapping {
  mode: "calendar" | "absolute-day-cycle";
  climateYearLength: number;
  baseOffsetDays: number;
  cycleReset: WeatherProfileCycleReset;
}

export interface MoonPhaseImageDefinition {
  phaseIndex: number;
  imageRef: string;
}

export interface FantasyMoon {
  id: string;
  name: string;
  cycleDays: number;
  offsetDays: number;
  cycleAnchor: MoonCycleAnchor;
  color?: string;
  phaseCount: number;
  size: number;
  phaseImages: MoonPhaseImageDefinition[];
  phaseLabels: string[];
}

export interface FantasyNamedYear {
  year: number;
  name: string;
}

export interface FantasyNamedWeek {
  week: number;
  name: string;
}

export interface FantasyEra {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  startYear: number;
  startMonthIndex: number;
  endYear?: number;
  endMonthIndex?: number;
  endDay?: number;
  startDay: number;
}

export interface FantasyMonthDay {
  monthIndex: number;
  day: number;
}

export interface FantasySeason {
  id: string;
  name: string;
  startDay: number;
  endDay: number;
  color: string;
}

export interface FantasyCalendarDefinition {
  id: string;
  name: string;
  eraLabel: string;
  weekdays: string[];
  months: FantasyMonth[];
  leapMonths: FantasyLeapMonthRule[];
  leapDays: FantasyLeapDayRule[];
  intercalaryDays: FantasyIntercalaryDayRule[];
  weatherProfile: FantasyWeatherProfileMapping;
  moons: FantasyMoon[];
  eras: FantasyEra[];
  yearNames: FantasyNamedYear[];
  namedWeeks: FantasyNamedWeek[];
  startWeekdayIndex: number;
  monthWeekdayMode: MonthWeekdayMode;
  seasons: FantasySeason[];
  time: FantasyTimeConfig;
  yearDisplay: FantasyYearDisplayConfig;
}

export interface CalendarFile {
  version: 1;
  kind: "calendar";
  id: string;
  name: string;
  definition: FantasyCalendarDefinition;
  state: CalendarState;
  linkedTagPackIds: string[];
  linkedCalendarIds: string[];
  linkedWeatherPackIds: string[];
  weatherEnabled: boolean;
  markers: DayMarker[];
  autoGenerateLinkedWeatherReferences?: boolean;
  defaultWeatherPackId?: string;
  timeline?: CalendarTimelineStyle;
  bannerImageRef?: string;
  description?: string;
}

export interface FantasyDate {
  year: number;
  monthIndex: number;
  day: number;
}

export interface DayMarker {
  id: string;
  year: number;
  monthIndex: number;
  day: number;
  tone?: "dark" | "pink" | "gold";
  label?: string;
}

export interface CalendarState {
  activeView: CalendarViewMode;
  todayDate: FantasyDate;
  cursorDate: FantasyDate;
  showEraDescription: boolean;
}

export interface TagDefinition {
  id: string;
  name: string;
  color?: string;
}

export interface TagPackFile {
  version: 1;
  kind: "tag-pack";
  id: string;
  name: string;
  tags: TagDefinition[];
  description?: string;
}

export interface TimeAdvanceButtonConfig {
  id: string;
  label: string;
  icon?: string;
  hours: number;
  minutes: number;
}

export interface FantasyClockEntry {
  hour: number;
  minute: number;
}

export interface FantasyClockState {
  byCalendarId: Record<string, FantasyClockEntry>;
}

export interface TtrpgToolsTimeSettings {
  dataFolder: string;
  activeCalendarId: string | null;
  dayViewDateFormat: string;
  showCalendarWeekNumbers: boolean;
  temperatureUnit: TemperatureUnit;
  controlTimeButtons: TimeAdvanceButtonConfig[];
  communityLibraryIndexUrl: string;
  frontmatterImport: FrontmatterImportSettings;
  frontmatterExport: FrontmatterExportSettings;
}

export interface IntervalEventRecurrenceRule {
  kind: "interval";
  frequency: EventRecurrenceFrequency;
  interval: number;
  endMode: EventRecurrenceEndMode;
  count?: number;
  until?: FantasyDate;
  excludedDates?: FantasyDate[];
}

export interface PatternEventRecurrenceRule {
  kind: "pattern";
  day: number;
  monthIndex?: number;
  year?: number;
  until?: FantasyDate;
  excludedDates?: FantasyDate[];
}

export type EventRecurrenceRule =
  | IntervalEventRecurrenceRule
  | PatternEventRecurrenceRule;

export interface EventPresetFile {
  version: 1;
  kind: "event-preset";
  calendarId: string;
  id: string;
  name: string;
  color?: string;
  tagRefs: string[];
  weatherPackId?: string;
}

export interface CalendarEventDefinition {
  id: string;
  calendarId: string;
  title: string;
  date: FantasyDate;
  endDate?: FantasyDate;
  startTime?: FantasyTimeOfDay;
  endTime?: FantasyTimeOfDay;
  description?: string;
  color?: string;
  tagRefs: string[];
  weatherPackId?: string;
  imageRef?: string;
  noteRef?: string;
  createdAt: string;
  recurrence?: EventRecurrenceRule;
  sourceEventId?: string;
  importSource?: FrontmatterEventImportSource;
  updatedAt: string;
}

export interface EventYearFile {
  version: 1;
  kind: "event-year";
  calendarId: string;
  year: number;
  events: CalendarEventDefinition[];
}

export interface EventIndexEntry {
  id: string;
  title: string;
  sourceEventId?: string;
  color: string;
}

export interface EventIndexDay {
  items: EventIndexEntry[];
}

export interface EventIndexYearFile {
  version: 1;
  kind: "event-index-year";
  calendarId: string;
  year: number;
  days: Record<string, EventIndexDay>;
}

export interface EventRecurrenceIndexEntry {
  id: string;
  title: string;
  color: string;
  date: FantasyDate;
  endDate?: FantasyDate;
  recurrence: EventRecurrenceRule;
  updatedAt: string;
}

export interface EventRecurrenceIndexFile {
  version: 1;
  kind: "event-recurrence-index";
  calendarId: string;
  items: EventRecurrenceIndexEntry[];
}

export interface WeatherPackFile {
  version: 1;
  kind: "weather-pack";
  id: string;
  name: string;
  description?: string;
  temperatureMin: number;
  temperatureMax: number;
  humidity: number;
  precipitation: number;
  storminess: number;
  cloudiness: number;
  fogginess: number;
  windiness: number;
  seasonality: number;
  frontFrequency: number;
  frontStrength: number;
  volatility: number;
  stableSpanMin: number;
  stableSpanMax: number;
  frontSpanMin: number;
  frontSpanMax: number;
  snowTemperature: number;
  monthProfiles: WeatherPackMonthProfile[];
}

export interface WeatherPackMonthProfile {
  monthIndex: number;
  temperatureOffset: number;
  humidity: number;
  precipitation: number;
  cloudiness: number;
  fogginess: number;
  windiness: number;
  frontBias: number;
}

export interface WeatherDayEntry {
  tempLow: number;
  tempHigh: number;
  condition: WeatherCondition;
  windDirection: string;
  windLabel: string;
  cloudsLabel: string;
  precipitationLabel: string;
  icon: string;
  note?: string;
  sourceType: WeatherSourceType;
  sourceId?: string;
  sourcePackId?: string;
  locked?: boolean;
}

export interface WeatherReferenceYearFile {
  version: 1;
  kind: "weather-reference-year";
  calendarId: string;
  weatherPackId: string;
  year: number;
  generatedAt: string;
  days: Record<string, WeatherDayEntry>;
}

export interface WeatherYearFile {
  version: 1;
  kind: "weather-day-year";
  calendarId: string;
  year: number;
  baseWeatherPackId: string;
  generatedAt: string;
  days: Record<string, WeatherDayEntry>;
}

export interface WeatherData {
  date: FantasyDate;
  tempLow: number;
  tempHigh: number;
  condition: WeatherCondition;
  conditionLabel: string;
  windDirection: string;
  windLabel: string;
  cloudsLabel: string;
  precipitationLabel: string;
  icon: string;
  note?: string;
  sourceType: WeatherSourceType;
  sourceId?: string;
  sourcePackId?: string;
  locked?: boolean;
}

export interface MoonPhaseData {
  moonId: string;
  name: string;
  cycleDays: number;
  cycleDay: number;
  phaseCount: number;
  phaseIndex: number;
  phaseLabel: string;
  size: number;
  color?: string;
  imageRef?: string;
  timeLabel?: string;
}

export interface MoonPhaseTransition {
  moonId: string;
  name: string;
  phaseIndex: number;
  phaseLabel: string;
  minuteOfDay: number;
  timeLabel: string;
}

export interface MonthGridIntercalaryDay {
  date: FantasyDate;
  name: string;
  color?: string;
  icon?: string;
  imageRef?: string;
  weekdayMode: IntercalaryDayWeekdayMode;
  displayPosition: IntercalaryDayDisplayPosition;
}

export interface MonthGridCell {
  day: number | null;
  date: FantasyDate | null;
  isToday: boolean;
  isCursor: boolean;
  markers: DayMarker[];
  seasonColor?: string;
  intercalaryDay?: MonthGridIntercalaryDay;
}

export interface MonthGrid {
  monthIndex: number;
  monthName: string;
  startWeekdayIndex: number;
  rows: MonthGridCell[][];
}