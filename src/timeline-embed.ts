import { Notice, parseYaml, type MarkdownPostProcessorContext } from "obsidian";
import {
  formatYearLabel,
  getEraShortLabel,
  getMonth
} from "./calendar";
import type TtrpgToolsTimePlugin from "./main";
import type {
  CalendarEventDefinition,
  CalendarFile,
  CalendarTimelineStyle,
  FantasyDate,
  TagPackFile,
  TimelineAlign
} from "./types";

export type TimeTimelineLayout = "cal" | "h";
export type TimeTimelineHorizontalMode = "mixed" | "stacked";

interface TimeTimelineBlockOptions {
  layout: TimeTimelineLayout;
  calendars: string[];
  title?: string;
  includeTags: string[];
  excludeTags: string[];
  jumpToToday: boolean;
  mode: TimeTimelineHorizontalMode;
  align?: TimelineAlign;
  maxSummaryLines?: number;
  cardWidth?: number;
  cardHeight?: number;
  boxHeight?: number;
  sideGapLeft?: number;
  sideGapRight?: number;
}

interface TimeTimelineStylePayload {
  align: TimelineAlign;
  maxSummaryLines: number;
  cardWidth: number;
  cardHeight: number;
  boxHeight: number;
  sideGapLeft: number;
  sideGapRight: number;
  colors: {
    bg?: string;
    accent?: string;
    hover?: string;
    title?: string;
    date?: string;
  };
}

export interface TimeTimelinePublishEntry {
  calendarId: string;
  eventId: string;
  notePath?: string;
  title: string;
  summary?: string;
  start: { y: number; m: number; d: number };
  end?: { y: number; m: number; d: number };
  img?: string;
  dateText: string;
  accentColor?: string;
}

export interface TimeTimelinePublishPayload {
  kind: "time-timeline";
  layout: TimeTimelineLayout;
  title: string;
  mode: TimeTimelineHorizontalMode;
  jumpToToday: boolean;
  todayDate?: { y: number; m: number; d: number };
  style: TimeTimelineStylePayload;
  entries: TimeTimelinePublishEntry[];
}

interface TimelineTagInfo {
  tagRef: string;
  color: string;
}

const DEFAULT_CARD_WIDTH = 200;
const DEFAULT_CARD_HEIGHT = 315;
const DEFAULT_BOX_HEIGHT = 289;
const DEFAULT_SIDE_GAP_LEFT = 40;
const DEFAULT_SIDE_GAP_RIGHT = 40;
const DEFAULT_SUMMARY_LINES = 7;

export function parseTimelineBlockOptions(
  raw: string,
  layout: TimeTimelineLayout
): TimeTimelineBlockOptions {
  const parsed = safeYamlRecord(raw);

  return {
    layout,
    calendars: parseStringList(parsed.calendars ?? parsed.calendar),
    title: readOptionalString(parsed.title),
    includeTags: parseStringList(parsed.includeTags),
    excludeTags: parseStringList(parsed.excludeTags),
    jumpToToday: isNormalizedStringValue(parsed.jumpTo, "today"),
    mode: parsed.mode === "stacked" ? "stacked" : "mixed",
    align: parsed.align === "right" ? "right" : parsed.align === "left" ? "left" : undefined,
    maxSummaryLines: readOptionalInteger(parsed.maxSummaryLines),
    cardWidth: readOptionalInteger(parsed.cardWidth),
    cardHeight: readOptionalInteger(parsed.cardHeight),
    boxHeight: readOptionalInteger(parsed.boxHeight),
    sideGapLeft: readOptionalInteger(parsed.sideGapLeft),
    sideGapRight: readOptionalInteger(parsed.sideGapRight)
  };
}

export async function buildTimelinePublishPayloadFromBlock(
  plugin: TtrpgToolsTimePlugin,
  raw: string,
  layout: TimeTimelineLayout
): Promise<TimeTimelinePublishPayload | null> {
  const options = parseTimelineBlockOptions(raw, layout);
  return await buildTimelinePublishPayload(plugin, options);
}

