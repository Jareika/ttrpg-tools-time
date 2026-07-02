import {
  clampDate,
  getAbsoluteDay as getCalendarAbsoluteDay
} from "./calendar";
import type {
  CalendarFile,
  FantasyCalendarDefinition,
  FantasyDate,
  FantasyMoon,
  FantasyTimeOfDay,
  MoonPhaseData,
  MoonPhaseTransition
} from "./types";

export const DEFAULT_MOON_PHASE_COUNT = 8;
export const DEFAULT_MOON_SIZE = 28;
const FALLBACK_HOURS_PER_DAY = 24;
const FALLBACK_MINUTES_PER_HOUR = 60;

const EIGHT_PHASE_LABELS = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent"
];

const FOUR_PHASE_LABELS = [
  "New Moon",
  "First Quarter",
  "Full Moon",
  "Last Quarter"
];

export function resolveMoonsForDate(
  calendar: CalendarFile,
  date: FantasyDate
): MoonPhaseData[] {
  return resolveMoonsForMoment(calendar, date);
}

export function resolveMoonsForMoment(
  calendar: CalendarFile,
  date: FantasyDate,
  time?: FantasyTimeOfDay
): MoonPhaseData[] {
  const normalizedDate = clampDate(date, calendar.definition);

  return calendar.definition.moons.map((moon) =>
    resolveMoonPhase(calendar.definition, moon, normalizedDate, time)
  );
}

export function resolveMoonPhase(
  definition: FantasyCalendarDefinition,
  moon: FantasyMoon,
  date: FantasyDate,
  time?: FantasyTimeOfDay
): MoonPhaseData {
  const normalizedDate = clampDate(date, definition);
  const cycleDays = getPositiveNumber(moon.cycleDays, 1);
  const phaseCount = Math.max(1, Math.trunc(moon.phaseCount ?? DEFAULT_MOON_PHASE_COUNT));
  const minutesPerDay = getMinutesPerDay(definition);
  const cycleMinute = getMoonCycleMinute(definition, moon, normalizedDate, time);
  const cycleMinutes = cycleDays * minutesPerDay;
  const offsetMinutes = getFiniteNumber(moon.offsetDays, 0) * minutesPerDay;
  const moonMinute = mod(cycleMinute + offsetMinutes, cycleMinutes);
  const phaseIndex = Math.min(
    phaseCount - 1,
    Math.floor((moonMinute / cycleMinutes) * phaseCount)
  );
  const imageRef =
    moon.phaseImages.find((entry) => entry.phaseIndex === phaseIndex)?.imageRef;
  const minuteOfDay = getMinuteOfDay(definition, time);

  return {
    moonId: moon.id,
    name: moon.name,
    cycleDays,
    cycleDay: Math.floor(moonMinute / minutesPerDay) + 1,
    phaseCount,
    phaseIndex,
    phaseLabel: getMoonPhaseLabel(phaseCount, phaseIndex, moon.phaseLabels),
    size: clampSize(moon.size ?? DEFAULT_MOON_SIZE),
    color: moon.color,
    imageRef,
	timeLabel: formatFantasyTimeFromMinuteOfDay(minuteOfDay, definition)
  };
}

export function getMoonPhaseLabel(
  phaseCount: number,
  phaseIndex: number,
  customLabels: string[] = []
): string {
  const custom = customLabels[phaseIndex]?.trim();
  if (custom) {
    return custom;
  }

  if (phaseCount === 8) {
    return EIGHT_PHASE_LABELS[phaseIndex] ?? `Phase ${phaseIndex + 1}`;
  }

  if (phaseCount === 4) {
    return FOUR_PHASE_LABELS[phaseIndex] ?? `Phase ${phaseIndex + 1}`;
  }

  return `Phase ${phaseIndex + 1}/${phaseCount}`;
}

export function clampTimeOfDay(
  time: FantasyTimeOfDay,
  definition: FantasyCalendarDefinition
): FantasyTimeOfDay {
  const hoursPerDay = getHoursPerDay(definition);
  const minutesPerHour = getMinutesPerHour(definition);

  return {
    hour: clamp(Math.trunc(time.hour || 0), 0, hoursPerDay - 1),
    minute: clamp(Math.trunc(time.minute || 0), 0, minutesPerHour - 1)
  };
}

export function formatFantasyTime(
  time: FantasyTimeOfDay,
  definition: FantasyCalendarDefinition
): string {
  const normalized = clampTimeOfDay(time, definition);
  const hourWidth = Math.max(2, String(getHoursPerDay(definition) - 1).length);
  const minuteWidth = Math.max(2, String(getMinutesPerHour(definition) - 1).length);

  return `${String(normalized.hour).padStart(hourWidth, "0")}:${String(normalized.minute).padStart(minuteWidth, "0")}`;
}

