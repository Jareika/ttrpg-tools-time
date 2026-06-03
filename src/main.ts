import { App, Notice, Plugin, TFile } from "obsidian";
import {
  normalizeCalendarFile,
  normalizeSettings
} from "./calendar";
import { CALENDAR_DAY_VIEW_TYPE, TimeDayView } from "./day-view";
import { EVENT_EDITOR_VIEW_TYPE, TimeEventEditorView } from "./event-editor-view";
import {
  buildEventIndexYearFile,
  findEventById,
  normalizeCalendarEventDefinition,
  sortEvents
} from "./events";
import {
  CalendarEditorModal,
  CalendarManagerModal,
  TagPackEditorModal,
  TagPackManagerModal
} from "./modals";
import { TimeSettingTab } from "./settings";
import { TimeDataStore } from "./storage";
import {
  WeatherPackEditorModal,
  WeatherPackManagerModal
} from "./weather-pack-modals";
import type {
  CalendarEventDefinition,
  CalendarFile,
  CalendarState,
  EventPresetFile,
  EventIndexYearFile,
  EventYearFile,
  FantasyDate,
  TagPackFile,
  TtrpgToolsTimeSettings,
  WeatherDayEntry,
  WeatherPackFile,
  WeatherReferenceYearFile,
  WeatherSourceType,
  WeatherYearFile
} from "./types";
import { CALENDAR_VIEW_TYPE, TimeCalendarView } from "./view";
import {
  createWeatherReferenceYear,
  createWeatherYearFromReference,
  DEFAULT_WEATHER_PACK,
  normalizeWeatherPackFile,
  weatherDayKey
} from "./weather";
import { shiftDay } from "./calendar";

type AppWithInternalSettings = App & {
  setting: {
    open: () => void;
    openTabById: (id: string) => void;
  };
};