export async function renderTimelineCodeBlock(
  plugin: TtrpgToolsTimePlugin,
  raw: string,
  layout: TimeTimelineLayout,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): Promise<void> {
  clearEl(el);

  const payload = await buildTimelinePublishPayloadFromBlock(plugin, raw, layout);
  const root = el.createDiv({ cls: "time-timeline-view time-embedded-timeline" });

  if (!payload) {
    const empty = root.createDiv({ cls: "time-calendar__empty" });
    empty.createEl("h2", { text: "No timeline data available" });
    empty.createEl("p", {
      text: "Check the calendar ids and timeline filters in the code block."
    });
    return;
  }

  renderPayload(root, plugin, payload, ctx.sourcePath);
}

async function buildTimelinePublishPayload(
  plugin: TtrpgToolsTimePlugin,
  options: TimeTimelineBlockOptions
): Promise<TimeTimelinePublishPayload | null> {
  const calendars = await plugin.listCalendars();
  const byId = new Map(calendars.map((calendar) => [calendar.id, calendar] as const));
  const selectedCalendars = resolveCalendars(plugin.activeCalendar, calendars, options.calendars, byId);

  if (selectedCalendars.length === 0) {
    return null;
  }

  const tagInfoByRef = await loadTagInfoMap(plugin);
  const entries: TimeTimelinePublishEntry[] = [];
  const includeSet = new Set(options.includeTags);
  const excludeSet = new Set(options.excludeTags);

  for (const calendar of selectedCalendars) {
    const events = await plugin.loadTimelineEvents(calendar.id);

    for (const event of events) {
      if (!matchesTagFilter(event, includeSet, excludeSet)) {
        continue;
      }

      const notePath = event.noteRef
        ? plugin.resolveStoredFileRef(event.noteRef)?.path
        : undefined;
      const imagePath = event.imageRef
        ? plugin.resolveStoredFileRef(event.imageRef)?.path
        : undefined;
      const accentColor = resolveAccentColor(event, tagInfoByRef);

      entries.push({
        calendarId: calendar.id,
        eventId: event.id,
        notePath,
        title: event.title,
        summary: normalizeSummary(event.description),
        start: toYmd(event.date),
        end: event.endDate ? toYmd(event.endDate) : undefined,
        img: imagePath,
        dateText: formatEventDateText(calendar, event),
        accentColor
      });
    }
  }

  entries.sort(compareTimelineEntries);

  const baseCalendar = selectedCalendars[0];
  const style = resolveStyle(baseCalendar.timeline, options);

  return {
    kind: "time-timeline",
    layout: options.layout,
    title: options.title?.trim() || "",
    mode: options.mode,
    jumpToToday: options.jumpToToday,
    todayDate: baseCalendar
      ? {
          y: baseCalendar.state.todayDate.year,
          m: baseCalendar.state.todayDate.monthIndex + 1,
          d: baseCalendar.state.todayDate.day
        }
      : undefined,
    style,
    entries
  };
}

function renderPayload(
  root: HTMLElement,
  plugin: TtrpgToolsTimePlugin,
  payload: TimeTimelinePublishPayload,
  sourcePath: string
): void {
  if (payload.title.trim().length > 0) {
    root.createEl("h3", {
      cls: "time-view-title",
      text: payload.title
    });
  }

  let timelineRoot: HTMLElement;

  if (payload.jumpToToday) {
    const controls = root.createDiv({ cls: "time-timeline__toolbar" });
    createActionButton(controls, "Today", () => {
      if (!payload.todayDate) {
        new Notice("No timeline 'today' date available.");
        return;
      }

      const selector = payload.layout === "h" ? ".tl-h-item" : ".tl-row";
      const ok = jumpContainerToYmd(timelineRoot, payload.todayDate, selector);
      if (!ok) {
        new Notice("No timeline entry found for the configured 'today' date.");
      }
    });
  }

  timelineRoot = root.createDiv({ cls: "simple-timeline" });

  if (payload.entries.length === 0) {
    const empty = timelineRoot.createDiv({ cls: "time-calendar__empty" });
    empty.createEl("h2", { text: "No matching events" });
    empty.createEl("p", {
      text: "The current filters do not match any events."
    });
    return;
  }

  if (payload.layout === "h") {
    renderHorizontalTimeline(timelineRoot, plugin, payload, sourcePath);
  } else {
    renderCrossTimeline(timelineRoot, plugin, payload, sourcePath);
  }

  if (payload.jumpToToday && payload.todayDate) {
    const selector = payload.layout === "h" ? ".tl-h-item" : ".tl-row";
    window.setTimeout(() => {
      jumpContainerToYmd(timelineRoot, payload.todayDate!, selector);
    }, 0);
  }
}