export function resolveMoonPhaseTransitionsForDate(
  calendar: CalendarFile,
  date: FantasyDate
): MoonPhaseTransition[] {
  if (!calendar.definition.time.enabled) {
    return [];
  }

  const definition = calendar.definition;
  const normalizedDate = clampDate(date, definition);
  const minutesPerDay = getMinutesPerDay(definition);
  const transitions: MoonPhaseTransition[] = [];

  definition.moons.forEach((moon) => {
    const dayStartMinute = getMoonCycleDayStartMinute(definition, moon, normalizedDate);
    const dayEndMinute = dayStartMinute + minutesPerDay;
    const phaseCount = Math.max(1, Math.trunc(moon.phaseCount ?? DEFAULT_MOON_PHASE_COUNT));
    const cycleMinutes = getPositiveNumber(moon.cycleDays, 1) * minutesPerDay;
    const offsetMinutes = getFiniteNumber(moon.offsetDays, 0) * minutesPerDay;
    const phaseDuration = cycleMinutes / phaseCount;
    const startBoundaryIndex = Math.floor((dayStartMinute + offsetMinutes) / phaseDuration) - 1;

    for (let boundaryIndex = startBoundaryIndex; boundaryIndex < startBoundaryIndex + phaseCount + 4; boundaryIndex += 1) {
      const boundaryMinute = boundaryIndex * phaseDuration - offsetMinutes;

      if (boundaryMinute >= dayEndMinute) {
        break;
      }

      if (boundaryMinute < dayStartMinute) {
        continue;
      }

      const minuteOfDay = clamp(Math.round(boundaryMinute - dayStartMinute), 0, minutesPerDay - 1);
      const phaseIndex = mod(boundaryIndex, phaseCount);

      if (
        transitions.some((entry) => entry.moonId === moon.id && entry.minuteOfDay === minuteOfDay && entry.phaseIndex === phaseIndex)
      ) {
        continue;
      }

      transitions.push({
        moonId: moon.id,
        name: moon.name,
        phaseIndex,
        phaseLabel: getMoonPhaseLabel(phaseCount, phaseIndex, moon.phaseLabels),
        minuteOfDay,
        timeLabel: formatFantasyTimeFromMinuteOfDay(minuteOfDay, definition)
      });
    }
  });

  return transitions.sort((left, right) => {
    if (left.minuteOfDay !== right.minuteOfDay) {
      return left.minuteOfDay - right.minuteOfDay;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export function getAbsoluteDay(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  return getCalendarAbsoluteDay(definition, date);
}

function getMoonCycleMinute(
  definition: FantasyCalendarDefinition,
  moon: FantasyMoon,
  date: FantasyDate,
  time?: FantasyTimeOfDay
): number {
  const normalizedTime = clampTimeOfDay(time ?? { hour: 0, minute: 0 }, definition);
  const minuteOfDay =
    normalizedTime.hour * getMinutesPerHour(definition) +
    normalizedTime.minute;

  if (moon.cycleAnchor === "month") {
    return (date.day - 1) * getMinutesPerDay(definition) + minuteOfDay;
  }

  return getAbsoluteDay(definition, date) * getMinutesPerDay(definition) + minuteOfDay;
}

function getMoonCycleDayStartMinute(
  definition: FantasyCalendarDefinition,
  moon: FantasyMoon,
  date: FantasyDate
): number {
  if (moon.cycleAnchor === "month") {
    return (date.day - 1) * getMinutesPerDay(definition);
  }

  return getAbsoluteDay(definition, date) * getMinutesPerDay(definition);
}

function getMinuteOfDay(
  definition: FantasyCalendarDefinition,
  time?: FantasyTimeOfDay
): number {
  const normalizedTime = clampTimeOfDay(time ?? { hour: 0, minute: 0 }, definition);
  return normalizedTime.hour * getMinutesPerHour(definition) + normalizedTime.minute;
}

function formatFantasyTimeFromMinuteOfDay(
  minuteOfDay: number,
  definition: FantasyCalendarDefinition
): string {
  const minutesPerHour = getMinutesPerHour(definition);
  const hour = Math.floor(minuteOfDay / minutesPerHour);
  const minute = minuteOfDay % minutesPerHour;
  return formatFantasyTime({ hour, minute }, definition);
}

function getHoursPerDay(definition: FantasyCalendarDefinition): number {
  return Math.max(1, Math.trunc(definition.time.hoursPerDay || FALLBACK_HOURS_PER_DAY));
}

function getMinutesPerHour(definition: FantasyCalendarDefinition): number {
  return Math.max(1, Math.trunc(definition.time.minutesPerHour || FALLBACK_MINUTES_PER_HOUR));
}

function getMinutesPerDay(definition: FantasyCalendarDefinition): number {
  return getHoursPerDay(definition) * getMinutesPerHour(definition);
}

function getPositiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getFiniteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampSize(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 12), 300);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
}