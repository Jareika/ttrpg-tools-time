import {
  clampDate,
  getMonthsForYear,
  dayOfYearToMonthDay,
  getYearLength,
  getWeatherProfileDayOfYearForDate
} from "./calendar";
import type {
  CalendarFile,
  FantasyDate,
  FantasyMonth,
  TemperatureUnit,
  WeatherCondition,
  WeatherData,
  WeatherDayEntry,
  WeatherPackFile,
  WeatherPackMonthProfile,
  WeatherReferenceYearFile,
  WeatherSourceType,
  WeatherYearFile
} from "./types";

type WeatherPhaseKind =
  | "clear"
  | "cloudy"
  | "wet-front"
  | "storm-front"
  | "fog-bank"
  | "snow-front"
  | "warm-spell"
  | "cold-snap";

const CONDITION_LABELS: Record<WeatherCondition, string> = {
  clear: "Clear sky",
  "mostly-clear": "Mostly clear",
  "partly-cloudy": "Partly cloudy",
  "scattered-clouds": "Scattered clouds",
  "broken-clouds": "Broken clouds",
  overcast: "Overcast",
  mist: "Mist",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  "heavy-rain": "Heavy rain",
  thunderstorm: "Thunderstorm",
  sleet: "Sleet",
  flurries: "Snow flurries",
  snow: "Snowfall",
  blizzard: "Blizzard"
};

const CONDITION_ICONS: Record<WeatherCondition, string> = {
  clear: "sun",
  "mostly-clear": "sun",
  "partly-cloudy": "cloud-sun",
  "scattered-clouds": "cloud-sun",
  "broken-clouds": "cloud",
  overcast: "cloud",
  mist: "cloud-fog",
  fog: "cloud-fog",
  drizzle: "cloud-drizzle",
  rain: "cloud-rain",
  "heavy-rain": "cloud-rain",
  thunderstorm: "cloud-lightning",
  sleet: "cloud-rain",
  flurries: "snowflake",
  snow: "snowflake",
  blizzard: "snowflake"
};

const SKY_ONLY_CONDITIONS = new Set<WeatherCondition>([
  "clear",
  "mostly-clear",
  "partly-cloudy",
  "scattered-clouds",
  "broken-clouds",
  "overcast"
]);

export const WEATHER_CONDITION_OPTIONS: WeatherCondition[] = [
  "clear",
  "mostly-clear",
  "partly-cloudy",
  "scattered-clouds",
  "broken-clouds",
  "overcast",
  "mist",
  "fog",
  "drizzle",
  "rain",
  "heavy-rain",
  "thunderstorm",
  "sleet",
  "flurries",
  "snow",
  "blizzard"
];

const WIND_DIRECTIONS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW"
];

export const DEFAULT_WEATHER_PACK: WeatherPackFile = {
  version: 1,
  kind: "weather-pack",
  id: "general",
  name: "General",
  description: "Default general weather pack.",
  temperatureMin: -5,
  temperatureMax: 28,
  humidity: 45,
  precipitation: 35,
  storminess: 14,
  cloudiness: 42,
  fogginess: 10,
  windiness: 34,
  seasonality: 62,
  frontFrequency: 46,
  frontStrength: 48,
  volatility: 30,
  stableSpanMin: 3,
  stableSpanMax: 7,
  frontSpanMin: 1,
  frontSpanMax: 3,
  snowTemperature: 0,
  monthProfiles: []
};

export function getWeatherConditionLabel(condition: WeatherCondition): string {
  return CONDITION_LABELS[condition];
}

export function getWeatherIconName(condition: WeatherCondition): string {
  return CONDITION_ICONS[condition];
}

export function getTemperatureUnitLabel(unit: TemperatureUnit): string {
  return unit === "f" ? "°F" : "°C";
}

export function toDisplayTemperature(value: number, unit: TemperatureUnit): number {
  return unit === "f" ? (value * 9) / 5 + 32 : value;
}

export function fromDisplayTemperature(value: number, unit: TemperatureUnit): number {
  return unit === "f" ? ((value - 32) * 5) / 9 : value;
}

export function formatTemperatureForDisplay(value: number, unit: TemperatureUnit): string {
  return `${Math.round(toDisplayTemperature(value, unit))}${getTemperatureUnitLabel(unit)}`;
}

export function formatTemperatureRangeForDisplay(
  low: number,
  high: number,
  unit: TemperatureUnit
): string {
  const min = Math.min(low, high);
  const max = Math.max(low, high);
  return `${formatTemperatureForDisplay(min, unit)} to ${formatTemperatureForDisplay(max, unit)}`;
}

export function isSkyOnlyWeatherCondition(condition: WeatherCondition): boolean {
  return SKY_ONLY_CONDITIONS.has(condition);
}

export function getWeatherStateLabel(
  input: Pick<WeatherData, "condition" | "conditionLabel" | "precipitationLabel">
): string | null {
  if (isSkyOnlyWeatherCondition(input.condition)) {
    return null;
  }

  const precipitation = input.precipitationLabel.trim();

  if (
    input.condition === "drizzle" ||
    input.condition === "rain" ||
    input.condition === "heavy-rain" ||
    input.condition === "thunderstorm" ||
    input.condition === "sleet" ||
    input.condition === "flurries" ||
    input.condition === "snow" ||
    input.condition === "blizzard"
  ) {
    return precipitation.length > 0 && precipitation !== "None"
      ? precipitation
      : input.conditionLabel;
  }

  return input.conditionLabel;
}