function renderCrossTimeline(
  timelineRoot: HTMLElement,
  plugin: TtrpgToolsTimePlugin,
  payload: TimeTimelinePublishPayload,
  sourcePath: string
): void {
  const wrapper = timelineRoot.createDiv({ cls: "tl-wrapper tl-cross-mode" });

  payload.entries.forEach((entry) => {
    renderCardRow(wrapper, plugin, payload.style, entry, sourcePath, []);
  });
}

function renderHorizontalTimeline(
  timelineRoot: HTMLElement,
  plugin: TtrpgToolsTimePlugin,
  payload: TimeTimelinePublishPayload,
  sourcePath: string
): void {
  const scroller = timelineRoot.createDiv({ cls: "tl-h-scroller" });

  if (payload.mode === "mixed") {
    const wrapper = scroller.createDiv({ cls: "tl-h-content tl-horizontal tl-h-mixed" });
    const rendered: Array<{ el: HTMLElement; left: "media" | "box"; right: "media" | "box" }> = [];

    payload.entries.forEach((entry) => {
      const row = renderCardRow(wrapper, plugin, payload.style, entry, sourcePath, ["tl-h-item"]);
      rendered.push({ el: row, ...getHorizontalEdges(entry, payload.style.align) });
    });

    for (let i = 0; i < rendered.length - 1; i += 1) {
      applyHorizontalJoin(
        { el: rendered[i].el, right: rendered[i].right },
        { el: rendered[i + 1].el, left: rendered[i + 1].left }
      );
    }

    return;
  }

  const wrapper = scroller.createDiv({ cls: "tl-h-content tl-horizontal tl-h-stacked" });
  const axisKeys = [...new Set(payload.entries.map((entry) => ymdSortKey(entry.start)))].sort((a, b) => a - b);
  const colByKey = new Map(axisKeys.map((key, index) => [key, index + 1] as const));

  wrapper.style.setProperty("--tl-h-cols", String(axisKeys.length));

  const rowWrap = wrapper.createDiv({ cls: "tl-h-timeline" });
  const rowGrid = rowWrap.createDiv({ cls: "tl-h-row" });
  rowGrid.style.setProperty("--tl-h-cols", String(axisKeys.length));

  const byDate = new Map<number, TimeTimelinePublishEntry[]>();
  payload.entries.forEach((entry) => {
    const key = ymdSortKey(entry.start);
    const arr = byDate.get(key);
    if (arr) arr.push(entry);
    else byDate.set(key, [entry]);
  });

  const renderedSlots: Array<{
    col: number;
    el: HTMLElement;
    left: "media" | "box";
    right: "media" | "box";
  }> = [];

  [...byDate.keys()]
    .sort((a, b) => (colByKey.get(a) ?? 0) - (colByKey.get(b) ?? 0))
    .forEach((dateKey) => {
      const col = colByKey.get(dateKey);
      if (!col) return;

      const slot = rowGrid.createDiv({ cls: "tl-h-slot" });
      slot.style.setProperty("--tl-h-col", String(col));

      const items = byDate.get(dateKey) ?? [];
      let stored = false;

      items.forEach((entry) => {
        const row = renderCardRow(slot, plugin, payload.style, entry, sourcePath, ["tl-h-item"]);
        if (!stored) {
          renderedSlots.push({ col, el: row, ...getHorizontalEdges(entry, payload.style.align) });
          stored = true;
        }
      });
    });

  renderedSlots.sort((a, b) => a.col - b.col);
  for (let i = 0; i < renderedSlots.length - 1; i += 1) {
    const left = renderedSlots[i];
    const right = renderedSlots[i + 1];
    if (right.col === left.col + 1) {
      applyHorizontalJoin(
        { el: left.el, right: left.right },
        { el: right.el, left: right.left }
      );
    }
  }
}

