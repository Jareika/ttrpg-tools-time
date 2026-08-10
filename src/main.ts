import { App, MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import {
  clampDate,
  normalizeFantasyClockState,
  normalizeCalendarFile,
  normalizeSettings,
  sameDate,
  shiftDay
} from "./calendar";
import { CONTROL_VIEW_TYPE, TimeControlView } from "./control-view";
import { CALENDAR_DAY_VIEW_TYPE, TimeDayView } from "./day-view";
import { EventExplorerModal } from "./event-explorer-modal";
import { EVENT_EDITOR_VIEW_TYPE, TimeEventEditorView } from "./event-editor-view";
import {
  createEventId,
  expandRecurringEventForYear,
  buildEventIndexYearFile,
  buildEventIndexYearFromRecurrenceIndex,
  buildEventRecurrenceIndexFile,
  estimateRecurringEventEndYear,
  getRecurringOccurrenceIndex,
  hasRecurringItemsInEventIndexYear,
  mergeEventIndexYears,
  normalizeCalendarEventDefinition,
  stripRecurringItemsFromEventIndexYear,
  sortEvents
} from "./events";
import {
  CalendarEditorModal,
  CalendarManagerModal,
  TagPackEditorModal,
  TagPackManagerModal
} from "./modals";
import { FrontmatterManagerModal } from "./frontmatter-modals";
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
  EventRecurrenceIndexFile,
  EventDeleteMode,
  EventYearFile,
  FantasyClockEntry,
  FantasyClockState,
  FantasyDate,
  TagPackFile,
  TimeAdvanceButtonConfig,
  TtrpgToolsTimeSettings,
  WeatherDayEntry,
  WeatherPackFile,
  WeatherReferenceYearFile,
  WeatherSourceType,
  WeatherYearFile
} from "./types";
import {
  TIMELINE_FILTER_VIEW_TYPE,
  TIMELINE_VIEW_TYPE,
  TimeTimelineFilterView,
  TimeTimelineView
} from "./timeline-view";
import {
  buildTimelinePublishPayloadFromBlock,
  renderTimelineCodeBlock,
  type TimeTimelineLayout,
  type TimeTimelinePublishPayload
} from "./timeline-embed";
import { CALENDAR_VIEW_TYPE, TimeCalendarView } from "./view";
import {
  createWeatherReferenceYear,
  createWeatherYearFromReference,
  DEFAULT_WEATHER_PACK,
  normalizeWeatherPackFile,
  weatherDayKey
} from "./weather";
import {
  applyEventToFrontmatter,
  buildFrontmatterImportCandidate,
  getFrontmatterImportConfigurationError
} from "./frontmatter";

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
  private readonly recurrenceIndexCache = new Map<string, EventRecurrenceIndexFile>();
  private fantasyClock: FantasyClockState = { byCalendarId: {} };
  private lastMarkdownLeaf: WorkspaceLeaf | null = null;
  private timelineLayoutMode: "vertical" | "horizontal" = "vertical";
  private readonly timelineIncludedTagRefs = new Set<string>();
  private readonly timelineExcludedTagRefs = new Set<string>();
  private pendingActiveCalendarStateSaveTimer: number | null = null;

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
	
    this.registerView(
      CONTROL_VIEW_TYPE,
      (leaf) => new TimeControlView(leaf, this)
    );
	
    this.registerView(
      TIMELINE_VIEW_TYPE,
      (leaf) => new TimeTimelineView(leaf, this)
    );

    this.registerView(
      TIMELINE_FILTER_VIEW_TYPE,
      (leaf) => new TimeTimelineFilterView(leaf, this)
    );
	
    this.registerMarkdownCodeBlockProcessor("time-timeline-cal", (src, el, ctx) => {
      void renderTimelineCodeBlock(this, src, "cal", el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor("time-timeline-h", (src, el, ctx) => {
      void renderTimelineCodeBlock(this, src, "h", el, ctx);
    });

    this.addRibbonIcon("calendar", "Open TTRPG Tools - Time", () => {
      void this.activateView();
    });

    this.addRibbonIcon("sun", "Open TTRPG Tools - Time: day view", () => {
      void this.activateDayView();
    });

    this.addRibbonIcon("plus-circle", "Open TTRPG Tools - Time: Event editor", () => {
      void this.activateEventEditorView();
    });
	
    this.addRibbonIcon("command", "Open TTRPG Tools - Time: Controls", () => {
      void this.activateControlView();
    });
	
    this.addRibbonIcon("milestone", "Open TTRPG Tools - Time: Timeline", () => {
      void this.activateTimelineView();
    });

    this.addRibbonIcon("tags", "Open TTRPG Tools - Time: Timeline filters", () => {
      void this.activateTimelineFilterView();
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
      id: "open-event-explorer",
      name: "Open event explorer",
      callback: () => {
        this.openEventExplorerModal();
      }
    });
	
    this.addCommand({
      id: "open-control-pane",
      name: "Open control pane",
      callback: () => {
        void this.activateControlView();
      }
    });

    this.addCommand({
      id: "open-timeline-side-pane",
      name: "Open timeline view",
      callback: () => {
        void this.activateTimelineView();
      }
    });

    this.addCommand({
      id: "open-timeline-filter-pane",
      name: "Open timeline filter pane",
      callback: () => {
        void this.activateTimelineFilterView();
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

    this.addSettingTab(new TimeSettingTab(this.app, this));
	this.app.workspace.trigger("parse-style-settings");
	
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView) {
        this.lastMarkdownLeaf = leaf;
      }
    }));

    this.app.workspace.onLayoutReady(() => {
      void (async () => {
        await this.initializeData();

        this.refreshOpenViews();
      })();
    });
  }

  onunload(): void {
    void this.flushPendingActiveCalendarStateSave();
	
    this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE).forEach((leaf) => leaf.detach());
    this.app.workspace.getLeavesOfType(CALENDAR_DAY_VIEW_TYPE).forEach((leaf) => leaf.detach());
    this.app.workspace.getLeavesOfType(EVENT_EDITOR_VIEW_TYPE).forEach((leaf) => leaf.detach());
	this.app.workspace.getLeavesOfType(CONTROL_VIEW_TYPE).forEach((leaf) => leaf.detach());
    this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE).forEach((leaf) => leaf.detach());
    this.app.workspace.getLeavesOfType(TIMELINE_FILTER_VIEW_TYPE).forEach((leaf) => leaf.detach());
  }

  async initializeData(): Promise<void> {
    await this.dataStore.ensureBaseFolders();
    await this.ensureDefaultWeatherPack();
	this.clearTimelineTagFilters(false);

    const calendars = await this.dataStore.listCalendars();

    if (calendars.length === 0) {
      this.activeCalendar = null;
      return;
    }
	
	await this.migrateLegacyEventStorage(calendars);

    const active =
      (this.settings.activeCalendarId
        ? calendars.find((calendar) => calendar.id === this.settings.activeCalendarId)
        : null) ?? calendars[0];

    this.activeCalendar = active;
	this.clearTimelineTagFilters(false);
	
    if (active) {
      await this.ensureWeatherReferencesForCalendarYear(active, active.state.cursorDate.year);
    }

    if (this.settings.activeCalendarId !== active.id) {
      this.settings.activeCalendarId = active.id;
      await this.saveSettings();
    }
  }

  async reloadDataFromDisk(): Promise<void> {
	await this.flushPendingActiveCalendarStateSave();
    this.weatherPackCache.clear();
    this.weatherReferenceCache.clear();
    this.weatherYearCache.clear();
	this.recurrenceIndexCache.clear();
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

  openFrontmatterManagerModal(): void {
    new FrontmatterManagerModal(this).open();
  }
  
  openEventExplorerModal(): void {
    if (!this.activeCalendar) {
      new Notice("No active calendar loaded.");
      return;
    }

    new EventExplorerModal(this, this.activeCalendar).open();
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
	
    if (!calendar.weatherEnabled) {
      return [];
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
  
  async listEventExplorerYears(calendarId: string): Promise<number[]> {
    const calendar =
      this.activeCalendar?.id === calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(calendarId);

    if (!calendar) {
      return [];
    }

    const sourceEvents = await this.dataStore.listEventSources(calendarId);
    if (sourceEvents.length === 0) {
      return [calendar.state.cursorDate.year];
    }

    const years = new Set<number>();
    sourceEvents.forEach((event) => {
      getIndexedYearsForEventSource(event, calendar).forEach((year) => years.add(year));
    });

    return [...years].sort((left, right) => left - right);
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
  
  async activateTimelineView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
    }

    if (!leaf) return;

    await leaf.setViewState({
      type: TIMELINE_VIEW_TYPE,
      active: true
    });

    await this.app.workspace.revealLeaf(leaf);
  }

  async activateTimelineFilterView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(TIMELINE_FILTER_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(true);
    }

    if (!leaf) return;

    await leaf.setViewState({ type: TIMELINE_FILTER_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  
  async activateControlView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(CONTROL_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
    }

    if (!leaf) return;

    await leaf.setViewState({
      type: CONTROL_VIEW_TYPE,
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

  async activateEventEditorView(eventToEdit?: CalendarEventDefinition): Promise<void> {
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

    if (eventToEdit) {
      const candidate = leaf.view as { editEvent?: (event: CalendarEventDefinition) => void };
      candidate.editEvent?.(eventToEdit);
    }
  }
  
  async activateEventEditorForDate(date: FantasyDate): Promise<void> {
    const calendar = this.activeCalendar;

    if (!calendar) {
      new Notice("No active calendar loaded.");
      return;
    }

    const normalizedDate = clampDate(date, calendar.definition);

    await this.updateActiveCalendarState({
      cursorDate: { ...normalizedDate }
    });

    await this.activateEventEditorView();

    const leaf = this.app.workspace.getLeavesOfType(EVENT_EDITOR_VIEW_TYPE)[0];
    if (!leaf) {
      return;
    }

    const editor = leaf.view as { createEventForDate?: (seedDate: FantasyDate) => void };
    editor.createEventForDate?.({ ...normalizedDate });
  }

  async activateEventEditorForEvent(
    calendarId: string,
    year: number,
    eventId: string
  ): Promise<void> {
    const detail = await this.loadEventById(calendarId, year, eventId);

    if (!detail) {
      new Notice("Could not load event for editing.");
      return;
    }

    await this.activateEventEditorView(detail);
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as unknown;
    const record = asRecord(raw);
    const settingsSource = isRecord(record.settings) ? record.settings : raw;
    this.settings = normalizeSettings(settingsSource);
    this.fantasyClock = normalizeFantasyClockState(record.fantasyClock);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      settings: this.settings,
      fantasyClock: this.fantasyClock
    });
  }

  async replaceSettings(nextSettings: TtrpgToolsTimeSettings): Promise<void> {
    this.settings = normalizeSettings(nextSettings);
    await this.saveSettings();
  }
  
  getConfiguredTimeAdvanceButtons(): TimeAdvanceButtonConfig[] {
    return this.settings.controlTimeButtons
      .filter((button) => button.hours !== 0 || button.minutes !== 0)
      .map((button) => ({ ...button }));
  }

  getFantasyClock(calendar: CalendarFile | null = this.activeCalendar): FantasyClockEntry | null {
    if (!calendar || !calendar.definition.time.enabled) {
      return null;
    }

    const minutesPerHour = Math.max(1, Math.trunc(calendar.definition.time.minutesPerHour || 60));
    const hoursPerDay = Math.max(1, Math.trunc(calendar.definition.time.hoursPerDay || 24));
    const totalMinutesPerDay = hoursPerDay * minutesPerHour;
    const stored = this.fantasyClock.byCalendarId[calendar.id];

    if (!stored) {
      return {
        hour: 0,
        minute: 0
      };
    }

    const totalMinutes = mod(
      Math.trunc(stored.hour || 0) * minutesPerHour + Math.trunc(stored.minute || 0),
      totalMinutesPerDay
    );

    return {
      hour: Math.floor(totalMinutes / minutesPerHour),
      minute: totalMinutes % minutesPerHour
    };
  }

  async advanceFantasyClock(hoursDelta: number, minutesDelta = 0): Promise<void> {
    const calendar = this.activeCalendar;

    if (!calendar) {
      new Notice("No active calendar loaded.");
      return;
    }

    if (!calendar.definition.time.enabled) {
      new Notice("The active calendar has no time system enabled.");
      return;
    }

    const minutesPerHour = Math.max(1, Math.trunc(calendar.definition.time.minutesPerHour || 60));
    const hoursPerDay = Math.max(1, Math.trunc(calendar.definition.time.hoursPerDay || 24));
    const totalMinutesPerDay = hoursPerDay * minutesPerHour;
    const currentClock = this.getFantasyClock(calendar) ?? { hour: 0, minute: 0 };
    const currentTotalMinutes = currentClock.hour * minutesPerHour + currentClock.minute;
    const deltaMinutes =
      Math.trunc(hoursDelta || 0) * minutesPerHour + Math.trunc(minutesDelta || 0);
    const nextAbsoluteMinutes = currentTotalMinutes + deltaMinutes;
    const nextMinuteOfDay = mod(nextAbsoluteMinutes, totalMinutesPerDay);
    const dayDelta = Math.floor(nextAbsoluteMinutes / totalMinutesPerDay);

    this.fantasyClock.byCalendarId[calendar.id] = {
      hour: Math.floor(nextMinuteOfDay / minutesPerHour),
      minute: nextMinuteOfDay % minutesPerHour
    };

    if (dayDelta !== 0) {
      const nextTodayDate = shiftDay(calendar.state.todayDate, dayDelta, calendar.definition);
      await this.saveCalendar(
        {
          ...calendar,
          state: {
            ...calendar.state,
            todayDate: nextTodayDate,
            cursorDate: nextTodayDate
          }
        },
        true
      );
      return;
    }

    await this.saveSettings();
    this.refreshOpenViews();
  }

  async insertTextAtLastMarkdownCursor(text: string): Promise<boolean> {
    const targetLeaf = this.lastMarkdownLeaf;

    if (targetLeaf?.view instanceof MarkdownView) {
      await this.app.workspace.revealLeaf(targetLeaf);

      const editor = targetLeaf.view.editor;
      const cursor = editor.getCursor();
      editor.replaceRange(text, cursor);
      editor.focus();
      return true;
    }

    const activeMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (!activeMarkdownView) {
      new Notice("No Markdown editor available for timeline insertion.");
      return false;
    }

    const editor = activeMarkdownView.editor;
    const cursor = editor.getCursor();
    editor.replaceRange(text, cursor);
    editor.focus();
    return true;
  }

  async setActiveCalendarById(id: string): Promise<void> {
	await this.flushPendingActiveCalendarStateSave();
    const calendar = await this.dataStore.loadCalendarById(id);

    if (!calendar) {
      new Notice(`Kalender "${id}" wurde nicht gefunden.`);
      return;
    }

    this.activeCalendar = calendar;
	this.clearTimelineTagFilters(false);
    await this.replaceSettings({
      ...this.settings,
      activeCalendarId: calendar.id
    });
	
	await this.ensureWeatherReferencesForCalendarYear(calendar, calendar.state.cursorDate.year);
    this.refreshOpenViews();
  }

  async saveCalendar(calendar: CalendarFile, setActive = false): Promise<void> {
	await this.flushPendingActiveCalendarStateSave();
    const normalized = normalizeCalendarFile(calendar);
    await this.dataStore.saveCalendar(normalized);

    if (setActive || this.activeCalendar?.id === normalized.id || this.activeCalendar === null) {
      this.activeCalendar = normalized;
      await this.replaceSettings({
        ...this.settings,
        activeCalendarId: normalized.id
      });
    }
	this.clearTimelineTagFilters(false);
	
    if (this.activeCalendar?.id === normalized.id) {
      await this.ensureWeatherReferencesForCalendarYear(normalized, normalized.state.cursorDate.year);
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
    const calendar = await this.getCalendarById(calendarId);
    if (!calendar || !calendar.weatherEnabled) {
      return null;
    }

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
    sourceType: WeatherSourceType = "event",
    refreshViews = true
  ): Promise<void> {
    const calendar = await this.getCalendarById(calendarId);

    if (!calendar) {
      new Notice("Could not resolve calendar for weather application.");
      return;
    }
	
    if (!calendar.weatherEnabled) {
      new Notice("Weather is disabled for this calendar.");
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

    if (touchedYears.size > 0 && refreshViews) {
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
  
  getTimelineLayoutMode(): "vertical" | "horizontal" {
    return this.timelineLayoutMode;
  }

  async setTimelineLayoutMode(mode: "vertical" | "horizontal"): Promise<void> {
    if (this.timelineLayoutMode === mode) {
      return;
    }

    this.timelineLayoutMode = mode;
    this.refreshOpenViews();
  }

  getTimelineTagFilterSnapshot(): { include: string[]; exclude: string[] } {
    return {
      include: [...this.timelineIncludedTagRefs],
      exclude: [...this.timelineExcludedTagRefs]
    };
  }

  isTimelineTagIncluded(tagRef: string): boolean {
    return this.timelineIncludedTagRefs.has(tagRef);
  }

  isTimelineTagExcluded(tagRef: string): boolean {
    return this.timelineExcludedTagRefs.has(tagRef);
  }

  toggleTimelineIncludedTag(tagRef: string): void {
    if (this.timelineIncludedTagRefs.has(tagRef)) {
      this.timelineIncludedTagRefs.delete(tagRef);
    } else {
      this.timelineIncludedTagRefs.add(tagRef);
      this.timelineExcludedTagRefs.delete(tagRef);
    }

    this.refreshOpenViews();
  }

  toggleTimelineExcludedTag(tagRef: string): void {
    if (this.timelineExcludedTagRefs.has(tagRef)) {
      this.timelineExcludedTagRefs.delete(tagRef);
    } else {
      this.timelineExcludedTagRefs.add(tagRef);
      this.timelineIncludedTagRefs.delete(tagRef);
    }

    this.refreshOpenViews();
  }

  clearTimelineTagFilters(refresh = true): void {
    this.timelineIncludedTagRefs.clear();
    this.timelineExcludedTagRefs.clear();

    if (refresh) {
      this.refreshOpenViews();
    }
  }

  refreshOpenViews(): void {
    this.refreshViews([
      CALENDAR_VIEW_TYPE,
      CALENDAR_DAY_VIEW_TYPE,
      EVENT_EDITOR_VIEW_TYPE,
	  CONTROL_VIEW_TYPE,
      TIMELINE_VIEW_TYPE,
      TIMELINE_FILTER_VIEW_TYPE
    ]);
  }

  private refreshViews(viewTypes: string[]): void {
    [...new Set(viewTypes)].forEach((viewType) => {
      this.app.workspace.getLeavesOfType(viewType).forEach((leaf) => {
        const candidate = leaf.view as { refresh?: () => void };
        if (typeof candidate.refresh === "function") {
          candidate.refresh();
        }
      });
    });
  }

  private refreshViewsForCalendarStatePatch(
    previousState: CalendarState,
    patch: Partial<CalendarState>
  ): void {
    const viewTypes = new Set<string>();

    if (
      patch.activeView !== undefined &&
      patch.activeView !== previousState.activeView
    ) {
      viewTypes.add(CALENDAR_VIEW_TYPE);
    }
	
    if (
      patch.showEraDescription !== undefined &&
      patch.showEraDescription !== previousState.showEraDescription
    ) {
      viewTypes.add(CALENDAR_VIEW_TYPE);
      viewTypes.add(CONTROL_VIEW_TYPE);
    }

    if (patch.cursorDate && !sameDate(previousState.cursorDate, patch.cursorDate)) {
      viewTypes.add(CALENDAR_VIEW_TYPE);
      viewTypes.add(CALENDAR_DAY_VIEW_TYPE);
      viewTypes.add(CONTROL_VIEW_TYPE);
    }

    if (patch.todayDate && !sameDate(previousState.todayDate, patch.todayDate)) {
      viewTypes.add(CALENDAR_VIEW_TYPE);
      viewTypes.add(CALENDAR_DAY_VIEW_TYPE);
      viewTypes.add(CONTROL_VIEW_TYPE);
    }

    if (viewTypes.size > 0) {
      this.refreshViews([...viewTypes]);
    }
  }

  private scheduleActiveCalendarStateSave(delayMs = 600): void {
    if (this.pendingActiveCalendarStateSaveTimer !== null) {
      window.clearTimeout(this.pendingActiveCalendarStateSaveTimer);
    }

    this.pendingActiveCalendarStateSaveTimer = window.setTimeout(() => {
      this.pendingActiveCalendarStateSaveTimer = null;
      void this.persistActiveCalendarStateToDisk();
    }, delayMs);
  }

  private async flushPendingActiveCalendarStateSave(): Promise<void> {
    if (this.pendingActiveCalendarStateSaveTimer !== null) {
      window.clearTimeout(this.pendingActiveCalendarStateSaveTimer);
      this.pendingActiveCalendarStateSaveTimer = null;
      await this.persistActiveCalendarStateToDisk();
    }
  }

  private async persistActiveCalendarStateToDisk(): Promise<void> {
    if (!this.activeCalendar) {
      return;
    }

    await this.dataStore.saveCalendar(this.activeCalendar);

    if (this.settings.activeCalendarId !== this.activeCalendar.id) {
      this.settings.activeCalendarId = this.activeCalendar.id;
      await this.saveSettings();
    }
  }

  async loadEventYear(calendarId: string, year: number): Promise<EventYearFile | null> {
    const calendarDefinition =
      (this.activeCalendar?.id === calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(calendarId))?.definition;

    if (!calendarDefinition) {
      return null;
    }

    return await this.buildEventYearFromSources(calendarId, year, calendarDefinition);
  }

  async loadEventIndexYear(calendarId: string, year: number): Promise<EventIndexYearFile | null> {
    const existing = await this.dataStore.loadEventIndexYear(calendarId, year);

    const calendarDefinition =
      (this.activeCalendar?.id === calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(calendarId))?.definition;

    if (!calendarDefinition) {
      return null;
    }

    let concreteIndex = existing ? stripRecurringItemsFromEventIndexYear(existing) : null;

    if (existing && hasRecurringItemsInEventIndexYear(existing)) {
      if (concreteIndex && Object.keys(concreteIndex.days).length > 0) {
        await this.dataStore.saveEventIndexYear(concreteIndex);
      } else {
        await this.dataStore.deleteEventIndexYear(calendarId, year);
        concreteIndex = null;
      }
    }

    if (!concreteIndex) {
      concreteIndex = await this.buildConcreteEventIndexYearFromSources(
        calendarId,
        year,
        calendarDefinition
      );

      if (concreteIndex) {
        await this.dataStore.saveEventIndexYear(concreteIndex);
      }
    }

    const recurrenceIndex = await this.loadEventRecurrenceIndex(calendarId);
    const recurrenceYearIndex = buildEventIndexYearFromRecurrenceIndex(
      recurrenceIndex,
      calendarDefinition,
      year
    );

    return mergeEventIndexYears(calendarId, year, [
      concreteIndex,
      recurrenceYearIndex
    ]);
  }
  
  async loadEventRecurrenceIndex(calendarId: string): Promise<EventRecurrenceIndexFile> {
    const cached = this.recurrenceIndexCache.get(calendarId);
    if (cached) {
      return cached;
    }

    const existing = await this.dataStore.loadEventRecurrenceIndex(calendarId);
    if (existing) {
      this.recurrenceIndexCache.set(calendarId, existing);
      return existing;
    }

    const sourceEvents = await this.dataStore.listEventSources(calendarId);
    const built = buildEventRecurrenceIndexFile(
      calendarId,
      sourceEvents.filter((event) => Boolean(event.recurrence))
    );

    if (built.items.length > 0) {
      await this.dataStore.saveEventRecurrenceIndex(built);
    }

    this.recurrenceIndexCache.set(calendarId, built);
    return built;
  }
  
  async loadTimelineEvents(calendarId: string): Promise<CalendarEventDefinition[]> {
    const calendar =
      this.activeCalendar?.id === calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(calendarId);

    if (!calendar) {
      return [];
    }

    const sourceEvents = await this.dataStore.listEventSources(calendarId);
    if (sourceEvents.length === 0) {
      return [];
    }

    const concreteEvents = new Map<string, CalendarEventDefinition>();
    const recurringSources = new Map<string, CalendarEventDefinition>();
    const fallbackHorizon =
      Math.max(calendar.state.todayDate.year, calendar.state.cursorDate.year) + 25;

    sourceEvents.forEach((event) => {
      if (event.recurrence) {
        upsertEventById(recurringSources, event);
        return;
      }

      upsertEventById(concreteEvents, event);
    });

    const recurringOccurrences = new Map<string, CalendarEventDefinition>();

    for (const event of recurringSources.values()) {
      const estimatedEndYear = estimateRecurringEventEndYear(
        event,
        calendar.definition,
        fallbackHorizon
      );
      const startYear = Math.min(event.date.year, estimatedEndYear);
      const endYear = Math.max(event.date.year, estimatedEndYear);

      for (let year = startYear; year <= endYear; year += 1) {
        const occurrences = expandRecurringEventForYear(
          event,
          calendar.definition,
          year
        );

        occurrences.forEach((occurrence) => {
          upsertEventById(recurringOccurrences, occurrence);
        });
      }
    }

    return [...concreteEvents.values(), ...recurringOccurrences.values()].sort(sortEvents);
  }

  async ensureEventYearFile(calendarId: string, year: number): Promise<EventYearFile> {
    const existing = await this.dataStore.loadEventYear(calendarId, year);
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
    const occurrence = await this.loadEventOccurrenceById(calendarId, year, eventId);

    if (occurrence?.sourceEventId) {
      return await this.loadSourceEventById(calendarId, occurrence.sourceEventId);
    }

    if (occurrence) {
      return occurrence;
    }

    return await this.loadSourceEventById(calendarId, eventId);
  }
  
  async deleteEventById(
    calendarId: string,
    year: number,
    eventId: string,
    mode: EventDeleteMode = "all",
    occurrenceDate?: FantasyDate
  ): Promise<boolean> {
    const occurrence = await this.loadEventOccurrenceById(calendarId, year, eventId);
    const sourceEventId = occurrence?.sourceEventId ?? parseRecurringOccurrenceSourceId(eventId) ?? eventId;
    const sourceEvent =
      (await this.loadSourceEventById(calendarId, sourceEventId)) ??
      (await this.loadEventById(calendarId, year, eventId));

    if (!sourceEvent) {
      new Notice("Could not load event for deletion.");
      return false;
    }

    const calendar =
      this.activeCalendar?.id === sourceEvent.calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(sourceEvent.calendarId);

    if (!calendar) {
      new Notice("Could not resolve calendar for event deletion.");
      return false;
    }
	
    const targetOccurrenceDate = occurrenceDate
      ? { ...occurrenceDate }
      : occurrence?.date
        ? { ...occurrence.date }
        : { ...sourceEvent.date };

    if (sourceEvent.recurrence && mode !== "all") {
      if (mode === "single") {
        const updatedEvent: CalendarEventDefinition = {
          ...sourceEvent,
          recurrence: {
            ...sourceEvent.recurrence,
            excludedDates: mergeExcludedDates(
              sourceEvent.recurrence.excludedDates ?? [],
              targetOccurrenceDate
            )
          },
          updatedAt: new Date().toISOString()
        };

        await this.saveEvent(updatedEvent, sourceEvent);
        new Notice(`Deleted occurrence "${sourceEvent.title}" on ${formatSimpleDate(targetOccurrenceDate)}.`);
        return true;
      }

      if (mode === "following") {
        if (sourceEvent.recurrence.kind === "pattern") {
          const updatedEvent: CalendarEventDefinition = {
            ...sourceEvent,
            recurrence: {
              ...sourceEvent.recurrence,
              until: shiftDay(targetOccurrenceDate, -1, calendar.definition),
              excludedDates: filterExcludedDatesBefore(
                sourceEvent.recurrence.excludedDates ?? [],
                targetOccurrenceDate
              )
            },
            updatedAt: new Date().toISOString()
          };

          await this.saveEvent(updatedEvent, sourceEvent);
          new Notice(`Deleted "${sourceEvent.title}" from ${formatSimpleDate(targetOccurrenceDate)} and following.`);
          return true;
        }
        const occurrenceIndex = getRecurringOccurrenceIndex(
          sourceEvent,
          calendar.definition,
          targetOccurrenceDate
        );

        if (occurrenceIndex === null) {
          new Notice("Could not resolve recurring occurrence.");
          return false;
        }

        if (occurrenceIndex > 0) {
          const updatedEvent: CalendarEventDefinition = {
            ...sourceEvent,
            recurrence: {
              ...sourceEvent.recurrence,
              endMode: "count",
              count: occurrenceIndex,
              until: undefined,
              excludedDates: filterExcludedDatesBefore(
                sourceEvent.recurrence.excludedDates ?? [],
                targetOccurrenceDate
              )
            },
            updatedAt: new Date().toISOString()
          };

          await this.saveEvent(updatedEvent, sourceEvent);
          new Notice(`Deleted "${sourceEvent.title}" from ${formatSimpleDate(targetOccurrenceDate)} and following.`);
          return true;
        }
      }
    }

    await this.dataStore.deleteEventSource(sourceEvent.calendarId, sourceEvent.id);

    if (sourceEvent.recurrence) {
      await this.rebuildEventRecurrenceIndex(sourceEvent.calendarId);
    } else {
      for (const targetYear of getStoredEventYears(sourceEvent)) {
        await this.rebuildEventIndexYear(sourceEvent.calendarId, targetYear, calendar.definition);
      }
    }

    this.refreshOpenViews();
    new Notice(`Deleted event "${sourceEvent.title}".`);
    return true;
  }

  async loadEventOccurrenceById(
    calendarId: string,
    year: number,
    eventId: string
  ): Promise<CalendarEventDefinition | null> {
    const calendar =
      this.activeCalendar?.id === calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(calendarId);

    if (!calendar) {
      return null;
    }

    const sourceEventId = parseRecurringOccurrenceSourceId(eventId);

    if (sourceEventId) {
      const source = await this.dataStore.loadEventSource(calendarId, sourceEventId);
      if (!source?.recurrence) {
        return null;
      }

      return (
        expandRecurringEventForYear(source, calendar.definition, year).find(
          (event) => event.id === eventId
        ) ?? null
      );
    }

    const source = await this.dataStore.loadEventSource(calendarId, eventId);
    if (!source) {
      return null;
    }

    if (source.recurrence) {
      return (
        expandRecurringEventForYear(source, calendar.definition, year).find(
          (event) => event.id === eventId
        ) ?? null
      );
    }

    return eventIntersectsYear(source, year) ? source : null;
  }

  resolveStoredFileRef(ref: string): TFile | null {
    return this.app.metadataCache.getFirstLinkpathDest(ref, "") ??
      this.app.vault.getFiles().find((file) => file.name === ref || file.basename === ref) ??
      null;
  }

  async saveEvent(
    event: CalendarEventDefinition,
    previousEvent?: CalendarEventDefinition,
    refreshViews = true
  ): Promise<void> {
    const normalized = normalizeCalendarEventDefinition(event);
    const currentCalendar =
      this.activeCalendar?.id === normalized.calendarId
        ? this.activeCalendar
        : await this.dataStore.loadCalendarById(normalized.calendarId);

    if (!currentCalendar) {
      new Notice("Could not resolve calendar for event save.");
      return;
    }

    const previousCalendar =
      previousEvent
        ? (this.activeCalendar?.id === previousEvent.calendarId
            ? this.activeCalendar
            : await this.dataStore.loadCalendarById(previousEvent.calendarId))
        : null;

    await this.dataStore.saveEventSource(normalized);

    if (
      previousEvent &&
      (previousEvent.calendarId !== normalized.calendarId || previousEvent.id !== normalized.id)
    ) {
      await this.dataStore.deleteEventSource(previousEvent.calendarId, previousEvent.id);
    }

    const rebuildTargets = new Map<string, Set<number>>();
    const addRebuildYears = (calendarId: string, years: number[]): void => {
      const target = rebuildTargets.get(calendarId) ?? new Set<number>();
      years.forEach((year) => target.add(year));
      rebuildTargets.set(calendarId, target);
    };

    if (previousEvent && !previousEvent.recurrence) {
      addRebuildYears(
        previousEvent.calendarId,
        getIndexedYearsForEventSource(previousEvent, previousCalendar)
      );
    }

    if (!normalized.recurrence) {
      addRebuildYears(
        normalized.calendarId,
        getIndexedYearsForEventSource(normalized, currentCalendar)
      );
    }

    const recurrenceCalendars = new Set<string>();
    if (previousEvent) {
      recurrenceCalendars.add(previousEvent.calendarId);
    }
    recurrenceCalendars.add(normalized.calendarId);

    for (const calendarId of recurrenceCalendars) {
      await this.rebuildEventRecurrenceIndex(calendarId);
    }

    for (const [calendarId, years] of rebuildTargets.entries()) {
      const calendarForYears =
        calendarId === currentCalendar.id
          ? currentCalendar
          : calendarId === previousCalendar?.id
            ? previousCalendar
            : await this.dataStore.loadCalendarById(calendarId);

      if (!calendarForYears) {
        continue;
      }

      for (const year of [...years].sort((left, right) => left - right)) {
        await this.rebuildEventIndexYear(calendarId, year, calendarForYears.definition);
      }
    }

    if (normalized.weatherPackId && !normalized.recurrence) {
      await this.applyWeatherPackToRange(
        normalized.calendarId,
        normalized.weatherPackId,
        normalized.date,
        normalized.endDate ?? normalized.date,
        normalized.id,
        "event"
      );
    }
	
    try {
      await this.writeEventToFrontmatter(normalized, currentCalendar);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Event saved, but frontmatter export failed: ${message}`);
    }

    if (refreshViews) {
      this.refreshOpenViews();
    }
  }
  
  private async writeEventToFrontmatter(
    event: CalendarEventDefinition,
    calendar?: CalendarFile
  ): Promise<void> {
    const exportSettings = this.settings.frontmatterExport;

    if (!exportSettings.enabled) {
      return;
    }

    const noteRef = event.noteRef?.trim();
    if (!noteRef) {
      return;
    }

    const file = this.resolveStoredFileRef(noteRef);
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      return;
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      applyEventToFrontmatter(
        frontmatter as Record<string, unknown>,
        event,
        exportSettings,
        calendar
      );
    });
  }
  
  async scanActiveNoteFrontmatter(): Promise<void> {
    const calendar = this.activeCalendar;
    if (!calendar) {
      new Notice("No active calendar loaded.");
      return;
    }

    const configError = getFrontmatterImportConfigurationError(this.settings.frontmatterImport);
    if (configError) {
      new Notice(configError);
      return;
    }

    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") {
      new Notice("No active Markdown note found.");
      return;
    }

    const importedMap = await this.buildFrontmatterImportedEventMap(calendar.id);
    const result = await this.importFrontmatterFromFile(file, calendar, importedMap, false);

    if (result.changed) {
      this.refreshOpenViews();
    }

    new Notice(result.message);
  }

  async scanVaultFrontmatter(): Promise<void> {
    const calendar = this.activeCalendar;
    if (!calendar) {
      new Notice("No active calendar loaded.");
      return;
    }

    const configError = getFrontmatterImportConfigurationError(this.settings.frontmatterImport);
    if (configError) {
      new Notice(configError);
      return;
    }

    const files = this.app.vault.getMarkdownFiles();
    const importedMap = await this.buildFrontmatterImportedEventMap(calendar.id);

    let imported = 0;
    let skipped = 0;
    let invalid = 0;
    let changed = false;

    for (const file of files) {
      const result = await this.importFrontmatterFromFile(file, calendar, importedMap, true);

      if (result.status === "imported") {
        imported += 1;
        changed = true;
        continue;
      }

      if (result.status === "invalid") {
        invalid += 1;
        continue;
      }

      skipped += 1;
    }

    if (changed) {
      this.refreshOpenViews();
    }

    new Notice(
      `Frontmatter scan finished: ${imported} imported, ${skipped} skipped, ${invalid} invalid.`
    );
  }

  private async importFrontmatterFromFile(
    file: TFile,
    calendar: CalendarFile,
    importedMap: Map<string, CalendarEventDefinition>,
    suppressRefresh: boolean
  ): Promise<{ status: "imported" | "skipped" | "invalid"; changed: boolean; message: string }> {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = asRecord(cache?.frontmatter);

    if (Object.keys(frontmatter).length === 0) {
      return {
        status: "skipped",
        changed: false,
        message: `Skipped ${file.path}: no frontmatter found.`
      };
    }

    const linkedTagPacks = (await this.listTagPacks()).filter((pack) =>
      calendar.linkedTagPackIds.includes(pack.id)
    );

    const parsed = buildFrontmatterImportCandidate(
      file,
      frontmatter,
      calendar,
      this.settings.frontmatterImport,
      linkedTagPacks
    );

    if (parsed.status === "skip") {
      return {
        status: "skipped",
        changed: false,
        message: `Skipped ${file.path}: ${parsed.reason}`
      };
    }

    if (parsed.status === "invalid") {
      return {
        status: "invalid",
        changed: false,
        message: `Invalid frontmatter in ${file.path}: ${parsed.reason}`
      };
    }

    const candidate = parsed.candidate;
    const existing = importedMap.get(candidate.syncKey);

    if (existing) {
      const didUpdateNoteRef = await this.tryUpdateImportedEventNoteRef(
        existing,
        file.path,
        suppressRefresh
      );

      if (didUpdateNoteRef) {
        importedMap.set(candidate.syncKey, {
          ...existing,
          noteRef: file.path,
          importSource: existing.importSource
            ? {
                ...existing.importSource,
                notePath: file.path
              }
            : existing.importSource
        });
      }

      return {
        status: "skipped",
        changed: didUpdateNoteRef,
        message: didUpdateNoteRef
          ? `Updated linked note for existing imported event from ${file.path}.`
          : `Skipped ${file.path}: event already imported.`
      };
    }

    const now = new Date().toISOString();
    const eventId = createEventId(candidate.title);
    const syncIdProperty = this.settings.frontmatterImport.syncIdProperty?.trim();
    const explicitSyncId =
      candidate.explicitSyncId ??
      (syncIdProperty ? eventId : undefined);
    const syncKey = explicitSyncId
      ? `frontmatter-sync:${explicitSyncId}`
      : candidate.syncKey;

    const event: CalendarEventDefinition = {
      id: eventId,
      calendarId: calendar.id,
      title: candidate.title,
      date: candidate.date,
      endDate: candidate.endDate,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      description: candidate.description,
      color: candidate.color,
      tagRefs: candidate.tagRefs,
      weatherPackId: candidate.weatherPackId,
      imageRef: candidate.imageRef,
      noteRef: candidate.noteRef,
      createdAt: now,
      recurrence: candidate.recurrence,
      importSource: {
        kind: "frontmatter",
        syncKey,
        notePath: candidate.noteRef,
        importedAt: now,
        explicitSyncId
      },
      updatedAt: now
    };

    await this.saveEvent(event, undefined, !suppressRefresh);

    if (syncIdProperty && explicitSyncId && !candidate.explicitSyncId) {
      void this.tryWriteImportedSyncIdToNote(file, syncIdProperty, explicitSyncId);
    }

    importedMap.set(syncKey, event);

    return {
      status: "imported",
      changed: true,
      message: `Imported event from ${file.path}.`
    };
  }

  private async buildFrontmatterImportedEventMap(
    calendarId: string
  ): Promise<Map<string, CalendarEventDefinition>> {
    const events = await this.dataStore.listEventSources(calendarId);
    const result = new Map<string, CalendarEventDefinition>();

    events.forEach((event) => {
      if (event.importSource?.kind === "frontmatter") {
        result.set(event.importSource.syncKey, event);
      }
    });

    return result;
  }

  private async tryUpdateImportedEventNoteRef(
    event: CalendarEventDefinition,
    nextNoteRef: string,
    suppressRefresh: boolean
  ): Promise<boolean> {
    if (
      event.importSource?.kind !== "frontmatter" ||
      event.noteRef === nextNoteRef
    ) {
      return false;
    }

    const updated: CalendarEventDefinition = {
      ...event,
      noteRef: nextNoteRef,
      importSource: {
        ...event.importSource,
        notePath: nextNoteRef
      },
      updatedAt: new Date().toISOString()
    };

    await this.saveEvent(updated, event, !suppressRefresh);
    return true;
  }
  
  private async tryWriteImportedSyncIdToNote(
    file: TFile,
    property: string,
    syncId: string
  ): Promise<void> {
    const key = property.trim();
    if (key.length === 0) {
      return;
    }

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const fm = frontmatter as Record<string, unknown>;
        const current: unknown = fm[key];

        if (
          (typeof current === "string" && current.trim().length > 0) ||
          typeof current === "number" ||
          typeof current === "boolean"
        ) {
          return;
        }

        fm[key] = syncId;
      });
    } catch {
      // empty
    }
  }
  
  private async removeEventCopies(
    event: CalendarEventDefinition,
    calendarDefinition: CalendarFile["definition"] | undefined
  ): Promise<void> {
    if (event.recurrence) {
      const years = await this.dataStore.listEventYears(event.calendarId);

      for (const year of years) {
        const file = await this.dataStore.loadEventYear(event.calendarId, year);

        if (!file) {
          continue;
        }

        const nextEvents = file.events.filter((entry) => entry.id !== event.id);

        if (nextEvents.length === file.events.length) {
          continue;
        }

        const nextFile: EventYearFile = {
          ...file,
          events: nextEvents.sort(sortEvents)
        };

        await this.dataStore.saveEventYear(nextFile);
        await this.dataStore.saveEventIndexYear(buildEventIndexYearFile(nextFile, calendarDefinition));
      }

      return;
    }

    const startYear = Math.min(event.date.year, event.endDate?.year ?? event.date.year);
    const endYear = Math.max(event.date.year, event.endDate?.year ?? event.date.year);

    for (let year = startYear; year <= endYear; year += 1) {
      const file = await this.dataStore.loadEventYear(event.calendarId, year);

      if (!file) {
        continue;
      }

      const nextEvents = file.events.filter((entry) => entry.id !== event.id);

      if (nextEvents.length === file.events.length) {
        continue;
      }

      const nextFile: EventYearFile = {
        ...file,
        events: nextEvents.sort(sortEvents)
      };

      await this.dataStore.saveEventYear(nextFile);
      await this.dataStore.saveEventIndexYear(buildEventIndexYearFile(nextFile, calendarDefinition));
    }
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

    const previousState = this.activeCalendar.state;
    const didActiveViewChange =
      patch.activeView !== undefined && patch.activeView !== previousState.activeView;
    const didEraDescriptionVisibilityChange =
      patch.showEraDescription !== undefined &&
      patch.showEraDescription !== previousState.showEraDescription;
    const didTodayChange =
      patch.todayDate !== undefined && !sameDate(previousState.todayDate, patch.todayDate);
    const didCursorChange =
      patch.cursorDate !== undefined && !sameDate(previousState.cursorDate, patch.cursorDate);

    if (
      !didActiveViewChange &&
      !didEraDescriptionVisibilityChange &&
      !didTodayChange &&
      !didCursorChange
    ) {
      return;
    }

    const nextCalendar: CalendarFile = {
      ...this.activeCalendar,
      state: {
        ...previousState,
        ...patch
      }
    };

    this.activeCalendar = nextCalendar;

    if (
      patch.cursorDate &&
      patch.cursorDate.year !== previousState.cursorDate.year
    ) {
      void this.ensureWeatherReferencesForCalendarYear(
        nextCalendar,
        patch.cursorDate.year
      );
    }

    if (
      patch.todayDate &&
      patch.todayDate.year !== previousState.todayDate.year
    ) {
      void this.ensureWeatherReferencesForCalendarYear(
        nextCalendar,
        patch.todayDate.year
      );
    }

    this.scheduleActiveCalendarStateSave();
    this.refreshViewsForCalendarStatePatch(previousState, patch);
  }
  
  async ensureWeatherReferencesForCalendarYear(
    calendar: CalendarFile,
    year: number
  ): Promise<void> {
    if (!calendar.weatherEnabled || !calendar.autoGenerateLinkedWeatherReferences) {
      return;
    }

    const packIds = new Set<string>(calendar.linkedWeatherPackIds);

    if (calendar.defaultWeatherPackId) {
      packIds.add(calendar.defaultWeatherPackId);
    }

    await Promise.all(
      [...packIds].map(async (packId) => {
        const pack = await this.loadWeatherPackById(packId);
        if (!pack) {
          return;
        }

        await this.loadWeatherReferenceYear(calendar.id, pack.id, year);
      })
    );
  }

  private async loadSourceEventById(
    calendarId: string,
    eventId: string
  ): Promise<CalendarEventDefinition | null> {
    return await this.dataStore.loadEventSource(calendarId, eventId);
  }
  
  private async buildEventYearFromSources(
    calendarId: string,
    year: number,
    definition: CalendarFile["definition"],
    sourceEvents?: CalendarEventDefinition[]
  ): Promise<EventYearFile | null> {
    const sources = sourceEvents ?? (await this.dataStore.listEventSources(calendarId));

    if (sources.length === 0) {
      return null;
    }

    const concreteEvents = sources
      .filter((event) => !event.recurrence && eventIntersectsYear(event, year))
      .map((event) => ({ ...event }));

    const recurringOccurrences = sources
      .filter((event) => Boolean(event.recurrence))
      .flatMap((event) => expandRecurringEventForYear(event, definition, year));

    const events = dedupeEventList([...concreteEvents, ...recurringOccurrences]).sort(sortEvents);

    if (events.length === 0) {
      return null;
    }

    return {
      version: 1,
      kind: "event-year",
      calendarId,
      year,
      events
    };
  }
  
  private async buildConcreteEventIndexYearFromSources(
    calendarId: string,
    year: number,
    definition: CalendarFile["definition"],
    sourceEvents?: CalendarEventDefinition[]
  ): Promise<EventIndexYearFile | null> {
    const sources = sourceEvents ?? (await this.dataStore.listEventSources(calendarId));
    const concreteEvents = sources
      .filter((event) => !event.recurrence && eventIntersectsYear(event, year))
      .map((event) => ({ ...event }));

    if (concreteEvents.length === 0) {
      return null;
    }

    return buildEventIndexYearFile(
      {
        version: 1,
        kind: "event-year",
        calendarId,
        year,
        events: concreteEvents
      },
      definition
    );
  }

  private async rebuildEventIndexYear(
    calendarId: string,
    year: number,
    definition?: CalendarFile["definition"],
    sourceEvents?: CalendarEventDefinition[]
  ): Promise<void> {
    const calendarDefinition =
      definition ??
      (
        this.activeCalendar?.id === calendarId
          ? this.activeCalendar
          : await this.dataStore.loadCalendarById(calendarId)
      )?.definition;

    if (!calendarDefinition) {
      return;
    }

    const detail = await this.buildConcreteEventIndexYearFromSources(
      calendarId,
      year,
      calendarDefinition,
      sourceEvents
    );

    if (!detail || Object.keys(detail.days).length === 0) {
      await this.dataStore.deleteEventIndexYear(calendarId, year);
      return;
    }

    await this.dataStore.saveEventIndexYear(detail);
  }

  private async rebuildEventRecurrenceIndex(
    calendarId: string,
    sourceEvents?: CalendarEventDefinition[]
  ): Promise<void> {
    const events = sourceEvents ?? (await this.dataStore.listEventSources(calendarId));
    const file = buildEventRecurrenceIndexFile(
      calendarId,
      events.filter((event) => Boolean(event.recurrence))
    );

    if (file.items.length === 0) {
      await this.dataStore.deleteEventRecurrenceIndex(calendarId);
      this.recurrenceIndexCache.set(calendarId, file);
      return;
    }

    await this.dataStore.saveEventRecurrenceIndex(file);
    this.recurrenceIndexCache.set(calendarId, file);
  }

  private async migrateLegacyEventStorage(calendars: CalendarFile[]): Promise<void> {
    let migratedEventCount = 0;
	let archivedLegacyCalendars = 0;

    for (const calendar of calendars) {
      const [existingSources, legacyYears, hasMigrationMarker] = await Promise.all([
        this.dataStore.listEventSources(calendar.id),
        this.dataStore.listEventYears(calendar.id),
        this.dataStore.hasLegacyEventMigrationMarker(calendar.id)
      ]);

      if (legacyYears.length === 0) {
        continue;
      }
	  
      if (existingSources.length > 0 || hasMigrationMarker) {
        const archivedPath = await this.dataStore.moveLegacyEventDetailsFolderToBackup(calendar.id);
        if (archivedPath) {
          archivedLegacyCalendars += 1;
        }

        if (!hasMigrationMarker) {
          await this.dataStore.saveLegacyEventMigrationMarker(calendar.id, {
            migratedAt: new Date().toISOString(),
            sourceCount: existingSources.length,
            legacyYears
          });
        }
        continue;
      }

      const deduped = new Map<string, CalendarEventDefinition>();

      for (const year of legacyYears) {
        const file = await this.dataStore.loadEventYear(calendar.id, year);
        file?.events.forEach((event) => {
          upsertEventById(deduped, event);
        });
      }

      const sources = [...deduped.values()];
      if (sources.length === 0) {
        continue;
      }

      for (const event of sources) {
        await this.dataStore.saveEventSource(event);
      }
	  
      await this.rebuildEventRecurrenceIndex(calendar.id, sources);

      for (const year of legacyYears) {
        await this.rebuildEventIndexYear(calendar.id, year, calendar.definition, sources);
      }
	  
      const archivedPath = await this.dataStore.moveLegacyEventDetailsFolderToBackup(calendar.id);
      if (archivedPath) {
        archivedLegacyCalendars += 1;
      }
	  
      await this.dataStore.saveLegacyEventMigrationMarker(calendar.id, {
        migratedAt: new Date().toISOString(),
        sourceCount: sources.length,
        legacyYears
      });

      migratedEventCount += sources.length;
    }

    if (migratedEventCount > 0) {
      new Notice(
        `Migrated ${migratedEventCount} legacy event(s) to source storage. Legacy yearly event folders were moved to backup and marked as migrated.`
      );
    } else if (archivedLegacyCalendars > 0) {
      new Notice(
        `Moved ${archivedLegacyCalendars} legacy event folder${archivedLegacyCalendars === 1 ? "" : "s"} to backup and marked them as migrated.`
      );
    }
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
	await this.flushPendingActiveCalendarStateSave();
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
	delete this.fantasyClock.byCalendarId[id];

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

  async buildTimelinePublishPayloadFromBlock(
    raw: string,
    layout: TimeTimelineLayout
  ): Promise<TimeTimelinePublishPayload | null> {
    return await buildTimelinePublishPayloadFromBlock(this, raw, layout);
  }
}

function compareFantasyDates(left: FantasyDate, right: FantasyDate): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
  return left.day - right.day;
}

function getStoredEventYears(event: CalendarEventDefinition): number[] {
  if (event.recurrence) {
    return [event.date.year];
  }

  const startYear = Math.min(event.date.year, event.endDate?.year ?? event.date.year);
  const endYear = Math.max(event.date.year, event.endDate?.year ?? event.date.year);
  const years: number[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }

  return years;
}

function getIndexedYearsForEventSource(
  event: CalendarEventDefinition,
  calendar: CalendarFile | null
): number[] {
  if (!event.recurrence) {
    return getStoredEventYears(event);
  }

  if (!calendar) {
    return [event.date.year];
  }

  const fallbackEndYear =
    Math.max(calendar.state.todayDate.year, calendar.state.cursorDate.year) + 25;
  const estimatedEndYear = estimateRecurringEventEndYear(
    event,
    calendar.definition,
    fallbackEndYear
  );
  const startYear = Math.min(event.date.year, estimatedEndYear);
  const endYear = Math.max(event.date.year, estimatedEndYear);
  const years: number[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }

  return years;
}

function eventIntersectsYear(event: CalendarEventDefinition, year: number): boolean {
  const startYear = Math.min(event.date.year, event.endDate?.year ?? event.date.year);
  const endYear = Math.max(event.date.year, event.endDate?.year ?? event.date.year);
  return year >= startYear && year <= endYear;
}

function parseRecurringOccurrenceSourceId(eventId: string): string | null {
  const delimiterIndex = eventId.indexOf("::");
  return delimiterIndex >= 0 ? eventId.slice(0, delimiterIndex) : null;
}

function mergeExcludedDates(
  excludedDates: FantasyDate[],
  date: FantasyDate
): FantasyDate[] {
  const byKey = new Map<string, FantasyDate>();

  excludedDates.forEach((entry) => {
    byKey.set(formatFantasyDateKey(entry), { ...entry });
  });

  byKey.set(formatFantasyDateKey(date), { ...date });

  return [...byKey.values()].sort(compareFantasyDates);
}

function filterExcludedDatesBefore(
  excludedDates: FantasyDate[],
  date: FantasyDate
): FantasyDate[] | undefined {
  const filtered = excludedDates
    .filter((entry) => compareFantasyDates(entry, date) < 0)
    .map((entry) => ({ ...entry }))
    .sort(compareFantasyDates);

  return filtered.length > 0 ? filtered : undefined;
}

function formatFantasyDateKey(date: FantasyDate): string {
  return `${date.year}:${date.monthIndex}:${date.day}`;
}

function formatSimpleDate(date: FantasyDate): string {
  return `${date.day}-${date.monthIndex + 1}-${date.year}`;
}

function dedupeEventList(events: CalendarEventDefinition[]): CalendarEventDefinition[] {
  const deduped = new Map<string, CalendarEventDefinition>();

  events.forEach((event) => {
    upsertEventById(deduped, event);
  });

  return [...deduped.values()];
}

function upsertEventById(
  target: Map<string, CalendarEventDefinition>,
  event: CalendarEventDefinition
): void {
  const existing = target.get(event.id);

  if (!existing || (event.updatedAt ?? "") >= (existing.updatedAt ?? "")) {
    target.set(event.id, event);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
}