export function weatherDayKey(date: Pick<FantasyDate, "monthIndex" | "day">): string {
  return `${Math.trunc(date.monthIndex)}-${Math.trunc(date.day)}`;
}

export function normalizeWeatherPackFile(raw: unknown): WeatherPackFile {
  const record = asRecord(raw);
  const stableSpanMin = Math.max(1, Math.trunc(readNumber(record.stableSpanMin, DEFAULT_WEATHER_PACK.stableSpanMin)));
  const stableSpanMax = Math.max(stableSpanMin, Math.trunc(readNumber(record.stableSpanMax, DEFAULT_WEATHER_PACK.stableSpanMax)));
  const frontSpanMin = Math.max(1, Math.trunc(readNumber(record.frontSpanMin, DEFAULT_WEATHER_PACK.frontSpanMin)));
  const frontSpanMax = Math.max(frontSpanMin, Math.trunc(readNumber(record.frontSpanMax, DEFAULT_WEATHER_PACK.frontSpanMax)));

  return {
    version: 1,
    kind: "weather-pack",
    id: readString(record.id, DEFAULT_WEATHER_PACK.id),
    name: readString(record.name, DEFAULT_WEATHER_PACK.name),
    description: readOptionalString(record.description),
    temperatureMin: readNumber(record.temperatureMin, DEFAULT_WEATHER_PACK.temperatureMin),
    temperatureMax: readNumber(record.temperatureMax, DEFAULT_WEATHER_PACK.temperatureMax),
    humidity: clamp(readNumber(record.humidity, DEFAULT_WEATHER_PACK.humidity), 0, 100),
    precipitation: clamp(readNumber(record.precipitation, DEFAULT_WEATHER_PACK.precipitation), 0, 100),
    storminess: clamp(readNumber(record.storminess, DEFAULT_WEATHER_PACK.storminess), 0, 100),
    cloudiness: clamp(readNumber(record.cloudiness, DEFAULT_WEATHER_PACK.cloudiness), 0, 100),
    fogginess: clamp(readNumber(record.fogginess, DEFAULT_WEATHER_PACK.fogginess), 0, 100),
    windiness: clamp(readNumber(record.windiness, DEFAULT_WEATHER_PACK.windiness), 0, 100),
    seasonality: clamp(readNumber(record.seasonality, DEFAULT_WEATHER_PACK.seasonality), 0, 100),
    frontFrequency: clamp(readNumber(record.frontFrequency, DEFAULT_WEATHER_PACK.frontFrequency), 0, 100),
    frontStrength: clamp(readNumber(record.frontStrength, DEFAULT_WEATHER_PACK.frontStrength), 0, 100),
    volatility: clamp(readNumber(record.volatility, DEFAULT_WEATHER_PACK.volatility), 0, 100),
    stableSpanMin,
    stableSpanMax,
    frontSpanMin,
    frontSpanMax,
    snowTemperature: readNumber(record.snowTemperature, DEFAULT_WEATHER_PACK.snowTemperature),
    monthProfiles: readWeatherPackMonthProfiles(record.monthProfiles)
  };
}

export function normalizeWeatherReferenceYearFile(raw: unknown): WeatherReferenceYearFile {
  const record = asRecord(raw);
  const daysRecord = asRecord(record.days);
  const days: Record<string, WeatherDayEntry> = {};

  Object.entries(daysRecord).forEach(([key, value]) => {
    days[key] = normalizeWeatherDayEntry(value);
  });

  return {
    version: 1,
    kind: "weather-reference-year",
    calendarId: readString(record.calendarId, "default-calendar"),
    weatherPackId: readString(record.weatherPackId, DEFAULT_WEATHER_PACK.id),
    year: Math.trunc(readNumber(record.year, 0)),
    generatedAt: readString(record.generatedAt, new Date(0).toISOString()),
    days
  };
}

export function normalizeWeatherYearFile(raw: unknown): WeatherYearFile {
  const record = asRecord(raw);
  const daysRecord = asRecord(record.days);
  const days: Record<string, WeatherDayEntry> = {};

  Object.entries(daysRecord).forEach(([key, value]) => {
    days[key] = normalizeWeatherDayEntry(value);
  });

  return {
    version: 1,
    kind: "weather-day-year",
    calendarId: readString(record.calendarId, "default-calendar"),
    year: Math.trunc(readNumber(record.year, 0)),
    baseWeatherPackId: readString(record.baseWeatherPackId, DEFAULT_WEATHER_PACK.id),
    generatedAt: readString(record.generatedAt, new Date(0).toISOString()),
    days
  };
}

export function getWeatherDayEntry(
  file: WeatherYearFile | null,
  date: FantasyDate
): WeatherDayEntry | null {
  if (!file || file.year !== date.year) {
    return null;
  }

  return file.days[weatherDayKey(date)] ?? null;
}