function renderCardRow(
  parent: HTMLElement,
  plugin: TtrpgToolsTimePlugin,
  style: TimeTimelineStylePayload,
  entry: TimeTimelinePublishEntry,
  sourcePath: string,
  extraRowClasses: string[]
): HTMLElement {
  const row = parent.createDiv({ cls: ["tl-row", ...extraRowClasses].join(" ") });
  row.dataset.tlStartKey = String(ymdSortKey(entry.start));
  row.dataset.tlEndKey = String(ymdSortKey(entry.end ?? entry.start));

  if (style.align === "right") {
    row.addClass("tl-align-right");
  }

  row.style.setProperty("--tl-side-gap-left", `${style.sideGapLeft}px`);
  row.style.setProperty("--tl-side-gap-right", `${style.sideGapRight}px`);
  row.style.setProperty("--tl-bg", style.colors.bg ?? "var(--background-primary)");
  row.style.setProperty("--tl-accent", entry.accentColor ?? style.colors.accent ?? "var(--background-modifier-border)");
  row.style.setProperty("--tl-hover", style.colors.hover ?? "var(--interactive-accent)");

  const hasMedia = Boolean(entry.img);
  const grid = row.createDiv({ cls: `tl-grid ${hasMedia ? "has-media" : "no-media"}` });
  grid.setCssProps({
    "--tl-media-w": `${style.cardWidth}px`
  });

  let media: HTMLElement | null = null;

  if (hasMedia && entry.img) {
    media = grid.createDiv({ cls: "tl-media time-timeline__media-frame" });
    media.setCssProps({
      "--time-tl-media-h": `${style.cardHeight}px`
    });

    const imageSrc = resolveImageSrc(plugin, entry.img);
    if (imageSrc) {
      media.createEl("img", {
		cls: "time-timeline__media-image",
        attr: {
          src: imageSrc,
          alt: entry.title,
          loading: "lazy"
        }
      });
    }

    if (entry.notePath) {
      const anchor = createNoteAnchor(media, entry.notePath, entry.title);
      attachHoverForAnchor(plugin, anchor, media, entry.notePath, sourcePath);
    }
  }

  const box = grid.createDiv({
    cls: `tl-box callout time-timeline__box ${hasMedia ? "has-media" : "no-media"}`
  });
  box.setCssProps({
    "--time-tl-box-h": `${style.boxHeight}px`,
    "--tl-bg": style.colors.bg ?? "var(--background-primary)",
    "--tl-accent": entry.accentColor ?? style.colors.accent ?? "var(--background-modifier-border)",
    "--tl-hover": style.colors.hover ?? "var(--interactive-accent)"
  });

  const titleEl = box.createEl("h1", {
    cls: "tl-title tl-title-colored",
    text: entry.title
  });
  const dateEl = box.createEl("h4", {
    cls: "tl-date tl-date-colored",
    text: entry.dateText
  });
  const summaryEl = box.createDiv({ cls: "tl-summary tl-clamp time-timeline__summary" });
  summaryEl.setCssProps({
    "--tl-summary-lines": String(style.maxSummaryLines)
  });
  summaryEl.textContent = entry.summary ?? "";

  if (style.colors.title) {
    titleEl.style.color = style.colors.title;
  }
  if (style.colors.date) {
    dateEl.style.color = style.colors.date;
  }

  if (entry.notePath) {
    const anchor = createNoteAnchor(box, entry.notePath, entry.title);
    attachHoverForAnchor(plugin, anchor, box, entry.notePath, sourcePath);
  }

  return row;
}

