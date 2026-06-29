import {
  clampDate,
  dayOfYearToMonthDay,
  getDayOfYear,
  getAbsoluteDay,
  getMonthsForYear,
  shiftDay,
  shiftMonth,
  shiftYear,
  slugify
} from "./calendar";
import type {
  CalendarEventDefinition,
  EventPresetFile,
  EventRecurrenceEndMode,
  EventRecurrenceFrequency,
  EventRecurrenceRule,
  FantasyCalendarDefinition,
  EventIndexYearFile,
  EventIndexDay,
  EventYearFile,
  FantasyDate
} from "./types";

export function normalizeCalendarEventDefinition(raw: unknown): CalendarEventDefinition {
  const record = asRecord(raw);
  const dateRecord = asRecord(record.date);
  const now = new Date().toISOString();

  return {
    id: readString(record.id, createEventId(readString(record.title, "event"))),
    calendarId: readString(record.calendarId, "default-calendar"),
    title: readString(record.title, "Untitled event"),
    date: {
      year: Math.trunc(readNumber(dateRecord.year, 0)),
      monthIndex: Math.max(0, Math.trunc(readNumber(dateRecord.monthIndex, 0))),
      day: Math.max(1, Math.trunc(readNumber(dateRecord.day, 1)))
    },
	endDate: readOptionalFantasyDate(record.endDate),
    startTime: readOptionalFantasyTime(record.startTime),
    endTime: readOptionalFantasyTime(record.endTime),
    description: readOptionalString(record.description),
    color: readColor(record.color),
    tagRefs: readStringArray(record.tagRefs),
	weatherPackId: readOptionalString(record.weatherPackId),
    imageRef: readOptionalString(record.imageRef),
    noteRef: readOptionalString(record.noteRef),
    createdAt: readString(record.createdAt, now),
    recurrence: readOptionalEventRecurrence(record.recurrence),
    sourceEventId: readOptionalString(record.sourceEventId),
    updatedAt: readString(record.updatedAt, now)
  };
}

export function normalizeEventYearFile(raw: unknown): EventYearFile {
  const record = asRecord(raw);
  const year = Math.trunc(readNumber(record.year, 0));
  const eventsRaw = Array.isArray(record.events) ? record.events : [];

  return {
    version: 1,
    kind: "event-year",
    calendarId: readString(record.calendarId, "default-calendar"),
    year,
    events: dedupeEventsById(
      eventsRaw.map((entry) => normalizeCalendarEventDefinition(entry))
    ).sort(sortEvents)
  };
}

export function normalizeEventPresetFile(raw: unknown): EventPresetFile {
  const record = asRecord(raw);

  return {
    version: 1,
    kind: "event-preset",
    calendarId: readString(record.calendarId, "default-calendar"),
    id: readString(record.id, slugify(readString(record.name, "preset"))),
    name: readString(record.name, "Preset"),
    color: readColor(record.color),
	weatherPackId: readOptionalString(record.weatherPackId),
    tagRefs: readStringArray(record.tagRefs).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" })
    )
  };
}

export function normalizeEventIndexYearFile(raw: unknown): EventIndexYearFile {
  const record = asRecord(raw);
  const daysRecord = asRecord(record.days);
  const days: Record<string, EventIndexDay> = {};

  Object.entries(daysRecord).forEach(([key, value]) => {
    const dayRecord = asRecord(value);
    const itemsRaw = Array.isArray(dayRecord.items) ? dayRecord.items : [];

    const items = itemsRaw
      .map((itemRaw, index) => {
        const itemRecord = asRecord(itemRaw);
        const id = readString(itemRecord.id, "");
        if (id.length === 0) {
          return null;
        }
        return {
          id,
          title: readString(itemRecord.title, `Event ${index + 1}`),
		  sourceEventId: readOptionalString(itemRecord.sourceEventId),
          color: readColor(itemRecord.color) ?? "#4e3e3e"
        };
      })
      .filter((entry): entry is { id: string; title: string; color: string } => entry !== null);

    if (items.length > 0) {
      days[key] = {
        items
      };
    }
  });

  return {
    version: 1,
    kind: "event-index-year",
    calendarId: readString(record.calendarId, "default-calendar"),
    year: Math.trunc(readNumber(record.year, 0)),
    days
  };
}

