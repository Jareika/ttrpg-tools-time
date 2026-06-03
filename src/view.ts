import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import {
  buildMonthGrid,
  formatLongDate,
  getEraShortLabel,
  getMonth,
  getSeasonForDate,
  getWeekIndexInMonth,
  getWeekOfYear,
  getWeekRow,
  getYearLength,
  shiftDay,
  shiftMonth,
  shiftYear
} from "./calendar";
import { getEventDotsForDate } from "./events";
import { resolveWeatherForDate } from "./weather";
import type {
  CalendarFile,
  CalendarViewMode,
  EventIndexYearFile,
  FantasyDate,
  MonthGridCell,
  WeatherYearFile
} from "./types";

export const CALENDAR_VIEW_TYPE = "time-calendar-view";

export class TimeCalendarView extends ItemView {
  private readonly plugin: TtrpgToolsTimePlugin;

  constructor(leaf: WorkspaceLeaf, plugin: TtrpgToolsTimePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.activeCalendar?.definition.name ?? "TTRPG Tools: Time";
  }

  getIcon(): string {
    return "calendar";
  }

  onOpen(): void {
    void this.refresh();
  }

  onClose(): void {
    // no-op
  }

  refresh(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("time-calendar-view");
    void this.render(root);
  }

  private async render(root: HTMLElement): Promise<void> {
    const shell = root.createDiv({ cls: "time-calendar" });
    const inner = shell.createDiv({ cls: "time-calendar__shell" });

    const calendar = this.getActiveCalendar();

    if (calendar === null) {
      this.renderEmptyState(inner);
      return;
    }

    this.renderRail(inner, calendar);

    const [weatherYear, eventIndexYear] = await Promise.all([
      this.plugin.loadWeatherYear(calendar.id, calendar.state.cursorDate.year),
      this.plugin.loadEventIndexYear(calendar.id, calendar.state.cursorDate.year)
    ]);

    const panel = inner.createDiv({ cls: "time-calendar__panel" });
    this.renderHeader(panel, calendar);

    const scroller = panel.createDiv({ cls: "time-calendar__scroller" });
    this.renderActiveView(scroller, calendar, weatherYear, eventIndexYear);

    this.scrollCursorIntoView(scroller);
  }

  private renderEmptyState(parent: HTMLElement): void {
    const empty = parent.createDiv({ cls: "time-calendar__empty" });
    empty.createEl("h2", { text: "No calendar loaded" });
    empty.createEl("p", {
      text: "Create a calendar first or reload your JSON data."
    });

    const button = empty.createEl("button", {
      cls: "mod-cta",
      text: "Create calendar"
    });
    button.addEventListener("click", () => {
      this.plugin.openCreateCalendarModal(() => this.refresh());
    });
  }

  private renderRail(parent: HTMLElement, calendar: CalendarFile): void {
    const { definition, state } = calendar;

    const rail = parent.createDiv({ cls: "time-calendar__rail" });
    rail.createDiv({
      cls: "time-calendar__rail-day",
      text: String(state.cursorDate.day)
    });
    rail.createDiv({
      cls: "time-calendar__rail-era",
      text: getEraShortLabel(definition, state.cursorDate)
    });
    rail.createDiv({ cls: "time-calendar__rail-divider" });
    rail.createDiv({
      cls: "time-calendar__rail-month",
      text: getMonth(definition, state.cursorDate.monthIndex).name
    });
    rail.createDiv({
      cls: "time-calendar__rail-year",
      text: String(state.cursorDate.year)
    });
  }