function createNoteAnchor(parent: HTMLElement, notePath: string, title: string): HTMLAnchorElement {
  return parent.createEl("a", {
    cls: "internal-link tl-hover-anchor",
    attr: {
      href: notePath,
      "data-href": notePath,
      "aria-label": title
    }
  });
}

function attachHoverForAnchor(
  plugin: TtrpgToolsTimePlugin,
  anchorEl: HTMLElement,
  hoverParent: HTMLElement,
  filePath: string,
  sourcePath: string
): void {
  const workspaceLike = plugin.app.workspace as unknown as {
    trigger?: (
      name: string,
      data: {
        event: MouseEvent | TouchEvent;
        source: string;
        hoverParent: HTMLElement;
        targetEl: HTMLElement;
        linktext: string;
        sourcePath: string;
      }
    ) => void;
  };

  const makeForcedHoverEvent = (evt?: MouseEvent | TouchEvent): MouseEvent | TouchEvent => {
    if (evt && typeof TouchEvent !== "undefined" && evt instanceof TouchEvent) {
      return evt;
    }

    const mouseEvent = evt instanceof MouseEvent ? evt : undefined;
      const doc =
        (anchorEl as HTMLElement & { doc?: Document }).doc ??
        anchorEl.ownerDocument;
    const view = doc.defaultView ?? window;

    return new view.MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: mouseEvent?.clientX ?? 0,
      clientY: mouseEvent?.clientY ?? 0,
      screenX: mouseEvent?.screenX ?? 0,
      screenY: mouseEvent?.screenY ?? 0,
      ctrlKey: true,
      metaKey: true,
      shiftKey: mouseEvent?.shiftKey ?? false,
      altKey: mouseEvent?.altKey ?? false
    });
  };

  const openPopover = (evt?: MouseEvent | TouchEvent) => {
    if (typeof workspaceLike.trigger !== "function") {
      return;
    }

    workspaceLike.trigger("hover-link", {
      event: makeForcedHoverEvent(evt),
      source: "ttrpg-tools-time",
      hoverParent,
      targetEl: anchorEl,
      linktext: filePath,
      sourcePath
    });
  };

  anchorEl.addEventListener("mouseenter", (evt: MouseEvent) => openPopover(evt));

  let timer: number | null = null;
  anchorEl.addEventListener(
    "touchstart",
    (evt: TouchEvent) => {
      timer = window.setTimeout(() => openPopover(evt), 350);
    },
    { passive: true }
  );

  const clearTouchTimer = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  for (const eventName of ["touchend", "touchmove", "touchcancel"] as const) {
    anchorEl.addEventListener(eventName, clearTouchTimer, { passive: true });
  }
}

function resolveImageSrc(plugin: TtrpgToolsTimePlugin, path: string): string | undefined {
  const file = plugin.resolveStoredFileRef(path);
  return file ? plugin.app.vault.getResourcePath(file) : undefined;
}

function resolveCalendars(
  activeCalendar: CalendarFile | null,
  allCalendars: CalendarFile[],
  requestedIds: string[],
  byId: Map<string, CalendarFile>
): CalendarFile[] {
  if (requestedIds.length === 0) {
    return activeCalendar ? [activeCalendar] : [];
  }

  const byName = new Map(allCalendars.map((calendar) => [calendar.name.toLowerCase(), calendar] as const));
  const result: CalendarFile[] = [];
  const seen = new Set<string>();

  requestedIds.forEach((id) => {
    const direct = byId.get(id);
    const byCalendarName = byName.get(id.toLowerCase());
    const calendar = direct ?? byCalendarName;
    if (!calendar || seen.has(calendar.id)) {
      return;
    }
    seen.add(calendar.id);
    result.push(calendar);
  });

  return result;
}

async function loadTagInfoMap(plugin: TtrpgToolsTimePlugin): Promise<Map<string, TimelineTagInfo>> {
  const packs = await plugin.listTagPacks();
  const map = new Map<string, TimelineTagInfo>();

  packs.forEach((pack) => {
    mapTagPack(map, pack);
  });

  return map;
}

