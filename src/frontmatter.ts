import type { TFile } from "obsidian";
import { clampDate, getMonthsForYear, slugify } from "./calendar";
import { clampTimeOfDay } from "./moons";
import type {
  CalendarFile,
  CalendarEventDefinition,
  EventRecurrenceEndMode,
  EventRecurrenceFrequency,
  EventRecurrenceRule,
  FantasyDate,
  FantasyTimeOfDay,
  FrontmatterExportSettings,
  FrontmatterImportSettings,
  TagPackFile
} from "./types";

export interface FrontmatterImportCandidate {
  syncKey: string;
  explicitSyncId?: string;
  title: string;
  date: FantasyDate;
  endDate?: FantasyDate;
  startTime?: FantasyTimeOfDay;
  endTime?: FantasyTimeOfDay;
  description?: string;
  imageRef?: string;
  weatherPackId?: string;
  tagRefs: string[];
  color?: string;
  recurrence?: EventRecurrenceRule;
  noteRef: string;
}

export type FrontmatterImportParseResult =
  | { status: "ok"; candidate: FrontmatterImportCandidate }
  | { status: "skip"; reason: string }
  | { status: "invalid"; reason: string };

export function getFrontmatterImportConfigurationError(
  settings: FrontmatterImportSettings
): string | null {
  if (!settings.enabled) {
    return "Frontmatter import is disabled. Enable it first in “Manage frontmatter”.";
  }

  if (!settings.startDateProperty?.trim()) {
    return "Please configure a start date property in “Manage frontmatter”.";
  }

  return null;
}

export function buildFrontmatterImportCandidate(
  file: TFile,
  frontmatter: Record<string, unknown>,
  calendar: CalendarFile,
  settings: FrontmatterImportSettings,
  linkedTagPacks: TagPackFile[]
): FrontmatterImportParseResult {
  const startDateValue = getFrontmatterValue(frontmatter, settings.startDateProperty);
  if (startDateValue === undefined) {
    return {
      status: "skip",
      reason: "No matching start date property found."
    };
  }

  const parsedStart = parseFrontmatterDateDefinition(startDateValue, calendar);
  if (parsedStart.kind === "invalid") {
    return {
      status: "invalid",
      reason: parsedStart.reason
    };
  }

  const startDate = parsedStart.date;

  const endDateValue = getFrontmatterValue(frontmatter, settings.endDateProperty);
  const parsedEnd = parseOptionalExactFrontmatterDate(endDateValue, calendar);
  if (parsedEnd.status === "invalid") {
    return {
      status: "invalid",
      reason: parsedEnd.reason
    };
  }

  const normalizedEndDate = parsedEnd.date;

  const configuredTitle = readScalarString(getFrontmatterValue(frontmatter, settings.titleProperty));
  const title = configuredTitle
    ?? (settings.fallbackTitleToFilename ? file.basename : undefined);

  if (!title || title.trim().length === 0) {
    return {
      status: "invalid",
      reason: "No title was found and title fallback to note name is disabled."
    };
  }

  const startTime = readFrontmatterTime(
    frontmatter,
    settings.startHourProperty,
    settings.startMinuteProperty,
    calendar
  );
  const endTime = readFrontmatterTime(
    frontmatter,
    settings.endHourProperty,
    settings.endMinuteProperty,
    calendar
  );

  const tagRefs = resolveTagRefs(
    getFrontmatterValue(frontmatter, settings.tagProperty),
    linkedTagPacks
  );
  const explicitSyncId = readScalarString(getFrontmatterValue(frontmatter, settings.syncIdProperty));
  const color =
    readHexColor(getFrontmatterValue(frontmatter, settings.colorProperty))
    ?? resolveMappedColor(frontmatter, settings);

  const importedIntervalRecurrence = readFrontmatterRecurrence(frontmatter, settings, calendar);
  const recurrence =
    parsedStart.kind === "pattern"
      ? mergePatternRecurrence(parsedStart.recurrence, importedIntervalRecurrence)
      : importedIntervalRecurrence;

  return {
    status: "ok",
    candidate: {
      syncKey: buildSyncKey(file, explicitSyncId),
      explicitSyncId: explicitSyncId ?? undefined,
      title: title.trim(),
      date: startDate,
      endDate: normalizedEndDate,
      startTime,
      endTime,
      description: readScalarString(getFrontmatterValue(frontmatter, settings.descriptionProperty)) ?? undefined,
      imageRef: readScalarString(getFrontmatterValue(frontmatter, settings.imageProperty)) ?? undefined,
      weatherPackId: readScalarString(getFrontmatterValue(frontmatter, settings.weatherPackProperty)) ?? undefined,
      tagRefs,
      color,
      recurrence,
      noteRef: file.path
    }
  };
}