export function buildEventIndexYearFile(
  file: EventYearFile,
  definition?: FantasyCalendarDefinition
): EventIndexYearFile {
  const days: Record<string, EventIndexDay> = {};

  file.events.forEach((event) => {
    const color = event.color ?? "#4e3e3e";
    const coveredDates = expandEventDatesForIndex(event, definition, file.year);

    coveredDates.forEach((date) => {
      const key = eventDayKey(date);

      if (!days[key]) {
        days[key] = {
          items: []
        };
      }

      const alreadyExists = days[key].items.some((item) => item.id === event.id);

      if (!alreadyExists) {
        days[key].items.push({
          id: event.id,
          sourceEventId: event.sourceEventId,
          title: event.title,
          color
        });
      }
    });
  });

  return {
    version: 1,
    kind: "event-index-year",
    calendarId: file.calendarId,
    year: file.year,
    days
  };
}

export function eventDayKey(date: Pick<FantasyDate, "monthIndex" | "day">): string {
  return `${Math.trunc(date.monthIndex)}-${Math.trunc(date.day)}`;
}

export function getEventDotsForDate(
  file: EventIndexYearFile | null,
  date: FantasyDate
): Array<{ id: string; color: string }> {
  if (!file || file.year !== date.year) {
    return [];
  }

  return (file.days[eventDayKey(date)]?.items ?? []).map((item) => ({
    id: item.id,
    color: item.color
  }));
}

export function getEventIndexEntriesForDate(
  file: EventIndexYearFile | null,
  date: FantasyDate
): Array<{ id: string; title: string; color: string; sourceEventId?: string }> {
  if (!file || file.year !== date.year) {
    return [];
  }

  return file.days[eventDayKey(date)]?.items ?? [];
}

export function findEventById(
  file: EventYearFile | null,
  eventId: string
): CalendarEventDefinition | null {
  if (!file) return null;
  return file.events.find((event) => event.id === eventId) ?? null;
}

export function buildRecurringOccurrenceId(
  sourceEventId: string,
  date: FantasyDate
): string {
  return `${sourceEventId}::${date.year}-${date.monthIndex}-${date.day}`;
}

export function expandRecurringEventForYear(
  event: CalendarEventDefinition,
  definition: FantasyCalendarDefinition,
  targetYear: number
): CalendarEventDefinition[] {
  if (!event.recurrence) {
    return [];
  }

  const recurrence = event.recurrence;
  const sourceEventId = event.sourceEventId ?? event.id;
  const untilDate = recurrence.until ? clampDate(recurrence.until, definition) : undefined;
  const durationDays = getEventDurationDays(event, definition);
  const maxCount = recurrence.endMode === "count"
    ? Math.max(1, Math.trunc(recurrence.count || 1))
    : null;
  const results: CalendarEventDefinition[] = [];

  let occurrenceIndex = getFastForwardOccurrenceCount(event, recurrence, definition, targetYear);
  let occurrenceStart = shiftOccurrenceStart(
    clampDate(event.date, definition),
    recurrence,
    occurrenceIndex,
    definition
  );
  let guard = 0;

  while (guard < 50000) {
    if (maxCount !== null && occurrenceIndex >= maxCount) {
      break;
    }

    if (untilDate && compareFantasyDates(occurrenceStart, untilDate) > 0) {
      break;
    }

    const occurrenceEnd = shiftDay(occurrenceStart, durationDays - 1, definition);

    if (intersectsYear(occurrenceStart, occurrenceEnd, targetYear)) {
      results.push({
        ...event,
        id: buildRecurringOccurrenceId(sourceEventId, occurrenceStart),
        sourceEventId,
        date: { ...occurrenceStart },
        endDate: compareFantasyDates(occurrenceStart, occurrenceEnd) === 0
          ? undefined
          : { ...occurrenceEnd }
      });
    }

    if (occurrenceStart.year > targetYear && occurrenceEnd.year > targetYear) {
      break;
    }

    occurrenceIndex += 1;
    occurrenceStart = shiftOccurrenceStart(occurrenceStart, recurrence, 1, definition);
    guard += 1;
  }

  return results;
}

