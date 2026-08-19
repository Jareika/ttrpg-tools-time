import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import {
  buildMonthGrid,
  formatDisplayYear,
  formatLongDate,
  getEraShortLabel,
  getEraForDate,
  getInlineIntercalaryHostMonthIndex,
  getIntercalaryDayRuleForDate,
  getMonth,
  getMonthsForYear,
  getNamedWeekForDate,
  isInlineIntercalaryDate,
  isIntercalaryMonth,
  getSeasonForDate,
  sameDate,
  getWeekIndexInMonth,
  getWeekOfYear,
  getWeekRow,
  getYearLength,
  shiftDay,
  shiftMonth,
  shiftYear
} from "./calendar";
import { getEventDotsForDate } from "./events";
import { formatTemperatureRangeForDisplay, resolveWeatherForDate } from "./weather";
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
    return this.plugin.activeCalendar?.definition.name ?? "TTRPG Tools - Time";
  }

  getIcon(): string {
    return "calendar";
  }

  onOpen(): Promise<void> {
    void this.refresh();
	return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
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
    const currentMonth = getMonth(
      definition,
      state.cursorDate.monthIndex,
      state.cursorDate.year
    );

    const rail = parent.createDiv({ cls: "time-calendar__rail" });
    const bannerImageRef = calendar.bannerImageRef?.trim();
    if (bannerImageRef) {
      const file = this.plugin.resolveStoredFileRef(bannerImageRef);
      if (file) {
        const imageUrl = this.plugin.app.vault.getResourcePath(file).replace(/"/g, '\\"');
        rail.style.setProperty("--time-calendar-rail-image", `url("${imageUrl}")`);
      }
    }

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
      text: currentMonth.name
    });
    const railMonth = rail.lastElementChild as HTMLElement;
    const monthColor = currentMonth.color;

    if (containsCjkCharacters(currentMonth.name)) {
      railMonth.addClass("is-cjk");
    }

    const monthColorSource = getComputedStyle(rail)
      .getPropertyValue("--ttrpg-time-calendar-rail-month-color-source")
      .trim()
      .toLowerCase();

    if (monthColor && monthColorSource !== "global") {
      railMonth.style.setProperty("--time-month-color", monthColor);
    }

    rail.createDiv({
      cls: "time-calendar__rail-year",
      text: formatDisplayYear(definition, state.cursorDate, "compact")
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
    const displayMonthIndex = this.getDisplayMonthIndexForDate(
      calendar,
      state.cursorDate
    );
    const month = getMonth(definition, displayMonthIndex, state.cursorDate.year);
    const namedWeek = getNamedWeekForDate(definition, state.cursorDate);
    const weekLabel =
      namedWeek ??
      `Week ${getWeekIndexInMonth(definition, state.cursorDate) + 1}`;
	
    if (isIntercalaryMonth(month) && !isInlineIntercalaryDate(definition, state.cursorDate)) {
      this.renderIntercalaryDaySection(container, calendar, state.cursorDate, eventIndexYear);
      return;
    }

    const intro = container.createDiv({ cls: "time-view-frame time-view-frame--intro" });
    intro.createDiv({
      cls: "time-view-title",
      text: month.name
    });
    const title = intro.lastElementChild as HTMLElement;
    if (month.color) {
      title.style.setProperty("--time-month-color", month.color);
    }
    intro.createDiv({
      cls: "time-view-meta",
      text: this.getCalendarSubheader(
        calendar,
        `${weekLabel} • ${formatDisplayYear(definition, state.cursorDate, "verbose")}${formatEraSuffix(definition, state.cursorDate)}`,
        state.cursorDate
      )
    });
	
    if (this.isEraDescriptionVisible(calendar)) {
      return;
    }

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
    const displayMonthIndex = this.getDisplayMonthIndexForDate(calendar, state.cursorDate);
    const month = getMonth(definition, displayMonthIndex, state.cursorDate.year);
	
    if (isIntercalaryMonth(month) && !isInlineIntercalaryDate(definition, state.cursorDate)) {
      this.renderIntercalaryDaySection(container, calendar, state.cursorDate, eventIndexYear);
      return;
    }

    const intro = container.createDiv({ cls: "time-view-frame time-view-frame--intro" });
    intro.createDiv({
      cls: "time-view-title",
      text: month.name
    });
    const title = intro.lastElementChild as HTMLElement;
    if (month.color) {
      title.style.setProperty("--time-month-color", month.color);
    }
    intro.createDiv({
      cls: "time-view-meta",
      text: this.getCalendarSubheader(
        calendar,
        `${formatDisplayYear(definition, state.cursorDate, "verbose")}${formatEraSuffix(definition, state.cursorDate)} • ${month.days} days`,
        state.cursorDate
      )
    });
	
    if (this.isEraDescriptionVisible(calendar)) {
      return;
    }

    this.renderMonthSection(
      container,
      state.cursorDate.year,
      displayMonthIndex,
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
      cls: "time-view-title time-view-title--year",
      text: formatDisplayYear(definition, state.cursorDate, "verbose")
    });
    intro.createDiv({
      cls: "time-view-meta",
      text: this.getCalendarSubheader(
        calendar,
        [
          `${getYearLength(definition, state.cursorDate.year)} days`,
          `${getMonthsForYear(definition, state.cursorDate.year).filter(
            (month) => !isIntercalaryMonth(month)
          ).length} months`,
          getEraShortLabel(definition, state.cursorDate)
        ].filter((entry) => entry.length > 0).join(" • "),
        state.cursorDate
      )
    });
	
    if (this.isEraDescriptionVisible(calendar)) {
      return;
    }

    getMonthsForYear(definition, state.cursorDate.year).forEach((month, monthIndex) => {
      if (isIntercalaryMonth(month)) {
        if (isInlineIntercalaryDate(definition, {
          year: state.cursorDate.year,
          monthIndex,
          day: 1
        })) {
          return;
        }

        this.renderIntercalaryDaySection(
          container,
          calendar,
          { year: state.cursorDate.year, monthIndex, day: 1 },
          eventIndexYear
        );
        return;
      }

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
  
  private renderIntercalaryDaySection(
    parent: HTMLElement,
    calendar: CalendarFile,
    date: FantasyDate,
    eventIndexYear: EventIndexYearFile | null
  ): void {
    const month = getMonth(calendar.definition, date.monthIndex, date.year);
    const events = getEventDotsForDate(eventIndexYear, date);
    const card = parent.createDiv({ cls: "time-intercalary-day" });
	
    if (sameDate(date, calendar.state.todayDate)) {
      card.addClass("is-today");
    }

    if (sameDate(date, calendar.state.cursorDate)) {
      card.addClass("is-cursor");
    }

    if (month.color) {
      card.style.setProperty("--time-intercalary-day-color", month.color);
    }
	
    const rule = getIntercalaryDayRuleForDate(calendar.definition, date);
    if (rule?.imageRef) {
      const file = this.plugin.resolveStoredFileRef(rule.imageRef);

      if (file) {
        const image = card.createEl("img", {
          cls: "time-intercalary-day__image"
        });
        image.src = this.plugin.app.vault.getResourcePath(file);
        image.alt = rule.name;
        image.draggable = false;
      }
    } else if (rule?.icon?.trim()) {
      const icon = card.createDiv({ cls: "time-intercalary-day__icon" });
      setIcon(icon, rule.icon);
    }

    card.createDiv({
      cls: "time-intercalary-day__title",
      text: month.name
    });
	
    if (events.length > 0) {
      const markers = card.createDiv({
        cls: "time-intercalary-day__markers"
      });

      events.slice(0, 5).forEach((event) => {
        const marker = markers.createDiv({
          cls: "time-day-marker time-day-marker--event"
        });
        marker.style.backgroundColor = event.color;
      });
    }

    const meta = [
      formatDisplayYear(calendar.definition, date, "verbose"),
      getEraShortLabel(calendar.definition, date),
      events.length > 0
        ? `${events.length} event${events.length === 1 ? "" : "s"}`
        : null
    ].filter((entry): entry is string => Boolean(entry));

    card.createDiv({
      cls: "time-intercalary-day__meta",
      text: meta.join(" • ")
    });

    card.title = formatLongDate(date, calendar.definition);
    card.addEventListener("click", () => {
      void this.selectDate(date);
    });

    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.openDateContextMenu(event, date);
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
      const title = heading.lastElementChild as HTMLElement;
      const month = getMonth(definition, monthIndex, year);
      if (month.color) {
        title.style.setProperty("--time-month-color", month.color);
      }

      if (options.showMeta) {
        heading.createDiv({
          cls: "time-month-section__meta",
          text: `${year}${formatEraSuffix(definition, { year, monthIndex, day: 1 })}`
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

    if (!cellData.date) {
      cell.addClass("is-empty");
      return;
    }

    const date = cellData.date;

    if (cellData.intercalaryDay) {
      this.renderInlineIntercalaryDayCell(cell, cellData, calendar, eventIndexYear);
      return;
    }
	
    if (cellData.day === null) {
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
    const weather = calendar.weatherEnabled
      ? resolveWeatherForDate(calendar, cellData.date, weatherYear)
      : null;
    const temperatureRange = weather
      ? formatTemperatureRangeForDisplay(
          weather.tempLow,
          weather.tempHigh,
          this.plugin.settings.temperatureUnit
        )
      : null;
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
      temperatureRange,
      weather?.conditionLabel,
      weather?.windLabel,
      markerLabels.length > 0 ? `Entries: ${markerLabels.join(", ")}` : null
    ].filter((entry): entry is string => Boolean(entry));

    cell.title = titleParts.join(" • ");

    cell.addEventListener("click", () => {
      void this.selectDate(date);
    });

    cell.addEventListener("contextmenu", (event) => {
      event.preventDefault();

      this.openDateContextMenu(event, cellData.date!);
    });
  }
  
  private renderInlineIntercalaryDayCell(
    cell: HTMLElement,
    cellData: MonthGridCell,
    calendar: CalendarFile,
    eventIndexYear: EventIndexYearFile | null
  ): void {
    const namedDay = cellData.intercalaryDay;
    const date = cellData.date;

    if (!namedDay || !date) {
      cell.addClass("is-empty");
      return;
    }

    cell.addClass("time-day-cell--intercalary");

    if (cellData.isToday) {
      cell.addClass("is-today");
    }

    if (cellData.isCursor) {
      cell.addClass("is-cursor");
    }

    if (namedDay.color) {
      cell.style.setProperty("--time-intercalary-day-color", namedDay.color);
    }

    if (namedDay.imageRef) {
      const imageFile = this.plugin.resolveStoredFileRef(namedDay.imageRef);

      if (imageFile) {
        const image = cell.createEl("img", {
          cls: "time-day-cell__holiday-image"
        });
        image.src = this.plugin.app.vault.getResourcePath(imageFile);
        image.alt = namedDay.name;
        image.draggable = false;
      }
    }

    if (!cell.querySelector(".time-day-cell__holiday-image")) {
      const icon = cell.createDiv({ cls: "time-day-cell__holiday-icon" });
      setIcon(icon, namedDay.icon?.trim() || "sparkles");
    }

    const eventDots = getEventDotsForDate(eventIndexYear, date);
    const markersEl = cell.createDiv({
      cls: "time-day-cell__markers time-day-cell__markers--intercalary"
    });

    eventDots.slice(0, 2).forEach((dot) => {
      const markerEl = markersEl.createDiv({
        cls: "time-day-marker time-day-marker--event"
      });
      markerEl.style.backgroundColor = dot.color;
    });

    cellData.markers.slice(0, 2).forEach((marker) => {
      const markerEl = markersEl.createDiv({ cls: "time-day-marker" });
      markerEl.addClass(`is-${marker.tone ?? "dark"}`);
    });

    cell.title = [
      namedDay.name,
      formatLongDate(date, calendar.definition),
      eventDots.length > 0
        ? `${eventDots.length} event${eventDots.length === 1 ? "" : "s"}`
        : null
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(" • ");

    cell.addEventListener("click", () => {
      void this.selectDate(date);
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
        nextDate = this.getAdjacentVisibleWeekDate(calendar, direction);
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
  
  private getAdjacentVisibleWeekDate(
    calendar: CalendarFile,
    direction: number
  ): FantasyDate {
    const { definition, state, markers } = calendar;
    const cursorDate = state.cursorDate;
    const cursorMonth = getMonth(
      definition,
      cursorDate.monthIndex,
      cursorDate.year
    );
    const isStandaloneIntercalaryDay =
      isIntercalaryMonth(cursorMonth) &&
      !isInlineIntercalaryDate(definition, cursorDate);

    let preferredColumn = -1;

    if (!isStandaloneIntercalaryDay) {
      const displayMonthIndex = this.getDisplayMonthIndexForDate(
        calendar,
        cursorDate
      );
      const grid = buildMonthGrid(
        definition,
        cursorDate.year,
        displayMonthIndex,
        cursorDate,
        state.todayDate,
        markers
      );
      const currentRowIndex = grid.rows.findIndex((row) =>
        row.some((cell) => sameDate(cell.date, cursorDate))
      );

      if (currentRowIndex >= 0) {
        const currentRow = grid.rows[currentRowIndex] ?? [];
        preferredColumn = currentRow.findIndex((cell) =>
          sameDate(cell.date, cursorDate)
        );

        const adjacentRow = grid.rows[currentRowIndex + direction];
        if (adjacentRow) {
          const date = this.getWeekRowTargetDate(
            adjacentRow,
            preferredColumn,
            direction
          );

          if (date) {
            return date;
          }
        }
      }
    }

    const adjacentMonthDate = this.getAdjacentWeekMonthDate(
      calendar,
      direction
    );
    const adjacentMonth = getMonth(
      definition,
      adjacentMonthDate.monthIndex,
      adjacentMonthDate.year
    );

    // Eigenständige benannte bzw. Schalttage bleiben eine eigene Wochenansicht.
    if (isIntercalaryMonth(adjacentMonth)) {
      return adjacentMonthDate;
    }

    const targetGrid = buildMonthGrid(
      definition,
      adjacentMonthDate.year,
      adjacentMonthDate.monthIndex,
      cursorDate,
      state.todayDate,
      markers
    );
    const targetRow =
      direction > 0
        ? targetGrid.rows[0]
        : targetGrid.rows[targetGrid.rows.length - 1];
    const targetDate = targetRow
      ? this.getWeekRowTargetDate(targetRow, preferredColumn, direction)
      : null;

    return targetDate ??
      shiftDay(
        cursorDate,
        direction * definition.weekdays.length,
        definition
      );
  }

  private getWeekRowTargetDate(
    row: MonthGridCell[],
    preferredColumn: number,
    direction: number
  ): FantasyDate | null {
    const sameColumnDate =
      preferredColumn >= 0
        ? row[preferredColumn]?.date ?? null
        : null;

    if (sameColumnDate) {
      return { ...sameColumnDate };
    }

    const dates: FantasyDate[] = [];

    row.forEach((cell) => {
      if (cell.date) {
        dates.push(cell.date);
      }
    });

    const fallback =
      direction > 0
        ? dates[0]
        : dates[dates.length - 1];

    return fallback ? { ...fallback } : null;
  }

  private getAdjacentWeekMonthDate(
    calendar: CalendarFile,
    direction: number
  ): FantasyDate {
    const { definition, state } = calendar;
    const displayMonthIndex = this.getDisplayMonthIndexForDate(
      calendar,
      state.cursorDate
    );
    let candidate: FantasyDate = {
      year: state.cursorDate.year,
      monthIndex: displayMonthIndex,
      day: 1
    };

    for (let guard = 0; guard < 1000; guard += 1) {
      candidate = shiftMonth(candidate, direction, definition);

      const month = getMonth(
        definition,
        candidate.monthIndex,
        candidate.year
      );

      if (!isIntercalaryMonth(month)) {
        return candidate;
      }

      if (!isInlineIntercalaryDate(definition, candidate)) {
        return candidate;
      }
    }

    return candidate;
  }

  private async selectDate(date: FantasyDate): Promise<void> {
    await this.plugin.updateActiveCalendarState({
      cursorDate: { ...date }
    });
  }

  private scrollCursorIntoView(scroller: HTMLElement): void {
    const target = scroller.querySelector<HTMLElement>(
      ".time-day-cell.is-cursor, .time-intercalary-day.is-cursor"
    );

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
  
  private getCalendarSubheader(
    calendar: CalendarFile,
    fallback: string,
    date: FantasyDate
  ): string {
    if (!calendar.state.showEraDescription) {
      return fallback;
    }

    return getEraForDate(calendar.definition, date)?.description?.trim() || fallback;
  }
  
  private isEraDescriptionVisible(calendar: CalendarFile): boolean {
    return Boolean(
      calendar.state.showEraDescription &&
      getEraForDate(
        calendar.definition,
        calendar.state.cursorDate
      )?.description?.trim()
    );
  }

  private getActiveCalendar(): CalendarFile | null {
    return this.plugin.activeCalendar;
  }
  
  private getDisplayMonthIndexForDate(
    calendar: CalendarFile,
    date: FantasyDate
  ): number {
    if (!isInlineIntercalaryDate(calendar.definition, date)) {
      return date.monthIndex;
    }

    return (
      getInlineIntercalaryHostMonthIndex(calendar.definition, date) ??
      date.monthIndex
    );
  }

  private openDateContextMenu(event: MouseEvent, date: FantasyDate): void {
    const selectedDate = { ...date };
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle("Set as today").setIcon("crosshair").onClick(() => {
        void this.plugin.updateActiveCalendarState({
          todayDate: { ...selectedDate },
          cursorDate: { ...selectedDate }
        });
      })
    );

    menu.addItem((item) =>
      item.setTitle("New event").setIcon("plus").onClick(() => {
        void this.plugin.activateEventEditorForDate(selectedDate);
      })
    );

    menu.addItem((item) =>
      item.setTitle("Open day view").setIcon("sun").onClick(() => {
        void (async () => {
          await this.plugin.updateActiveCalendarState({
            cursorDate: { ...selectedDate }
          });
          await this.plugin.activateDayView();
        })();
      })
    );

    menu.showAtMouseEvent(event);
  }
}

function containsCjkCharacters(value: string): boolean {
  return /[\u1100-\u11ff\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(value);
}

function abbreviateWeekday(label: string, maxChars: number): string {
  const trimmed = label.trim();
  const compact = trimmed.replace(/\s+/g, "");

  if (compact.length <= maxChars) {
    return compact;
  }

  return compact.slice(0, maxChars);
}

function formatEraSuffix(
  definition: CalendarFile["definition"],
  date: FantasyDate
): string {
  const eraLabel = getEraShortLabel(definition, date);
  return eraLabel ? ` ${eraLabel}` : "";
}