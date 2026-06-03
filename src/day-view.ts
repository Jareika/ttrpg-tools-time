import { ItemView, Menu, Modal, Notice, Setting, WorkspaceLeaf, setIcon } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import {
  formatDateWithPattern,
  formatLongDate,
  formatShortDate,
  getMarkersForDate,
  getSeasonForDate,
  shiftDay
} from "./calendar";
import { getEventIndexEntriesForDate } from "./events";
import {
  formatFantasyTime,
  resolveMoonPhaseTransitionsForDate,
  resolveMoonsForDate,
  resolveMoonsForMoment
} from "./moons";
import {
  getWeatherConditionLabel,
  getWeatherDayEntry,
  getWeatherIconName,
  getWeatherStateLabel,
  resolveWeatherForDate,
  WEATHER_CONDITION_OPTIONS
} from "./weather";
import { WeatherPackPickerModal } from "./weather-pack-modals";
import type {
  CalendarEventDefinition,
  CalendarFile,
  FantasyTimeOfDay,
  EventYearFile,
  MoonPhaseTransition,
  FantasyDate,
  MoonPhaseData,
  WeatherCondition,
  WeatherDayEntry,
  WeatherYearFile
} from "./types";

export const CALENDAR_DAY_VIEW_TYPE = "time-day-view";

export class TimeDayView extends ItemView {
  private readonly plugin: TtrpgToolsTimePlugin;

  constructor(leaf: WorkspaceLeaf, plugin: TtrpgToolsTimePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CALENDAR_DAY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Ttrpg tools: time day";
  }

  getIcon(): string {
    return "sun";
  }

  onOpen(): void {
    void this.refresh();
  }

  onClose(): void {
    // no-op
  }

  refresh(): void {
    this.contentEl.empty();
    this.contentEl.addClass("time-day-view");
    void this.render();
  }