function buildSyncKey(file: TFile, explicitSyncId?: string): string {
  if (explicitSyncId && explicitSyncId.trim().length > 0) {
    return `frontmatter-sync:${explicitSyncId.trim()}`;
  }

  return `frontmatter-note:${Math.trunc(file.stat.ctime)}`;
}

function readFrontmatterTime(
  frontmatter: Record<string, unknown>,
  hourProperty: string | undefined,
  minuteProperty: string | undefined,
  calendar: CalendarFile
): FantasyTimeOfDay | undefined {
  const hourValue = getFrontmatterValue(frontmatter, hourProperty);
  const minuteValue = getFrontmatterValue(frontmatter, minuteProperty);

  if (hourValue === undefined && minuteValue === undefined) {
    return undefined;
  }

  const parsedHour = parseInteger(hourValue);
  const parsedMinute = parseInteger(minuteValue);

  if (parsedHour === null && parsedMinute === null) {
    return undefined;
  }

  return clampTimeOfDay(
    {
      hour: parsedHour ?? 0,
      minute: parsedMinute ?? 0
    },
    calendar.definition
  );
}

function readFrontmatterRecurrence(
  frontmatter: Record<string, unknown>,
  settings: FrontmatterImportSettings,
  calendar: CalendarFile
): EventRecurrenceRule | undefined {
  const frequencyRaw = readScalarString(
    getFrontmatterValue(frontmatter, settings.recurrenceFrequencyProperty)
  )?.toLowerCase();

  const frequency = normalizeRecurrenceFrequency(frequencyRaw);
  if (!frequency) {
    return undefined;
  }

  const interval = Math.max(
    1,
    parseInteger(getFrontmatterValue(frontmatter, settings.recurrenceIntervalProperty)) ?? 1
  );

  const endModeRaw = readScalarString(
    getFrontmatterValue(frontmatter, settings.recurrenceEndModeProperty)
  )?.toLowerCase();
  const endMode = normalizeRecurrenceEndMode(endModeRaw) ?? "never";

  const count =
    endMode === "count"
      ? Math.max(
          1,
          parseInteger(getFrontmatterValue(frontmatter, settings.recurrenceCountProperty)) ?? 1
        )
      : undefined;

  const untilRaw = getFrontmatterValue(frontmatter, settings.recurrenceUntilProperty);
  const untilText =
    untilRaw === undefined
      ? undefined
      : readScalarString(untilRaw);
  const untilDate =
    endMode === "until" && untilText !== undefined
      ? parseFantasyDateValue(untilText)
      : undefined;

  return {
	kind: "interval",
    frequency,
    interval,
    endMode,
    count,
    until: untilDate ? clampDate(untilDate, calendar.definition) : undefined
  };
}

function normalizeRecurrenceFrequency(
  value: string | undefined
): EventRecurrenceFrequency | undefined {
  return value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "yearly"
    ? value
    : undefined;
}

function normalizeRecurrenceEndMode(
  value: string | undefined
): EventRecurrenceEndMode | undefined {
  return value === "never" || value === "count" || value === "until"
    ? value
    : undefined;
}

function resolveMappedColor(
  frontmatter: Record<string, unknown>,
  settings: FrontmatterImportSettings
): string | undefined {
  for (const rule of settings.colorMappings) {
    const current = getFrontmatterValue(frontmatter, rule.property);
    if (current === undefined) {
      continue;
    }

    if (frontmatterValueMatches(current, rule.value)) {
      return normalizeHex(rule.color);
    }
  }

  return undefined;
}