function mapTagPack(target: Map<string, TimelineTagInfo>, pack: TagPackFile): void {
  pack.tags.forEach((tag) => {
    target.set(`${pack.id}:${tag.id}`, {
      tagRef: `${pack.id}:${tag.id}`,
      color: normalizeColor(tag.color)
    });
  });
}

function matchesTagFilter(
  event: CalendarEventDefinition,
  includeSet: Set<string>,
  excludeSet: Set<string>
): boolean {
  const eventTagRefs = event.tagRefs.map((tagRef) => normalizeTagFilterValue(tagRef));

  const matchesFilter = (filterValue: string): boolean =>
    eventTagRefs.some((tagRef) => tagFilterMatches(tagRef, filterValue));

  if ([...excludeSet].some((filterValue) => matchesFilter(filterValue))) {
    return false;
  }

  if (includeSet.size === 0) {
    return true;
  }

  return [...includeSet].some((filterValue) => matchesFilter(filterValue));
}

function tagFilterMatches(tagRef: string, filterValue: string): boolean {
  const normalizedFilter = normalizeTagFilterValue(filterValue);

  if (normalizedFilter.length === 0) {
    return false;
  }

  if (tagRef === normalizedFilter) {
    return true;
  }

  if (normalizedFilter.includes(":")) {
    return false;
  }

  return (
    tagRef.startsWith(`${normalizedFilter}:`) ||
    tagRef.endsWith(`:${normalizedFilter}`)
  );
}

function normalizeTagFilterValue(value: string): string {
  return value.trim().toLowerCase();
}

function resolveAccentColor(
  event: CalendarEventDefinition,
  tagInfoByRef: Map<string, TimelineTagInfo>
): string | undefined {
  if (event.color) {
    return event.color;
  }

  const firstTag = event.tagRefs.find((tagRef) => tagInfoByRef.has(tagRef));
  return firstTag ? tagInfoByRef.get(firstTag)?.color : undefined;
}

function resolveStyle(
  style: CalendarTimelineStyle | undefined,
  options: TimeTimelineBlockOptions
): TimeTimelineStylePayload {
  const align = options.align ?? (style?.align === "right" ? "right" : "left");

  return {
    align,
    maxSummaryLines: resolvePositiveInt(options.maxSummaryLines, style?.maxSummaryLines, DEFAULT_SUMMARY_LINES),
    cardWidth: resolvePositiveInt(options.cardWidth, style?.cardWidth, DEFAULT_CARD_WIDTH),
    cardHeight: resolvePositiveInt(options.cardHeight, style?.cardHeight, DEFAULT_CARD_HEIGHT),
    boxHeight: resolvePositiveInt(options.boxHeight, style?.boxHeight, DEFAULT_BOX_HEIGHT),
    sideGapLeft: resolvePositiveInt(options.sideGapLeft, style?.sideGapLeft, DEFAULT_SIDE_GAP_LEFT),
    sideGapRight: resolvePositiveInt(options.sideGapRight, style?.sideGapRight, DEFAULT_SIDE_GAP_RIGHT),
    colors: {
      bg: style?.colors?.bg,
      accent: style?.colors?.accent,
      hover: style?.colors?.hover,
      title: style?.colors?.title,
      date: style?.colors?.date
    }
  };
}

function formatEventDateText(calendar: CalendarFile, event: CalendarEventDefinition): string {
  const start = event.date;
  const end = event.endDate;

  const formatSingle = (date: FantasyDate): string => {
    const monthName = getMonth(calendar.definition, date.monthIndex, date.year).name;
    const year = formatYearLabel(calendar.definition, date.year);
    const era = getEraShortLabel(calendar.definition, date);
    return `${date.day}. ${monthName} ${year}${era ? ` ${era}` : ""}`;
  };

  if (!end || sameDate(start, end)) {
    return formatSingle(start);
  }

  if (start.year === end.year && start.monthIndex === end.monthIndex) {
    const monthName = getMonth(calendar.definition, start.monthIndex, start.year).name;
    const year = formatYearLabel(calendar.definition, start.year);
    const era = getEraShortLabel(calendar.definition, start);
    return `${start.day}–${end.day}. ${monthName} ${year}${era ? ` ${era}` : ""}`;
  }

  return `${formatSingle(start)} → ${formatSingle(end)}`;
}