  private async render(): Promise<void> {
    const root = this.contentEl.createDiv({ cls: "time-day" });
    const calendar = this.plugin.activeCalendar;

    if (!calendar) {
      const empty = root.createDiv({ cls: "time-calendar__empty" });
      empty.createEl("h2", { text: "No calendar loaded" });
      empty.createEl("p", { text: "Open or create a calendar first." });
      return;
    }

    const panel = root.createDiv({ cls: "time-day__panel" });

    const [weatherYear, eventIndexYear, eventYear] = await Promise.all([
      this.plugin.loadWeatherYear(calendar.id, calendar.state.cursorDate.year),
      this.plugin.loadEventIndexYear(calendar.id, calendar.state.cursorDate.year),
      this.plugin.loadEventYear(calendar.id, calendar.state.cursorDate.year)
    ]);

    const markers = getMarkersForDate(calendar.markers, calendar.state.cursorDate);
    const weather = resolveWeatherForDate(calendar, calendar.state.cursorDate, weatherYear);
    const season = getSeasonForDate(calendar.definition, calendar.state.cursorDate);
    const moons = resolveMoonsForDate(calendar, calendar.state.cursorDate);

    const header = panel.createDiv({ cls: "time-day__header" });
    const topbar = header.createDiv({ cls: "time-day__topbar" });

    const dateNav = topbar.createDiv({ cls: "time-day__date-nav" });

    this.createIconButton(dateNav, "chevron-left", "Previous day", () => {
      void this.navigate(-1);
    }).addClass("time-day__nav-button");

    const dateBlock = dateNav.createDiv({ cls: "time-day__date" });

    dateBlock.createDiv({
      cls: "time-day__date-main",
      text: formatDateWithPattern(
        calendar.state.cursorDate,
        calendar.definition,
        this.plugin.settings.dayViewDateFormat
      )
    });
    dateBlock.setAttr("title", formatLongDate(calendar.state.cursorDate, calendar.definition));

    const seasonBar = dateBlock.createDiv({ cls: "time-day__season-bar" });
    if (season) {
      seasonBar.style.setProperty("--time-season-color", season.color);
      seasonBar.title = season.name;
    }

    this.createIconButton(dateNav, "chevron-right", "Next day", () => {
      void this.navigate(1);
    }).addClass("time-day__nav-button");

    const actions = topbar.createDiv({ cls: "time-day__actions" });

    const weatherWrap = actions.createDiv({ cls: "time-day__weather" });
    const weatherMain = weatherWrap.createDiv({ cls: "time-day__weather-main" });

    const weatherIcon = weatherMain.createSpan();
    setIcon(weatherIcon, weather.icon);
    weatherMain.createSpan({ text: `${weather.tempHigh}°` });

    const pop = weatherWrap.createDiv({ cls: "time-day__weather-pop" });
    this.renderWeatherLine(pop, "thermometer", `${weather.tempLow}° to ${weather.tempHigh}°`);

    const stateLabel = getWeatherStateLabel(weather);
    if (stateLabel) {
      this.renderWeatherLine(pop, weather.icon, stateLabel);
    }

    this.renderWeatherLine(pop, "wind", weather.windLabel);
    this.renderWeatherLine(pop, "cloud", weather.cloudsLabel);

    if (weather.note) {
      this.renderWeatherLine(pop, "sticky-note", weather.note);
    }

    const menuButton = actions.createEl("button", {
      cls: "time-icon-button clickable-icon time-day__menu-button"
    });
    menuButton.type = "button";
    menuButton.setAttr("aria-label", "Day options");
    setIcon(menuButton, "settings");
    menuButton.addEventListener("click", (event: MouseEvent) => {
      this.openDayMenu(event, calendar, weatherYear);
    });

    const section = panel.createDiv({ cls: "time-day__section" });
    section.createDiv({
      cls: "time-day__section-title",
      text: "Events"
    });

    const events = section.createDiv({ cls: "time-day__events" });

    const indexedEvents = getEventIndexEntriesForDate(eventIndexYear, calendar.state.cursorDate);
    const eventLookup = new Map((eventYear?.events ?? []).map((event) => [event.id, event] as const));
	const dayEvents =
      indexedEvents.length > 0
        ? indexedEvents.map((event) => {
            const detail = eventLookup.get(event.id);
            return { ...event, startTime: detail?.startTime, endTime: detail?.endTime };
          })
        : collectFallbackEvents(eventYear, calendar.state.cursorDate);

    if (dayEvents.length === 0 && markers.length === 0) {
      events.createDiv({
        cls: "time-day__empty",
        text: "No entries for this day yet."
      });
    } else {
      dayEvents.forEach((event) => {
        const row = events.createDiv({ cls: "time-day__event" });
        row.title = "Double-click for details";

        const dot = row.createDiv({ cls: "time-day__event-dot" });
        dot.style.backgroundColor = event.color ?? "#4e3e3e";

        row.addEventListener("dblclick", () => {
          void this.openEventDetails(calendar, event.id);
        });

        const body = row.createDiv({ cls: "time-day__event-body" });
        body.createDiv({
          cls: "time-day__event-title",
          text: event.title
        });

        const timeLabel = buildEventTimeRangeLabel(calendar, event.startTime, event.endTime);
        if (timeLabel) {
          body.createDiv({
            cls: "time-day__event-description",
            text: timeLabel
          });
        }
      });

      markers.forEach((marker) => {
        const row = events.createDiv({ cls: "time-day__event" });

        const dot = row.createDiv({ cls: "time-day__event-dot" });
        dot.addClass(`is-${marker.tone ?? "dark"}`);

        const body = row.createDiv({ cls: "time-day__event-body" });
        body.createDiv({
          cls: "time-day__event-title",
          text: marker.label ?? "Unnamed entry"
        });

        body.createDiv({
          cls: "time-day__event-description",
          text: "Marker"
        });
      });
    }

    if (moons.length > 0) {
      this.renderMoonStrip(panel, moons);
    }
  }