function resolveTagRefs(
  raw: unknown,
  linkedTagPacks: TagPackFile[]
): string[] {
  const values = readStringList(raw);
  if (values.length === 0) {
    return [];
  }

  const byFullRef = new Map<string, string>();
  const byShortId = new Map<string, string>();
  const bySluggedName = new Map<string, string>();

  linkedTagPacks.forEach((pack) => {
    pack.tags.forEach((tag) => {
      const fullRef = `${pack.id}:${tag.id}`;
      byFullRef.set(fullRef.toLowerCase(), fullRef);

      if (!byShortId.has(tag.id.toLowerCase())) {
        byShortId.set(tag.id.toLowerCase(), fullRef);
      }

      const sluggedName = slugify(tag.name);
      if (!bySluggedName.has(sluggedName.toLowerCase())) {
        bySluggedName.set(sluggedName.toLowerCase(), fullRef);
      }
    });
  });

  const resolved = new Set<string>();

  values.forEach((entry) => {
    const normalized = entry.trim().toLowerCase();
    const exact = byFullRef.get(normalized);
    if (exact) {
      resolved.add(exact);
      return;
    }

    const short = byShortId.get(normalized);
    if (short) {
      resolved.add(short);
      return;
    }

    const byName = bySluggedName.get(slugify(entry).toLowerCase());
    if (byName) {
      resolved.add(byName);
    }
  });

  return [...resolved].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
}

function frontmatterValueMatches(value: unknown, expected: string): boolean {
  const normalizedExpected = expected.trim().toLowerCase();

  if (Array.isArray(value)) {
    return value.some((entry) => {
      const scalar = readScalarString(entry);
      return scalar?.trim().toLowerCase() === normalizedExpected;
    });
  }

  return readScalarString(value)?.trim().toLowerCase() === normalizedExpected;
}

function getFrontmatterValue(
  frontmatter: Record<string, unknown>,
  property: string | undefined
): unknown {
  if (!property || property.trim().length === 0) {
    return undefined;
  }

  const normalizedProperty = property.trim().toLowerCase();

  for (const [key, value] of Object.entries(frontmatter)) {
    if (key.trim().toLowerCase() === normalizedProperty) {
      return value;
    }
  }

  return undefined;
}

