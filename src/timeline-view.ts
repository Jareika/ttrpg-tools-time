import { ItemView, Menu, Notice, WorkspaceLeaf } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import { confirmWithModal } from "./confirm-dialog";
import { formatYearLabel, getEraShortLabel, getMonth } from "./calendar";
import type {
  CalendarTimelineStyle,
  CalendarEventDefinition,
  CalendarFile,
  FantasyDate,
  TimelineAlign,
  TagPackFile
} from "./types";

export const TIMELINE_VIEW_TYPE = "time-timeline-view";
export const TIMELINE_FILTER_VIEW_TYPE = "time-timeline-filter-view";

const TL_CARD_WIDTH = 200;
const TL_CARD_HEIGHT = 315;
const TL_BOX_HEIGHT = 289;
const TL_SIDE_GAP_LEFT = 40;
const TL_SIDE_GAP_RIGHT = 40;
const TL_MAX_SUMMARY_LINES = 7;

type HorizontalEdge = "media" | "box";

type TimelineRenderItem = {
  event: CalendarEventDefinition;
  title: string;
  summary?: string;
  imageSrc?: string;
  notePath?: string;
  start: FantasyDate;
  end?: FantasyDate;
  tagRefs: string[];
  accentColor?: string;
};

type TimelineTagInfo = {
  packId: string;
  packName: string;
  tagId: string;
  tagName: string;
  tagRef: string;
  color: string;
};

type ResolvedTimelineStyle = {
  name: string;
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
  monthNames?: string[];
};