  private renderMoonStrip(parent: HTMLElement, moons: MoonPhaseData[]): void {
    const wrap = parent.createDiv({ cls: "time-day__moons" });
    const list = wrap.createDiv({ cls: "time-day__moon-list" });

    moons.forEach((moon) => {
      const item = list.createDiv({ cls: "time-day__moon" });
      item.style.setProperty("--time-moon-size", `${moon.size}px`);
      item.setAttr(
        "aria-label",
        `${moon.name} — ${moon.phaseLabel} — Day ${moon.cycleDay}/${moon.cycleDays}`
      );
      item.title = `${moon.name} • ${moon.phaseLabel} • Day ${moon.cycleDay}/${moon.cycleDays}`;

      if (moon.imageRef) {
        const file = this.plugin.resolveStoredFileRef(moon.imageRef);

        if (file) {
          const image = item.createEl("img", {
            cls: "time-day__moon-image"
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
    const fallback = parent.createDiv({ cls: "time-day__moon-fallback" });
    fallback.textContent = String(moon.phaseIndex + 1);

    if (moon.color) {
      fallback.style.backgroundColor = moon.color;
    }
  }

  private openDayMenu(
    event: MouseEvent,
    calendar: CalendarFile,
    weatherYear: WeatherYearFile | null
  ): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item.setTitle("Edit day weather").setIcon("cloud").onClick(() => {
        const currentEntry = getWeatherDayEntry(weatherYear, calendar.state.cursorDate);

        if (!currentEntry) {
          new Notice("No weather entry available for this day.");
          return;
        }

        new DayWeatherEditorModal(
          this.plugin,
          calendar,
          calendar.state.cursorDate,
          currentEntry,
          () => this.refresh()
        ).open();
      })
    );

    menu.addItem((item) =>
      item.setTitle("Apply weather pack to this day").setIcon("cloud-drizzle").onClick(() => {
        new WeatherPackPickerModal(
          this.plugin,
          undefined,
          (packId) => {
            void this.plugin.applyWeatherPackToRange(
              calendar.id,
              packId,
              calendar.state.cursorDate,
              calendar.state.cursorDate,
              packId,
              "pack"
            );
          },
          "Apply weather pack to current day"
        ).open();
      })
    );

    menu.addItem((item) =>
      item.setTitle("Apply weather pack to date range").setIcon("calendar").onClick(() => {
        new ApplyWeatherPackRangeModal(
          this.plugin,
          calendar,
          calendar.state.cursorDate,
          () => this.refresh()
        ).open();
      })
    );

    menu.addItem((item) =>
      item.setTitle("Apply weather pack from this date to year end").setIcon("chevrons-right").onClick(() => {
        const endDate = getYearEndDate(calendar, calendar.state.cursorDate.year);

        new WeatherPackPickerModal(
          this.plugin,
          undefined,
          (packId) => {
            void this.plugin.applyWeatherPackToRange(
              calendar.id,
              packId,
              calendar.state.cursorDate,
              endDate,
              packId,
              "pack"
            );
          },
          "Apply weather pack from current day to year end"
        ).open();
      })
    );

    menu.addItem((item) =>
      item.setTitle("Reset day to default weather pack").setIcon("rotate-ccw").onClick(() => {
        void this.plugin.resetWeatherDayToDefaultPack(calendar.id, calendar.state.cursorDate);
      })
    );

    menu.addItem((item) =>
      item.setTitle("Open event editor").setIcon("plus-circle").onClick(() => {
        void this.plugin.activateEventEditorView();
      })
    );

    menu.addItem((item) =>
      item.setTitle("Jump to today").setIcon("crosshair").onClick(() => {
        void this.plugin.jumpToToday();
      })
    );

    menu.showAtMouseEvent(event);
  }

  private renderWeatherLine(parent: HTMLElement, icon: string, label: string): void {
    const line = parent.createDiv({ cls: "time-day__weather-line" });
    const iconEl = line.createSpan();
    setIcon(iconEl, icon);
    line.createSpan({ text: label });
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

  private async openEventDetails(calendar: CalendarFile, eventId: string): Promise<void> {
    const detail = await this.plugin.loadEventById(
      calendar.id,
      calendar.state.cursorDate.year,
      eventId
    );

    if (!detail) {
      new Notice("Could not load event details.");
      return;
    }

    const hasDescription = Boolean(detail.description?.trim());
    const hasImage = Boolean(detail.imageRef?.trim());
    const hasNote = Boolean(detail.noteRef?.trim());

    if (hasNote && !hasDescription && !hasImage) {
      await this.plugin.openStoredNoteRef(detail.noteRef!);
      return;
    }

    if (!hasDescription && !hasImage && !hasNote) {
      new Notice("No additional details available.");
      return;
    }

    new EventDetailModal(this.plugin, calendar, detail).open();
  }

  private async navigate(delta: number): Promise<void> {
    const calendar = this.getActiveCalendar();
    if (!calendar) {
      return;
    }

    await this.plugin.updateActiveCalendarState({
      cursorDate: shiftDay(calendar.state.cursorDate, delta, calendar.definition)
    });
  }

  private getActiveCalendar(): CalendarFile | null {
    return this.plugin.activeCalendar;
  }
}

class DayWeatherEditorModal extends Modal {
  private tempLow: number;
  private tempHigh: number;
  private condition: WeatherCondition;
  private windDirection: string;
  private windLabel: string;
  private cloudsLabel: string;
  private precipitationLabel: string;
  private icon: string;
  private note: string;
  private locked: boolean;
  private readonly sourcePackId?: string;

  constructor(
    private readonly plugin: TtrpgToolsTimePlugin,
    private readonly calendar: CalendarFile,
    private readonly date: FantasyDate,
    private readonly currentEntry: WeatherDayEntry,
    private readonly onSaved?: () => void
  ) {
    super(plugin.app);

    this.tempLow = currentEntry.tempLow;
    this.tempHigh = currentEntry.tempHigh;
    this.condition = currentEntry.condition;
    this.windDirection = currentEntry.windDirection;
    this.windLabel = currentEntry.windLabel;
    this.cloudsLabel = currentEntry.cloudsLabel;
    this.precipitationLabel = currentEntry.precipitationLabel;
    this.icon = currentEntry.icon;
    this.note = currentEntry.note ?? "";
    this.locked = currentEntry.locked ?? false;
    this.sourcePackId = currentEntry.sourcePackId;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", {
      text: `Edit weather • ${formatShortDate(this.date)}`
    });

    new Setting(contentEl)
      .setName("Temperature low")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.tempLow));
        text.onChange((value) => {
          this.tempLow = Math.round(Number(value) || 0);
        });
      });