function readScalarString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => readScalarString(entry) ?? "")
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n;]+/g)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function parseFantasyDateValue(value: string): FantasyDate | null {
  const match = value.trim().match(/^(-?\d+)[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) {
    return null;
  }

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return {
    year: Math.trunc(year),
    monthIndex: Math.max(0, Math.trunc(month) - 1),
    day: Math.max(1, Math.trunc(day))
  };
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}

function readHexColor(value: unknown): string | undefined {
  return normalizeHex(readScalarString(value));
}

function normalizeHex(value: string | undefined): string | undefined {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function applyEventToFrontmatter(
  frontmatter: Record<string, unknown>,
  event: CalendarEventDefinition,
  settings: FrontmatterExportSettings,
  calendar?: CalendarFile
): void {
  const clearMissing = settings.clearMissingFields;

  setMappedValue(frontmatter, settings.titleProperty, event.title, clearMissing);
  setMappedValue(
    frontmatter,
    settings.startDateProperty,
    event.recurrence?.kind === "pattern"
      ? formatPatternFrontmatterDate(event.recurrence, calendar)
      : formatFantasyDate(event.date),
    clearMissing
  );
  setMappedValue(frontmatter, settings.endDateProperty, event.endDate ? formatFantasyDate(event.endDate) : undefined, clearMissing);
  setMappedValue(frontmatter, settings.startHourProperty, event.startTime?.hour, clearMissing);
  setMappedValue(frontmatter, settings.startMinuteProperty, event.startTime?.minute, clearMissing);
  setMappedValue(frontmatter, settings.endHourProperty, event.endTime?.hour, clearMissing);
  setMappedValue(frontmatter, settings.endMinuteProperty, event.endTime?.minute, clearMissing);
  setMappedValue(frontmatter, settings.descriptionProperty, event.description, clearMissing);
  setMappedValue(frontmatter, settings.imageProperty, event.imageRef, clearMissing);
  setMappedValue(frontmatter, settings.weatherPackProperty, event.weatherPackId, clearMissing);
  setMappedValue(frontmatter, settings.colorProperty, event.color, clearMissing);
  setMappedValue(
    frontmatter,
    settings.syncIdProperty,
    resolveExportSyncId(event),
    clearMissing
  );
  setMappedValue(
    frontmatter,
    settings.tagProperty,
    event.tagRefs.length > 0 ? [...event.tagRefs] : undefined,
    clearMissing
  );

  setMappedValue(
    frontmatter,
    settings.recurrenceFrequencyProperty,
    event.recurrence?.kind === "interval" ? event.recurrence.frequency : undefined,
    clearMissing
  );
  setMappedValue(
    frontmatter,
    settings.recurrenceIntervalProperty,
    event.recurrence?.kind === "interval" ? event.recurrence.interval : undefined,
    clearMissing
  );
  setMappedValue(
    frontmatter,
    settings.recurrenceEndModeProperty,
    event.recurrence?.kind === "interval"
      ? event.recurrence.endMode
      : event.recurrence?.kind === "pattern" && event.recurrence.until
        ? "until"
        : undefined,
    clearMissing
  );
  setMappedValue(
    frontmatter,
    settings.recurrenceCountProperty,
    event.recurrence?.kind === "interval" ? event.recurrence.count : undefined,
    clearMissing
  );
  setMappedValue(
    frontmatter,
    settings.recurrenceUntilProperty,
    event.recurrence?.until ? formatFantasyDate(event.recurrence.until) : undefined,
    clearMissing
  );
}

function setMappedValue(
  frontmatter: Record<string, unknown>,
  property: string | undefined,
  value: string | number | string[] | Record<string, unknown> | undefined,
  clearMissing: boolean
): void {
  const key = property?.trim();
  if (!key) {
    return;
  }

  if (
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  ) {
    if (clearMissing) {
      delete frontmatter[key];
    }
    return;
  }

  frontmatter[key] = value;
}

type ParsedFrontmatterDateDefinition =
  | { kind: "exact"; date: FantasyDate }
  | { kind: "pattern"; date: FantasyDate; recurrence: Extract<EventRecurrenceRule, { kind: "pattern" }> }
  | { kind: "invalid"; reason: string };

function parseFrontmatterDateDefinition(
  value: unknown,
  calendar: CalendarFile
): ParsedFrontmatterDateDefinition {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const scalar = readScalarString(value);
    const parsed = scalar ? parseFantasyDateValue(scalar) : null;

    if (!parsed) {
      return {
        kind: "invalid",
        reason: `Invalid start date "${scalar ?? String(value)}". Expected format YYYY-MM-DD or Calendarium object.`
      };
    }

    return {
      kind: "exact",
      date: clampDate(parsed, calendar.definition)
    };
  }

  if (!isRecord(value)) {
    return {
      kind: "invalid",
      reason: "Start date property exists but is neither a scalar date nor a Calendarium date object."
    };
  }

  const day = parseInteger(value.day);
  if (day === null || day < 1) {
    return {
      kind: "invalid",
      reason: "Calendarium date object requires a positive day."
    };
  }

  const year = parseInteger(value.year) ?? undefined;
  const monthIndex = resolveFrontmatterMonthIndex(value.month, calendar, year);
  if (monthIndex === null) {
    return {
      kind: "invalid",
      reason: "Invalid Calendarium month value in frontmatter."
    };
  }

  if (typeof year === "number" && typeof monthIndex === "number") {
    const exactDate = validateExactFantasyDate(calendar, year, monthIndex, day);
    if (!exactDate) {
      return {
        kind: "invalid",
        reason: "Calendarium date object points to an invalid concrete date."
      };
    }

    return {
      kind: "exact",
      date: exactDate
    };
  }

  const recurrence: Extract<EventRecurrenceRule, { kind: "pattern" }> = {
    kind: "pattern",
    day,
    monthIndex: monthIndex ?? undefined,
    year
  };

  const anchorDate = getFirstPatternAnchorDate(calendar, recurrence);
  if (!anchorDate) {
    return {
      kind: "invalid",
      reason: "Calendarium wildcard recurrence does not produce a valid anchor date in this calendar."
    };
  }

  return {
    kind: "pattern",
    date: anchorDate,
    recurrence
  };
}

function parseOptionalExactFrontmatterDate(
  value: unknown,
  calendar: CalendarFile
): { date?: FantasyDate; status: "ok" | "invalid"; reason?: string } {
  if (value === undefined) {
    return { status: "ok" };
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const scalar = readScalarString(value);
    const parsed = scalar ? parseFantasyDateValue(scalar) : null;

    if (!parsed) {
      return {
        status: "invalid",
        reason: `Invalid end date "${scalar ?? String(value)}". Expected format YYYY-MM-DD.`
      };
    }

    return {
      status: "ok",
      date: clampDate(parsed, calendar.definition)
    };
  }

  if (!isRecord(value)) {
    return {
      status: "invalid",
      reason: "End date property exists but is not a supported date value."
    };
  }

  const day = parseInteger(value.day);
  const year = parseInteger(value.year);
  const monthIndex = resolveFrontmatterMonthIndex(value.month, calendar, year ?? undefined);

  if (day === null || year === null || monthIndex === null || monthIndex === undefined) {
    return {
      status: "invalid",
      reason: "End date object must contain concrete year, month, and day values."
    };
  }

  const exactDate = validateExactFantasyDate(calendar, year, monthIndex, day);
  if (!exactDate) {
    return {
      status: "invalid",
      reason: "End date object points to an invalid concrete date."
    };
  }

  return {
    status: "ok",
    date: exactDate
  };
}

function mergePatternRecurrence(
  pattern: Extract<EventRecurrenceRule, { kind: "pattern" }>,
  importedInterval: EventRecurrenceRule | undefined
): Extract<EventRecurrenceRule, { kind: "pattern" }> {
  if (!importedInterval || importedInterval.kind !== "interval") {
    return pattern;
  }

  if (importedInterval.endMode !== "until" || !importedInterval.until) {
    return pattern;
  }

  return {
    ...pattern,
    until: importedInterval.until
  };
}

function resolveFrontmatterMonthIndex(
  value: unknown,
  calendar: CalendarFile,
  year: number | undefined
): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const numericMonth = Math.trunc(value);
    return numericMonth >= 1 ? numericMonth - 1 : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const numericMonth = Number(trimmed);
  if (Number.isFinite(numericMonth)) {
    return Math.trunc(numericMonth) >= 1 ? Math.trunc(numericMonth) - 1 : null;
  }

  const months = getMonthsForYear(calendar.definition, year ?? 0);
  const normalized = trimmed.toLowerCase();
  const byName = months.findIndex((month) => month.name.trim().toLowerCase() === normalized);
  if (byName >= 0) {
    return byName;
  }

  const byId = months.findIndex((month) => month.id.trim().toLowerCase() === normalized);
  return byId >= 0 ? byId : null;
}