export function createWeatherYearFromReference(
  reference: WeatherReferenceYearFile
): WeatherYearFile {
  const days: Record<string, WeatherDayEntry> = {};

  Object.entries(reference.days).forEach(([key, entry]) => {
    days[key] = {
      ...entry,
      sourceType: "pack",
      sourceId: reference.weatherPackId,
      sourcePackId: reference.weatherPackId
    };
  });

  return {
    version: 1,
    kind: "weather-day-year",
    calendarId: reference.calendarId,
    year: reference.year,
    baseWeatherPackId: reference.weatherPackId,
    generatedAt: new Date().toISOString(),
    days
  };
}

export function resolveWeatherPackMonthProfiles(
  pack: WeatherPackFile,
  months: FantasyMonth[]
): WeatherPackMonthProfile[] {
  const defaults = buildDefaultMonthProfiles(months.length, pack);
  const byIndex = new Map<number, WeatherPackMonthProfile>();

  pack.monthProfiles.forEach((profile) => {
    byIndex.set(profile.monthIndex, normalizeMonthProfile(profile, profile.monthIndex, pack));
  });

  return months.map((_month, monthIndex) =>
    byIndex.get(monthIndex) ?? defaults[monthIndex] ?? buildDefaultMonthProfile(monthIndex, pack)
  );
}

export function getWeatherProfileMonths(
  calendar: CalendarFile,
  pack?: WeatherPackFile,
  year = calendar.state.cursorDate.year
): FantasyMonth[] {
  const mapping = calendar.definition.weatherProfile;

  if (mapping.mode !== "absolute-day-cycle") {
    return getMonthsForYear(calendar.definition, year);
  }

  const climateYearLength = Math.max(1, Math.trunc(mapping.climateYearLength || 1));
  const requestedMonthCount = Math.max(
    1,
    pack?.monthProfiles.length ?? 0,
    calendar.definition.months.length,
    12
  );
  const monthCount = Math.min(requestedMonthCount, climateYearLength);
  const baseDays = Math.floor(climateYearLength / monthCount);
  const remainder = climateYearLength % monthCount;

  return Array.from({ length: monthCount }, (_, index) => ({
    id: `climate-month-${index + 1}`,
    name: `Climate Month ${index + 1}`,
    days: baseDays + (index < remainder ? 1 : 0)
  }));
}

export function createWeatherPreviewReferenceYear(
  calendar: CalendarFile,
  pack: WeatherPackFile,
  previewYear = 1
): WeatherReferenceYearFile {
  const seedMaterial = JSON.stringify({
    temperatureMin: pack.temperatureMin,
    temperatureMax: pack.temperatureMax,
    humidity: pack.humidity,
    precipitation: pack.precipitation,
    storminess: pack.storminess,
    cloudiness: pack.cloudiness,
    fogginess: pack.fogginess,
    windiness: pack.windiness,
    seasonality: pack.seasonality,
    frontFrequency: pack.frontFrequency,
    frontStrength: pack.frontStrength,
    volatility: pack.volatility,
    stableSpanMin: pack.stableSpanMin,
    stableSpanMax: pack.stableSpanMax,
    frontSpanMin: pack.frontSpanMin,
    frontSpanMax: pack.frontSpanMax,
    snowTemperature: pack.snowTemperature,
    monthProfiles: pack.monthProfiles.map((profile) => ({
      monthIndex: profile.monthIndex,
      temperatureOffset: profile.temperatureOffset,
      humidity: profile.humidity,
      precipitation: profile.precipitation,
      cloudiness: profile.cloudiness,
      fogginess: profile.fogginess,
      windiness: profile.windiness,
      frontBias: profile.frontBias
    }))
  });

  return createWeatherReferenceYear(
    calendar,
    pack,
    previewYear,
    hashString(`weather-pack-preview:${calendar.definition.id}:${seedMaterial}`)
  );
}

