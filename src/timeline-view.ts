import { ItemView, Menu, Notice, WorkspaceLeaf } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import { chooseDeleteEventMode } from "./delete-event-modal";
import { formatYearLabel, getEraShortLabel, getMonth } from "./calendar";
import { buildTimelineGridLayout } from "./timeline-grid";
import { syncTimelineSummaryLineClamp } from "./timeline-summary";
import { resolveMoonsForDate } from "./moons";
import type {
  CalendarTimelineStyle,
  CalendarEventDefinition,
  CalendarFile,
  FantasyDate,
  MoonPhaseData,
  TimelineAlign,
  TagPackFile
} from "./types";

export const TIMELINE_VIEW_TYPE = "time-timeline-view";
export const TIMELINE_FILTER_VIEW_TYPE = "time-timeline-filter-view";

const TL_CARD_WIDTH = 200;
const TL_CARD_HEIGHT = 315;
const TL_BOX_HEIGHT = 289;
const TL_SIDE_GAP_LEFT = 40;
const TL_GRID_ROWS = 2;
const TL_SIDE_GAP_RIGHT = 40;
const TL_MAX_SUMMARY_LINES = 7;
const TL_MOON_SIZE = 28;

type HorizontalEdge = "media" | "box";

type TimelineRenderItem = {
  event: CalendarEventDefinition;
  calendar: CalendarFile;
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
  showMoons: boolean;
  moonSize: number;
  maxSummaryLines: number;
  cardWidth: number;
  cardHeight: number;
  boxHeight: number;
  gridRows: 2 | 3 | 4;
  gridTileHeight: number;
  gridTileWidth: number;
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

  onOpen(): Promise<void> {
    void this.refresh();
	return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
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

    const allCalendars = await this.plugin.listCalendars();
    const linkedCalendarIds = new Set(calendar.linkedCalendarIds);
    const selectedCalendarIds = new Set([
      calendar.id,
      ...this.plugin.getTimelineAdditionalCalendarIds()
    ]);
    const selectedCalendars = allCalendars.filter(
      (candidate) =>
        candidate.id === calendar.id ||
        (linkedCalendarIds.has(candidate.id) &&
          selectedCalendarIds.has(candidate.id))
    );

    const [eventGroups, tagInfos] = await Promise.all([
      Promise.all(
        selectedCalendars.map(async (candidate) => ({
          calendar: candidate,
          events: await this.plugin.loadTimelineEvents(candidate.id)
        }))
      ),
      loadLinkedTagInfos(this.plugin, selectedCalendars)
    ]);

    if (token !== this.renderToken) {
      return;
    }

    const tagInfoByRef = new Map(tagInfos.map((tag) => [tag.tagRef, tag] as const));
    const allItems = eventGroups.flatMap(({ calendar: eventCalendar, events }) =>
      events.map((event) =>
        buildTimelineRenderItem(this.plugin, eventCalendar, event, tagInfoByRef)
      )
    );
    const orderedItems = [...allItems].sort(compareTimelineRenderItems);
	const filters = this.plugin.getTimelineTagFilterSnapshot();
    const visibleItems = applyTimelineTagFilter(orderedItems, filters);
	const timelineStyle = resolveTimelineStyle(calendar);

    const panel = root.createDiv({ cls: "time-timeline__panel" });
    const header = panel.createDiv({ cls: "time-timeline__header" });
    const headerTop = header.createDiv({ cls: "time-timeline__header-top" });
    const headerText = headerTop.createDiv({ cls: "time-timeline__header-text" });

    headerText.createEl("h2", {
      cls: "time-timeline__title",
      text: timelineStyle.name
    });

    headerText.createEl("p", {
      cls: "time-timeline__meta",
      text: buildTimelineMetaText(
        calendar,
        selectedCalendars,
        allItems.length,
        visibleItems.length,
        filters
      )
    });
	
    if (timelineStyle.showMoons) {
      this.renderMoonStrip(headerTop, calendar, timelineStyle.moonSize);
    }

    const toolbar = header.createDiv({ cls: "time-timeline__toolbar" });
	
	const layoutMode = this.plugin.getTimelineLayoutMode();

    createActionButton(toolbar, "Today", () => {
      const content = panel.querySelector<HTMLElement>(".time-timeline__content");
      if (!content) {
        return;
      }

      const itemSelector =
        layoutMode === "vertical"
          ? ".tl-row"
          : layoutMode === "grid"
            ? ".time-timeline-grid__item"
            : ".tl-h-item";

      const ok = this.jumpContainerToDate(
        content,
        calendar.state.todayDate,
        itemSelector
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
      layoutMode === "vertical"
    );

    createActionButton(
      toolbar,
      "Horizontal",
      () => {
        void this.plugin.setTimelineLayoutMode("horizontal");
      },
      layoutMode === "horizontal"
    );

    createActionButton(
      toolbar,
      "Grid",
      () => {
        void this.plugin.setTimelineLayoutMode("grid");
      },
      layoutMode === "grid"
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

    if (layoutMode === "horizontal") {
      this.renderHorizontalTimeline(timelineRoot, calendar, visibleItems, timelineStyle);
      return;
    }
	
    if (layoutMode === "grid") {
      this.renderGridTimeline(timelineRoot, calendar, visibleItems, timelineStyle);
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
  
  private renderMoonStrip(
    parent: HTMLElement,
    calendar: CalendarFile,
    size: number
  ): void {
    const moons = resolveMoonsForDate(calendar, calendar.state.cursorDate);

    if (moons.length === 0) {
      return;
    }

    const panel = parent.createDiv({ cls: "time-timeline__moon-panel" });
    panel.title = `Moon phases • ${formatRangeLabel(
      calendar,
      calendar.state.cursorDate,
      undefined
    )}`;

    const list = panel.createDiv({ cls: "time-timeline__moon-list" });

    moons.forEach((moon) => {
      const item = list.createDiv({ cls: "time-timeline__moon" });
      item.style.setProperty("--time-timeline-moon-size", `${size}px`);
      item.title = `${moon.name} • ${moon.phaseLabel} • Day ${moon.cycleDay}/${moon.cycleDays}`;

      if (moon.imageRef) {
        const file = this.plugin.resolveStoredFileRef(moon.imageRef);

        if (file) {
          const image = item.createEl("img", {
            cls: "time-timeline__moon-image"
          });
          image.src = this.plugin.app.vault.getResourcePath(file);
          image.alt = `${moon.name} — ${moon.phaseLabel}`;
          image.draggable = false;
          return;
        }
      }

      this.renderMoonFallback(item, moon);
    });
  }

  private renderMoonFallback(parent: HTMLElement, moon: MoonPhaseData): void {
    const fallback = parent.createDiv({ cls: "time-timeline__moon-fallback" });
    fallback.textContent = String(moon.phaseIndex + 1);

    if (moon.color) {
      fallback.style.backgroundColor = moon.color;
    }
  }

  private renderVerticalTimeline(
    root: HTMLElement,
    calendar: CalendarFile,
    items: TimelineRenderItem[],
    timelineStyle: ResolvedTimelineStyle
  ): void {
    const wrapper = root.createDiv({ cls: "tl-wrapper tl-cross-mode" });

    items.forEach((item) => {
	  this.renderCardRow(wrapper, item, timelineStyle, false);
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
      const rowEl = this.renderCardRow(wrapper, item, timelineStyle, true);
      rendered.push({
        el: rowEl,
        ...this.getHorizontalEdges(
          item,
          resolveTimelineItemStyle(item, timelineStyle)
        )
      });
    });

    for (let index = 0; index < rendered.length - 1; index += 1) {
      this.applyHorizontalJoin(
        { el: rendered[index].el, right: rendered[index].right },
        { el: rendered[index + 1].el, left: rendered[index + 1].left }
      );
    }
  }
  
  private renderGridTimeline(
    root: HTMLElement,
    calendar: CalendarFile,
    items: TimelineRenderItem[],
    timelineStyle: ResolvedTimelineStyle
  ): void {
    const layout = buildTimelineGridLayout(
      items.map((item) => ({
        value: item,
        start: item.start,
        end: item.end
      })),
      timelineStyle.gridRows
    );

    const scroller = root.createDiv({ cls: "tl-grid-scroller" });
    const grid = scroller.createDiv({ cls: "tl-grid-timeline" });

    grid.setCssProps({
      "--tl-grid-cols": String(Math.max(1, layout.columnCount)),
      "--tl-grid-rows": String(layout.rowCount),
      "--tl-grid-col-w": `${timelineStyle.gridTileWidth}px`,
      "--tl-grid-row-h": `${timelineStyle.gridTileHeight}px`
    });

    layout.placements.forEach((placement) => {
      const item = placement.value;
	  const itemStyle = resolveTimelineItemStyle(item, timelineStyle);
      const isRange = placement.isRange;
      const columnSpan = isRange
        ? Math.max(2, placement.columnSpan)
        : 1;

      const eventEl = grid.createDiv({
        cls: [
          "time-timeline-grid__item",
          placement.isRange
            ? "time-timeline-grid__item--range"
            : "time-timeline-grid__item--single"
        ].join(" ")
      });

      eventEl.dataset.tlStartKey = String(ymdSortKey(item.start));
      eventEl.dataset.tlEndKey = String(ymdSortKey(item.end ?? item.start));

      eventEl.style.setProperty(
        "grid-column-start",
        String(placement.column + 1),
        "important"
      );
      eventEl.style.setProperty(
        "grid-column-end",
        `span ${columnSpan}`,
        "important"
      );
      eventEl.style.setProperty(
        "grid-row-start",
        String(placement.row + 1),
        "important"
      );

      const accentColor =
        itemStyle.colors.accent ??
        item.accentColor ??
        "var(--background-modifier-border)";

      eventEl.setCssProps({
        "--tl-bg": itemStyle.colors.bg ?? "var(--background-primary)",
        "--tl-accent": accentColor,
        "--tl-hover": itemStyle.colors.hover ?? "var(--interactive-accent)",
        "--tl-grid-media-w": `${timelineStyle.gridTileWidth}px`
      });

      if (isRange) {
        this.renderGridRangeCard(eventEl, item, itemStyle);
      } else {
        this.renderGridSingleCard(eventEl, item, itemStyle);
      }
    });
  }

  private renderGridSingleCard(
    parent: HTMLElement,
    item: TimelineRenderItem,
    timelineStyle: ResolvedTimelineStyle
  ): void {
    const card = parent.createDiv({ cls: "time-timeline-grid__single-card" });
	
    if (!item.notePath) {
      this.attachContextMenu(card, item);
    }

    if (item.imageSrc) {
	  card.addClass("is-with-image");
      card.createEl("img", {
        cls: "time-timeline-grid__single-image",
        attr: {
          src: item.imageSrc,
          alt: item.title,
          loading: "lazy"
        }
      });
    } else {
      card.addClass("is-without-image");
      card.createDiv({
        cls: "time-timeline-grid__single-title",
        text: item.title
      });
    }

    const date = card.createDiv({
      cls: "time-timeline-grid__date-header",
      text: formatRangeLabel(item.calendar, item.start, undefined, timelineStyle)
    });

    if (timelineStyle.colors.date) {
      date.style.color = timelineStyle.colors.date;
    }

    card.title = `${item.title} • ${formatRangeLabel(
      item.calendar,
      item.start,
      item.end,
      timelineStyle
    )}`;

    const overlay = this.buildInteractiveOverlay(card, item.notePath ?? item.event.id, item.title);
    overlay.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.openTimelineItem(item);
    });
    overlay.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.openItemContextMenu(event, item);
    });

    if (item.notePath) {
      this.attachHoverForAnchor(overlay, card, item.notePath);
    }
  }

  private renderGridRangeCard(
    parent: HTMLElement,
    item: TimelineRenderItem,
    timelineStyle: ResolvedTimelineStyle
  ): void {
    const card = parent.createDiv({ cls: "time-timeline-grid__range-card" });
    card.toggleClass("is-without-image", !item.imageSrc);
	card.toggleClass("is-without-note", !item.notePath);

    if (!item.notePath) {
      this.attachContextMenu(card, item);
    }

    if (item.imageSrc) {
      const media = card.createDiv({ cls: "time-timeline-grid__range-media" });
      media.createEl("img", {
        cls: "time-timeline-grid__range-image",
        attr: {
          src: item.imageSrc,
          alt: item.title,
          loading: "lazy"
        }
      });
    }

    const body = card.createDiv({ cls: "time-timeline-grid__range-body" });
    const title = body.createEl("h3", {
      cls: "time-timeline-grid__range-title",
      text: item.title
    });
    const date = body.createDiv({
      cls: "time-timeline-grid__range-date",
      text: formatRangeLabel(item.calendar, item.start, item.end, timelineStyle)
    });
    const summary = body.createDiv({
      cls: "time-timeline-grid__range-summary",
      text: item.summary ?? ""
    });
    summary.setCssProps({
      "--tl-summary-lines": String(timelineStyle.maxSummaryLines)
    });

    if (item.summary) {
      syncTimelineSummaryLineClamp(
        summary,
        timelineStyle.maxSummaryLines
      );
    }

    if (timelineStyle.colors.title) {
      title.style.color = timelineStyle.colors.title;
    }
    if (timelineStyle.colors.date) {
      date.style.color = timelineStyle.colors.date;
    }

    if (item.notePath) {
      const overlay = this.buildInteractiveOverlay(card, item.notePath, item.title);
      overlay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.openTimelineItem(item);
      });
      overlay.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.openItemContextMenu(event, item);
      });

      this.attachHoverForAnchor(overlay, card, item.notePath);
    }
  }

  private renderCardRow(
    parent: HTMLElement,
    item: TimelineRenderItem,
	timelineStyle: ResolvedTimelineStyle,
    horizontal: boolean
  ): HTMLElement {
    const itemStyle = resolveTimelineItemStyle(item, timelineStyle);
	const rowClasses = ["tl-row"];
    if (horizontal) {
      rowClasses.push("tl-h-item");
    }
    if (itemStyle.align === "right") {
      rowClasses.push("tl-align-right");
    }

    const row = parent.createDiv({ cls: rowClasses.join(" ") });
    row.dataset.tlStartKey = String(ymdSortKey(item.start));
    row.dataset.tlEndKey = String(ymdSortKey(item.end ?? item.start));

    const accentColor =
      itemStyle.colors.accent ??
      item.accentColor ??
      "var(--background-modifier-border)";

    row.setCssProps({
      "--tl-side-gap-left": horizontal
        ? "0px"
        : `${itemStyle.sideGapLeft}px`,
      "--tl-side-gap-right": horizontal
        ? "0px"
        : `${itemStyle.sideGapRight}px`,
      "--tl-bg": itemStyle.colors.bg ?? "var(--background-primary)",
      "--tl-accent": accentColor,
      "--tl-hover": itemStyle.colors.hover ?? "var(--interactive-accent)"
    });

    const grid = row.createDiv({ cls: `tl-grid ${item.imageSrc ? "has-media" : "no-media"}` });
    grid.setCssProps({
      "--tl-media-w": `${itemStyle.cardWidth}px`
    });

    let media: HTMLElement | null = null;

    if (item.imageSrc) {
      media = grid.createDiv({ cls: "tl-media time-timeline__media-frame" });
      media.setCssProps({
        "--time-tl-media-h": `${itemStyle.cardHeight}px`
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
      cls: [
        "tl-box",
        "callout",
        "time-timeline__box",
        item.imageSrc ? "has-media" : "no-media",
        !item.notePath ? "is-without-note" : ""
      ].filter(Boolean).join(" ")
    });

    box.setCssProps({
      "--time-tl-box-h": `${itemStyle.boxHeight}px`,
      "--tl-bg": itemStyle.colors.bg ?? "var(--background-primary)",
      "--tl-accent": accentColor,
      "--tl-hover": itemStyle.colors.hover ?? "var(--interactive-accent)"
    });

    const titleEl = box.createEl("h1", {
      cls: "tl-title tl-title-colored",
      text: item.title
    });

    const dateEl = box.createEl("h4", {
      cls: "tl-date tl-date-colored",
      text: formatRangeLabel(item.calendar, item.start, item.end, timelineStyle)
    });

    const summaryEl = box.createDiv({ cls: "tl-summary tl-clamp time-timeline__summary" });
    summaryEl.setCssProps({
      "--tl-summary-lines": String(itemStyle.maxSummaryLines)
    });
    summaryEl.textContent = item.summary ?? "";

    if (item.summary) {
      syncTimelineSummaryLineClamp(
        summaryEl,
        itemStyle.maxSummaryLines
      );
    }

    if (itemStyle.colors.title) {
      titleEl.style.color = itemStyle.colors.title;
    }
    if (itemStyle.colors.date) {
      dateEl.style.color = itemStyle.colors.date;
    }

    const clickTarget = item.notePath ? item.notePath : item.event.id;

    if (media) {
      const overlay = this.buildInteractiveOverlay(media, clickTarget, item.title);
      overlay.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        void this.openTimelineItem(item);
      });
      overlay.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        this.openItemContextMenu(evt, item);
      });

      if (item.notePath) {
        this.attachHoverForAnchor(overlay, media, item.notePath);
      }
    }
	
    if (!item.notePath) {
      this.attachContextMenu(box, item);
    }

    if (item.notePath) {
      const boxOverlay = this.buildInteractiveOverlay(
        box,
        clickTarget,
        item.title
      );
      boxOverlay.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        void this.openTimelineItem(item);
      });
      boxOverlay.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        this.openItemContextMenu(evt, item);
      });

      this.attachHoverForAnchor(boxOverlay, box, item.notePath);
    }

    return row;
  }
  
  private attachContextMenu(
    element: HTMLElement,
    item: TimelineRenderItem
  ): void {
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openItemContextMenu(event, item);
    });
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

  private async openTimelineItem(item: TimelineRenderItem): Promise<void> {
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
          item.calendar.id,
          item.start.year,
          item.event.id
        );
      })
    );
	
    menu.addItem((entry) =>
      entry.setTitle("Delete event").setIcon("trash-2").onClick(() => {
        void (async () => {
          const deleteMode = await chooseDeleteEventMode(this.plugin.app, {
            title: "Delete event",
            eventTitle: item.title,
            occurrenceLabel: formatRangeLabel(
              item.calendar,
              item.start,
              item.end,
              resolveTimelineStyle(item.calendar)
            ),
            recurring: Boolean(item.event.recurrence)
          });

          if (!deleteMode) {
            return;
          }

          await this.plugin.deleteEventById(
            item.calendar.id,
            item.start.year,
            item.event.id,
            deleteMode,
            item.start
          );
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

  onOpen(): Promise<void> {
    void this.refresh();
	return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
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

    const [allCalendars, tagInfos] = await Promise.all([
      this.plugin.listCalendars(),
      loadLinkedTagInfos(this.plugin, [calendar])
    ]);

    if (token !== this.renderToken) {
      return;
    }

    const panel = root.createDiv({ cls: "time-tag-filter__panel" });
    const content = panel.createDiv({ cls: "time-tag-filter__content" });
    const filterSnapshot = this.plugin.getTimelineTagFilterSnapshot();

    const linkedCalendarIds = new Set(calendar.linkedCalendarIds);
    const linkedCalendars = allCalendars.filter((candidate) =>
      linkedCalendarIds.has(candidate.id)
    );

    if (linkedCalendars.length > 0) {
      const calendarGroup = content.createDiv({
        cls: "time-tag-filter__group"
      });
      calendarGroup.createEl("h3", {
        cls: "time-tag-filter__group-title",
        text: "Calendars"
      });

      const calendarChips = calendarGroup.createDiv({
        cls: "time-tag-filter__chips"
      });

      linkedCalendars.forEach((candidate, index) => {
        const color = TIMELINE_CALENDAR_COLORS[
          index % TIMELINE_CALENDAR_COLORS.length
        ] ?? "#d46b65";
        const button = calendarChips.createEl("button", {
          cls: "time-tag-filter__button time-timeline-calendar-filter__button",
          text: candidate.name
        });
        button.type = "button";
        button.title = this.plugin.isTimelineCalendarIncluded(candidate.id)
          ? `Hide ${candidate.name} from timeline`
          : `Add ${candidate.name} to timeline`;

        applyTagButtonState(
          button,
          color,
          this.plugin.isTimelineCalendarIncluded(candidate.id),
          false
        );

        button.addEventListener("click", () => {
          this.plugin.toggleTimelineCalendar(candidate.id);
        });
      });
    }
	
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
  calendar: CalendarFile,
  event: CalendarEventDefinition,
  tagInfoByRef: Map<string, TimelineTagInfo>
): TimelineRenderItem {
  const accentTag = event.tagRefs.find((tagRef) => tagInfoByRef.has(tagRef));
  const accentColor = event.color ?? (accentTag ? tagInfoByRef.get(accentTag)?.color : undefined);

  return {
    event,
	calendar,
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
  calendars: CalendarFile[]
): Promise<TimelineTagInfo[]> {
  const packs = await plugin.listTagPacks();
  const linkedPackIds = new Set(
    calendars.flatMap((calendar) => calendar.linkedTagPackIds)
  );

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
  selectedCalendars: CalendarFile[],
  totalItems: number,
  visibleItems: number,
  filters: { include: string[]; exclude: string[] }
): string {
  const parts = [
    selectedCalendars.length === 1
      ? calendar.name
      : `${calendar.name} +${selectedCalendars.length - 1} calendar${selectedCalendars.length === 2 ? "" : "s"}`,
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
  const cardWidth = resolvePositiveInteger(source?.cardWidth, TL_CARD_WIDTH);
  const cardHeight = resolvePositiveInteger(source?.cardHeight, TL_CARD_HEIGHT);
  const gridTileHeight = resolvePositiveInteger(
    source?.gridTileHeight,
    cardHeight
  );
  const gridTileWidth = Math.max(
    1,
    Math.round((cardWidth / cardHeight) * gridTileHeight)
  );

  return {
    name: source?.name?.trim() || "Timeline",
    align: source?.align === "right" ? "right" : "left",
    showMoons: source?.showMoons === true,
    moonSize: resolvePositiveInteger(source?.moonSize, TL_MOON_SIZE),
    maxSummaryLines: resolvePositiveInteger(
      source?.maxSummaryLines,
      TL_MAX_SUMMARY_LINES
    ),
    cardWidth,
    cardHeight,
    boxHeight: resolvePositiveInteger(source?.boxHeight, TL_BOX_HEIGHT),
    gridRows:
      source?.gridRows === 3 || source?.gridRows === 4
        ? source.gridRows
        : TL_GRID_ROWS,
    gridTileHeight,
    gridTileWidth,
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

function resolveTimelineItemStyle(
  item: TimelineRenderItem,
  fallback: ResolvedTimelineStyle
): ResolvedTimelineStyle {
  const source = item.calendar.timeline;
  const cardWidth = resolvePositiveInteger(source?.cardWidth, fallback.cardWidth);
  const cardHeight = resolvePositiveInteger(source?.cardHeight, fallback.cardHeight);
  const gridTileHeight = resolvePositiveInteger(
    source?.gridTileHeight,
    fallback.gridTileHeight
  );

  return {
    ...fallback,
    align: source?.align === "right" ? "right" : source?.align === "left"
      ? "left"
      : fallback.align,
    maxSummaryLines: resolvePositiveInteger(
      source?.maxSummaryLines,
      fallback.maxSummaryLines
    ),
    cardWidth,
    cardHeight,
    boxHeight: resolvePositiveInteger(source?.boxHeight, fallback.boxHeight),
    gridTileHeight,
    gridTileWidth: Math.max(
      1,
      Math.round((cardWidth / cardHeight) * gridTileHeight)
    ),
    sideGapLeft: resolveNonNegativeInteger(
      source?.sideGapLeft,
      fallback.sideGapLeft
    ),
    sideGapRight: resolveNonNegativeInteger(
      source?.sideGapRight,
      fallback.sideGapRight
    ),
    colors: {
      bg: normalizeOptionalCssValue(source?.colors?.bg) ?? fallback.colors.bg,
      accent:
        normalizeOptionalCssValue(source?.colors?.accent) ??
        fallback.colors.accent,
      hover:
        normalizeOptionalCssValue(source?.colors?.hover) ??
        fallback.colors.hover,
      title:
        normalizeOptionalCssValue(source?.colors?.title) ??
        fallback.colors.title,
      date:
        normalizeOptionalCssValue(source?.colors?.date) ??
        fallback.colors.date
    }
  };
}

function compareTimelineRenderItems(
  left: TimelineRenderItem,
  right: TimelineRenderItem
): number {
  const startComparison = compareTimelineDates(left.start, right.start);

  if (startComparison !== 0) {
    return startComparison;
  }

  const endComparison = compareTimelineDates(
    left.end ?? left.start,
    right.end ?? right.start
  );

  if (endComparison !== 0) {
    return endComparison;
  }

  const calendarComparison = left.calendar.name.localeCompare(
    right.calendar.name,
    undefined,
    { sensitivity: "base" }
  );

  if (calendarComparison !== 0) {
    return calendarComparison;
  }

  return left.title.localeCompare(right.title, undefined, {
    sensitivity: "base"
  });
}

function compareTimelineDates(left: FantasyDate, right: FantasyDate): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }

  if (left.monthIndex !== right.monthIndex) {
    return left.monthIndex - right.monthIndex;
  }

  return left.day - right.day;
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

const TIMELINE_CALENDAR_COLORS = ["#d46b65", "#3f8f8a", "#7d6cc4", "#d28a3f"];

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