function validateExactFantasyDate(
  calendar: CalendarFile,
  year: number,
  monthIndex: number,
  day: number
): FantasyDate | null {
  const months = getMonthsForYear(calendar.definition, year);
  const month = months[monthIndex];

  if (!month || day < 1 || day > month.days) {
    return null;
  }

  return {
    year,
    monthIndex,
    day
  };
}

function getFirstPatternAnchorDate(
  calendar: CalendarFile,
  recurrence: Extract<EventRecurrenceRule, { kind: "pattern" }>
): FantasyDate | null {
  const year = recurrence.year ?? 0;
  const months = getMonthsForYear(calendar.definition, year);

  if (typeof recurrence.monthIndex === "number") {
    const month = months[recurrence.monthIndex];
    if (!month || month.days < recurrence.day) {
      return null;
    }

    return {
      year,
      monthIndex: recurrence.monthIndex,
      day: recurrence.day
    };
  }

  const firstMonthIndex = months.findIndex((month) => month.days >= recurrence.day);
  if (firstMonthIndex < 0) {
    return null;
  }

  return {
    year,
    monthIndex: firstMonthIndex,
    day: recurrence.day
  };
}

function formatPatternFrontmatterDate(
  recurrence: Extract<EventRecurrenceRule, { kind: "pattern" }>,
  calendar?: CalendarFile
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    day: recurrence.day
  };

  if (typeof recurrence.monthIndex === "number") {
    if (calendar) {
      const months = getMonthsForYear(
        calendar.definition,
        recurrence.year ?? calendar.state.cursorDate.year
      );
      result.month = months[recurrence.monthIndex]?.name ?? recurrence.monthIndex + 1;
    } else {
      result.month = recurrence.monthIndex + 1;
    }
  }

  if (typeof recurrence.year === "number") {
    result.year = recurrence.year;
  }

  return result;
}

function resolveExportSyncId(event: CalendarEventDefinition): string {
  if (event.importSource?.kind === "frontmatter" && event.importSource.explicitSyncId) {
    return event.importSource.explicitSyncId;
  }

  return event.id;
}

function formatFantasyDate(date: FantasyDate): string {
  const year = String(date.year);
  const month = String(date.monthIndex + 1).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}