export function createWeatherReferenceYear(
  calendar: CalendarFile,
  pack: WeatherPackFile,
  year: number,
  seedOverride?: number
): WeatherReferenceYearFile {
  const definition = calendar.definition;
  const yearLength = getYearLength(definition, year);
  const seed = seedOverride ?? hashString(`${calendar.id}:${pack.id}:${year}`);
  const rng = createRng(seed);
  const days: Record<string, WeatherDayEntry> = {};
  const weatherProfileMonths = getWeatherProfileMonths(calendar, pack, year);
  const weatherProfileYearLength = weatherProfileMonths.reduce(
    (sum, month) => sum + month.days,
    0
  );
  const monthProfiles = resolveWeatherPackMonthProfiles(pack, weatherProfileMonths);
  const hasExplicitMonthlyTemperature = hasExplicitMonthTemperatureProfiles(monthProfiles);

  let dayOfYear = 1;
  let previousPhase: WeatherPhaseKind | null = null;

  while (dayOfYear <= yearLength) {
    const monthDay = dayOfYearToMonthDay(definition, year, dayOfYear);
    const date: FantasyDate = {
      year,
      monthIndex: monthDay.monthIndex,
      day: monthDay.day
    };
    const weatherProfileDayOfYear = resolveWeatherProfileDayOfYear(
      calendar,
      date,
      dayOfYear
    );
    const weatherProfileMonthDay = dayOfYearToMonthDayForMonths(
      weatherProfileMonths,
      weatherProfileDayOfYear
    );
    const monthClimate = getInterpolatedMonthProfile(weatherProfileMonths, monthProfiles, {
      year,
      monthIndex: weatherProfileMonthDay.monthIndex,
      day: weatherProfileMonthDay.day
    });

    const referenceTemperature = getReferenceTemperature(
      pack,
      weatherProfileDayOfYear,
      weatherProfileYearLength,
      monthClimate,
      hasExplicitMonthlyTemperature
    );

    const phase = pickPhaseKind(pack, referenceTemperature, monthClimate, previousPhase, rng);
    const phaseLength = pickPhaseLength(pack, phase, rng);
    const intensity = 0.35 + rng() * 0.65;

    for (let offset = 0; offset < phaseLength && dayOfYear <= yearLength; offset += 1, dayOfYear += 1) {
      const currentMonthDay = dayOfYearToMonthDay(definition, year, dayOfYear);
      const date: FantasyDate = {
        year,
        monthIndex: currentMonthDay.monthIndex,
        day: currentMonthDay.day
      };
      const currentWeatherProfileDayOfYear = resolveWeatherProfileDayOfYear(
        calendar,
        date,
        dayOfYear
      );
      const currentWeatherProfileMonthDay = dayOfYearToMonthDayForMonths(
        weatherProfileMonths,
        currentWeatherProfileDayOfYear
      );	
      const progress = phaseLength <= 1 ? 1 : offset / (phaseLength - 1);
      const currentMonthClimate = getInterpolatedMonthProfile(
        weatherProfileMonths,
        monthProfiles,
        {
          year,
          monthIndex: currentWeatherProfileMonthDay.monthIndex,
          day: currentWeatherProfileMonthDay.day
        }
      );

      days[weatherDayKey(date)] = createEntryForPhase(
        pack,
        currentWeatherProfileDayOfYear,
        weatherProfileYearLength,
        currentMonthClimate,
        hasExplicitMonthlyTemperature,
        phase,
        intensity,
        progress,
        rng
      );
    }

    previousPhase = phase;
  }

  return {
    version: 1,
    kind: "weather-reference-year",
    calendarId: calendar.id,
    weatherPackId: pack.id,
    year,
    generatedAt: new Date().toISOString(),
    days
  };
}

export function resolveWeatherForDate(
  calendar: CalendarFile,
  date: FantasyDate,
  weatherYearFile: WeatherYearFile | null = null
): WeatherData {
  const normalizedDate = clampDate(date, calendar.definition);
  const entry = weatherYearFile?.year === normalizedDate.year
    ? weatherYearFile.days[weatherDayKey(normalizedDate)]
    : null;

  if (!entry) {
    return {
      date: normalizedDate,
      tempLow: 0,
      tempHigh: 0,
      condition: "clear",
      conditionLabel: CONDITION_LABELS.clear,
      windDirection: "—",
      windLabel: "No data",
      cloudsLabel: "No data",
      precipitationLabel: "No data",
      icon: CONDITION_ICONS.clear,
      sourceType: "pack"
    };
  }

  return hydrateWeatherData(normalizedDate, entry);
}

function hydrateWeatherData(date: FantasyDate, entry: WeatherDayEntry): WeatherData {
  const tempLow = Math.min(entry.tempLow, entry.tempHigh);
  const tempHigh = Math.max(entry.tempLow, entry.tempHigh);

  return {
    date,
    tempLow,
    tempHigh,
    condition: entry.condition,
    conditionLabel: CONDITION_LABELS[entry.condition],
    windDirection: entry.windDirection,
    windLabel: entry.windLabel,
    cloudsLabel: entry.cloudsLabel,
    precipitationLabel: entry.precipitationLabel,
    icon: entry.icon || CONDITION_ICONS[entry.condition],
    note: entry.note,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    sourcePackId: entry.sourcePackId,
    locked: entry.locked
  };
}

function normalizeWeatherDayEntry(raw: unknown): WeatherDayEntry {
  const record = asRecord(raw);
  const condition = readWeatherCondition(record.condition) ?? "clear";

  return {
    tempLow: Math.round(readNumber(record.tempLow, 0)),
    tempHigh: Math.round(readNumber(record.tempHigh, 0)),
    condition,
    windDirection: readString(record.windDirection, "—"),
    windLabel: readString(record.windLabel, "No data"),
    cloudsLabel: readString(record.cloudsLabel, defaultSkyLabelForCondition(condition)),
    precipitationLabel: readString(record.precipitationLabel, describePrecipitation(condition)),
    icon: readString(record.icon, CONDITION_ICONS[condition]),
    note: readOptionalString(record.note),
    sourceType: readWeatherSourceType(record.sourceType) ?? "pack",
    sourceId: readOptionalString(record.sourceId),
    sourcePackId: readOptionalString(record.sourcePackId),
    locked: readBoolean(record.locked, false)
  };
}