export class TimeTimelineView extends ItemView {
  private renderToken = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: TtrpgToolsTimePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return TIMELINE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Timeline";
  }

  getIcon(): string {
    return "milestone";
  }

  onOpen(): void {
    void this.refresh();
  }

  onClose(): void {
    // no-op
  }

  refresh(): void {
    clearEl(this.contentEl);
    this.contentEl.addClass("time-timeline-view");
    void this.render();
  }

  private async render(): Promise<void> {
    const token = ++this.renderToken;
    const root = this.contentEl.createDiv({ cls: "time-timeline" });
    const calendar = this.plugin.activeCalendar;

    if (!calendar) {
      this.renderNoCalendar(root);
      return;
    }

    const [events, tagInfos] = await Promise.all([
      this.plugin.loadTimelineEvents(calendar.id),
      loadLinkedTagInfos(this.plugin, calendar)
    ]);

    if (token !== this.renderToken) {
      return;
    }

    const tagInfoByRef = new Map(tagInfos.map((tag) => [tag.tagRef, tag] as const));
    const allItems = events.map((event) => buildTimelineRenderItem(this.plugin, event, tagInfoByRef));
    const filters = this.plugin.getTimelineTagFilterSnapshot();
    const visibleItems = applyTimelineTagFilter(allItems, filters);
	const timelineStyle = resolveTimelineStyle(calendar);

    const panel = root.createDiv({ cls: "time-timeline__panel" });
    const header = panel.createDiv({ cls: "time-timeline__header" });

    header.createEl("h2", {
      cls: "time-timeline__title",
      text: timelineStyle.name
    });

    header.createEl("p", {
      cls: "time-timeline__meta",
      text: buildTimelineMetaText(calendar, allItems.length, visibleItems.length, filters)
    });

    const toolbar = header.createDiv({ cls: "time-timeline__toolbar" });

    createActionButton(toolbar, "Today", () => {
      const content = panel.querySelector<HTMLElement>(".time-timeline__content");
      if (!content) {
        return;
      }

      const ok = this.jumpContainerToDate(
        content,
        calendar.state.todayDate,
        this.plugin.getTimelineLayoutMode() === "horizontal" ? ".tl-h-item" : ".tl-row"
      );

      if (!ok) {
        new Notice("No timeline entry found for today.");
      }
    });

    createActionButton(
      toolbar,
      "Vertical",
      () => {
        void this.plugin.setTimelineLayoutMode("vertical");
      },
      this.plugin.getTimelineLayoutMode() === "vertical"
    );

    createActionButton(
      toolbar,
      "Horizontal",
      () => {
        void this.plugin.setTimelineLayoutMode("horizontal");
      },
      this.plugin.getTimelineLayoutMode() === "horizontal"
    );

    createActionButton(toolbar, "Filters", () => {
      void this.plugin.activateTimelineFilterView();
    });

    if (filters.include.length > 0 || filters.exclude.length > 0) {
      createActionButton(toolbar, "Clear filters", () => {
        this.plugin.clearTimelineTagFilters();
      });
    }

    const content = panel.createDiv({ cls: "time-timeline__content" });

    if (allItems.length === 0) {
      const empty = content.createDiv({ cls: "time-calendar__empty" });
      empty.createEl("h2", { text: "No events available" });
      empty.createEl("p", {
        text: "Create some events first. They will appear here automatically."
      });
      createActionButton(empty, "Open event editor", () => {
        void this.plugin.activateEventEditorView();
      }, true);
      return;
    }

    if (visibleItems.length === 0) {
      const empty = content.createDiv({ cls: "time-calendar__empty" });
      empty.createEl("h2", { text: "No matching events" });
      empty.createEl("p", {
        text: "Your current tag filters hide all events in the timeline."
      });
      createActionButton(empty, "Clear filters", () => {
        this.plugin.clearTimelineTagFilters();
      }, true);
      return;
    }

    const timelineRoot = content.createDiv({ cls: "simple-timeline" });

    if (this.plugin.getTimelineLayoutMode() === "horizontal") {
      this.renderHorizontalTimeline(timelineRoot, calendar, visibleItems, timelineStyle);
      return;
    }

    this.renderVerticalTimeline(timelineRoot, calendar, visibleItems, timelineStyle);
  }

  private renderNoCalendar(root: HTMLElement): void {
    const empty = root.createDiv({ cls: "time-calendar__empty" });
    empty.createEl("h2", { text: "No calendar loaded" });
    empty.createEl("p", {
      text: "Load or create a calendar first."
    });
  }

  private renderVerticalTimeline(
    root: HTMLElement,
    calendar: CalendarFile,
    items: TimelineRenderItem[],
    timelineStyle: ResolvedTimelineStyle
  ): void {
    const wrapper = root.createDiv({ cls: "tl-wrapper tl-cross-mode" });

    items.forEach((item) => {
	  this.renderCardRow(wrapper, calendar, item, timelineStyle, false);
    });
  }

  private renderHorizontalTimeline(
    root: HTMLElement,
    calendar: CalendarFile,
    items: TimelineRenderItem[],
    timelineStyle: ResolvedTimelineStyle
  ): void {
    const scroller = root.createDiv({ cls: "tl-h-scroller" });
    const wrapper = scroller.createDiv({ cls: "tl-h-content tl-horizontal tl-h-mixed" });

    const rendered: Array<{ el: HTMLElement; left: HorizontalEdge; right: HorizontalEdge }> = [];

    items.forEach((item) => {
      const rowEl = this.renderCardRow(wrapper, calendar, item, timelineStyle, true);
      rendered.push({ el: rowEl, ...this.getHorizontalEdges(item, timelineStyle) });
    });

    for (let index = 0; index < rendered.length - 1; index += 1) {
      this.applyHorizontalJoin(
        { el: rendered[index].el, right: rendered[index].right },
        { el: rendered[index + 1].el, left: rendered[index + 1].left }
      );
    }
  }

  private renderCardRow(
    parent: HTMLElement,
    calendar: CalendarFile,
    item: TimelineRenderItem,
	timelineStyle: ResolvedTimelineStyle,
    horizontal: boolean
  ): HTMLElement {
    const rowClasses = ["tl-row"];
    if (horizontal) {
      rowClasses.push("tl-h-item");
    }
    if (timelineStyle.align === "right") {
      rowClasses.push("tl-align-right");
    }

    const row = parent.createDiv({ cls: rowClasses.join(" ") });
    row.dataset.tlStartKey = String(ymdSortKey(item.start));
    row.dataset.tlEndKey = String(ymdSortKey(item.end ?? item.start));

    const accentColor = timelineStyle.colors.accent ?? item.accentColor ?? "var(--background-modifier-border)";

    row.style.setProperty(
      "--tl-side-gap-left",
      horizontal ? "0px" : `${timelineStyle.sideGapLeft}px`
    );
    row.style.setProperty(
      "--tl-side-gap-right",
      horizontal ? "0px" : `${timelineStyle.sideGapRight}px`
    );
    row.style.setProperty("--tl-bg", timelineStyle.colors.bg ?? "var(--background-primary)");
    row.style.setProperty("--tl-accent", accentColor);
    row.style.setProperty("--tl-hover", timelineStyle.colors.hover ?? "var(--interactive-accent)");

    const grid = row.createDiv({ cls: `tl-grid ${item.imageSrc ? "has-media" : "no-media"}` });
    grid.setCssProps({
      "--tl-media-w": `${timelineStyle.cardWidth}px`
    });

    let media: HTMLElement | null = null;

    if (item.imageSrc) {
      media = grid.createDiv({ cls: "tl-media time-timeline__media-frame" });
      media.setCssProps({
        "--time-tl-media-h": `${timelineStyle.cardHeight}px`
      });

      media.createEl("img", {
		cls: "time-timeline__media-image",
        attr: {
          src: item.imageSrc,
          alt: item.title,
          loading: "lazy"
        }
      });
    }

    const box = grid.createDiv({
      cls: `tl-box callout time-timeline__box ${item.imageSrc ? "has-media" : "no-media"}`
    });

    box.setCssProps({
      "--time-tl-box-h": `${timelineStyle.boxHeight}px`,
      "--tl-bg": timelineStyle.colors.bg ?? "var(--background-primary)",
      "--tl-accent": accentColor,
      "--tl-hover": timelineStyle.colors.hover ?? "var(--interactive-accent)"
    });

    const titleEl = box.createEl("h1", {
      cls: "tl-title tl-title-colored",
      text: item.title
    });

    const dateEl = box.createEl("h4", {
      cls: "tl-date tl-date-colored",
      text: formatRangeLabel(calendar, item.start, item.end, timelineStyle)
    });

    const summaryEl = box.createDiv({ cls: "tl-summary tl-clamp time-timeline__summary" });
    summaryEl.setCssProps({
      "--tl-summary-lines": String(timelineStyle.maxSummaryLines)
    });
    summaryEl.textContent = item.summary ?? "";

    if (timelineStyle.colors.title) {
      titleEl.style.color = timelineStyle.colors.title;
    }
    if (timelineStyle.colors.date) {
      dateEl.style.color = timelineStyle.colors.date;
    }

    const clickTarget = item.notePath ? item.notePath : item.event.id;

    if (media) {
      const overlay = this.buildInteractiveOverlay(media, clickTarget, item.title);
      overlay.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        void this.openTimelineItem(calendar, item);
      });
      overlay.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        this.openItemContextMenu(evt, calendar, item);
      });

      if (item.notePath) {
        this.attachHoverForAnchor(overlay, media, item.notePath);
      }
    }

    const boxOverlay = this.buildInteractiveOverlay(box, clickTarget, item.title);
    boxOverlay.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      void this.openTimelineItem(calendar, item);
    });
    boxOverlay.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.openItemContextMenu(evt, calendar, item);
    });

    if (item.notePath) {
      this.attachHoverForAnchor(boxOverlay, box, item.notePath);
    }

    return row;
  }

  private buildInteractiveOverlay(
    parent: HTMLElement,
    href: string,
    ariaLabel: string
  ): HTMLAnchorElement {
    return parent.createEl("a", {
      cls: "internal-link tl-hover-anchor",
      attr: {
        href,
        "data-href": href,
        "aria-label": ariaLabel
      }
    });
  }

  private async openTimelineItem(calendar: CalendarFile, item: TimelineRenderItem): Promise<void> {
    if (item.notePath) {
      await this.plugin.openStoredNoteRef(item.notePath);
      return;
    }

    await this.plugin.updateActiveCalendarState({
      cursorDate: { ...item.start }
    });
    await this.plugin.activateDayView();
  }

  private openItemContextMenu(
    event: MouseEvent,
    calendar: CalendarFile,
    item: TimelineRenderItem
  ): void {
    const menu = new Menu();

    if (item.notePath) {
      menu.addItem((entry) =>
        entry.setTitle("Open linked note").setIcon("file-text").onClick(() => {
          void this.plugin.openStoredNoteRef(item.notePath!);
        })
      );
    }

    menu.addItem((entry) =>
      entry.setTitle("Open day view").setIcon("sun").onClick(() => {
        void (async () => {
          await this.plugin.updateActiveCalendarState({
            cursorDate: { ...item.start }
          });
          await this.plugin.activateDayView();
        })();
      })
    );

    menu.addItem((entry) =>
      entry.setTitle("Edit event").setIcon("pencil").onClick(() => {
        void this.plugin.activateEventEditorForEvent(
          calendar.id,
          item.start.year,
          item.event.id
        );
      })
    );
	
    menu.addItem((entry) =>
      entry.setTitle("Delete event").setIcon("trash-2").onClick(() => {
        void (async () => {
          const confirmed = await confirmWithModal(this.plugin.app, {
            title: "Delete event",
            message: `Delete "${item.title}"?`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel"
          });

          if (!confirmed) {
            return;
          }

          await this.plugin.deleteEventById(calendar.id, item.start.year, item.event.id);
        })();
      })
    );

    menu.showAtMouseEvent(event);
  }

  private getHorizontalEdges(
    item: TimelineRenderItem,
    timelineStyle: ResolvedTimelineStyle
  ): { left: HorizontalEdge; right: HorizontalEdge } {
    if (!item.imageSrc) {
      return { left: "box", right: "box" };
    }

    if (timelineStyle.align === "right") {
      return { left: "box", right: "media" };
    }

    return { left: "media", right: "box" };
  }

  private applyHorizontalJoin(
    left: { el: HTMLElement; right: HorizontalEdge },
    right: { el: HTMLElement; left: HorizontalEdge }
  ): void {
    if (left.right === "box") {
      left.el.addClass("tl-h-join-right-box");
    }
    if (right.left === "box") {
      right.el.addClass("tl-h-join-left-box");
    }
  }

  private attachHoverForAnchor(
    anchorEl: HTMLElement,
    hoverParent: HTMLElement,
    filePath: string
  ): void {
    const makeForcedHoverEvent = (evt?: MouseEvent | TouchEvent): MouseEvent | TouchEvent => {
      if (evt && typeof TouchEvent !== "undefined" && evt instanceof TouchEvent) {
        return evt;
      }

      const mouseEvent = evt instanceof MouseEvent ? evt : undefined;
      const ownerDocument = getDocumentFor(anchorEl);
      const view = ownerDocument.defaultView ?? window;

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

    const workspaceLike = this.app.workspace as unknown as {
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
        sourcePath: filePath
      });
    };

    anchorEl.addEventListener("mouseenter", (evt) => openPopover(evt));

    let timer: number | null = null;

    anchorEl.addEventListener(
      "touchstart",
      (evt) => {
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

  private jumpContainerToDate(
    containerEl: HTMLElement,
    date: FantasyDate,
    selector: string
  ): boolean {
    const targetKey = ymdSortKey(date);
    const rows = Array.from(containerEl.querySelectorAll<HTMLElement>(selector));

    let exact: HTMLElement | null = null;
    let nextAfter: { key: number; el: HTMLElement } | null = null;
    let lastBefore: { key: number; el: HTMLElement } | null = null;

    for (const row of rows) {
      const startKeyRaw = row.dataset.tlStartKey;
      if (!startKeyRaw) {
        continue;
      }

      const startKey = Number(startKeyRaw);
      if (!Number.isFinite(startKey)) {
        continue;
      }

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
    if (!target) {
      return false;
    }

    try {
      target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    } catch {
      target.scrollIntoView();
    }

    return true;
  }
}

export class TimeTimelineFilterView extends ItemView {
  private renderToken = 0;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: TtrpgToolsTimePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return TIMELINE_FILTER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Timeline filters";
  }

  getIcon(): string {
    return "tags";
  }

  onOpen(): void {
    void this.refresh();
  }

  onClose(): void {
    // no-op
  }

  refresh(): void {
    clearEl(this.contentEl);
    this.contentEl.addClass("time-tag-filter-view");
    void this.render();
  }

  private async render(): Promise<void> {
    const token = ++this.renderToken;
    const root = this.contentEl.createDiv({ cls: "time-tag-filter" });
    const calendar = this.plugin.activeCalendar;

    if (!calendar) {
      const empty = root.createDiv({ cls: "time-calendar__empty" });
      empty.createEl("h2", { text: "No calendar loaded" });
      empty.createEl("p", { text: "Load or create a calendar first." });
      return;
    }

    const tagInfos = await loadLinkedTagInfos(this.plugin, calendar);

    if (token !== this.renderToken) {
      return;
    }

    const panel = root.createDiv({ cls: "time-tag-filter__panel" });
    const content = panel.createDiv({ cls: "time-tag-filter__content" });
    const filterSnapshot = this.plugin.getTimelineTagFilterSnapshot();

    if (filterSnapshot.include.length > 0 || filterSnapshot.exclude.length > 0) {
      const toolbar = content.createDiv({ cls: "time-tag-filter__toolbar" });
      createActionButton(toolbar, "Clear filters", () => {
        this.plugin.clearTimelineTagFilters();
      });
    }

    if (tagInfos.length === 0) {
      const empty = content.createDiv({ cls: "time-calendar__empty" });
      empty.createEl("h2", { text: "No linked tags available" });
      empty.createEl("p", {
        text: "Link one or more tag packs to the active calendar to use tag filtering in the timeline."
      });
      return;
    }

    const filters = filterSnapshot;
    const included = new Set(filters.include);
    const excluded = new Set(filters.exclude);

    const groups = groupTagsByPack(tagInfos);

    groups.forEach((group) => {
      const groupEl = content.createDiv({ cls: "time-tag-filter__group" });

      groupEl.createEl("h3", {
        cls: "time-tag-filter__group-title",
        text: group.packName
      });

      const chips = groupEl.createDiv({ cls: "time-tag-filter__chips" });

      group.tags.forEach((tag) => {
        const button = chips.createEl("button", {
          cls: "time-tag-filter__button",
          text: tag.tagName
        });

        button.type = "button";
        button.style.setProperty("--time-tag-color", tag.color);
        button.title = buildTagButtonTitle(tag, included.has(tag.tagRef), excluded.has(tag.tagRef));

        applyTagButtonState(button, tag.color, included.has(tag.tagRef), excluded.has(tag.tagRef));

        let clickTimer: number | null = null;

        button.addEventListener("click", () => {
          if (clickTimer !== null) {
            window.clearTimeout(clickTimer);
          }

          clickTimer = window.setTimeout(() => {
            clickTimer = null;
            this.plugin.toggleTimelineIncludedTag(tag.tagRef);
          }, 220);
        });

        button.addEventListener("dblclick", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();

          if (clickTimer !== null) {
            window.clearTimeout(clickTimer);
            clickTimer = null;
          }

          this.plugin.toggleTimelineExcludedTag(tag.tagRef);
        });
      });
    });
  }
}