export function estimateRecurringEventEndYear(
  event: CalendarEventDefinition,
  definition: FantasyCalendarDefinition,
  fallbackEndYear = event.date.year + 25
): number {
  if (!event.recurrence) {
    return event.endDate?.year ?? event.date.year;
  }

  const recurrence = event.recurrence;
  const durationDays = getEventDurationDays(event, definition);

  if (recurrence.endMode === "until" && recurrence.until) {
    const untilDate = clampDate(recurrence.until, definition);
    return shiftDay(untilDate, durationDays - 1, definition).year;
  }

  if (recurrence.endMode === "count") {
    const occurrenceCount = Math.max(1, Math.trunc(recurrence.count || 1));
    const lastStart = shiftOccurrenceStart(
      clampDate(event.date, definition),
      recurrence,
      Math.max(0, occurrenceCount - 1),
      definition
    );
    return shiftDay(lastStart, durationDays - 1, definition).year;
  }

  return Math.max(event.endDate?.year ?? event.date.year, Math.trunc(fallbackEndYear || event.date.year));
}

function getFastForwardOccurrenceCount(
  event: CalendarEventDefinition,
  recurrence: EventRecurrenceRule,
  definition: FantasyCalendarDefinition,
  targetYear: number
): number {
  const normalizedStart = clampDate(event.date, definition);

  if (targetYear <= normalizedStart.year) {
    return 0;
  }

  if (recurrence.frequency === "daily" || recurrence.frequency === "weekly") {
    const stepDays = recurrence.frequency === "daily"
      ? recurrence.interval
      : recurrence.interval * definition.weekdays.length;
    const targetStartAbs = getAbsoluteDay(definition, { year: targetYear, monthIndex: 0, day: 1 });
    const startAbs = getAbsoluteDay(definition, normalizedStart);
    return Math.max(0, Math.floor((targetStartAbs - startAbs) / Math.max(1, stepDays)) - 2);
  }

  if (recurrence.frequency === "monthly") {
    const yearDelta = targetYear - normalizedStart.year;
    const approxMonthCount = yearDelta * Math.max(1, definition.months.length);
    return Math.max(0, Math.floor(approxMonthCount / Math.max(1, recurrence.interval)) - 2);
  }

  if (recurrence.frequency === "yearly") {
    return Math.max(0, Math.floor((targetYear - normalizedStart.year) / Math.max(1, recurrence.interval)) - 1);
  }

  return 0;
}

function getEventDurationDays(
  event: CalendarEventDefinition,
  definition: FantasyCalendarDefinition
): number {
  const start = clampDate(event.date, definition);
  const end = clampDate(event.endDate ?? event.date, definition);
  return Math.max(1, getAbsoluteDay(definition, end) - getAbsoluteDay(definition, start) + 1);
}

function expandEventDatesForIndex(
  event: CalendarEventDefinition,
  definition: FantasyCalendarDefinition | undefined,
  year: number
): FantasyDate[] {
  if (!definition) {
    return event.date.year === year ? [{ ...event.date }] : [];
  }

  const start = clampDate(event.date, definition);
  const end = clampDate(event.endDate ?? event.date, definition);

  if (compareFantasyDates(end, start) < 0) {
    return [];
  }

  const yearMonths = getMonthsForYear(definition, year);
  const lastMonthIndex = Math.max(0, yearMonths.length - 1);
  const yearStart: FantasyDate = { year, monthIndex: 0, day: 1 };
  const yearEnd: FantasyDate = {
    year,
    monthIndex: lastMonthIndex,
    day: yearMonths[lastMonthIndex]?.days ?? 1
  };

  const overlapStart = compareFantasyDates(start, yearStart) > 0 ? start : yearStart;
  const overlapEnd = compareFantasyDates(end, yearEnd) < 0 ? end : yearEnd;

  if (compareFantasyDates(overlapStart, overlapEnd) > 0) {
    return [];
  }

  const startDayOfYear = getDayOfYear(definition, overlapStart);
  const endDayOfYear = getDayOfYear(definition, overlapEnd);
  const dates: FantasyDate[] = [];

  for (let dayOfYear = startDayOfYear; dayOfYear <= endDayOfYear; dayOfYear += 1) {
    const monthDay = dayOfYearToMonthDay(definition, year, dayOfYear);
    dates.push({
      year,
      monthIndex: monthDay.monthIndex,
      day: monthDay.day
    });
  }

  return dates;
}