function readWeatherPackMonthProfiles(raw: unknown): WeatherPackMonthProfile[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    return normalizeMonthProfile(
      {
        monthIndex: Math.trunc(readNumber(record.monthIndex, index)),
        temperatureOffset: readNumber(record.temperatureOffset, 0),
        humidity: clamp(readNumber(record.humidity, DEFAULT_WEATHER_PACK.humidity), 0, 100),
        precipitation: clamp(readNumber(record.precipitation, DEFAULT_WEATHER_PACK.precipitation), 0, 100),
        cloudiness: clamp(readNumber(record.cloudiness, DEFAULT_WEATHER_PACK.cloudiness), 0, 100),
        fogginess: clamp(readNumber(record.fogginess, DEFAULT_WEATHER_PACK.fogginess), 0, 100),
        windiness: clamp(readNumber(record.windiness, DEFAULT_WEATHER_PACK.windiness), 0, 100),
        frontBias: clamp(readNumber(record.frontBias, DEFAULT_WEATHER_PACK.frontFrequency), 0, 100)
      },
      index,
      DEFAULT_WEATHER_PACK
    );
  });
}

function normalizeMonthProfile(
  profile: WeatherPackMonthProfile,
  monthIndex: number,
  pack: WeatherPackFile
): WeatherPackMonthProfile {
  return {
    monthIndex,
    temperatureOffset: readNumber(profile.temperatureOffset, 0),
    humidity: clamp(readNumber(profile.humidity, pack.humidity), 0, 100),
    precipitation: clamp(readNumber(profile.precipitation, pack.precipitation), 0, 100),
    cloudiness: clamp(readNumber(profile.cloudiness, pack.cloudiness), 0, 100),
    fogginess: clamp(readNumber(profile.fogginess, pack.fogginess), 0, 100),
    windiness: clamp(readNumber(profile.windiness, pack.windiness), 0, 100),
    frontBias: clamp(readNumber(profile.frontBias, pack.frontFrequency), 0, 100)
  };
}

function buildDefaultMonthProfiles(
  monthCount: number,
  pack: WeatherPackFile
): WeatherPackMonthProfile[] {
  return Array.from({ length: Math.max(1, monthCount) }, (_, monthIndex) =>
    buildDefaultMonthProfile(monthIndex, pack)
  );
}

function buildDefaultMonthProfile(
  monthIndex: number,
  pack: WeatherPackFile
): WeatherPackMonthProfile {
  return {
    monthIndex,
    temperatureOffset: 0,
    humidity: pack.humidity,
    precipitation: pack.precipitation,
    cloudiness: pack.cloudiness,
    fogginess: pack.fogginess,
    windiness: pack.windiness,
    frontBias: pack.frontFrequency
  };
}

function getInterpolatedMonthProfile(
  months: FantasyMonth[],
  profiles: WeatherPackMonthProfile[],
  date: FantasyDate
): WeatherPackMonthProfile {
  const current = profiles[date.monthIndex] ?? profiles[0] ?? buildDefaultMonthProfile(0, DEFAULT_WEATHER_PACK);
  const next = profiles[(date.monthIndex + 1) % profiles.length] ?? current;
  const monthDays = Math.max(1, months[date.monthIndex]?.days ?? 1);
  const amount = monthDays <= 1 ? 1 : clampNumber((date.day - 1) / (monthDays - 1), 0, 1);

  return {
    monthIndex: current.monthIndex,
    temperatureOffset: lerp(current.temperatureOffset, next.temperatureOffset, amount),
    humidity: lerp(current.humidity, next.humidity, amount),
    precipitation: lerp(current.precipitation, next.precipitation, amount),
    cloudiness: lerp(current.cloudiness, next.cloudiness, amount),
    fogginess: lerp(current.fogginess, next.fogginess, amount),
    windiness: lerp(current.windiness, next.windiness, amount),
    frontBias: lerp(current.frontBias, next.frontBias, amount)
  };
}