function buildTimelineRenderItem(
  plugin: TtrpgToolsTimePlugin,
  event: CalendarEventDefinition,
  tagInfoByRef: Map<string, TimelineTagInfo>
): TimelineRenderItem {
  const accentTag = event.tagRefs.find((tagRef) => tagInfoByRef.has(tagRef));
  const accentColor = event.color ?? (accentTag ? tagInfoByRef.get(accentTag)?.color : undefined);

  return {
    event,
    title: event.title,
    summary: normalizeSummary(event.description),
    imageSrc: resolveImageSrc(plugin, event),
    notePath: resolveNotePath(plugin, event),
    start: { ...event.date },
    end: event.endDate ? { ...event.endDate } : undefined,
    tagRefs: [...event.tagRefs],
    accentColor
  };
}

async function loadLinkedTagInfos(
  plugin: TtrpgToolsTimePlugin,
  calendar: CalendarFile
): Promise<TimelineTagInfo[]> {
  const packs = await plugin.listTagPacks();
  const linkedPackIds = new Set(calendar.linkedTagPackIds);

  return packs
    .filter((pack) => linkedPackIds.has(pack.id))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }))
    .flatMap((pack) => mapTagsForPack(pack));
}

function mapTagsForPack(pack: TagPackFile): TimelineTagInfo[] {
  return pack.tags
    .map((tag) => ({
      packId: pack.id,
      packName: pack.name,
      tagId: tag.id,
      tagName: tag.name,
      tagRef: `${pack.id}:${tag.id}`,
      color: normalizeColor(tag.color)
    }))
    .sort((left, right) => left.tagName.localeCompare(right.tagName, undefined, { sensitivity: "base" }));
}

