import { clampDate, getDayOfYear, getYearLength } from "./calendar";
import type {
  CalendarFile,
  FantasyCalendarDefinition,
  FantasyDate,
  FantasyMoon,
  MoonPhaseData
} from "./types";

export const DEFAULT_MOON_PHASE_COUNT = 8;
export const DEFAULT_MOON_SIZE = 28;

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
  const normalizedDate = clampDate(date, calendar.definition);

  return calendar.definition.moons.map((moon) =>
    resolveMoonPhase(calendar.definition, moon, normalizedDate)
  );
}

export function resolveMoonPhase(
  definition: FantasyCalendarDefinition,
  moon: FantasyMoon,
  date: FantasyDate
): MoonPhaseData {
  const normalizedDate = clampDate(date, definition);
  const cycleDays = Math.max(1, Math.trunc(moon.cycleDays || 1));
  const phaseCount = Math.max(1, Math.trunc(moon.phaseCount ?? DEFAULT_MOON_PHASE_COUNT));
  const absoluteDay = getAbsoluteDay(definition, normalizedDate);
  const moonDay = mod(absoluteDay + Math.trunc(moon.offsetDays || 0), cycleDays);
  const phaseIndex = Math.min(
    phaseCount - 1,
    Math.floor((moonDay / cycleDays) * phaseCount)
  );
  const imageRef =
    moon.phaseImages.find((entry) => entry.phaseIndex === phaseIndex)?.imageRef;

  return {
    moonId: moon.id,
    name: moon.name,
    cycleDays,
    cycleDay: moonDay + 1,
    phaseCount,
    phaseIndex,
    phaseLabel: getMoonPhaseLabel(phaseCount, phaseIndex),
    size: clampSize(moon.size ?? DEFAULT_MOON_SIZE),
    color: moon.color,
    imageRef
  };
}

export function getMoonPhaseLabel(
  phaseCount: number,
  phaseIndex: number
): string {
  if (phaseCount === 8) {
    return EIGHT_PHASE_LABELS[phaseIndex] ?? `Phase ${phaseIndex + 1}`;
  }

  if (phaseCount === 4) {
    return FOUR_PHASE_LABELS[phaseIndex] ?? `Phase ${phaseIndex + 1}`;
  }

  return `Phase ${phaseIndex + 1}/${phaseCount}`;
}

export function getAbsoluteDay(
  definition: FantasyCalendarDefinition,
  date: FantasyDate
): number {
  const normalizedDate = clampDate(date, definition);
  return normalizedDate.year * getYearLength(definition) + getDayOfYear(definition, normalizedDate) - 1;
}

function clampSize(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 12), 96);
}

function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
}