function createEntryForPhase(
  pack: WeatherPackFile,
  dayOfYear: number,
  yearLength: number,
  monthClimate: WeatherPackMonthProfile,
  hasExplicitMonthlyTemperature: boolean,
  phase: WeatherPhaseKind,
  intensity: number,
  progress: number,
  rng: () => number
): WeatherDayEntry {
  const baseHigh = getReferenceTemperature(
    pack,
    dayOfYear,
    yearLength,
    monthClimate,
    hasExplicitMonthlyTemperature
  );

  const humid = monthClimate.humidity / 100;
  const cloudyBase = monthClimate.cloudiness / 100;
  const windBase = monthClimate.windiness / 100;
  const phaseCurve = Math.sin(Math.PI * progress);
  const frontPower = pack.frontStrength / 100;

  let cloudCover = cloudyBase * 0.45 + randomRange(rng, -0.06, 0.06);
  let windiness = windBase * 0.45 + randomRange(rng, -0.05, 0.05);
  let tempShift = randomRange(rng, -1.0, 1.0) * (0.35 + pack.volatility / 100);
  let condition: WeatherCondition = "partly-cloudy";
  let wetness: number | null = null;
  let stormy = false;
  let snowyFront = false;

  switch (phase) {
    case "clear":
      cloudCover = 0.04 + randomRange(rng, 0, 0.14);
      windiness = 0.10 + windBase * 0.22 + randomRange(rng, -0.04, 0.06);
      tempShift += 1.8 * intensity;
      break;

    case "cloudy":
      cloudCover = 0.46 + cloudyBase * 0.32 + randomRange(rng, -0.04, 0.12);
      windiness = 0.14 + windBase * 0.26 + randomRange(rng, -0.04, 0.08);
      tempShift -= 0.6 * intensity;
      break;

    case "wet-front":
      wetness = clamp01(
        0.28 +
          humid * 0.26 +
          (monthClimate.precipitation / 100) * 0.22 +
          phaseCurve * 0.28 +
          randomRange(rng, -0.04, 0.06)
      );
      cloudCover = 0.72 + phaseCurve * 0.18 + cloudyBase * 0.12;
      windiness = 0.24 + windBase * 0.28 + phaseCurve * 0.18;
      tempShift += (0.5 - progress) * (1.8 + frontPower * 2.2);
      break;

    case "storm-front":
      wetness = clamp01(
        0.52 +
          humid * 0.18 +
          (monthClimate.precipitation / 100) * 0.14 +
          phaseCurve * 0.25 +
          randomRange(rng, -0.03, 0.06)
      );
      stormy = true;
      cloudCover = 0.86 + phaseCurve * 0.10;
      windiness = 0.54 + windBase * 0.24 + phaseCurve * 0.18;
      tempShift += (0.5 - progress) * (2.1 + frontPower * 2.6);
      break;

    case "fog-bank":
      cloudCover = 0.42 + humid * 0.26 + randomRange(rng, -0.04, 0.08);
      windiness = 0.02 + windBase * 0.08;
      tempShift -= 0.4 * intensity;
      break;

    case "snow-front":
      wetness = clamp01(
        0.40 +
          humid * 0.18 +
          (monthClimate.precipitation / 100) * 0.20 +
          phaseCurve * 0.28 +
          randomRange(rng, -0.04, 0.05)
      );
      snowyFront = true;
      cloudCover = 0.80 + phaseCurve * 0.15;
      windiness = 0.34 + windBase * 0.20 + phaseCurve * 0.16;
      tempShift -= 2.2 + frontPower * 2.0;
      break;

    case "warm-spell":
      cloudCover = 0.08 + randomRange(rng, 0, 0.18);
      windiness = 0.10 + windBase * 0.20 + randomRange(rng, -0.03, 0.06);
      tempShift += 2.8 + intensity * 2.4;
      break;

    case "cold-snap":
      cloudCover = 0.14 + cloudyBase * 0.18 + randomRange(rng, 0, 0.16);
      windiness = 0.12 + windBase * 0.18 + randomRange(rng, -0.03, 0.07);
      tempShift -= 2.8 + intensity * 2.2;
      break;
  }

  cloudCover = clamp01(cloudCover);
  windiness = clamp01(windiness);

  const diurnalSwing = clampNumber(
    6 + (1 - cloudCover) * 4.5 + (phase === "warm-spell" ? 1.2 : 0) - (phase === "fog-bank" ? 2.4 : 0),
    3,
    14
  );

  const targetHigh = baseHigh + tempShift;
  const precipitationTemperature = targetHigh - diurnalSwing * 0.6;

  if (snowyFront && wetness !== null) {
    condition = pickSnowCondition(
      precipitationTemperature,
      pack.snowTemperature,
      wetness,
      windiness
    );
  } else if (wetness !== null) {
    condition = pickWetCondition(
      precipitationTemperature,
      pack.snowTemperature,
      wetness,
      stormy
    );
  } else if (phase === "fog-bank") {
    condition = rng() > 0.45 ? "fog" : "mist";
  } else if (phase === "cold-snap" && precipitationTemperature <= pack.snowTemperature - 1 && rng() > 0.7) {
    condition = "flurries";
  } else {
    condition = pickSkyCondition(cloudCover);
  }

  let tempHigh = Math.round(clampNumber(targetHigh, pack.temperatureMin, pack.temperatureMax));
  let tempLow = Math.round(
    clampNumber(tempHigh - diurnalSwing, pack.temperatureMin, tempHigh)
  );

  if (tempLow > tempHigh) {
    tempLow = tempHigh;
  }

  const windDirection = WIND_DIRECTIONS[Math.floor(rng() * WIND_DIRECTIONS.length)] ?? "N";

  return {
    tempLow,
    tempHigh,
    condition,
    windDirection,
    windLabel: describeWind(windiness, condition),
    cloudsLabel: describeSky(cloudCover),
    precipitationLabel: describePrecipitation(condition),
    icon: CONDITION_ICONS[condition],
    sourceType: "pack",
    sourceId: pack.id,
    sourcePackId: pack.id,
    locked: false
  };
}

function getReferenceTemperature(
  pack: WeatherPackFile,
  dayOfYear: number,
  yearLength: number,
  monthClimate: WeatherPackMonthProfile,
  hasExplicitMonthlyTemperature: boolean
): number {
  if (hasExplicitMonthlyTemperature) {
    return monthClimate.temperatureOffset;
  }

  return getSeasonalTemperature(pack, dayOfYear, yearLength);
}