function toYmd(date: FantasyDate): { y: number; m: number; d: number } {
  return {
    y: date.year,
    m: date.monthIndex + 1,
    d: date.day
  };
}

function compareTimelineEntries(left: TimeTimelinePublishEntry, right: TimeTimelinePublishEntry): number {
  const leftKey = ymdSortKey(left.start);
  const rightKey = ymdSortKey(right.start);

  if (leftKey !== rightKey) {
    return leftKey - rightKey;
  }

  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
}

function ymdSortKey(value: { y: number; m: number; d: number }): number {
  return value.y * 10000 + value.m * 100 + value.d;
}

function jumpContainerToYmd(
  containerEl: HTMLElement,
  ymd: { y: number; m: number; d: number },
  selector = ".tl-row"
): boolean {
  const targetKey = ymdSortKey(ymd);
  const rows: HTMLElement[] = Array.from(
    containerEl.querySelectorAll<HTMLElement>(selector)
  );

  let exact: HTMLElement | null = null;
  let nextAfter: { key: number; el: HTMLElement } | null = null;
  let lastBefore: { key: number; el: HTMLElement } | null = null;

  for (const row of rows) {
    const startKeyRaw = row.dataset.tlStartKey;
    if (!startKeyRaw) continue;

    const startKey = Number(startKeyRaw);
    if (!Number.isFinite(startKey)) continue;

    const endKeyRaw = row.dataset.tlEndKey;
    const endKey = endKeyRaw ? Number(endKeyRaw) : startKey;
    const rangeEnd = Number.isFinite(endKey) ? endKey : startKey;

    if (targetKey >= startKey && targetKey <= rangeEnd) {
      exact = row;
      break;
    }

    if (startKey >= targetKey) {
      if (!nextAfter || startKey < nextAfter.key) {
        nextAfter = { key: startKey, el: row };
      }
    } else if (!lastBefore || startKey > lastBefore.key) {
      lastBefore = { key: startKey, el: row };
    }
  }

  const target = exact ?? nextAfter?.el ?? lastBefore?.el;
  if (!target) return false;

  try {
    target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  } catch {
    target.scrollIntoView();
  }

  return true;
}

function getHorizontalEdges(
  entry: TimeTimelinePublishEntry,
  align: TimelineAlign
): { left: "media" | "box"; right: "media" | "box" } {
  if (!entry.img) {
    return { left: "box", right: "box" };
  }

  if (align === "right") {
    return { left: "box", right: "media" };
  }

  return { left: "media", right: "box" };
}

function applyHorizontalJoin(
  left: { el: HTMLElement; right: "media" | "box" },
  right: { el: HTMLElement; left: "media" | "box" }
): void {
  if (left.right === "box") {
    left.el.addClass("tl-h-join-right-box");
  }
  if (right.left === "box") {
    right.el.addClass("tl-h-join-left-box");
  }
}

function createActionButton(
  parent: HTMLElement,
  label: string,
  onClick: () => void | Promise<void>,
  primary = false
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "time-manager__button",
    text: label
  });

  button.type = "button";
  if (primary) {
    button.addClass("mod-cta");
  }
  button.addEventListener("click", () => void onClick());
  return button;
}

function safeYamlRecord(raw: string): Record<string, unknown> {
  try {
    const value = parseYaml(raw) as unknown;
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function parseStringList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,\n;]+/g)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function resolvePositiveInt(
  primary: number | undefined,
  secondary: number | undefined,
  fallback: number
): number {
  const value = primary ?? secondary;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : fallback;
}

function sameDate(left: FantasyDate, right: FantasyDate): boolean {
  return (
    left.year === right.year &&
    left.monthIndex === right.monthIndex &&
    left.day === right.day
  );
}

function normalizeSummary(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeColor(value: string | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : "#d46b65";
}

function isNormalizedStringValue(value: unknown, expected: string): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === expected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clearEl(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}