function dedupeEventsById(events: CalendarEventDefinition[]): CalendarEventDefinition[] {
  const byId = new Map<string, CalendarEventDefinition>();

  for (const event of events) {
    const existing = byId.get(event.id);

    if (!existing) {
      byId.set(event.id, event);
      continue;
    }

    if ((event.updatedAt ?? "") >= (existing.updatedAt ?? "")) {
      byId.set(event.id, event);
    }
  }

  return [...byId.values()];
}

function compareFantasyDates(left: FantasyDate, right: FantasyDate): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
  return left.day - right.day;
}

function intersectsYear(start: FantasyDate, end: FantasyDate, year: number): boolean {
  return start.year <= year && end.year >= year;
}

function shiftOccurrenceStart(
  date: FantasyDate,
  recurrence: EventRecurrenceRule,
  occurrenceSteps: number,
  definition: FantasyCalendarDefinition
): FantasyDate {
  const steps = Math.max(0, Math.trunc(occurrenceSteps || 0));
  const interval = Math.max(1, Math.trunc(recurrence.interval || 1));

  switch (recurrence.frequency) {
    case "daily":
      return shiftDay(date, steps * interval, definition);
    case "weekly":
      return shiftDay(date, steps * interval * definition.weekdays.length, definition);
    case "monthly":
      return shiftMonth(date, steps * interval, definition);
    case "yearly":
      return shiftYear(date, steps * interval, definition);
    default:
      return { ...date };
  }
}

function readOptionalEventRecurrence(value: unknown): EventRecurrenceRule | undefined {
  const record = asRecord(value);
  const frequency = readEventRecurrenceFrequency(record.frequency);

  if (!frequency) {
    return undefined;
  }

  const endMode = readEventRecurrenceEndMode(record.endMode) ?? "never";

  return {
    frequency,
    interval: Math.max(1, Math.trunc(readNumber(record.interval, 1))),
    endMode,
    count: endMode === "count" ? Math.max(1, Math.trunc(readNumber(record.count, 1))) : undefined,
    until: endMode === "until" ? readOptionalFantasyDate(record.until) : undefined
  };
}

export function createEventId(title: string): string {
  const base = (slugify(title) || "event").slice(0, 6);
  const token = `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
  return `${base}-${token}`;
}

export function sortEvents(left: CalendarEventDefinition, right: CalendarEventDefinition): number {
  if (left.date.year !== right.date.year) {
    return left.date.year - right.date.year;
  }
  if (left.date.monthIndex !== right.date.monthIndex) {
    return left.date.monthIndex - right.date.monthIndex;
  }
  if (left.date.day !== right.date.day) {
    return left.date.day - right.date.day;
  }

  const timeComparison = compareOptionalTimes(left.startTime, right.startTime);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
}

function compareOptionalTimes(left?: { hour: number; minute: number }, right?: { hour: number; minute: number }): number {
  if (left && right) return left.hour !== right.hour ? left.hour - right.hour : left.minute - right.minute;
  if (left) return -1;
  if (right) return 1;
  return 0;
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

function readColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
}

function readOptionalFantasyDate(value: unknown): FantasyDate | undefined {
  const record = asRecord(value);

  if (!("year" in record) && !("monthIndex" in record) && !("day" in record)) {
    return undefined;
  }

  return {
    year: Math.trunc(readNumber(record.year, 0)),
    monthIndex: Math.max(0, Math.trunc(readNumber(record.monthIndex, 0))),
    day: Math.max(1, Math.trunc(readNumber(record.day, 1)))
  };
}

function readOptionalFantasyTime(
  value: unknown
): { hour: number; minute: number } | undefined {
  const record = asRecord(value);

  if (!("hour" in record) && !("minute" in record)) {
    return undefined;
  }

  return {
    hour: Math.max(0, Math.trunc(readNumber(record.hour, 0))),
    minute: Math.max(0, Math.trunc(readNumber(record.minute, 0)))
  };
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function readEventRecurrenceFrequency(value: unknown): EventRecurrenceFrequency | undefined {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "yearly"
    ? value
    : undefined;
}

function readEventRecurrenceEndMode(value: unknown): EventRecurrenceEndMode | undefined {
  return value === "never" || value === "count" || value === "until"
    ? value
    : undefined;
}