function groupTagsByPack(tagInfos: TimelineTagInfo[]): Array<{ packId: string; packName: string; tags: TimelineTagInfo[] }> {
  const groups = new Map<string, { packId: string; packName: string; tags: TimelineTagInfo[] }>();

  tagInfos.forEach((tag) => {
    const existing = groups.get(tag.packId);
    if (existing) {
      existing.tags.push(tag);
      return;
    }

    groups.set(tag.packId, {
      packId: tag.packId,
      packName: tag.packName,
      tags: [tag]
    });
  });

  return [...groups.values()];
}

function applyTimelineTagFilter(
  items: TimelineRenderItem[],
  filters: { include: string[]; exclude: string[] }
): TimelineRenderItem[] {
  const included = new Set(filters.include);
  const excluded = new Set(filters.exclude);

  return items.filter((item) => {
    if (item.tagRefs.some((tagRef) => excluded.has(tagRef))) {
      return false;
    }

    if (included.size === 0) {
      return true;
    }

    return item.tagRefs.some((tagRef) => included.has(tagRef));
  });
}

function buildTimelineMetaText(
  calendar: CalendarFile,
  totalItems: number,
  visibleItems: number,
  filters: { include: string[]; exclude: string[] }
): string {
  const parts = [
    calendar.name,
    `${visibleItems}/${totalItems} events`
  ];

  if (filters.include.length > 0) {
    parts.push(`include: ${filters.include.length}`);
  }

  if (filters.exclude.length > 0) {
    parts.push(`exclude: ${filters.exclude.length}`);
  }

  return parts.join(" • ");
}

