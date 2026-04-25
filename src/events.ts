import { clampDate, shiftDay, slugify } from "./calendar";
import type {
  CalendarEventDefinition,
  EventPresetFile,
  FantasyCalendarDefinition,
  EventIndexDay,
  EventIndexYearFile,
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
    description: readOptionalString(record.description),
    color: readColor(record.color),
    tagRefs: readStringArray(record.tagRefs),
	weatherPackId: readOptionalString(record.weatherPackId),
    imageRef: readOptionalString(record.imageRef),
    noteRef: readOptionalString(record.noteRef),
    createdAt: readString(record.createdAt, now),
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
    events: eventsRaw
      .map((entry) => normalizeCalendarEventDefinition(entry))
      .sort(sortEvents)
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

      days[key].items.push({
        id: event.id,
		title: event.title,
        color
      });
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
): Array<{ id: string; title: string; color: string }> {
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

function expandEventDatesForIndex(
  event: CalendarEventDefinition,
  definition: FantasyCalendarDefinition | undefined,
  year: number
): FantasyDate[] {
  if (!definition || !event.endDate || compareFantasyDates(event.endDate, event.date) < 0) {
    return event.date.year === year ? [{ ...event.date }] : [];
  }

  const dates: FantasyDate[] = [];
  let cursor = clampDate(event.date, definition);
  const end = clampDate(event.endDate, definition);
  let guard = 0;

  while (compareFantasyDates(cursor, end) <= 0 && guard < 5000) {
    if (cursor.year === year) {
      dates.push({ ...cursor });
    }

    cursor = shiftDay(cursor, 1, definition);
    guard += 1;
  }

  return dates;
}

function compareFantasyDates(left: FantasyDate, right: FantasyDate): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
  return left.day - right.day;
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
  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}