function hasExplicitMonthTemperatureProfiles(
  profiles: WeatherPackMonthProfile[]
): boolean {
  if (profiles.length === 0) {
    return false;
  }

  const rounded = profiles.map((profile) => Math.round(profile.temperatureOffset * 10));
  return rounded.some((value) => value !== 0) || new Set(rounded).size > 1;
}

function getSeasonalTemperature(
  pack: WeatherPackFile,
  dayOfYear: number,
  yearLength: number
): number {
  const min = Math.min(pack.temperatureMin, pack.temperatureMax);
  const max = Math.max(pack.temperatureMin, pack.temperatureMax);
  const midpoint = (min + max) / 2;
  const amplitude = (max - min) / 2;
  const seasonality = 0.2 + (pack.seasonality / 100) * 0.8;
  const hotPeak = Math.max(1, Math.round(yearLength * 0.58));
  const angle = ((dayOfYear - hotPeak) / yearLength) * Math.PI * 2;

  return midpoint + Math.cos(angle) * amplitude * seasonality;
}

function pickPhaseKind(
  pack: WeatherPackFile,
  referenceTemperature: number,
  monthClimate: WeatherPackMonthProfile,
  previous: WeatherPhaseKind | null,
  rng: () => number
): WeatherPhaseKind {
  const tempSpan = Math.max(1, pack.temperatureMax - pack.temperatureMin);
  const warmth = clamp01((referenceTemperature - pack.temperatureMin) / tempSpan);
  const humidity = monthClimate.humidity / 100;
  const precipitation = monthClimate.precipitation / 100;
  const storminess = pack.storminess / 100;
  const cloudiness = monthClimate.cloudiness / 100;
  const fogginess = monthClimate.fogginess / 100;
  const frontiness = monthClimate.frontBias / 100;
  const volatility = pack.volatility / 100;
  const coldBias = referenceTemperature <= pack.snowTemperature + 3 ? 1 : 0;
  const warmBias = warmth >= 0.58 ? 1 : 0;

  const weights: Record<WeatherPhaseKind, number> = {
    clear: Math.max(0.08, 0.76 - humidity * 0.28 - precipitation * 0.22 - cloudiness * 0.26),
    cloudy: 0.20 + cloudiness * 0.60 + humidity * 0.18,
    "wet-front": 0.08 + frontiness * 0.50 + precipitation * 0.42 + humidity * 0.22,
    "storm-front": 0.02 + storminess * 0.70 + frontiness * 0.18 + warmBias * 0.18,
    "fog-bank": 0.01 + fogginess * 0.72 + humidity * 0.20 - (monthClimate.windiness / 100) * 0.10,
    "snow-front": 0.01 + coldBias * 0.34 + frontiness * 0.16 + precipitation * 0.16,
    "warm-spell": 0.04 + volatility * 0.36 + warmBias * 0.14,
    "cold-snap": 0.04 + volatility * 0.36 + (1 - warmBias) * 0.12
  };

  if (previous === "clear" || previous === "warm-spell") {
    weights.clear *= 0.68;
    weights["wet-front"] *= 1.18;
    weights.cloudy *= 1.08;
  }

  if (previous === "wet-front" || previous === "storm-front" || previous === "snow-front") {
    weights["wet-front"] *= 0.34;
    weights["storm-front"] *= 0.30;
    weights["snow-front"] *= 0.34;
    weights.cloudy *= 1.22;
    weights.clear *= 1.14;
    weights["cold-snap"] *= 1.12;
  }

  if (previous === "fog-bank") {
    weights["fog-bank"] *= 0.30;
    weights.clear *= 1.18;
    weights.cloudy *= 1.10;
  }

  return pickByWeight(weights, rng);
}

function pickPhaseLength(
  pack: WeatherPackFile,
  phase: WeatherPhaseKind,
  rng: () => number
): number {
  const stable =
    phase === "clear" ||
    phase === "cloudy" ||
    phase === "fog-bank" ||
    phase === "warm-spell" ||
    phase === "cold-snap";

  const volatilityAdjust = Math.round((pack.volatility / 100) * 2);

  if (stable) {
    const min = Math.max(1, pack.stableSpanMin - volatilityAdjust);
    const max = Math.max(min, pack.stableSpanMax);
    return randomInt(rng, min, max);
  }

  const min = Math.max(1, pack.frontSpanMin);
  const max = Math.max(min, pack.frontSpanMax + volatilityAdjust);
  return randomInt(rng, min, max);
}

function pickByWeight(
  weights: Record<WeatherPhaseKind, number>,
  rng: () => number
): WeatherPhaseKind {
  const entries = Object.entries(weights) as Array<[WeatherPhaseKind, number]>;
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);

  if (total <= 0) {
    return "clear";
  }

  let cursor = rng() * total;

  for (const [key, weight] of entries) {
    const normalized = Math.max(0, weight);
    cursor -= normalized;

    if (cursor <= 0) {
      return key;
    }
  }

  return entries[entries.length - 1]?.[0] ?? "clear";
}

function pickSkyCondition(cloudCover: number): WeatherCondition {
  if (cloudCover < 0.08) return "clear";
  if (cloudCover < 0.20) return "mostly-clear";
  if (cloudCover < 0.38) return "partly-cloudy";
  if (cloudCover < 0.56) return "scattered-clouds";
  if (cloudCover < 0.76) return "broken-clouds";
  return "overcast";
}