function buildTagButtonTitle(tag: TimelineTagInfo, included: boolean, excluded: boolean): string {
  const state = excluded ? "Excluded" : included ? "Included" : "Inactive";
  return `${tag.packName} • ${tag.tagName} • ${state}`;
}

function applyTagButtonState(
  button: HTMLButtonElement,
  color: string,
  included: boolean,
  excluded: boolean
): void {
  button.removeClass("is-include", "is-exclude");

  button.style.removeProperty("background-color");
  button.style.removeProperty("border-color");
  button.style.removeProperty("color");
  button.style.removeProperty("box-shadow");

  button.style.setProperty("--time-tag-color", color);

  if (excluded) {
    button.addClass("is-exclude");
    button.style.borderColor = color;
    button.style.color = color;
    button.style.boxShadow = `inset 0 0 0 2px ${color}`;
    return;
  }

  if (included) {
    button.addClass("is-include");
    button.style.backgroundColor = color;
    button.style.borderColor = color;
    button.style.color = getReadableTextColor(color);
    return;
  }

  button.style.borderColor = color;
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

  button.addEventListener("click", () => {
    void onClick();
  });

  return button;
}

function resolveImageSrc(
  plugin: TtrpgToolsTimePlugin,
  event: CalendarEventDefinition
): string | undefined {
  if (!event.imageRef) {
    return undefined;
  }

  const file = plugin.resolveStoredFileRef(event.imageRef);
  return file ? plugin.app.vault.getResourcePath(file) : undefined;
}