  private renderHeader(panel: HTMLElement, calendar: CalendarFile): void {
    const { definition, state } = calendar;

    const header = panel.createDiv({ cls: "time-calendar__header" });

    header.createDiv({
      cls: "time-calendar__brand",
      text: definition.name
    });

    const toolbar = header.createDiv({ cls: "time-calendar__toolbar" });

    this.createIconButton(toolbar, "chevron-left", "Previous", () => {
      void this.navigate(-1);
    });

    const modeSwitch = toolbar.createDiv({ cls: "time-calendar__mode-switch" });
    this.createModeIconButton(modeSwitch, "week", "calendar", "Week view", state.activeView);
    this.createModeIconButton(modeSwitch, "month", "moon", "Month view", state.activeView);
    this.createModeIconButton(modeSwitch, "year", "sun", "Year view", state.activeView);

    this.createIconButton(toolbar, "crosshair", "Jump to today", () => {
      void this.plugin.jumpToToday();
    }).addClass("time-calendar__today-button");

    this.createIconButton(toolbar, "chevron-right", "Next", () => {
      void this.navigate(1);
    });

    toolbar.createDiv({ cls: "time-calendar__toolbar-spacer" });

    const menuButton = toolbar.createEl("button", {
      cls: "time-icon-button clickable-icon time-calendar__menu-button"
    });
    menuButton.type = "button";
    menuButton.setAttr("aria-label", "Open menu");
    setIcon(menuButton, "settings");
    menuButton.addEventListener("click", (event: MouseEvent) => {
      this.openHeaderMenu(event);
    });
  }