    new Setting(contentEl)
      .setName("Temperature high")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.tempHigh));
        text.onChange((value) => {
          this.tempHigh = Math.round(Number(value) || 0);
        });
      });

    new Setting(contentEl)
      .setName("Condition")
      .addDropdown((dropdown) => {
        WEATHER_CONDITION_OPTIONS.forEach((condition) => {
          dropdown.addOption(condition, getWeatherConditionLabel(condition));
        });

        dropdown.setValue(this.condition);
        dropdown.onChange((value) => {
          const next = value as WeatherCondition;
          this.condition = next;
          if (this.icon.trim().length === 0 || this.icon === getWeatherIconName(this.currentEntry.condition)) {
            this.icon = getWeatherIconName(next);
          }
        });
      });

    new Setting(contentEl)
      .setName("Precipitation text")
      .addText((text) => {
        text.setValue(this.precipitationLabel);
        text.onChange((value) => {
          this.precipitationLabel = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Wind direction")
      .addText((text) => {
        text.setValue(this.windDirection);
        text.onChange((value) => {
          this.windDirection = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Wind text")
      .addText((text) => {
        text.setValue(this.windLabel);
        text.onChange((value) => {
          this.windLabel = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Sky text")
      .addText((text) => {
        text.setValue(this.cloudsLabel);
        text.onChange((value) => {
          this.cloudsLabel = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Icon")
      .setDesc("Any Obsidian icon name.")
      .addText((text) => {
        text.setValue(this.icon);
        text.onChange((value) => {
          this.icon = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Note")
      .addTextArea((text) => {
        text.setValue(this.note);
        text.inputEl.rows = 3;
        text.onChange((value) => {
          this.note = value;
        });
      });

    new Setting(contentEl)
      .setName("Locked")
      .setDesc("Manual event/weather applications will not overwrite this day.")
      .addToggle((toggle) => {
        toggle.setValue(this.locked);
        toggle.onChange((value) => {
          this.locked = value;
        });
      });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => {
        void this.submit();
      });
    });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => {
        this.close();
      });
    });
  }

  private async submit(): Promise<void> {
    const low = Math.min(this.tempLow, this.tempHigh);
    const high = Math.max(this.tempLow, this.tempHigh);

    await this.plugin.saveWeatherDayEntry(this.calendar.id, this.date, {
      tempLow: low,
      tempHigh: high,
      condition: this.condition,
      windDirection: this.windDirection.trim().length > 0 ? this.windDirection.trim() : "—",
      windLabel: this.windLabel.trim().length > 0 ? this.windLabel.trim() : "No data",
      cloudsLabel: this.cloudsLabel.trim().length > 0 ? this.cloudsLabel.trim() : "No data",
      precipitationLabel:
        this.precipitationLabel.trim().length > 0 ? this.precipitationLabel.trim() : "None",
      icon: this.icon.trim().length > 0 ? this.icon.trim() : getWeatherIconName(this.condition),
      note: this.note.trim().length > 0 ? this.note.trim() : undefined,
      sourceType: "manual",
      sourceId: "manual",
      sourcePackId: this.sourcePackId,
      locked: this.locked
    });

    this.close();
    this.onSaved?.();
    new Notice(`Saved weather for ${formatShortDate(this.date)}.`);
  }
}

class ApplyWeatherPackRangeModal extends Modal {
  private startDate: FantasyDate;
  private endDate: FantasyDate;
  private selectedPackId = "";

  constructor(
    private readonly plugin: TtrpgToolsTimePlugin,
    private readonly calendar: CalendarFile,
    initialDate: FantasyDate,
    private readonly onApplied?: () => void
  ) {
    super(plugin.app);
    this.startDate = { ...initialDate };
    this.endDate = { ...initialDate };
    this.selectedPackId = calendar.defaultWeatherPackId ?? "";
  }

  onOpen(): void {
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const packs = await this.plugin.listVisibleWeatherPacks(this.calendar);

    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", { text: "Apply weather pack to date range" });

    if (packs.length === 0) {
      contentEl.createEl("p", {
        text: "No visible weather packs are available for this calendar."
      });

      const footer = contentEl.createDiv({ cls: "time-modal__footer" });
      new Setting(footer).addButton((button) => {
        button.setButtonText("Close");
        button.onClick(() => this.close());
      });
      return;
    }

    if (!packs.some((pack) => pack.id === this.selectedPackId)) {
      this.selectedPackId = packs[0]?.id ?? "";
    }

    new Setting(contentEl)
      .setName("Weather pack")
      .setDesc("Visible weather packs for the active calendar.")
      .addDropdown((dropdown) => {
        packs.forEach((pack) => {
          dropdown.addOption(pack.id, pack.name);
        });
        dropdown.setValue(this.selectedPackId);
        dropdown.onChange((value) => {
          this.selectedPackId = value;
        });
      });

    contentEl.createEl("h3", { text: "Start date" });
    renderFantasyDateInputs(contentEl, this.calendar, this.startDate, (nextDate) => {
      this.startDate = nextDate;
    });

    contentEl.createEl("h3", { text: "End date" });
    renderFantasyDateInputs(contentEl, this.calendar, this.endDate, (nextDate) => {
      this.endDate = nextDate;
    });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Apply");
      button.setCta();
      button.onClick(() => {
        void this.submit();
      });
    });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private async submit(): Promise<void> {
    const start = { ...this.startDate };
    const end = { ...this.endDate };

    if (compareFantasyDate(start, end) > 0) {
      new Notice("The end date must not be before the start date.");
      return;
    }

    await this.plugin.applyWeatherPackToRange(
      this.calendar.id,
      this.selectedPackId,
      start,
      end,
      this.selectedPackId,
      "pack"
    );

    this.close();
    this.onApplied?.();
    new Notice(
      `Applied weather pack from ${formatShortDate(start)} to ${formatShortDate(end)}.`
    );
  }
}

class EventDetailModal extends Modal {
  constructor(
    private readonly plugin: TtrpgToolsTimePlugin,
    private readonly calendar: CalendarFile,
    private readonly event: CalendarEventDefinition
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal", "time-event-detail");

    const header = contentEl.createDiv({ cls: "time-event-detail__header" });
    const main = header.createDiv({ cls: "time-event-detail__header-main" });
    main.createEl("h2", { text: this.event.title });
    main.createEl("p", {
      cls: "time-event-editor__meta",
      text: buildEventDateRangeLabel(this.calendar, this.event)
    });

    const timeLabel = buildEventTimeRangeLabel(this.calendar, this.event.startTime, this.event.endTime);
    if (timeLabel) {
      main.createEl("p", {
        cls: "time-event-editor__meta",
        text: `Time: ${timeLabel}`
      });
    }

    const moonPanel = header.createDiv({ cls: "time-event-detail__moon-panel" });
    const moons = this.event.startTime
      ? resolveMoonsForMoment(this.calendar, this.event.date, this.event.startTime)
      : resolveMoonsForDate(this.calendar, this.event.date);

    if (moons.length > 0) {
      const moonList = moonPanel.createDiv({ cls: "time-day__moon-list" });
      moons.forEach((moon) => {
        const item = moonList.createDiv({ cls: "time-day__moon" });
        item.style.setProperty("--time-moon-size", `${moon.size}px`);
        item.title = `${moon.name} • ${moon.phaseLabel}${moon.timeLabel ? ` • ${moon.timeLabel}` : ""}`;

        if (moon.imageRef) {
          const imageFile = this.plugin.resolveStoredFileRef(moon.imageRef);
          if (imageFile) {
            const image = item.createEl("img", {
              cls: "time-day__moon-image"
            });
            image.src = this.plugin.app.vault.getResourcePath(imageFile);
            image.alt = `${moon.name} — ${moon.phaseLabel}`;
            image.draggable = false;
          } else {
            renderMoonFallback(item, moon);
          }
        } else {
          renderMoonFallback(item, moon);
        }
      });
    }

    const transitions = resolveMoonPhaseTransitionsForDate(this.calendar, this.event.date);
    if (transitions.length > 0) {
      renderMoonTransitions(moonPanel, transitions);
    }

    if (this.event.imageRef) {
      const imageFile = this.plugin.resolveStoredFileRef(this.event.imageRef);
      if (imageFile) {
        const image = contentEl.createEl("img", {
          cls: "time-event-detail__image"
        });
        image.src = this.plugin.app.vault.getResourcePath(imageFile);
        image.alt = this.event.title;
      }
    }

    if (this.event.description?.trim()) {
      contentEl.createDiv({
        cls: "time-event-detail__description",
        text: this.event.description
      });
    }

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    if (this.event.noteRef) {
      const openButton = footer.createEl("button", {
        cls: "time-manager__button mod-cta",
        text: "Open note"
      });
      openButton.type = "button";
      openButton.addEventListener("click", () => {
        void (async () => {
          await this.plugin.openStoredNoteRef(this.event.noteRef!);
          this.close();
        })();
      });
    }

    const closeButton = footer.createEl("button", {
      cls: "time-manager__button",
      text: "Close"
    });
    closeButton.type = "button";
    closeButton.addEventListener("click", () => this.close());
  }
}

function renderMoonFallback(parent: HTMLElement, moon: MoonPhaseData): void {
  const fallback = parent.createDiv({ cls: "time-day__moon-fallback" });
  fallback.textContent = String(moon.phaseIndex + 1);

  if (moon.color) {
    fallback.style.backgroundColor = moon.color;
  }
}

function renderMoonTransitions(parent: HTMLElement, transitions: MoonPhaseTransition[]): void {
  const wrap = parent.createDiv({ cls: "time-event-detail__moon-transitions" });
  wrap.createDiv({
    cls: "time-event-detail__moon-transitions-title",
    text: "Phase changes today"
  });

  transitions.forEach((transition) => {
    wrap.createDiv({
      cls: "time-event-detail__moon-transition",
      text: `${transition.timeLabel} • ${transition.name}: ${transition.phaseLabel}`
    });
  });
}

function buildEventDateRangeLabel(calendar: CalendarFile, event: CalendarEventDefinition): string {
  const start = formatLongDate(event.date, calendar.definition);

  if (!event.endDate) {
    return start;
  }

  const end = formatLongDate(event.endDate, calendar.definition);
  return compareFantasyDate(event.date, event.endDate) !== 0
    ? `${start} → ${end}`
    : start;
}

function buildEventTimeRangeLabel(
  calendar: CalendarFile,
  startTime?: FantasyTimeOfDay,
  endTime?: FantasyTimeOfDay
): string | null {
  if (!startTime) {
    return null;
  }

  const start = formatFantasyTime(startTime, calendar.definition);
  const end = endTime ? formatFantasyTime(endTime, calendar.definition) : null;
  return end ? `${start} – ${end}` : start;
}

function collectFallbackEvents(
  eventYear: EventYearFile | null,
  date: FantasyDate
): Array<{ id: string; title: string; color: string; startTime?: FantasyTimeOfDay; endTime?: FantasyTimeOfDay }> {
  if (!eventYear) {
    return [];
  }

  return eventYear.events
    .filter((event) => isEventOnDate(event, date))
    .map((event) => ({
      id: event.id,
      title: event.title,
      color: event.color ?? "#4e3e3e",
      startTime: event.startTime,
      endTime: event.endTime
    }));
}

function isEventOnDate(event: CalendarEventDefinition, date: FantasyDate): boolean {
  const endDate = event.endDate ?? event.date;
  return compareFantasyDate(event.date, date) <= 0 && compareFantasyDate(date, endDate) <= 0;
}

function compareFantasyDate(left: FantasyDate, right: FantasyDate): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
  return left.day - right.day;
}

function renderFantasyDateInputs(
  parent: HTMLElement,
  calendar: CalendarFile,
  date: FantasyDate,
  onChange: (date: FantasyDate) => void
): void {
  const row = parent.createDiv({ cls: "time-inline-fields time-inline-fields--triple" });

  createNumberField(row, "Year", String(date.year), (value) => {
    const nextDate = {
      ...date,
      year: Math.trunc(value)
    };
    date.year = nextDate.year;
    onChange(nextDate);
  });

  const monthField = row.createDiv({ cls: "time-inline-field" });
  monthField.createEl("label", {
    cls: "time-inline-field__label",
    text: "Month"
  });

  const monthSelect = monthField.createEl("select", {
    cls: "time-inline-field__input"
  });

  calendar.definition.months.forEach((month, index) => {
    const option = monthSelect.ownerDocument.createElement("option");
    option.value = String(index);
    option.text = month.name;
    monthSelect.add(option);
  });

  monthSelect.value = String(date.monthIndex);
  monthSelect.addEventListener("change", () => {
    const nextDate = {
      ...date,
      monthIndex: Math.max(0, Number(monthSelect.value) || 0)
    };
    date.monthIndex = nextDate.monthIndex;
    onChange(nextDate);
  });

  createNumberField(row, "Day", String(date.day), (value) => {
    const nextDate = {
      ...date,
      day: Math.max(1, Math.trunc(value))
    };
    date.day = nextDate.day;
    onChange(nextDate);
  });
}

function createNumberField(
  parent: HTMLElement,
  label: string,
  value: string,
  onChange: (value: number) => void
): void {
  const field = parent.createDiv({ cls: "time-inline-field" });
  field.createEl("label", {
    cls: "time-inline-field__label",
    text: label
  });

  const input = field.createEl("input", {
    cls: "time-inline-field__input"
  });
  input.type = "number";
  input.value = value;
  input.addEventListener("input", () => {
    onChange(Number(input.value) || 0);
  });
}

function getYearEndDate(calendar: CalendarFile, year: number): FantasyDate {
  const lastMonthIndex = Math.max(0, calendar.definition.months.length - 1);
  return {
    year,
    monthIndex: lastMonthIndex,
    day: calendar.definition.months[lastMonthIndex]?.days ?? 1
  };
}