function resolveNotePath(
  plugin: TtrpgToolsTimePlugin,
  event: CalendarEventDefinition
): string | undefined {
  if (!event.noteRef) {
    return undefined;
  }

  return plugin.resolveStoredFileRef(event.noteRef)?.path;
}

function normalizeSummary(summary: string | undefined): string | undefined {
  if (!summary) {
    return undefined;
  }

  const cleaned = summary.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function formatRangeLabel(
  calendar: CalendarFile,
  start: FantasyDate,
  end?: FantasyDate,
  timelineStyle?: ResolvedTimelineStyle
): string {
  const single = (date: FantasyDate) =>
    `${date.day}. ${getTimelineMonthName(calendar, date, timelineStyle)} ${formatYearLabel(calendar.definition, date.year, "verbose")}${formatEraSuffix(calendar, date)}`;

  if (!end || sameDate(start, end)) {
    return single(start);
  }

  if (start.year === end.year && start.monthIndex === end.monthIndex) {
	return `${start.day}–${end.day}. ${getTimelineMonthName(calendar, start, timelineStyle)} ${formatYearLabel(calendar.definition, start.year, "verbose")}${formatEraSuffix(calendar, start)}`;
  }

  return `${single(start)} → ${single(end)}`;
}

function formatEraSuffix(calendar: CalendarFile, date: FantasyDate): string {
  const era = getEraShortLabel(calendar.definition, date);
  return era ? ` ${era}` : "";
}

function sameDate(left: FantasyDate, right: FantasyDate): boolean {
  return (
    left.year === right.year &&
    left.monthIndex === right.monthIndex &&
    left.day === right.day
  );
}

function resolveTimelineStyle(calendar: CalendarFile): ResolvedTimelineStyle {
  const source: CalendarTimelineStyle | undefined = calendar.timeline;

  return {
    name: source?.name?.trim() || "Timeline",
    align: source?.align === "right" ? "right" : "left",
    maxSummaryLines: resolvePositiveInteger(source?.maxSummaryLines, TL_MAX_SUMMARY_LINES),
    cardWidth: resolvePositiveInteger(source?.cardWidth, TL_CARD_WIDTH),
    cardHeight: resolvePositiveInteger(source?.cardHeight, TL_CARD_HEIGHT),
    boxHeight: resolvePositiveInteger(source?.boxHeight, TL_BOX_HEIGHT),
    sideGapLeft: resolveNonNegativeInteger(source?.sideGapLeft, TL_SIDE_GAP_LEFT),
    sideGapRight: resolveNonNegativeInteger(source?.sideGapRight, TL_SIDE_GAP_RIGHT),
    colors: {
      bg: normalizeOptionalCssValue(source?.colors?.bg),
      accent: normalizeOptionalCssValue(source?.colors?.accent),
      hover: normalizeOptionalCssValue(source?.colors?.hover),
      title: normalizeOptionalCssValue(source?.colors?.title),
      date: normalizeOptionalCssValue(source?.colors?.date)
    },
    monthNames:
      source?.monthNames
        ?.map((entry) => entry.trim())
        .filter((entry) => entry.length > 0) ?? undefined
  };
}

function getTimelineMonthName(
  calendar: CalendarFile,
  date: FantasyDate,
  timelineStyle?: ResolvedTimelineStyle
): string {
  const monthNames = timelineStyle?.monthNames ?? [];

  if (monthNames.length > 0) {
    return monthNames[mod(date.monthIndex, monthNames.length)] ?? String(date.monthIndex + 1);
  }

  return getMonth(calendar.definition, date.monthIndex, date.year).name;
}

function ymdSortKey(date: FantasyDate): number {
  return date.year * 10000 + (date.monthIndex + 1) * 100 + date.day;
}

function clearEl(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function getDocumentFor(el: HTMLElement): Document {
  return (el as HTMLElement & { doc?: Document }).doc ?? el.ownerDocument;
}

function normalizeColor(value?: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : "#d46b65";
}

function normalizeOptionalCssValue(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function resolvePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Math.trunc(value) > 0
    ? Math.trunc(value)
    : fallback;
}

function resolveNonNegativeInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Math.trunc(value) >= 0
    ? Math.trunc(value)
    : fallback;
}

function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function getReadableTextColor(hexColor: string): string {
  const normalized = hexColor.replace("#", "");

  if (normalized.length !== 6) {
    return "#ffffff";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness >= 160 ? "#1f1f1f" : "#ffffff";
}