  private openHeaderMenu(event: MouseEvent): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle("Jump to today").setIcon("crosshair").onClick(() => {
        void this.plugin.jumpToToday();
      })
    );

    menu.addItem((item) =>
      item.setTitle("Open day view").setIcon("sun").onClick(() => {
        void this.plugin.activateDayView();
      })
    );

    menu.addItem((item) =>
      item.setTitle("New event").setIcon("plus-circle").onClick(() => {
        void this.plugin.activateEventEditorView();
      })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle("Edit active calendar").setIcon("pencil").onClick(() => {
        this.plugin.openEditActiveCalendarModal(() => this.refresh());
      })
    );

    menu.addItem((item) =>
      item.setTitle("Manage calendars").setIcon("calendar").onClick(() => {
        this.plugin.openManageCalendarsModal();
      })
    );

    menu.addItem((item) =>
      item.setTitle("Manage tag packs").setIcon("tags").onClick(() => {
        this.plugin.openManageTagPacksModal();
      })
    );
	
    menu.addItem((item) =>
      item.setTitle("Manage weather packs").setIcon("cloud").onClick(() => {
        this.plugin.openManageWeatherPacksModal();
      })
    );

    menu.addItem((item) =>
      item.setTitle("Reload JSON data").setIcon("refresh-cw").onClick(() => {
        void this.plugin.reloadDataFromDisk();
      })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle("Plugin settings").setIcon("settings").onClick(() => {
        this.plugin.openPluginSettings();
      })
    );

    menu.showAtMouseEvent(event);
  }

  private renderActiveView(
    container: HTMLElement,
    calendar: CalendarFile,
    weatherYear: WeatherYearFile | null,
    eventIndexYear: EventIndexYearFile | null
  ): void {
    const mode = calendar.state.activeView;

    if (mode === "week") {
      this.renderWeekView(container, calendar, weatherYear, eventIndexYear);
      return;
    }

    if (mode === "month") {
      this.renderMonthView(container, calendar, weatherYear, eventIndexYear);
      return;
    }

    this.renderYearView(container, calendar, weatherYear, eventIndexYear);
  }

  private renderWeekView(
    container: HTMLElement,
    calendar: CalendarFile,
    weatherYear: WeatherYearFile | null,
    eventIndexYear: EventIndexYearFile | null
  ): void {
    const { definition, state, markers } = calendar;
    const month = getMonth(definition, state.cursorDate.monthIndex);

    const intro = container.createDiv({ cls: "time-view-frame time-view-frame--intro" });
    intro.createDiv({
      cls: "time-view-title",
      text: month.name
    });
    intro.createDiv({
      cls: "time-view-meta",
      text: `Week ${getWeekIndexInMonth(definition, state.cursorDate) + 1} • ${state.cursorDate.year} ${getEraShortLabel(definition, state.cursorDate)}`
    });

    this.renderWeekdayHeader(container, calendar);
	const showWeekNumbers = this.shouldShowWeekNumbers();

    const weekGrid = container.createDiv({
      cls: "time-month-grid time-month-grid--week"
    });
    weekGrid.style.setProperty(
      "--time-columns",
      String(definition.weekdays.length + (showWeekNumbers ? 1 : 0))
    );

    const weekRow = getWeekRow(
      definition,
      state.cursorDate,
      state.cursorDate,
      state.todayDate,
      markers
    );
	
    if (showWeekNumbers) {
      this.renderWeekNumberCell(weekGrid, getWeekOfYear(definition, state.cursorDate));
    }

    weekRow.forEach((cell) =>
      this.renderDayCell(weekGrid, cell, calendar, weatherYear, eventIndexYear)
    );
  }

  private renderMonthView(
    container: HTMLElement,
    calendar: CalendarFile,
    weatherYear: WeatherYearFile | null,
    eventIndexYear: EventIndexYearFile | null
  ): void {
    const { definition, state } = calendar;
    const month = getMonth(definition, state.cursorDate.monthIndex);

    const intro = container.createDiv({ cls: "time-view-frame time-view-frame--intro" });
    intro.createDiv({
      cls: "time-view-title",
      text: month.name
    });
    intro.createDiv({
      cls: "time-view-meta",
      text: `${state.cursorDate.year} ${getEraShortLabel(definition, state.cursorDate)} • ${month.days} days`
    });

    this.renderMonthSection(
      container,
      state.cursorDate.year,
      state.cursorDate.monthIndex,
      calendar,
      weatherYear,
      eventIndexYear,
      {
        showHeading: false,
        showMeta: false
      }
    );
  }

  private renderYearView(
    container: HTMLElement,
    calendar: CalendarFile,
    weatherYear: WeatherYearFile | null,
    eventIndexYear: EventIndexYearFile | null
  ): void {
    const { definition, state } = calendar;

    const intro = container.createDiv({ cls: "time-view-frame time-view-frame--intro" });
    intro.createDiv({
      cls: "time-view-title",
      text: `${state.cursorDate.year}`
    });
    intro.createDiv({
      cls: "time-view-meta",
      text: `${getYearLength(definition)} days • ${definition.months.length} months • ${getEraShortLabel(definition, state.cursorDate)}`
    });

    definition.months.forEach((_month, monthIndex) => {
      this.renderMonthSection(
        container,
        state.cursorDate.year,
        monthIndex,
        calendar,
        weatherYear,
        eventIndexYear,
        {
          showHeading: true,
          showMeta: false
        }
      );
    });
  }

  private renderMonthSection(
    parent: HTMLElement,
    year: number,
    monthIndex: number,
    calendar: CalendarFile,
    weatherYear: WeatherYearFile | null,
    eventIndexYear: EventIndexYearFile | null,
    options: { showHeading: boolean; showMeta: boolean }
  ): void {
    const { definition, state, markers } = calendar;
    const gridData = buildMonthGrid(
      definition,
      year,
      monthIndex,
      state.cursorDate,
      state.todayDate,
      markers
    );

    const monthSection = parent.createDiv({ cls: "time-month-section" });

    if (options.showHeading) {
      const heading = monthSection.createDiv({ cls: "time-month-section__heading" });
      heading.createDiv({
        cls: "time-month-section__title",
        text: gridData.monthName
      });

      if (options.showMeta) {
        heading.createDiv({
          cls: "time-month-section__meta",
          text: `${year} ${getEraShortLabel(definition, { year, monthIndex, day: 1 })}`
        });
      }
    }

    this.renderWeekdayHeader(monthSection, calendar);

    const showWeekNumbers = this.shouldShowWeekNumbers();
    const grid = monthSection.createDiv({ cls: "time-month-grid" });
    grid.style.setProperty(
      "--time-columns",
      String(definition.weekdays.length + (showWeekNumbers ? 1 : 0))
    );

    gridData.rows.forEach((row) => {
      if (showWeekNumbers) {
        this.renderWeekNumberCell(
          grid,
          this.getWeekNumberForRow(
            row,
            calendar,
            { year, monthIndex, day: 1 }
          )
        );
      }
      row.forEach((cell) =>
        this.renderDayCell(grid, cell, calendar, weatherYear, eventIndexYear)
      );
    });
  }

  private renderWeekdayHeader(parent: HTMLElement, calendar: CalendarFile): void {
    const { definition } = calendar;

    const weekdayRow = parent.createDiv({ cls: "time-weekday-row" });
    const showWeekNumbers = this.shouldShowWeekNumbers();
    weekdayRow.style.setProperty(
      "--time-columns",
      String(definition.weekdays.length + (showWeekNumbers ? 1 : 0))
    );

    const availableWidth = this.contentEl.clientWidth || parent.clientWidth || 0;
    const weekdayWidth = showWeekNumbers
      ? Math.max(0, availableWidth - 48)
      : availableWidth;

    if (showWeekNumbers) {
      weekdayRow.createDiv({ cls: "time-weekday-cell time-weekday-cell--week-number", text: "#" });
    }

    definition.weekdays.forEach((weekday, index) => {
      const label = this.getWeekdayDisplayLabel(
        weekday,
        weekdayWidth,
        definition.weekdays.length
      );

      const cell = weekdayRow.createDiv({
        cls: "time-weekday-cell",
        text: label
      });
      cell.setAttr("data-weekday-index", String(index));
      cell.title = weekday;
    });
  }

  private renderDayCell(
    grid: HTMLElement,
    cellData: MonthGridCell,
    calendar: CalendarFile,
    weatherYear: WeatherYearFile | null,
    eventIndexYear: EventIndexYearFile | null
  ): void {
    const cell = grid.createDiv({ cls: "time-day-cell" });

    if (cellData.seasonColor) {
      cell.style.setProperty("--time-season-color", cellData.seasonColor);
    }

    if (!cellData.date || cellData.day === null) {
      cell.addClass("is-empty");
      return;
    }

    if (cellData.isToday) {
      cell.addClass("is-today");
    }

    if (cellData.isCursor) {
      cell.addClass("is-cursor");
    }

    const season = getSeasonForDate(calendar.definition, cellData.date);
    const weather = resolveWeatherForDate(calendar, cellData.date, weatherYear);
    const eventDots = getEventDotsForDate(eventIndexYear, cellData.date);

    cell.createDiv({
      cls: "time-day-cell__number",
      text: String(cellData.day)
    });

    const markersEl = cell.createDiv({ cls: "time-day-cell__markers" });

    eventDots.slice(0, 3).forEach((dot) => {
      const markerEl = markersEl.createDiv({ cls: "time-day-marker time-day-marker--event" });
      markerEl.style.backgroundColor = dot.color;
    });

    cellData.markers.slice(0, 3).forEach((marker) => {
      const markerEl = markersEl.createDiv({ cls: "time-day-marker" });
      markerEl.addClass(`is-${marker.tone ?? "dark"}`);
    });

    const markerLabels = cellData.markers
      .map((marker) => marker.label)
      .filter((label): label is string => Boolean(label));

    const titleParts = [
      formatLongDate(cellData.date, calendar.definition),
      season ? `Season: ${season.name}` : null,
      eventDots.length > 0 ? `${eventDots.length} event${eventDots.length === 1 ? "" : "s"}` : null,
      `${weather.tempLow}° to ${weather.tempHigh}°`,
      weather.conditionLabel,
      weather.windLabel,
      markerLabels.length > 0 ? `Entries: ${markerLabels.join(", ")}` : null
    ].filter((entry): entry is string => Boolean(entry));

    cell.title = titleParts.join(" • ");

    cell.addEventListener("click", () => {
      void this.selectDate(cellData.date);
    });

    cell.addEventListener("contextmenu", (event) => {
      event.preventDefault();

      const menu = new Menu();

      menu.addItem((item) =>
        item.setTitle("Set as today").setIcon("crosshair").onClick(() => {
          void this.plugin.updateActiveCalendarState({
            todayDate: { ...cellData.date! },
            cursorDate: { ...cellData.date! }
          });
        })
      );

      menu.addItem((item) =>
        item.setTitle("New event").setIcon("plus").onClick(() => {
          void (async () => {
            await this.plugin.updateActiveCalendarState({
              cursorDate: { ...cellData.date! }
            });
            await this.plugin.activateEventEditorView();
          })();
        })
      );

      menu.showAtMouseEvent(event);
    });
  }

  private createModeIconButton(
    parent: HTMLElement,
    mode: CalendarViewMode,
    icon: string,
    label: string,
    activeMode: CalendarViewMode
  ): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "time-calendar__mode-button" });
    button.type = "button";
    button.setAttr("aria-label", label);
    setIcon(button, icon);

    if (mode === activeMode) {
      button.addClass("is-active");
    }

    button.addEventListener("click", () => {
      void this.plugin.updateActiveCalendarState({ activeView: mode });
    });

    return button;
  }

  private createIconButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = parent.createEl("button", { cls: "time-icon-button clickable-icon" });
    button.type = "button";
    button.setAttr("aria-label", label);
    setIcon(button, icon);
    button.addEventListener("click", onClick);
    return button;
  }

  private async navigate(direction: number): Promise<void> {
    const calendar = this.getActiveCalendar();
    if (calendar === null) {
      return;
    }

    const { definition, state } = calendar;
    let nextDate: FantasyDate;

    switch (state.activeView) {
      case "week":
        nextDate = shiftDay(
          state.cursorDate,
          direction * definition.weekdays.length,
          definition
        );
        break;
      case "month":
        nextDate = shiftMonth(state.cursorDate, direction, definition);
        break;
      case "year":
      default:
        nextDate = shiftYear(state.cursorDate, direction, definition);
        break;
    }

    await this.plugin.updateActiveCalendarState({ cursorDate: nextDate });
  }

  private async selectDate(date: FantasyDate): Promise<void> {
    await this.plugin.updateActiveCalendarState({
      cursorDate: { ...date }
    });
  }

  private scrollCursorIntoView(scroller: HTMLElement): void {
    const target = scroller.querySelector<HTMLElement>(".time-day-cell.is-cursor");

    if (!target) {
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const nextTop =
      scroller.scrollTop +
      (targetRect.top - scrollerRect.top) -
      scroller.clientHeight / 2 +
      target.clientHeight / 2;

    scroller.scrollTo({
      top: Math.max(0, nextTop),
      behavior: "auto"
    });
  }

  private renderWeekNumberCell(parent: HTMLElement, weekNumber: number): void {
    const cell = parent.createDiv({
      cls: "time-week-number-cell",
      text: String(weekNumber).padStart(2, "0")
    });
    cell.title = `Week ${weekNumber}`;
  }

  private getWeekNumberForRow(
    row: MonthGridCell[],
    calendar: CalendarFile,
    fallbackDate: FantasyDate
  ): number {
    const representativeDate =
      row.find((cell) => cell.date !== null)?.date ?? fallbackDate;

    return getWeekOfYear(calendar.definition, representativeDate);
  }
  
  private getWeekdayDisplayLabel(
    weekday: string,
    availableWidth: number,
    weekdayCount: number
  ): string {
    const cellWidth = weekdayCount > 0 ? availableWidth / weekdayCount : availableWidth;

    if (cellWidth <= 48) {
      return abbreviateWeekday(weekday, 2);
    }

    if (cellWidth <= 72) {
      return abbreviateWeekday(weekday, 3);
    }

    return weekday;
  }

  private shouldShowWeekNumbers(): boolean {
    return this.plugin.settings.showCalendarWeekNumbers;
  }

  private getActiveCalendar(): CalendarFile | null {
    return this.plugin.activeCalendar;
  }
}

function abbreviateWeekday(label: string, maxChars: number): string {
  const trimmed = label.trim();
  const compact = trimmed.replace(/\s+/g, "");

  if (compact.length <= maxChars) {
    return compact;
  }

  return compact.slice(0, maxChars);
}