function describeSky(cloudCover: number): string {
  if (cloudCover < 0.08) return "Clear sky";
  if (cloudCover < 0.20) return "Mostly clear";
  if (cloudCover < 0.38) return "Light clouds";
  if (cloudCover < 0.56) return "Scattered clouds";
  if (cloudCover < 0.76) return "Broken clouds";
  return "Overcast";
}

function defaultSkyLabelForCondition(condition: WeatherCondition): string {
  switch (condition) {
    case "clear":
      return "Clear sky";
    case "mostly-clear":
      return "Mostly clear";
    case "partly-cloudy":
      return "Light clouds";
    case "scattered-clouds":
      return "Scattered clouds";
    case "broken-clouds":
      return "Broken clouds";
    default:
      return "Overcast";
  }
}

function pickWetCondition(
  temperature: number,
  snowTemperature: number,
  wetness: number,
  stormy: boolean
): WeatherCondition {
  if (temperature <= snowTemperature - 1) {
    if (wetness > 0.86) return "snow";
    if (wetness > 0.62) return "flurries";
    return "flurries";
  }

  if (temperature <= snowTemperature + 1.5) {
    if (wetness > 0.70) return "sleet";
    return "flurries";
  }

  if (stormy) {
    return wetness > 0.78 ? "thunderstorm" : "heavy-rain";
  }

  if (wetness < 0.40) return "drizzle";
  if (wetness < 0.74) return "rain";
  return "heavy-rain";
}

function pickSnowCondition(
  temperature: number,
  snowTemperature: number,
  wetness: number,
  windiness: number
): WeatherCondition {
  if (temperature > snowTemperature + 2) {
    return wetness > 0.62 ? "rain" : "sleet";
  }

  if (wetness > 0.84 && windiness > 0.70) {
    return "blizzard";
  }

  if (wetness > 0.60) {
    return "snow";
  }

  return "flurries";
}

function describeWind(windiness: number, condition: WeatherCondition): string {
  const adjusted =
    condition === "thunderstorm"
      ? Math.max(windiness, 0.82)
      : condition === "blizzard"
        ? Math.max(windiness, 0.84)
        : windiness;

  if (condition === "thunderstorm" && adjusted >= 0.82) return "Storm gusts";
  if (condition === "blizzard" && adjusted >= 0.84) return "Blizzard winds";
  if (adjusted < 0.06) return "Calm";
  if (adjusted < 0.14) return "Light air";
  if (adjusted < 0.28) return "Light breeze";
  if (adjusted < 0.42) return "Gentle breeze";
  if (adjusted < 0.58) return "Steady breeze";
  if (adjusted < 0.72) return "Fresh breeze";
  if (adjusted < 0.84) return "Strong breeze";
  if (adjusted < 0.94) return "Near gale";
  return "Gale";
}

function describePrecipitation(condition: WeatherCondition): string {
  switch (condition) {
    case "drizzle":
      return "Light drizzle";
    case "rain":
      return "Steady rain";
    case "heavy-rain":
      return "Heavy rain";
    case "thunderstorm":
      return "Heavy rain & thunder";
    case "sleet":
      return "Sleet";
    case "flurries":
      return "Snow flurries";
    case "snow":
      return "Snowfall";
    case "blizzard":
      return "Blowing snow";
    default:
      return "None";
  }
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function randomRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

function randomInt(rng: () => number, min: number, max: number): number {
  const safeMin = Math.ceil(min);
  const safeMax = Math.floor(max);

  if (safeMax <= safeMin) {
    return safeMin;
  }

  return Math.floor(randomRange(rng, safeMin, safeMax + 1));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clamp01(value: number): number {
  return clampNumber(value, 0, 1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveWeatherProfileDayOfYear(
  calendar: CalendarFile,
  date: FantasyDate,
  fallbackDayOfYear: number
): number {
  return getWeatherProfileDayOfYearForDate(
    calendar.definition,
    date,
    fallbackDayOfYear
  );
}

function dayOfYearToMonthDayForMonths(
  months: FantasyMonth[],
  dayOfYear: number
): { monthIndex: number; day: number } {
  const yearLength = Math.max(1, months.reduce((sum, month) => sum + month.days, 0));
  let remaining = mod(Math.trunc(dayOfYear) - 1, yearLength) + 1;

  for (let monthIndex = 0; monthIndex < months.length; monthIndex += 1) {
    const month = months[monthIndex];

    if (month && remaining <= month.days) {
      return {
        monthIndex,
        day: remaining
      };
    }

    remaining -= month?.days ?? 0;
  }

  return {
    monthIndex: Math.max(0, months.length - 1),
    day: months[months.length - 1]?.days ?? 1
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
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

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readWeatherCondition(value: unknown): WeatherCondition | undefined {
  return WEATHER_CONDITION_OPTIONS.includes(value as WeatherCondition)
    ? (value as WeatherCondition)
    : undefined;
}

function readWeatherSourceType(value: unknown): WeatherSourceType | undefined {
  return value === "pack" || value === "event" || value === "manual"
    ? value
    : undefined;
}