export default class TtrpgToolsTimePlugin extends Plugin {
  settings!: TtrpgToolsTimeSettings;
  activeCalendar: CalendarFile | null = null;
  private dataStore!: TimeDataStore;
  private readonly weatherPackCache = new Map<string, WeatherPackFile>();
  private readonly weatherReferenceCache = new Map<string, WeatherReferenceYearFile>();
  private readonly weatherYearCache = new Map<string, WeatherYearFile>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.dataStore = new TimeDataStore(this.app, () => this.settings);

    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf) => new TimeCalendarView(leaf, this)
    );

    this.registerView(
      CALENDAR_DAY_VIEW_TYPE,
      (leaf) => new TimeDayView(leaf, this)
    );

    this.registerView(
      EVENT_EDITOR_VIEW_TYPE,
      (leaf) => new TimeEventEditorView(leaf, this)
    );

    this.addRibbonIcon("calendar", "Open ttrpg tools: time", () => {
      void this.activateView();
    });

    this.addRibbonIcon("sun", "Open ttrpg tools: time day view", () => {
      void this.activateDayView();
    });

    this.addRibbonIcon("plus-circle", "Open ttrpg tools: time event editor", () => {
      void this.activateEventEditorView();
    });

    this.addCommand({
      id: "open-calendar-side-pane",
      name: "Open side pane",
      callback: () => {
        void this.activateView();
      }
    });

    this.addCommand({
      id: "open-day-side-pane",
      name: "Open day pane",
      callback: () => {
        void this.activateDayView();
      }
    });

    this.addCommand({
      id: "open-event-editor-tab",
      name: "Open event editor",
      callback: () => {
        void this.activateEventEditorView();
      }
    });

    this.addCommand({
      id: "jump-to-today",
      name: "Jump to today",
      callback: () => {
        void this.jumpToToday();
      }
    });

    this.addCommand({
      id: "create-calendar-json",
      name: "Create calendar JSON",
      callback: () => {
        this.openCreateCalendarModal();
      }
    });

    this.addCommand({
      id: "edit-active-calendar-json",
      name: "Edit active calendar JSON",
      callback: () => {
        this.openEditActiveCalendarModal();
      }
    });

    this.addCommand({
      id: "create-tag-pack-json",
      name: "Create tag pack JSON",
      callback: () => {
        this.openCreateTagPackModal();
      }
    });
	
    this.addCommand({
      id: "create-weather-pack-json",
      name: "Create weather pack JSON",
      callback: () => {
        this.openCreateWeatherPackModal();
      }
    });

    this.addCommand({
      id: "manage-calendars",
      name: "Manage calendars",
      callback: () => {
        this.openManageCalendarsModal();
      }
    });

    this.addCommand({
      id: "manage-tag-packs",
      name: "Manage tag packs",
      callback: () => {
        this.openManageTagPacksModal();
      }
    });
	
    this.addCommand({
      id: "manage-weather-packs",
      name: "Manage weather packs",
      callback: () => {
        this.openManageWeatherPacksModal();
      }
    });

    this.addCommand({
      id: "reload-time-data",
      name: "Reload JSON data",
      callback: () => {
        void this.reloadDataFromDisk();
      }
    });

    this.addSettingTab(new TimeSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void (async () => {
        await this.initializeData();

        if (
          this.settings.openOnStartup &&
          this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).length === 0
        ) {
          await this.activateView();
        }

        this.refreshOpenViews();
      })();
    });
  }

  onunload(): void {
    this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).forEach((leaf) => leaf.detach());
    this.app.workspace.getLeavesOfType(CALENDAR_DAY_VIEW_TYPE).forEach((leaf) => leaf.detach());
    this.app.workspace.getLeavesOfType(EVENT_EDITOR_VIEW_TYPE).forEach((leaf) => leaf.detach());
  }

  async initializeData(): Promise<void> {
    await this.dataStore.ensureBaseFolders();
    await this.ensureDefaultWeatherPack();

    const calendars = await this.dataStore.listCalendars();

    if (calendars.length === 0) {
      this.activeCalendar = null;
      return;
    }

    const active =
      (this.settings.activeCalendarId
        ? calendars.find((calendar) => calendar.id === this.settings.activeCalendarId)
        : null) ?? calendars[0];

    this.activeCalendar = active;

    if (this.settings.activeCalendarId !== active.id) {
      this.settings.activeCalendarId = active.id;
      await this.saveSettings();
    }
  }

  async reloadDataFromDisk(): Promise<void> {
    this.weatherPackCache.clear();
    this.weatherReferenceCache.clear();
    this.weatherYearCache.clear();
    await this.initializeData();
    this.refreshOpenViews();
    new Notice("Time data reloaded.");
  }

  async jumpToToday(): Promise<void> {
    if (!this.activeCalendar) {
      return;
    }

    await this.updateActiveCalendarState({
      cursorDate: { ...this.activeCalendar.state.todayDate }
    });
  }

  openCreateCalendarModal(onSaved?: () => void): void {
    new CalendarEditorModal(this, null, onSaved).open();
  }

  openEditActiveCalendarModal(onSaved?: () => void): void {
    if (!this.activeCalendar) {
      new Notice("No active calendar loaded.");
      return;
    }

    new CalendarEditorModal(this, this.activeCalendar, onSaved).open();
  }

  openEditCalendarModal(calendar: CalendarFile, onSaved?: () => void): void {
    new CalendarEditorModal(this, calendar, onSaved).open();
  }

  openCreateTagPackModal(onSaved?: () => void): void {
    new TagPackEditorModal(this, null, onSaved).open();
  }

  openEditTagPackModal(pack: TagPackFile, onSaved?: () => void): void {
    new TagPackEditorModal(this, pack, onSaved).open();
  }

  openManageCalendarsModal(): void {
    new CalendarManagerModal(this).open();
  }

  openManageTagPacksModal(): void {
    new TagPackManagerModal(this).open();
  }
  
  openCreateWeatherPackModal(onSaved?: () => void): void {
    new WeatherPackEditorModal(this, null, onSaved).open();
  }

  openManageWeatherPacksModal(): void {
    new WeatherPackManagerModal(this).open();
  }

  openPluginSettings(): void {
    const appWithInternalSettings = this.app as AppWithInternalSettings;
    appWithInternalSettings.setting.open();
    appWithInternalSettings.setting.openTabById(this.manifest.id);
  }

  async listCalendars(): Promise<CalendarFile[]> {
    return await this.dataStore.listCalendars();
  }

  async listTagPacks(): Promise<TagPackFile[]> {
    return await this.dataStore.listTagPacks();
  }

  async listWeatherPacks(): Promise<WeatherPackFile[]> {
    const packs = await this.dataStore.listWeatherPacks();
    packs.forEach((pack) => {
      this.weatherPackCache.set(pack.id, pack);
    });
    return packs;
  }
  
  async listVisibleWeatherPacks(
    calendar: CalendarFile | null = this.activeCalendar
  ): Promise<WeatherPackFile[]> {
    const packs = await this.listWeatherPacks();

    if (!calendar) {
      return packs;
    }

    const linked = new Set(calendar.linkedWeatherPackIds ?? []);

    if (linked.size === 0) {
      return packs;
    }

    if (calendar.defaultWeatherPackId) {
      linked.add(calendar.defaultWeatherPackId);
    }

    const filtered = packs.filter((pack) => linked.has(pack.id));
    return filtered.length > 0 ? filtered : packs;
  }
  
  async listEventPresets(calendarId: string): Promise<EventPresetFile[]> {
    return await this.dataStore.listEventPresets(calendarId);
  }

  async calendarExists(id: string): Promise<boolean> {
    return await this.dataStore.calendarExists(id);
  }

  async tagPackExists(id: string): Promise<boolean> {
    return await this.dataStore.tagPackExists(id);
  }

  async weatherPackExists(id: string): Promise<boolean> {
    return await this.dataStore.weatherPackExists(id);
  }

  async activateView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
    }

    if (!leaf) return;

    await leaf.setViewState({
      type: CALENDAR_VIEW_TYPE,
      active: true
    });

    await this.app.workspace.revealLeaf(leaf);
  }

  async activateDayView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(CALENDAR_DAY_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
    }

    if (!leaf) return;

    await leaf.setViewState({
      type: CALENDAR_DAY_VIEW_TYPE,
      active: true
    });

    await this.app.workspace.revealLeaf(leaf);
  }

  async activateEventEditorView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(EVENT_EDITOR_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
    }

    if (!leaf) return;

    await leaf.setViewState({
      type: EVENT_EDITOR_VIEW_TYPE,
      active: true
    });

    await this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as unknown;
    this.settings = normalizeSettings(raw);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async replaceSettings(nextSettings: TtrpgToolsTimeSettings): Promise<void> {
    this.settings = normalizeSettings(nextSettings);
    await this.saveSettings();
  }

  async setActiveCalendarById(id: string): Promise<void> {
    const calendar = await this.dataStore.loadCalendarById(id);

    if (!calendar) {
      new Notice(`Kalender "${id}" wurde nicht gefunden.`);
      return;
    }

    this.activeCalendar = calendar;
    await this.replaceSettings({
      ...this.settings,
      activeCalendarId: calendar.id
    });
    this.refreshOpenViews();
  }

  async saveCalendar(calendar: CalendarFile, setActive = false): Promise<void> {
    const normalized = normalizeCalendarFile(calendar);
    await this.dataStore.saveCalendar(normalized);

    if (setActive || this.activeCalendar?.id === normalized.id || this.activeCalendar === null) {
      this.activeCalendar = normalized;
      await this.replaceSettings({
        ...this.settings,
        activeCalendarId: normalized.id
      });
    }

    this.refreshOpenViews();
  }

  async saveTagPack(pack: TagPackFile): Promise<void> {
    await this.dataStore.saveTagPack(pack);
  }

  async saveWeatherPack(pack: WeatherPackFile): Promise<void> {
    const normalized = normalizeWeatherPackFile(pack);
    await this.dataStore.saveWeatherPack(normalized);
    this.weatherPackCache.set(normalized.id, normalized);
	this.refreshOpenViews();
  }

  async saveEventPreset(preset: EventPresetFile): Promise<void> {
    await this.dataStore.saveEventPreset(preset);
  }

  async loadWeatherPackById(id: string): Promise<WeatherPackFile | null> {
    const cached = this.weatherPackCache.get(id);
    if (cached) {
      return cached;
    }

    const pack = await this.dataStore.loadWeatherPackById(id);
    if (pack) {
      this.weatherPackCache.set(pack.id, pack);
    }
    return pack;
  }

  async loadWeatherReferenceYear(
    calendarId: string,
    weatherPackId: string,
    year: number
  ): Promise<WeatherReferenceYearFile | null> {
    const cacheKey = `${calendarId}::${weatherPackId}::${year}`;
    const cached = this.weatherReferenceCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const existing = await this.dataStore.loadWeatherReferenceYear(calendarId, weatherPackId, year);
    if (existing) {
      this.weatherReferenceCache.set(cacheKey, existing);
      return existing;
    }

    const calendar = await this.getCalendarById(calendarId);
    if (!calendar) {
      return null;
    }

    const pack =
      (await this.loadWeatherPackById(weatherPackId)) ??
      (weatherPackId === DEFAULT_WEATHER_PACK.id ? DEFAULT_WEATHER_PACK : null);

    if (!pack) {
      return null;
    }

    const reference = createWeatherReferenceYear(calendar, pack, year);
    await this.dataStore.saveWeatherReferenceYear(reference);
    this.weatherReferenceCache.set(cacheKey, reference);
    return reference;
  }

  async loadWeatherYear(calendarId: string, year: number): Promise<WeatherYearFile | null> {
    const cacheKey = `${calendarId}::${year}`;
    const cached = this.weatherYearCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const existing = await this.dataStore.loadWeatherYear(calendarId, year);
    if (existing) {
      this.weatherYearCache.set(cacheKey, existing);
      return existing;
    }

    const calendar = await this.getCalendarById(calendarId);
    if (!calendar) {
      return null;
    }

    const defaultPackId = await this.resolveDefaultWeatherPackId(calendar);
    const reference = await this.loadWeatherReferenceYear(calendarId, defaultPackId, year);

    if (!reference) {
      return null;
    }

    const weatherYear = createWeatherYearFromReference(reference);
    await this.dataStore.saveWeatherYear(weatherYear);
    this.weatherYearCache.set(cacheKey, weatherYear);
    return weatherYear;
  }

  async saveWeatherYear(file: WeatherYearFile): Promise<void> {
    await this.dataStore.saveWeatherYear(file);
    this.weatherYearCache.set(`${file.calendarId}::${file.year}`, file);
  }

  async saveWeatherDayEntry(
    calendarId: string,
    date: FantasyDate,
    entry: WeatherDayEntry
  ): Promise<void> {
    const file = await this.loadWeatherYear(calendarId, date.year);

    if (!file) {
      new Notice("Could not load day-view weather year.");
      return;
    }

    file.days[weatherDayKey(date)] = { ...entry };
    await this.saveWeatherYear(file);
    this.refreshOpenViews();
  }

  async applyWeatherPackToRange(
    calendarId: string,
    weatherPackId: string,
    startDate: FantasyDate,
    endDate: FantasyDate,
    sourceId: string,
    sourceType: WeatherSourceType = "event"
  ): Promise<void> {
    const calendar = await this.getCalendarById(calendarId);

    if (!calendar) {
      new Notice("Could not resolve calendar for weather application.");
      return;
    }

    let rangeStart = { ...startDate };
    let rangeEnd = { ...endDate };

    if (compareFantasyDates(rangeStart, rangeEnd) > 0) {
      rangeStart = { ...endDate };
      rangeEnd = { ...startDate };
    }

    const touchedYears = new Map<number, WeatherYearFile>();
    let cursor = { ...rangeStart };
    let guard = 0;

    while (compareFantasyDates(cursor, rangeEnd) <= 0 && guard < 10000) {
      const reference = await this.loadWeatherReferenceYear(calendarId, weatherPackId, cursor.year);
      const target =
        touchedYears.get(cursor.year) ?? (await this.loadWeatherYear(calendarId, cursor.year));

      if (reference && target) {
        const key = weatherDayKey(cursor);
        const sourceEntry = reference.days[key];
        const targetEntry = target.days[key];

        if (sourceEntry && !(targetEntry?.locked && targetEntry.sourceType === "manual")) {
          target.days[key] = {
            ...sourceEntry,
            sourceType,
            sourceId,
            sourcePackId: weatherPackId
          };
          touchedYears.set(cursor.year, target);
        }
      }

      cursor = shiftDay(cursor, 1, calendar.definition);
      guard += 1;
    }

    for (const file of touchedYears.values()) {
      await this.saveWeatherYear(file);
    }

    if (touchedYears.size > 0) {
      this.refreshOpenViews();
    }
  }
  
  async resetWeatherDayToDefaultPack(calendarId: string, date: FantasyDate): Promise<void> {
    const calendar = await this.getCalendarById(calendarId);
    if (!calendar) {
      new Notice("Could not resolve calendar.");
      return;
    }

    const defaultPackId = await this.resolveDefaultWeatherPackId(calendar);
    await this.applyWeatherPackToRange(
      calendarId,
      defaultPackId,
      date,
      date,
      defaultPackId,
      "pack"
    );
  }

  refreshOpenViews(): void {
    [CALENDAR_VIEW_TYPE, CALENDAR_DAY_VIEW_TYPE, EVENT_EDITOR_VIEW_TYPE].forEach((viewType) => {
      this.app.workspace.getLeavesOfType(viewType).forEach((leaf) => {
        const candidate = leaf.view as { refresh?: () => void };
        if (typeof candidate.refresh === "function") {
          candidate.refresh();
        }
      });
    });
  }

  async loadEventYear(calendarId: string, year: number): Promise<EventYearFile | null> {
    return await this.dataStore.loadEventYear(calendarId, year);
  }

  async loadEventIndexYear(calendarId: string, year: number): Promise<EventIndexYearFile | null> {
    const existing = await this.dataStore.loadEventIndexYear(calendarId, year);
    if (existing) {
      return existing;
    }

    const detail = await this.dataStore.loadEventYear(calendarId, year);
    if (!detail) {
      return null;
    }

    const calendarDefinition =
      (this.activeCalendar?.id === calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(calendarId))?.definition;
    const rebuilt = buildEventIndexYearFile(detail, calendarDefinition);
    await this.dataStore.saveEventIndexYear(rebuilt);
    return rebuilt;
  }

  async ensureEventYearFile(calendarId: string, year: number): Promise<EventYearFile> {
    const existing = await this.loadEventYear(calendarId, year);
    if (existing) {
      return existing;
    }

    const file: EventYearFile = {
      version: 1,
      kind: "event-year",
      calendarId,
      year,
      events: []
    };
    await this.dataStore.saveEventYear(file);
    const calendarDefinition =
      (this.activeCalendar?.id === calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(calendarId))?.definition;
    await this.dataStore.saveEventIndexYear(buildEventIndexYearFile(file, calendarDefinition));
    return file;
  }

  async loadEventById(
    calendarId: string,
    year: number,
    eventId: string
  ): Promise<CalendarEventDefinition | null> {
    const file = await this.loadEventYear(calendarId, year);
    return findEventById(file, eventId);
  }

  resolveStoredFileRef(ref: string): TFile | null {
    return this.app.metadataCache.getFirstLinkpathDest(ref, "") ??
      this.app.vault.getFiles().find((file) => file.name === ref || file.basename === ref) ??
      null;
  }

  async saveEvent(event: CalendarEventDefinition): Promise<void> {
    const normalized = normalizeCalendarEventDefinition(event);
    const calendarDefinition =
      (this.activeCalendar?.id === normalized.calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(normalized.calendarId))?.definition;

    const startYear = Math.min(normalized.date.year, normalized.endDate?.year ?? normalized.date.year);
    const endYear = Math.max(normalized.date.year, normalized.endDate?.year ?? normalized.date.year);

    for (let year = startYear; year <= endYear; year += 1) {
      const file = await this.ensureEventYearFile(normalized.calendarId, year);
      const existingIndex = file.events.findIndex((entry) => entry.id === normalized.id);

      if (existingIndex >= 0) {
        file.events[existingIndex] = normalized;
      } else {
        file.events.push(normalized);
      }

      file.events.sort(sortEvents);
      await this.dataStore.saveEventYear(file);
      await this.dataStore.saveEventIndexYear(buildEventIndexYearFile(file, calendarDefinition));
    }

    if (normalized.weatherPackId) {
      await this.applyWeatherPackToRange(
        normalized.calendarId,
        normalized.weatherPackId,
        normalized.date,
        normalized.endDate ?? normalized.date,
        normalized.id,
        "event"
      );
    }

    this.refreshOpenViews();
  }

  async openStoredNoteRef(ref: string): Promise<boolean> {
    const file = this.resolveStoredFileRef(ref);
    if (!file) {
      new Notice(`Could not resolve note "${ref}".`);
      return false;
    }

    await this.app.workspace.getLeaf(true).openFile(file);
    return true;
  }

  async updateActiveCalendarState(patch: Partial<CalendarState>): Promise<void> {
    if (!this.activeCalendar) {
      return;
    }

    const nextCalendar: CalendarFile = {
      ...this.activeCalendar,
      state: {
        ...this.activeCalendar.state,
        ...patch
      }
    };
    await this.saveCalendar(nextCalendar, true);
  }

  async setTagPackLinked(tagPackId: string, linked: boolean): Promise<void> {
    if (!this.activeCalendar) {
      new Notice("No active calendar loaded.");
      return;
    }

    const nextLinkedTagPackIds = new Set(this.activeCalendar.linkedTagPackIds);

    if (linked) {
      nextLinkedTagPackIds.add(tagPackId);
    } else {
      nextLinkedTagPackIds.delete(tagPackId);
    }

    await this.saveCalendar(
      {
        ...this.activeCalendar,
        linkedTagPackIds: [...nextLinkedTagPackIds]
      },
      true
    );
  }
  
  async setWeatherPackLinked(weatherPackId: string, linked: boolean): Promise<void> {
    if (!this.activeCalendar) {
      new Notice("No active calendar loaded.");
      return;
    }

    const nextLinkedWeatherPackIds = new Set(this.activeCalendar.linkedWeatherPackIds);

    if (linked) {
      nextLinkedWeatherPackIds.add(weatherPackId);
    } else {
      nextLinkedWeatherPackIds.delete(weatherPackId);
    }

    await this.saveCalendar(
      {
        ...this.activeCalendar,
        linkedWeatherPackIds: [...nextLinkedWeatherPackIds]
      },
      true
    );
  }

  async deleteCalendarById(id: string): Promise<boolean> {
    const calendars = await this.listCalendars();
    const target = calendars.find((calendar) => calendar.id === id);

    if (!target) {
      new Notice(`Calendar "${id}" was not found.`);
      return false;
    }

    if (calendars.length <= 1) {
      new Notice("You must keep at least one calendar.");
      return false;
    }

    await this.dataStore.deleteCalendar(id);

    const remaining = await this.listCalendars();
    const nextActive =
      this.settings.activeCalendarId === id
        ? remaining[0] ?? null
        : remaining.find((calendar) => calendar.id === this.settings.activeCalendarId) ??
          remaining[0] ??
          null;

    this.activeCalendar = nextActive;
    await this.replaceSettings({
      ...this.settings,
      activeCalendarId: nextActive?.id ?? null
    });

    this.refreshOpenViews();
    new Notice(`Deleted calendar "${target.name}".`);
    return true;
  }

  async deleteTagPackById(id: string): Promise<boolean> {
    const packs = await this.listTagPacks();
    const target = packs.find((pack) => pack.id === id);

    if (!target) {
      new Notice(`Tag pack "${id}" was not found.`);
      return false;
    }

    await this.dataStore.deleteTagPack(id);

    if (this.activeCalendar?.linkedTagPackIds.includes(id)) {
      await this.saveCalendar(
        {
          ...this.activeCalendar,
          linkedTagPackIds: this.activeCalendar.linkedTagPackIds.filter(
            (packId) => packId !== id
          )
        },
        true
      );
    } else {
      this.refreshOpenViews();
    }

    new Notice(`Deleted tag pack "${target.name}".`);
    return true;
  }
  
  async deleteWeatherPackById(id: string): Promise<boolean> {
    const packs = await this.listWeatherPacks();
    const target = packs.find((pack) => pack.id === id);

    if (!target) {
      new Notice(`Weather pack "${id}" was not found.`);
      return false;
    }

    if (packs.length <= 1) {
      new Notice("You must keep at least one weather pack.");
      return false;
    }

    await this.dataStore.deleteWeatherPack(id);
    this.weatherPackCache.delete(id);
    [...this.weatherReferenceCache.keys()]
      .filter((key) => key.includes(`::${id}::`))
      .forEach((key) => this.weatherReferenceCache.delete(key));

    const remaining = await this.listWeatherPacks();

    if (this.activeCalendar) {
      const nextLinkedWeatherPackIds = this.activeCalendar.linkedWeatherPackIds.filter(
        (packId) => packId !== id
      );
      const nextDefaultWeatherPackId =
        this.activeCalendar.defaultWeatherPackId === id
          ? remaining[0]?.id ?? DEFAULT_WEATHER_PACK.id
          : this.activeCalendar.defaultWeatherPackId;

      await this.saveCalendar(
        {
          ...this.activeCalendar,
          linkedWeatherPackIds: nextLinkedWeatherPackIds,
          defaultWeatherPackId: nextDefaultWeatherPackId
        },
        true
      );
    } else {
      this.refreshOpenViews();
    }

    new Notice(`Deleted weather pack "${target.name}".`);
    return true;
  }
  
  async listWeatherReferenceYears(
    calendarId: string,
    weatherPackId: string
  ): Promise<number[]> {
    return await this.dataStore.listWeatherReferenceYears(calendarId, weatherPackId);
  }

  async regenerateWeatherReferenceYear(
    calendarId: string,
    weatherPackId: string,
    year: number,
    resetDerivedYear = true
  ): Promise<boolean> {
    return await this.regenerateWeatherReferenceYearInternal(
      calendarId,
      weatherPackId,
      year,
      resetDerivedYear,
      true
    );
  }

  async regenerateAllWeatherReferenceYearsForPack(
    calendarId: string,
    weatherPackId: string,
    resetDerivedYears = true
  ): Promise<number> {
    const years = await this.listWeatherReferenceYears(calendarId, weatherPackId);
    const calendar = await this.getCalendarById(calendarId);
    const fallbackYear = calendar?.state.cursorDate.year;
    const targets =
      years.length > 0
        ? years
        : typeof fallbackYear === "number"
          ? [fallbackYear]
          : [];

    if (targets.length === 0) {
      new Notice("No reference years found for this weather pack.");
      return 0;
    }

    let regenerated = 0;

    for (const year of targets) {
      const ok = await this.regenerateWeatherReferenceYearInternal(
        calendarId,
        weatherPackId,
        year,
        resetDerivedYears,
        false
      );

      if (ok) {
        regenerated += 1;
      }
    }

    if (regenerated > 0) {
      this.refreshOpenViews();
      new Notice(
        `Regenerated ${regenerated} reference year${regenerated === 1 ? "" : "s"} for weather pack "${weatherPackId}".`
      );
    }

    return regenerated;
  }

  private async ensureDefaultWeatherPack(): Promise<void> {
    const packs = await this.dataStore.listWeatherPacks();

    if (packs.length > 0) {
      packs.forEach((pack) => {
        this.weatherPackCache.set(pack.id, pack);
      });
      return;
    }

    await this.saveWeatherPack(DEFAULT_WEATHER_PACK);
  }
  
  private async regenerateWeatherReferenceYearInternal(
    calendarId: string,
    weatherPackId: string,
    year: number,
    resetDerivedYear: boolean,
    showNotice: boolean
  ): Promise<boolean> {
    const calendar = await this.getCalendarById(calendarId);
    if (!calendar) {
      if (showNotice) {
        new Notice(`Calendar "${calendarId}" was not found.`);
      }
      return false;
    }

    const pack = await this.loadWeatherPackById(weatherPackId);
    if (!pack) {
      if (showNotice) {
        new Notice(`Weather pack "${weatherPackId}" was not found.`);
      }
      return false;
    }

    const reference = createWeatherReferenceYear(calendar, pack, year);
    await this.dataStore.saveWeatherReferenceYear(reference);
    this.weatherReferenceCache.set(`${calendarId}::${weatherPackId}::${year}`, reference);

    if (resetDerivedYear) {
      const existingYear = await this.dataStore.loadWeatherYear(calendarId, year);
      if (!existingYear || existingYear.baseWeatherPackId === weatherPackId) {
        const weatherYear = createWeatherYearFromReference(reference);
        await this.saveWeatherYear(weatherYear);
      }
    }

    if (showNotice) {
      this.refreshOpenViews();
      new Notice(
        `Regenerated reference year ${year} for weather pack "${pack.name}".`
      );
    }

    return true;
  }

  private async getCalendarById(id: string): Promise<CalendarFile | null> {
    if (this.activeCalendar?.id === id) {
      return this.activeCalendar;
    }

    return await this.dataStore.loadCalendarById(id);
  }

  private async resolveDefaultWeatherPackId(calendar: CalendarFile): Promise<string> {
    if (calendar.defaultWeatherPackId) {
      const existing = await this.loadWeatherPackById(calendar.defaultWeatherPackId);
      if (existing) {
        return existing.id;
      }
    }

    const packs = await this.listWeatherPacks();
    return packs[0]?.id ?? DEFAULT_WEATHER_PACK.id;
  }
}

function compareFantasyDates(left: FantasyDate, right: FantasyDate): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
  return left.day - right.day;
}