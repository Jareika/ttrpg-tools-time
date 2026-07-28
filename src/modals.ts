import {
  App,
  FuzzySuggestModal,
  Modal,
  Notice,
  Setting,
  TFile,
  setIcon,
  type FuzzyMatch
} from "obsidian";
import {
  buildDefaultSeasons,
  DEFAULT_WEATHER_PROFILE,
  normalizeCalendarFile,
  normalizeTagPackFile,
  slugify
} from "./calendar";
import { getMoonPhaseLabel } from "./moons";
import type {
  CalendarTimelineStyle,
  CalendarFile,
  CalendarViewMode,
  FantasyYearDisplayConfig,
  MonthWeekdayMode,
  FantasyLeapDayRule,
  FantasyLeapMonthRule,
  FantasyWeatherProfileMapping,
  MoonCycleAnchor,
  MoonPhaseImageDefinition,
  TimelineAlign,
  TagPackFile
} from "./types";
import type TtrpgToolsTimePlugin from "./main";

const DEFAULT_MONTH_LINES = Array.from(
  { length: 12 },
  (_, index) => `Month ${index + 1}|30`
).join("\n");

const DEFAULT_TAG_ROWS: TagRowDraft[] = [
  { name: "history", color: "#d46b65" },
  { name: "war", color: "#8f4f4c" },
  { name: "travel", color: "#e2b35d" }
];

interface EraDraft {
  id: string;
  name: string;
  shortName: string;
  startYear: number;
  startMonthIndex: number;
  endYear: number | null;
  endMonthIndex: number | null;
  endDay: number | null;
  startDay: number;
}

interface MonthDraft {
  id: string;
  name: string;
  days: number;
  color: string;
}

interface MoonDraft {
  id: string;
  name: string;
  cycleDays: number;
  offsetDays: number;
  cycleAnchor: MoonCycleAnchor;
  color: string;
  phaseCount: number;
  size: number;
  phaseImages: MoonPhaseImageDefinition[];
  phaseLabels: string[];
}

interface NamedYearDraft {
  year: number;
  name: string;
}

interface SeasonDraft {
  id: string;
  name: string;
  endDay: number;
  startDay: number;
  color: string;
}

interface TagRowDraft {
  name: string;
  color: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface CalendarWeatherPackSettingsResult {
  defaultWeatherPackId: string;
  linkedWeatherPackIds: string[];
  autoGenerateLinkedWeatherReferences: boolean;
}

export class CalendarEditorModal extends Modal {
  private readonly plugin: TtrpgToolsTimePlugin;
  private readonly existing: CalendarFile | null;
  private readonly onSaved?: () => void;

  private name: string;
  private id: string;
  private description: string;
  private bannerImageRef: string;
  private eras: EraDraft[];
  private weekdays: string[];
  private months: MonthDraft[];
  private moons: MoonDraft[];
  private namedYears: NamedYearDraft[];
  private startWeekdayIndex: number;
  private todayYear: number;
  private monthWeekdayMode: MonthWeekdayMode;
  private yearDisplay: FantasyYearDisplayConfig;
  private todayMonthIndex: number;
  private todayDay: number;
  private savedActiveView: CalendarViewMode;
  private seasons: SeasonDraft[];
  private timeEnabled: boolean;
  private hoursPerDay: number;
  private minutesPerHour: number;
  private leapMonths: FantasyLeapMonthRule[];
  private leapDays: FantasyLeapDayRule[];
  private weatherProfile: FantasyWeatherProfileMapping;
  private defaultWeatherPackId: string;
  private readonly selectedTagPackIds: Set<string>;
  private readonly selectedWeatherPackIds: Set<string>;
  private autoGenerateLinkedWeatherReferences: boolean;
  private timeline: CalendarTimelineStyle | undefined;

  constructor(
    plugin: TtrpgToolsTimePlugin,
    existing?: CalendarFile | null,
    onSaved?: () => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.existing = existing ?? null;
    this.onSaved = onSaved;

    const source = existing ?? plugin.activeCalendar;
    const definition = source?.definition;
    const state = source?.state;
    const monthDefaults: MonthDraft[] = definition?.months?.length
      ? definition.months.map((month) => ({
          ...month,
          color: month.color ?? ""
        }))
      : parseMonthLines(DEFAULT_MONTH_LINES).map((month) => ({
          ...month,
          color: ""
        }));

    this.name = definition?.name ?? "New Calendar";
    this.id = existing?.id ?? slugify(this.name);
    this.description = source?.description ?? "";
	this.bannerImageRef = source?.bannerImageRef ?? "";
    this.eras = definition
      ? definition.eras.map((era) => ({ ...era }))
      : [
          {
            id: slugify("ERA"),
            name: "Era 1",
            shortName: "ERA",
            startYear: 0,
            endYear: null,
            endMonthIndex: null,
            endDay: null,
            startMonthIndex: 0,
            startDay: 1
          }
        ];
    this.weekdays = [...(definition?.weekdays ?? ["RAU", "ZAR", "VEL", "KRA", "LUM"])];
    this.months = monthDefaults.map((month) => ({ ...month }));
    this.moons = (definition?.moons ?? []).map((moon) => ({
      ...moon,
      color: normalizeColor(moon.color),
	  cycleAnchor: moon.cycleAnchor === "month" ? "month" : "absolute",
      phaseCount: Math.max(1, Math.trunc(moon.phaseCount || 8)),
      size: normalizeMoonSize(moon.size),
      phaseImages: moon.phaseImages.map((entry) => ({ ...entry })),
      phaseLabels: [...moon.phaseLabels]
    }));
    this.namedYears = (definition?.yearNames ?? []).map((entry) => ({ ...entry }));
    this.startWeekdayIndex = definition?.startWeekdayIndex ?? 0;
    this.todayYear = state?.todayDate.year ?? 1166;
    this.monthWeekdayMode = definition?.monthWeekdayMode ?? "continuous";
    this.yearDisplay = definition?.yearDisplay
      ? { ...definition.yearDisplay }
      : { negativeYearsMode: "signed", largeYearFormat: "plain" };
    this.todayMonthIndex = state?.todayDate.monthIndex ?? 0;
    this.todayDay = state?.todayDate.day ?? 1;
	this.savedActiveView = state?.activeView ?? "year";

    const seasons = definition?.seasons?.length
      ? definition.seasons
      : buildDefaultSeasons(this.months);

    this.seasons = seasons.map((season) => ({
      id: season.id,
      name: season.name,
      startDay: season.startDay,
      endDay: season.endDay,
      color: normalizeColor(season.color)
    }));
    this.timeEnabled = definition?.time.enabled ?? false;
    this.hoursPerDay = definition?.time.hoursPerDay ?? 24;
    this.minutesPerHour = definition?.time.minutesPerHour ?? 60;
    this.leapMonths = (definition?.leapMonths ?? []).map((rule) => ({
      ...rule,
      month: { ...rule.month },
      leapYearPositions: [...rule.leapYearPositions]
    }));
    this.leapDays = (definition?.leapDays ?? []).map((rule) => ({
      ...rule,
      leapYearPositions: [...rule.leapYearPositions]
    }));
    this.weatherProfile = definition?.weatherProfile
      ? { ...definition.weatherProfile }
      : { ...DEFAULT_WEATHER_PROFILE };

	this.defaultWeatherPackId = source?.defaultWeatherPackId ?? "general";
    this.selectedTagPackIds = new Set(source?.linkedTagPackIds ?? []);
    this.selectedWeatherPackIds = new Set(source?.linkedWeatherPackIds ?? []);
    this.autoGenerateLinkedWeatherReferences = source?.autoGenerateLinkedWeatherReferences ?? false;
	this.timeline = cloneCalendarTimelineStyle(source?.timeline);
  }

  onOpen(): void {
	prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", {
      text: this.existing ? "Edit calendar" : "Create calendar"
    });

    const compactTopRow = contentEl.createDiv({
      cls: "time-calendar-editor__compact-grid"
    });

    createCompactTextField(compactTopRow, {
      label: "Calendar name",
      value: this.name,
      placeholder: "New Calendar",
      onChange: (value) => {
        this.name = value.trim();
      }
    });

    createCompactTextField(compactTopRow, {
      label: "Calendar ID",
      value: this.id,
      placeholder: "new-calendar",
      disabled: this.existing !== null,
      onChange: (value) => {
        if (this.existing) {
          return;
        }
        this.id = slugify(value);
      }
    });

    createCompactTextField(compactTopRow, {
      label: "Description",
      value: this.description,
      placeholder: "Optional description",
      onChange: (value) => {
        this.description = value.trim();
      }
    });

    const shortcutGrid = contentEl.createDiv({
      cls: "time-calendar-editor__shortcut-grid"
    });

    createManagerButton(shortcutGrid, "Eras", () => {
      this.openEraEditorModal();
    });

    createManagerButton(shortcutGrid, "Weekdays", () => {
      this.openWeekdayEditorModal();
    });

    createManagerButton(shortcutGrid, "Months", () => {
      this.openMonthEditorModal();
    });

    createManagerButton(shortcutGrid, "Leap & weather", () => {
      this.openLeapSettingsModal();
    });

    createManagerButton(shortcutGrid, "Moons", () => {
      this.openMoonEditorModal();
    });

    createManagerButton(shortcutGrid, "Named years", () => {
      this.openNamedYearEditorModal();
    });

    createManagerButton(shortcutGrid, "Seasons", () => {
      this.openSeasonEditorModal();
    });

    createManagerButton(shortcutGrid, "Timeline style", () => {
      new TimelineStyleModal(this.app, this.timeline, (nextTimeline) => {
        this.timeline = nextTimeline;
        void this.render();
      }).open();
    });
	
    createManagerButton(shortcutGrid, "Weather packs", () => {
      new CalendarWeatherPacksModal(
        this.plugin,
        this.defaultWeatherPackId,
        [...this.selectedWeatherPackIds],
        this.autoGenerateLinkedWeatherReferences,
        (result) => {
          this.defaultWeatherPackId = result.defaultWeatherPackId;
          this.autoGenerateLinkedWeatherReferences = result.autoGenerateLinkedWeatherReferences;
          this.selectedWeatherPackIds.clear();
          result.linkedWeatherPackIds.forEach((id) => this.selectedWeatherPackIds.add(id));
          void this.render();
        }
      ).open();
    });

    createManagerButton(shortcutGrid, "Tag packs", () => {
      new CalendarTagPacksModal(
        this.plugin,
        [...this.selectedTagPackIds],
        (tagPackIds) => {
          this.selectedTagPackIds.clear();
          tagPackIds.forEach((id) => this.selectedTagPackIds.add(id));
          void this.render();
        }
      ).open();
    });

    const setupGrid = contentEl.createDiv({
      cls: "time-calendar-editor__setup-grid"
    });

    const todayBlock = setupGrid.createDiv({
      cls: "time-calendar-editor__setup-block"
    });
    todayBlock.createDiv({
      cls: "time-event-editor__block-title",
      text: "Today & display"
    });

    const todayFields = todayBlock.createDiv({
      cls: "time-calendar-editor__mini-grid"
    });

    createCompactNumberField(todayFields, {
      label: "Year",
      value: String(this.todayYear),
      onChange: (value) => {
        this.todayYear = value;
      }
    });

    createCompactNumberField(todayFields, {
      label: "Month",
      value: String(this.todayMonthIndex + 1),
      min: 1,
      onChange: (value) => {
        this.todayMonthIndex = Math.max(0, value - 1);
      }
    });

    createCompactNumberField(todayFields, {
      label: "Day",
      value: String(this.todayDay),
      min: 1,
      onChange: (value) => {
        this.todayDay = Math.max(1, value);
      }
    });

    const displayChecks = todayBlock.createDiv({
      cls: "time-calendar-editor__checkbox-list"
    });

    createCompactCheckbox(displayChecks, {
      label: "Hide minus on negative years",
      checked: this.yearDisplay.negativeYearsMode === "absolute",
      onChange: (checked) => {
        this.yearDisplay.negativeYearsMode = checked ? "absolute" : "signed";
      }
    });

    createCompactCheckbox(displayChecks, {
      label: "Abbreviate large years",
      checked: this.yearDisplay.largeYearFormat === "abbreviated",
      onChange: (checked) => {
        this.yearDisplay.largeYearFormat = checked ? "abbreviated" : "plain";
      }
    });

    const timeBlock = setupGrid.createDiv({
      cls: "time-calendar-editor__setup-block"
    });
    timeBlock.createDiv({
      cls: "time-event-editor__block-title",
      text: "Time system"
    });

    const timeChecks = timeBlock.createDiv({
      cls: "time-calendar-editor__checkbox-list"
    });

    createCompactCheckbox(timeChecks, {
      label: "Enable exact time",
      checked: this.timeEnabled,
      onChange: (checked) => {
        this.timeEnabled = checked;
        void this.render();
      }
    });

    if (this.timeEnabled) {
      const timeFields = timeBlock.createDiv({
        cls: "time-calendar-editor__mini-grid time-calendar-editor__mini-grid--two"
      });

      createCompactNumberField(timeFields, {
        label: "Hours / day",
        value: String(this.hoursPerDay),
        min: 1,
        onChange: (value) => {
          this.hoursPerDay = Math.max(1, value);
        }
      });

      createCompactNumberField(timeFields, {
        label: "Minutes / hour",
        value: String(this.minutesPerHour),
        min: 1,
        onChange: (value) => {
          this.minutesPerHour = Math.max(1, value);
        }
      });
    }
	
    const bannerBlock = setupGrid.createDiv({
      cls: "time-calendar-editor__setup-block"
    });
    bannerBlock.createDiv({
      cls: "time-event-editor__block-title",
      text: "Calendar banner"
    });
    bannerBlock.createDiv({
      cls: "time-frontmatter-block-note",
      text: "Optional background image for the left vertical banner in calendar view. Stored per calendar so future calendar switching can show different banner art."
    });

    const bannerRow = bannerBlock.createDiv({ cls: "time-event-editor__picker-row" });

    const bannerInput = bannerRow.createEl("input", { cls: "time-event-editor__input" });
    bannerInput.type = "text";
    bannerInput.readOnly = true;
    bannerInput.placeholder = "No banner image selected";
    bannerInput.value = getDisplayFileName(this.bannerImageRef);
    bannerInput.title = this.bannerImageRef || "No banner image selected";
    bannerInput.addClass("time-event-editor__picker-display");

    const browseBannerButton = bannerRow.createEl("button", {
      cls: "time-event-editor__picker-button"
    });
    browseBannerButton.type = "button";
    browseBannerButton.setAttr("aria-label", "Browse banner image");
    browseBannerButton.title = "Browse";
    setIcon(browseBannerButton, "folder-open");
    browseBannerButton.addEventListener("click", () => {
      new VaultImagePickerModal(this.app, (file) => {
        this.bannerImageRef = file.path;
        void this.render();
      }).open();
    });

    const clearBannerButton = bannerRow.createEl("button", {
      cls: "time-event-editor__picker-button"
    });
    clearBannerButton.type = "button";
    clearBannerButton.setAttr("aria-label", "Clear banner image");
    clearBannerButton.title = "Clear";
    setIcon(clearBannerButton, "x");
    clearBannerButton.addEventListener("click", () => {
      this.bannerImageRef = "";
      void this.render();
    });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText(this.existing ? "Save" : "Create calendar");
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
  
  private getSeasonCycleLength(): number {
  return getSeasonCycleLengthForDraft(this.weatherProfile, this.months);
  }
  
  private getLeapSettingsSummary(): string {
    const weatherSummary =
      this.weatherProfile.mode === "absolute-day-cycle"
        ? `fixed ${this.weatherProfile.climateYearLength}-day climate cycle`
        : "calendar year mapping";

    const resetSummary =
      this.weatherProfile.mode === "absolute-day-cycle"
        ? this.weatherProfile.cycleReset === "none"
          ? "no climate reset"
          : "resets at intercalation cycle"
        : null;

    return [
      `${this.leapMonths.length} leap month rule${this.leapMonths.length === 1 ? "" : "s"}`,
      `${this.leapDays.length} leap day rule${this.leapDays.length === 1 ? "" : "s"}`,
      weatherSummary,
      resetSummary
    ].filter((entry): entry is string => Boolean(entry)).join(" • ");
  }

  private openLeapSettingsModal(): void {
    new LeapSettingsModal(
      this.app,
      this.months,
      this.leapMonths,
      this.leapDays,
      this.weatherProfile,
      (nextSettings) => {
        this.leapMonths = cloneLeapMonthRules(nextSettings.leapMonths);
        this.leapDays = cloneLeapDayRules(nextSettings.leapDays);
        this.weatherProfile = { ...nextSettings.weatherProfile };
        void this.render();
      }
    ).open();
  }
  
  private openEraEditorModal(): void {
    new EraEditorModal(this.app, this.months, this.eras, (nextEras) => {
      this.eras = nextEras;
      void this.render();
    }).open();
  }

  private openWeekdayEditorModal(): void {
    new WeekdayEditorModal(
      this.app,
      this.weekdays,
      this.startWeekdayIndex,
      (nextWeekdays, nextStartWeekdayIndex) => {
        this.weekdays = nextWeekdays;
        this.startWeekdayIndex = nextStartWeekdayIndex;
        void this.render();
      }
    ).open();
  }

  private openMonthEditorModal(): void {
    new MonthEditorModal(this.app, this.months, this.monthWeekdayMode, (nextMonths, nextMode) => {
      this.months = nextMonths;
	  this.monthWeekdayMode = nextMode;
      void this.render();
    }).open();
  }
  
  private openMoonEditorModal(): void {
    new MoonEditorModal(this.plugin, this.moons, (nextMoons) => {
      this.moons = nextMoons;
      void this.render();
    }).open();
  }

  private openNamedYearEditorModal(): void {
    new NamedYearEditorModal(this.app, this.namedYears, (nextNamedYears) => {
      this.namedYears = nextNamedYears;
      void this.render();
    }).open();
  }

  private getStartWeekdayName(): string {
    if (this.weekdays.length === 0) {
      return "—";
    }

    return this.weekdays[clamp(this.startWeekdayIndex, 0, this.weekdays.length - 1)] ?? "—";
  }
  
  private openSeasonEditorModal(): void {
    new SeasonEditorModal(
      this.app,
      this.getSeasonCycleLength(),
      this.seasons,
      (nextSeasons) => {
        this.seasons = nextSeasons;
        void this.render();
      }
    ).open();
  }

  private async submit(): Promise<void> {
    const sanitizedWeekdays = this.weekdays
      .map((weekday) => weekday.trim())
      .filter((weekday) => weekday.length > 0);

    const sanitizedMonths = this.months.map((month, index) => {
      const safeName = month.name.trim().length > 0 ? month.name.trim() : `Month ${index + 1}`;
      return {
        id: slugify(month.id || safeName),
        name: safeName,
        days: Math.max(1, Math.trunc(month.days || 1)),
        color: normalizeOptionalColor(month.color)
      };
    });

    const sanitizedEras = this.eras
      .map((era, index) => {
        const safeShortName = era.shortName.trim().length > 0 ? era.shortName.trim() : `ERA${index + 1}`;
        const safeName = era.name.trim().length > 0 ? era.name.trim() : `Era ${index + 1}`;
        const safeStartMonthIndex = clamp(era.startMonthIndex, 0, sanitizedMonths.length - 1);
        const safeStartDay = clamp(
          era.startDay,
          1,
          sanitizedMonths[safeStartMonthIndex]?.days ?? 1
        );

        return {
          id: slugify(era.id || safeShortName || safeName),
          name: safeName,
          shortName: safeShortName,
		  ...normalizeEraEndDraft(era, sanitizedMonths),
          startYear: Math.trunc(era.startYear || 0),
          startMonthIndex: safeStartMonthIndex,
          startDay: safeStartDay
        };
      })
      .sort((left, right) => {
        if (left.startYear !== right.startYear) return left.startYear - right.startYear;
        if (left.startMonthIndex !== right.startMonthIndex) return left.startMonthIndex - right.startMonthIndex;
        return left.startDay - right.startDay;
      });

    const name = this.name.trim();
    const id = slugify(this.id || this.name);

    if (name.length === 0) {
      new Notice("Please provide a calendar name.");
      return;
    }

    if (sanitizedWeekdays.length === 0) {
      new Notice("Please define at least one weekday.");
      return;
    }

    if (sanitizedMonths.length === 0) {
      new Notice("Please define at least one month.");
      return;
    }
	
    const sanitizedMoons = this.moons
      .map((moon, index) => {
        const safeName = moon.name.trim().length > 0 ? moon.name.trim() : `Moon ${index + 1}`;
        const safePhaseCount = Math.max(1, Math.trunc(moon.phaseCount || 8));
		return {
          id: slugify(moon.id || safeName),
          name: safeName,
          cycleDays: normalizePositiveDecimal(moon.cycleDays, 1),
          offsetDays: normalizeFiniteDecimal(moon.offsetDays, 0),
          cycleAnchor: normalizeMoonCycleAnchor(moon.cycleAnchor),
          color: normalizeColor(moon.color),
          phaseCount: safePhaseCount,
          size: normalizeMoonSize(moon.size),
          phaseImages: sanitizeMoonPhaseImages(moon.phaseImages, safePhaseCount),
          phaseLabels: sanitizeMoonPhaseLabels(moon.phaseLabels, safePhaseCount)
        };
      });

    const sanitizedNamedYears = this.namedYears
      .map((entry, index) => ({
        year: Math.trunc(entry.year || index + 1),
        name: entry.name.trim()
      }))
      .filter((entry) => entry.name.length > 0);

    const sanitizedSeasons = this.seasons.map((season, index) => {
      const seasonCycleLength = getSeasonCycleLengthForDraft(this.weatherProfile, sanitizedMonths);
      const safeName = season.name.trim().length > 0 ? season.name.trim() : `Season ${index + 1}`;

      return {
        id: slugify(season.id || safeName),
        name: safeName,
        startDay: clamp(season.startDay, 1, seasonCycleLength),
        endDay: clamp(season.endDay, 1, seasonCycleLength),
        color: normalizeColor(season.color)
      };
    });
	
    const sanitizedLeapMonths = this.leapMonths.map((rule, index) => {
      const safeName = rule.name.trim().length > 0 ? rule.name.trim() : `Leap Month ${index + 1}`;
      const cycleYears = Math.max(1, Math.trunc(rule.cycleYears || 1));

      return {
        id: slugify(rule.id || safeName),
        name: safeName,
        insertAfterMonthIndex: clamp(
          rule.insertAfterMonthIndex,
          -1,
          Math.max(-1, sanitizedMonths.length - 1)
        ),
        month: {
          id: slugify(rule.month.id || safeName),
          name: rule.month.name.trim().length > 0 ? rule.month.name.trim() : safeName,
          days: Math.max(1, Math.trunc(rule.month.days || 1))
        },
        cycleYears,
        leapYearPositions: sanitizeLeapYearPositions(rule.leapYearPositions, cycleYears)
      };
    });

    const sanitizedLeapDays = this.leapDays.map((rule, index) => {
      const safeName = rule.name.trim().length > 0 ? rule.name.trim() : `Leap Day ${index + 1}`;
      const cycleYears = Math.max(1, Math.trunc(rule.cycleYears || 1));

      return {
        id: slugify(rule.id || safeName),
        name: safeName,
        placement:
          rule.placement === "append-to-month"
            ? "append-to-month"
            : "standalone",
        insertAfterMonthIndex: clamp(
          rule.insertAfterMonthIndex,
          -1,
          Math.max(-1, sanitizedMonths.length - 1)
        ),
        days: Math.max(1, Math.trunc(rule.days || 1)),
        cycleYears,
        leapYearPositions: sanitizeLeapYearPositions(rule.leapYearPositions, cycleYears)
      };
    });

    if (!this.existing && (await this.plugin.calendarExists(id))) {
      new Notice(`A calendar with the ID "${id}" already exists.`);
      return;
    }

    const calendar = normalizeCalendarFile({
      version: 1,
      kind: "calendar",
      id,
      name,
      description: this.description,
      definition: {
        id,
        name,
        eraLabel: sanitizedEras[0]?.shortName ?? "",
        eras: sanitizedEras,
        weekdays: sanitizedWeekdays,
        months: sanitizedMonths,
        leapMonths: sanitizedLeapMonths,
        leapDays: sanitizedLeapDays,
        weatherProfile: this.weatherProfile,
        moons: sanitizedMoons,
        yearNames: sanitizedNamedYears,
        startWeekdayIndex: clamp(this.startWeekdayIndex, 0, sanitizedWeekdays.length - 1),
		monthWeekdayMode: this.monthWeekdayMode,
        seasons: sanitizedSeasons,
        time: {
          enabled: this.timeEnabled,
          hoursPerDay: Math.max(1, Math.trunc(this.hoursPerDay)),
          minutesPerHour: Math.max(1, Math.trunc(this.minutesPerHour))
        },
        yearDisplay: { ...this.yearDisplay }
      },
      state: {
        activeView: this.savedActiveView,
        todayDate: {
          year: this.todayYear,
          monthIndex: this.todayMonthIndex,
          day: this.todayDay
        },
        cursorDate: this.existing?.state.cursorDate ?? {
          year: this.todayYear,
          monthIndex: this.todayMonthIndex,
          day: this.todayDay
        }
      },
      bannerImageRef: this.bannerImageRef.trim() || undefined,
	  defaultWeatherPackId: this.defaultWeatherPackId,
	  autoGenerateLinkedWeatherReferences: this.autoGenerateLinkedWeatherReferences,
	  timeline: cloneCalendarTimelineStyle(this.timeline),
      linkedTagPackIds: [...this.selectedTagPackIds],
	  linkedWeatherPackIds: [...this.selectedWeatherPackIds],
      markers: this.existing?.markers ?? []
    });

    await this.plugin.saveCalendar(calendar, true);
    this.close();
    this.onSaved?.();
    new Notice(`Saved calendar "${calendar.name}".`);
  }
}

class CalendarWeatherPacksModal extends Modal {
  private defaultWeatherPackId: string;
  private readonly linkedWeatherPackIds: Set<string>;
  private autoGenerateLinkedWeatherReferences: boolean;

  constructor(
    private readonly plugin: TtrpgToolsTimePlugin,
    defaultWeatherPackId: string,
    linkedWeatherPackIds: string[],
    autoGenerateLinkedWeatherReferences: boolean,
    private readonly onSave: (result: CalendarWeatherPackSettingsResult) => void
  ) {
    super(plugin.app);
    this.defaultWeatherPackId = defaultWeatherPackId;
    this.linkedWeatherPackIds = new Set(linkedWeatherPackIds);
    this.autoGenerateLinkedWeatherReferences = autoGenerateLinkedWeatherReferences;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const weatherPacks = await this.plugin.listWeatherPacks();

    if (weatherPacks.length > 0 && !weatherPacks.some((pack) => pack.id === this.defaultWeatherPackId)) {
      this.defaultWeatherPackId = weatherPacks[0]?.id ?? "";
    }

    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", { text: "Calendar weather packs" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Configure the default weather pack, linked weather packs, and automatic reference generation for this calendar."
    });

    if (weatherPacks.length === 0) {
      contentEl.createDiv({
        cls: "time-manager__empty",
        text: "No weather packs available yet."
      });

      const footer = contentEl.createDiv({ cls: "time-modal__footer" });
      createManagerButton(footer, "Manage weather packs", () => {
        this.plugin.openManageWeatherPacksModal();
      }, false, true);
      createManagerButton(footer, "Close", () => {
        this.close();
      });
      return;
    }

    new Setting(contentEl)
      .setName("Default weather pack")
      .setDesc("Used when a day-view weather year is created.")
      .addDropdown((dropdown) => {
        weatherPacks.forEach((pack) => {
          dropdown.addOption(pack.id, pack.name);
        });
        dropdown.setValue(this.defaultWeatherPackId);
        dropdown.onChange((value) => {
          this.defaultWeatherPackId = value;
        });
      })
      .addExtraButton((button) => {
        button.setIcon("settings");
        button.setTooltip("Manage weather packs");
        button.onClick(() => {
          this.plugin.openManageWeatherPacksModal();
        });
      });

    new Setting(contentEl)
      .setName("Auto-generate linked weather references")
      .setDesc(
        "When enabled, opening/navigating to a year will ensure reference-year JSON files exist for all linked weather packs plus the default pack."
      )
      .addToggle((toggle) => {
        toggle.setValue(this.autoGenerateLinkedWeatherReferences);
        toggle.onChange((value) => {
          this.autoGenerateLinkedWeatherReferences = value;
        });
      });

    contentEl.createEl("h3", { text: "Linked weather packs" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "These packs belong to this calendar ecosystem."
    });

    weatherPacks.forEach((pack) => {
      new Setting(contentEl)
        .setName(pack.name)
        .setDesc(pack.id === this.defaultWeatherPackId ? "Default weather pack" : pack.id)
        .addToggle((toggle) => {
          toggle.setValue(this.linkedWeatherPackIds.has(pack.id));
          toggle.onChange((value) => {
            if (value) {
              this.linkedWeatherPackIds.add(pack.id);
            } else {
              this.linkedWeatherPackIds.delete(pack.id);
            }
          });
        });
    });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    createManagerButton(footer, "Save", () => {
      this.onSave({
        defaultWeatherPackId: this.defaultWeatherPackId,
        linkedWeatherPackIds: [...this.linkedWeatherPackIds].sort((left, right) =>
          left.localeCompare(right, undefined, { sensitivity: "base" })
        ),
        autoGenerateLinkedWeatherReferences: this.autoGenerateLinkedWeatherReferences
      });
      this.close();
    }, false, true);

    createManagerButton(footer, "Manage weather packs", () => {
      this.plugin.openManageWeatherPacksModal();
    });

    createManagerButton(footer, "Cancel", () => {
      this.close();
    });
  }
}

class CalendarTagPacksModal extends Modal {
  private readonly linkedTagPackIds: Set<string>;

  constructor(
    private readonly plugin: TtrpgToolsTimePlugin,
    linkedTagPackIds: string[],
    private readonly onSave: (tagPackIds: string[]) => void
  ) {
    super(plugin.app);
    this.linkedTagPackIds = new Set(linkedTagPackIds);
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const tagPacks = await this.plugin.listTagPacks();

    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", { text: "Calendar tag packs" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Choose which tag packs are linked to this calendar."
    });

    if (tagPacks.length === 0) {
      contentEl.createDiv({
        cls: "time-manager__empty",
        text: "No tag packs available yet."
      });

      const footer = contentEl.createDiv({ cls: "time-modal__footer" });
      createManagerButton(footer, "Manage tag packs", () => {
        this.plugin.openManageTagPacksModal();
      }, false, true);
      createManagerButton(footer, "Close", () => {
        this.close();
      });
      return;
    }

    tagPacks.forEach((pack) => {
      new Setting(contentEl)
        .setName(pack.name)
        .setDesc(`${pack.tags.length} tags`)
        .addToggle((toggle) => {
          toggle.setValue(this.linkedTagPackIds.has(pack.id));
          toggle.onChange((value) => {
            if (value) {
              this.linkedTagPackIds.add(pack.id);
            } else {
              this.linkedTagPackIds.delete(pack.id);
            }
          });
        });
    });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    createManagerButton(footer, "Save", () => {
      this.onSave(
        [...this.linkedTagPackIds].sort((left, right) =>
          left.localeCompare(right, undefined, { sensitivity: "base" })
        )
      );
      this.close();
    }, false, true);

    createManagerButton(footer, "Manage tag packs", () => {
      this.plugin.openManageTagPacksModal();
    });

    createManagerButton(footer, "Cancel", () => {
      this.close();
    });
  }
}

class TimelineStyleModal extends Modal {
  private readonly onSave: (timeline: CalendarTimelineStyle | undefined) => void;
  private draft: CalendarTimelineStyle;
  private monthNamesText: string;

  constructor(
    app: App,
    timeline: CalendarTimelineStyle | undefined,
    onSave: (timeline: CalendarTimelineStyle | undefined) => void
  ) {
    super(app);
    this.onSave = onSave;
    this.draft = cloneCalendarTimelineStyle(timeline) ?? {};
    this.draft.colors = { ...(this.draft.colors ?? {}) };
    this.monthNamesText = formatTimelineMonthNames(this.draft.monthNames);
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", {
      text: this.draft.name?.trim() ? "Edit timeline" : "Create timeline"
    });

    new Setting(contentEl)
      .setName("Name")
      .setDesc("Example: travel")
      .addText((text) => {
        text.setValue(this.draft.name ?? "");
        text.onChange((value) => {
          this.draft.name = value.trim() || undefined;
        });
      });

    new Setting(contentEl)
      .setName("Alignment")
      .setDesc("Where the image is placed in the cross layout.")
      .addDropdown((dropdown) => {
        const current: TimelineAlign = this.draft.align ?? "left";
        dropdown.addOption("left", "Left (image left)");
        dropdown.addOption("right", "Right (image right)");
        dropdown.setValue(current);
        dropdown.onChange((value) => {
          this.draft.align = value === "right" ? "right" : "left";
        });
      });
	  
    new Setting(contentEl)
      .setName("Show moon phases")
      .setDesc("Shows the moon phases for the currently selected calendar date in the timeline header.")
      .addToggle((toggle) => {
        toggle.setValue(this.draft.showMoons === true);
        toggle.onChange((value) => {
          this.draft.showMoons = value || undefined;
          this.render();
        });
      });

    if (this.draft.showMoons) {
      new Setting(contentEl)
        .setName("Moon size")
        .setDesc("Size of each moon icon in pixels.")
        .addSlider((slider) => {
          slider
            .setLimits(12, 128, 1)
            .setValue(this.draft.moonSize ?? 28)
            .setDynamicTooltip()
            .onChange((value) => {
              this.draft.moonSize = Math.trunc(value);
            });
        });
    }

    const addOptionalNumberField = (
      name: string,
      value: number | undefined,
      placeholder: string,
      assign: (value: number | undefined) => void
    ) => {
      new Setting(contentEl)
        .setName(name)
        .setDesc("Empty = use defaults")
        .addText((text) => {
          text.setPlaceholder(placeholder);
          text.setValue(value != null ? String(value) : "");
          text.onChange((inputValue) => {
            const trimmed = inputValue.trim();
            if (trimmed.length === 0) {
              assign(undefined);
              return;
            }

            const parsed = Number(trimmed);
            if (Number.isFinite(parsed)) {
              assign(Math.trunc(parsed));
            }
          });
        });
    };

    addOptionalNumberField(
      "Max. summary lines",
      this.draft.maxSummaryLines,
      "7",
      (value) => {
        this.draft.maxSummaryLines = value;
      }
    );

    addOptionalNumberField(
      "Image width",
      this.draft.cardWidth,
      "200",
      (value) => {
        this.draft.cardWidth = value;
      }
    );

    addOptionalNumberField(
      "Image height",
      this.draft.cardHeight,
      "315",
      (value) => {
        this.draft.cardHeight = value;
      }
    );

    addOptionalNumberField(
      "Box height",
      this.draft.boxHeight,
      "289",
      (value) => {
        this.draft.boxHeight = value;
      }
    );

    addOptionalNumberField(
      "Inner left padding",
      this.draft.sideGapLeft,
      "40",
      (value) => {
        this.draft.sideGapLeft = value;
      }
    );

    addOptionalNumberField(
      "Inner right padding",
      this.draft.sideGapRight,
      "40",
      (value) => {
        this.draft.sideGapRight = value;
      }
    );

    new Setting(contentEl)
      .setName("Box background")
      .setDesc("Empty = default/theme color")
      .addColorPicker((picker) => {
        picker.setValue(this.draft.colors?.bg || "");
        picker.onChange((value) => {
          this.draft.colors ??= {};
          this.draft.colors.bg = value || undefined;
        });
      });

    new Setting(contentEl)
      .setName("Box border")
      .setDesc("Empty = default/theme color")
      .addColorPicker((picker) => {
        picker.setValue(this.draft.colors?.accent || "");
        picker.onChange((value) => {
          this.draft.colors ??= {};
          this.draft.colors.accent = value || undefined;
        });
      });

    new Setting(contentEl)
      .setName("Hover background")
      .setDesc("Empty = default/theme color")
      .addColorPicker((picker) => {
        picker.setValue(this.draft.colors?.hover || "");
        picker.onChange((value) => {
          this.draft.colors ??= {};
          this.draft.colors.hover = value || undefined;
        });
      });

    new Setting(contentEl)
      .setName("Title color")
      .setDesc("Empty = default/theme color")
      .addColorPicker((picker) => {
        picker.setValue(this.draft.colors?.title || "");
        picker.onChange((value) => {
          this.draft.colors ??= {};
          this.draft.colors.title = value || undefined;
        });
      });

    new Setting(contentEl)
      .setName("Date color")
      .setDesc("Empty = default/theme color")
      .addColorPicker((picker) => {
        picker.setValue(this.draft.colors?.date || "");
        picker.onChange((value) => {
          this.draft.colors ??= {};
          this.draft.colors.date = value || undefined;
        });
      });

    new Setting(contentEl)
      .setName("Month names")
      .setDesc("Set own month names. Separate them with comma.")
      .addTextArea((text) => {
        text.inputEl.rows = 3;
        text.setValue(this.monthNamesText);
        text.onChange((value) => {
          this.monthNamesText = value;
        });
      });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => this.submit());
    });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private submit(): void {
    const nextTimeline = normalizeCalendarTimelineStyle({
      ...this.draft,
      monthNames: parseTimelineMonthNames(this.monthNamesText)
    });

    this.onSave(nextTimeline);
    this.close();
  }
}

class EraEditorModal extends Modal {
  private readonly months: MonthDraft[];
  private eras: EraDraft[];
  private readonly onSave: (eras: EraDraft[]) => void;

  constructor(
    app: App,
    months: MonthDraft[],
    eras: EraDraft[],
    onSave: (eras: EraDraft[]) => void
  ) {
    super(app);
	this.months = months.map((month) => ({ ...month }));
    this.eras = eras.map((era) => ({ ...era }));
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");
    contentEl.createEl("h2", { text: "Configure eras" });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });
	
    if (this.eras.length > 0) {
      const header = list.createDiv({
        cls: "time-collection-editor__row time-collection-editor__row--era time-collection-editor__row--era-header"
      });
      ["Name", "Short", "Start year", "Start month", "Start day", "End year", "End month", "End day", ""].forEach((label) => {
        header.createDiv({
          cls: "time-collection-editor__column-label",
          text: label
        });
      });
    }

    if (this.eras.length === 0) {
      list.createDiv({ cls: "time-collection-editor__empty", text: "No eras defined yet." });
    }

    this.eras.forEach((era, index) => {
      const row = list.createDiv({ cls: "time-collection-editor__row time-collection-editor__row--era" });

      const nameInput = row.createEl("input", { cls: "time-collection-editor__input" });
      nameInput.type = "text";
      nameInput.placeholder = "Era name";
      nameInput.value = era.name;
      nameInput.addEventListener("input", () => {
        this.eras[index].name = nameInput.value;
      });

      const shortInput = row.createEl("input", { cls: "time-collection-editor__input" });
      shortInput.type = "text";
      shortInput.placeholder = "Short label";
      shortInput.value = era.shortName;
      shortInput.addEventListener("input", () => {
        this.eras[index].shortName = shortInput.value;
      });

      const startYearInput = row.createEl("input", { cls: "time-collection-editor__input" });
      startYearInput.type = "number";
      startYearInput.value = String(era.startYear);
      startYearInput.addEventListener("input", () => {
        this.eras[index].startYear = Math.trunc(Number(startYearInput.value) || 0);
      });
	  
      const startMonthSelect = createMonthSelect(
        row,
        this.months.length > 0 ? this.months : [{ id: "month-1", name: "Month 1", days: 30 }],
        era.startMonthIndex,
        "time-collection-editor__input"
      );
      startMonthSelect.addEventListener("change", () => {
        this.eras[index].startMonthIndex = Math.trunc(Number(startMonthSelect.value) || 0);
      });

      const startDayInput = row.createEl("input", { cls: "time-collection-editor__input" });
      startDayInput.type = "number";
      startDayInput.min = "1";
      startDayInput.value = String(era.startDay);
      startDayInput.addEventListener("input", () => {
        this.eras[index].startDay = Math.max(1, Math.trunc(Number(startDayInput.value) || 1));
      });
	  
      const endYearInput = row.createEl("input", { cls: "time-collection-editor__input" });
      endYearInput.type = "number";
      endYearInput.placeholder = "Open";
      endYearInput.value = era.endYear == null ? "" : String(era.endYear);
      endYearInput.addEventListener("input", () => {
        this.eras[index].endYear = parseNullableInt(endYearInput.value);
      });

      const endMonthSelect = createOptionalMonthSelect(row, this.months, era.endMonthIndex, "time-collection-editor__input");
      endMonthSelect.addEventListener("change", () => {
        this.eras[index].endMonthIndex = endMonthSelect.value === "" ? null : Math.trunc(Number(endMonthSelect.value) || 0);
      });

      const endDayInput = row.createEl("input", { cls: "time-collection-editor__input" });
      endDayInput.type = "number";
      endDayInput.min = "1";
      endDayInput.placeholder = "Open";
      endDayInput.value = era.endDay == null ? "" : String(era.endDay);
      endDayInput.addEventListener("input", () => {
        this.eras[index].endDay = parseNullableInt(endDayInput.value);
      });

      createDeleteIconButton(row, () => {
        this.eras.splice(index, 1);
        this.render();
      });
    });

    const toolbar = contentEl.createDiv({ cls: "time-collection-editor__toolbar" });
    createManagerButton(toolbar, "Add era", () => {
      this.eras.push({
        id: "",
        name: `Era ${this.eras.length + 1}`,
        shortName: `ERA${this.eras.length + 1}`,
        startYear: 0,
        startMonthIndex: 0,
        startDay: 1
      });
      this.render();
    }, false, true);

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => this.submit());
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private submit(): void {
    const months = this.months.length > 0 ? this.months : [{ id: "month-1", name: "Month 1", days: 30 }];
    const sanitized = this.eras.map((era, index) => {
      const safeShortName = era.shortName.trim().length > 0 ? era.shortName.trim() : `ERA${index + 1}`;
      const safeName = era.name.trim().length > 0 ? era.name.trim() : `Era ${index + 1}`;
      const safeStartMonthIndex = clamp(era.startMonthIndex, 0, months.length - 1);
      const safeStartDay = clamp(era.startDay, 1, months[safeStartMonthIndex]?.days ?? 1);
	  const normalizedEnd = normalizeEraEndDraft(era, months);

      return {
        id: slugify(era.id || safeShortName || safeName),
        name: safeName,
        shortName: safeShortName,
		...normalizedEnd,
        startYear: Math.trunc(era.startYear || 0),
        startMonthIndex: safeStartMonthIndex,
        startDay: safeStartDay
      };
    }).sort((left, right) => {
      if (left.startYear !== right.startYear) return left.startYear - right.startYear;
      if (left.startMonthIndex !== right.startMonthIndex) return left.startMonthIndex - right.startMonthIndex;
      return left.startDay - right.startDay;
    });
	
    for (const era of sanitized) {
      if (typeof era.endYear === "number") {
        if (compareEraDateParts(
          { year: era.startYear, monthIndex: era.startMonthIndex, day: era.startDay },
          { year: era.endYear, monthIndex: era.endMonthIndex ?? 0, day: era.endDay ?? 1 }
        ) > 0) {
          new Notice(`Era "${era.name}" ends before it starts.`);
          return;
        }
      }
    }

    for (let index = 0; index < sanitized.length - 1; index += 1) {
      if (doErasOverlap(sanitized[index], sanitized[index + 1], months)) {
        new Notice(`Eras "${sanitized[index].name}" and "${sanitized[index + 1].name}" overlap.`);
        return;
      }
    }

    this.onSave(sanitized);
    this.close();
  }
}

class WeekdayEditorModal extends Modal {
  private weekdays: string[];
  private startWeekdayIndex: number;
  private readonly onSave: (weekdays: string[], startWeekdayIndex: number) => void;

  constructor(
    app: App,
    weekdays: string[],
    startWeekdayIndex: number,
    onSave: (weekdays: string[], startWeekdayIndex: number) => void
  ) {
    super(app);
    this.weekdays = [...weekdays];
    this.startWeekdayIndex = startWeekdayIndex;
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");
    contentEl.createEl("h2", { text: "Configure weekdays" });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });

    if (this.weekdays.length === 0) {
      list.createDiv({ cls: "time-collection-editor__empty", text: "No weekdays defined yet." });
    }

    this.weekdays.forEach((weekday, index) => {
      const row = list.createDiv({ cls: "time-collection-editor__row time-collection-editor__row--weekday" });
      const input = row.createEl("input", { cls: "time-collection-editor__input" });
      input.type = "text";
      input.placeholder = "Weekday name";
      input.value = weekday;
      input.addEventListener("input", () => {
        this.weekdays[index] = input.value;
      });

      createDeleteIconButton(row, () => {
        this.weekdays.splice(index, 1);
        this.startWeekdayIndex = clamp(this.startWeekdayIndex, 0, Math.max(0, this.weekdays.length - 1));
        this.render();
      });
    });

    new Setting(contentEl)
      .setName("Start weekday")
      .setDesc("Weekday index used for year 0 / month 1 / day 1.")
      .addDropdown((dropdown) => {
        if (this.weekdays.length === 0) {
          dropdown.addOption("0", "No weekdays defined");
          dropdown.setValue("0");
          dropdown.setDisabled(true);
          return;
        }

        this.weekdays.forEach((weekday, index) => {
          dropdown.addOption(String(index), weekday.trim().length > 0 ? weekday : `Weekday ${index + 1}`);
        });
        dropdown.setValue(String(clamp(this.startWeekdayIndex, 0, this.weekdays.length - 1)));
        dropdown.onChange((value) => {
          this.startWeekdayIndex = clamp(Number(value) || 0, 0, this.weekdays.length - 1);
        });
      });

    const toolbar = contentEl.createDiv({ cls: "time-collection-editor__toolbar" });
    createManagerButton(toolbar, "Add weekday", () => {
      this.weekdays.push("");
      this.render();
    }, false, true);

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => this.submit());
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private submit(): void {
    const sanitized = this.weekdays
      .map((weekday) => weekday.trim())
      .filter((weekday) => weekday.length > 0);

    if (sanitized.length === 0) {
      new Notice("Please define at least one weekday.");
      return;
    }

    this.onSave(sanitized, clamp(this.startWeekdayIndex, 0, sanitized.length - 1));
    this.close();
  }
}

class MonthEditorModal extends Modal {
  private monthWeekdayMode: MonthWeekdayMode;
  private months: MonthDraft[];
  private readonly onSave: (months: MonthDraft[], monthWeekdayMode: MonthWeekdayMode) => void;

  constructor(
    app: App,
    months: MonthDraft[],
    monthWeekdayMode: MonthWeekdayMode,
    onSave: (months: MonthDraft[], monthWeekdayMode: MonthWeekdayMode) => void
  ) {
    super(app);
    this.months = months.map((month) => ({
      ...month,
      color: month.color ?? ""
    }));
	this.monthWeekdayMode = monthWeekdayMode;
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");
    contentEl.createEl("h2", { text: "Configure months" });
	
    new Setting(contentEl)
      .setName("Weekday flow between months")
      .setDesc("Continuous = next month continues weekday flow. Reset = every month starts on the configured start weekday.")
      .addDropdown((dropdown) => {
        dropdown.addOption("continuous", "Continuous");
        dropdown.addOption("reset", "Reset every month");
        dropdown.setValue(this.monthWeekdayMode);
        dropdown.onChange((value) => {
          this.monthWeekdayMode = value === "reset" ? "reset" : "continuous";
        });
      });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });

    if (this.months.length === 0) {
      list.createDiv({ cls: "time-collection-editor__empty", text: "No months defined yet." });
    }

    this.months.forEach((month, index) => {
      const row = list.createDiv({ cls: "time-collection-editor__row time-collection-editor__row--month" });

      const nameInput = row.createEl("input", { cls: "time-collection-editor__input" });
      nameInput.type = "text";
      nameInput.placeholder = "Month name";
      nameInput.value = month.name;
      nameInput.addEventListener("input", () => {
        this.months[index].name = nameInput.value;
      });

      const daysInput = row.createEl("input", { cls: "time-collection-editor__input" });
      daysInput.type = "number";
      daysInput.min = "1";
      daysInput.value = String(month.days);
      daysInput.addEventListener("input", () => {
        this.months[index].days = Math.max(1, Math.trunc(Number(daysInput.value) || 1));
      });
	  
      const colorInput = row.createEl("input", {
        cls: "time-season-editor__color"
      });
      colorInput.type = "color";
      colorInput.setAttr("aria-label", "Month color");
      colorInput.title = "Month color";
      colorInput.value = normalizeColor(month.color || "#d46b65");
      colorInput.addEventListener("input", () => {
        this.months[index].color = colorInput.value;
        colorText.value = colorInput.value;
      });

      const colorText = row.createEl("input", {
        cls: "time-collection-editor__input"
      });
      colorText.type = "text";
      colorText.placeholder = "#d46b65";
      colorText.setAttr("aria-label", "Month color hex value");
      colorText.title = "Month color hex value";
      colorText.value = month.color;
      colorText.addEventListener("change", () => {
        const next = normalizeOptionalColor(colorText.value);
        this.months[index].color = next ?? "";
        colorInput.value = normalizeColor(next ?? "#d46b65");
        colorText.value = next ?? "";
      });

      createDeleteIconButton(row, () => {
        this.months.splice(index, 1);
        this.render();
      });
    });

    const toolbar = contentEl.createDiv({ cls: "time-collection-editor__toolbar" });
    createManagerButton(toolbar, "Add month", () => {
      this.months.push({
        id: "",
        name: `Month ${this.months.length + 1}`,
        days: 30,
        color: ""
      });
      this.render();
    }, false, true);

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => this.submit());
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private submit(): void {
    const sanitized = this.months.map((month, index) => {
      const safeName = month.name.trim().length > 0 ? month.name.trim() : `Month ${index + 1}`;
      return {
        id: slugify(month.id || safeName),
        name: safeName,
        days: Math.max(1, Math.trunc(month.days || 1)),
        color: normalizeOptionalColor(month.color)
      };
    });

    if (sanitized.length === 0) {
      new Notice("Please define at least one month.");
      return;
    }

    this.onSave(sanitized, this.monthWeekdayMode);
    this.close();
  }
}

class LeapMonthEditorModal extends Modal {
  private readonly months: MonthDraft[];
  private rules: FantasyLeapMonthRule[];
  private readonly onSave: (rules: FantasyLeapMonthRule[]) => void;

  constructor(
    app: App,
    months: MonthDraft[],
    rules: FantasyLeapMonthRule[],
    onSave: (rules: FantasyLeapMonthRule[]) => void
  ) {
    super(app);
    this.months = months.map((month) => ({ ...month }));
    this.rules = rules.map((rule) => ({
      ...rule,
      month: { ...rule.month },
      leapYearPositions: [...rule.leapYearPositions]
    }));
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", { text: "Configure leap months" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Leap months are inserted as additional months in matching years."
    });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });

    if (this.rules.length === 0) {
      list.createDiv({
        cls: "time-collection-editor__empty",
        text: "No leap month rules defined yet."
      });
    }
	
    if (this.rules.length > 0) {
      const header = list.createDiv({
        cls: "time-collection-editor__row time-collection-editor__row--leap-rule time-collection-editor__row--leap-rule-header"
      });

      ["Name", "Insert after", "Days", "Cycle", "Year Positions", ""].forEach((label) => {
        header.createDiv({
          cls: "time-collection-editor__column-label",
          text: label
        });
      });
    }

    this.rules.forEach((rule, index) => {
      const row = list.createDiv({
        cls: "time-collection-editor__row time-collection-editor__row--leap-rule"
      });

      const nameInput = row.createEl("input", { cls: "time-collection-editor__input" });
      nameInput.type = "text";
      nameInput.placeholder = "Leap month name";
      nameInput.value = rule.name;
      nameInput.addEventListener("input", () => {
        this.rules[index].name = nameInput.value;
        this.rules[index].month.name = nameInput.value;
      });

      const insertSelect = createMonthInsertionSelect(
        row,
        this.months,
        rule.insertAfterMonthIndex,
        "time-collection-editor__input"
      );
      insertSelect.addEventListener("change", () => {
        this.rules[index].insertAfterMonthIndex = Math.trunc(Number(insertSelect.value) || 0);
      });

      const daysInput = row.createEl("input", { cls: "time-collection-editor__input" });
      daysInput.type = "number";
      daysInput.min = "1";
      daysInput.placeholder = "Days";
      daysInput.value = String(rule.month.days);
      daysInput.addEventListener("input", () => {
        this.rules[index].month.days = Math.max(1, Math.trunc(Number(daysInput.value) || 1));
      });

      const cycleInput = row.createEl("input", { cls: "time-collection-editor__input" });
      cycleInput.type = "number";
      cycleInput.min = "1";
      cycleInput.placeholder = "Cycle";
      cycleInput.value = String(rule.cycleYears);
      cycleInput.addEventListener("input", () => {
        const cycleYears = Math.max(1, Math.trunc(Number(cycleInput.value) || 1));
        this.rules[index].cycleYears = cycleYears;
        this.rules[index].leapYearPositions = sanitizeLeapYearPositions(
          this.rules[index].leapYearPositions,
          cycleYears
        );
      });

      const positionsInput = row.createEl("input", { cls: "time-collection-editor__input" });
      positionsInput.type = "text";
      positionsInput.placeholder = "Positions, e.g. 4";
      positionsInput.value = formatLeapYearPositions(rule.leapYearPositions);
      positionsInput.addEventListener("change", () => {
        this.rules[index].leapYearPositions = parseLeapYearPositions(
          positionsInput.value,
          this.rules[index].cycleYears
        );
        positionsInput.value = formatLeapYearPositions(this.rules[index].leapYearPositions);
      });

      createDeleteIconButton(row, () => {
        this.rules.splice(index, 1);
        this.render();
      });
    });

    const toolbar = contentEl.createDiv({ cls: "time-collection-editor__toolbar" });
    createManagerButton(toolbar, "Add leap month", () => {
      const name = `Leap Month ${this.rules.length + 1}`;
      this.rules.push({
        id: slugify(name),
        name,
        insertAfterMonthIndex: Math.max(0, this.months.length - 1),
        month: {
          id: slugify(name),
          name,
          days: 30
        },
        cycleYears: 4,
        leapYearPositions: [4]
      });
      this.render();
    }, false, true);

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => this.submit());
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private submit(): void {
    this.onSave(this.rules);
    this.close();
  }
}

class LeapDayEditorModal extends Modal {
  private readonly months: MonthDraft[];
  private rules: FantasyLeapDayRule[];
  private readonly onSave: (rules: FantasyLeapDayRule[]) => void;

  constructor(
    app: App,
    months: MonthDraft[],
    rules: FantasyLeapDayRule[],
    onSave: (rules: FantasyLeapDayRule[]) => void
  ) {
    super(app);
    this.months = months.map((month) => ({ ...month }));
    this.rules = rules.map((rule) => ({
      ...rule,
      leapYearPositions: [...rule.leapYearPositions]
    }));
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", { text: "Configure leap days" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Leap days are inserted as intercalary day blocks."
    });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });

    if (this.rules.length === 0) {
      list.createDiv({
        cls: "time-collection-editor__empty",
        text: "No leap day rules defined yet."
      });
    }
	
    if (this.rules.length > 0) {
      const header = list.createDiv({
        cls: "time-collection-editor__row time-collection-editor__row--leap-day-rule time-collection-editor__row--leap-day-rule-header"
      });

      ["Name", "Placement", "Insert after", "Days", "Cycle", "Year Positions", ""].forEach((label) => {
        header.createDiv({
          cls: "time-collection-editor__column-label",
          text: label
        });
      });
    }

    this.rules.forEach((rule, index) => {
      const row = list.createDiv({
        cls: "time-collection-editor__row time-collection-editor__row--leap-day-rule"
      });

      const nameInput = row.createEl("input", { cls: "time-collection-editor__input" });
      nameInput.type = "text";
      nameInput.placeholder = "Leap day name";
      nameInput.value = rule.name;
      nameInput.addEventListener("input", () => {
        this.rules[index].name = nameInput.value;
      });
	  
      const placementSelect = row.createEl("select", { cls: "time-collection-editor__input" });
      addSelectOption(placementSelect, "standalone", "Standalone day block");
      addSelectOption(placementSelect, "append-to-month", "Append to month");
      placementSelect.value = rule.placement ?? "standalone";
      placementSelect.addEventListener("change", () => {
        this.rules[index].placement =
          placementSelect.value === "append-to-month"
            ? "append-to-month"
            : "standalone";
      });

      const insertSelect = createMonthInsertionSelect(
        row,
        this.months,
        rule.insertAfterMonthIndex,
        "time-collection-editor__input"
      );
      insertSelect.addEventListener("change", () => {
        this.rules[index].insertAfterMonthIndex = Math.trunc(Number(insertSelect.value) || 0);
      });

      const daysInput = row.createEl("input", { cls: "time-collection-editor__input" });
      daysInput.type = "number";
      daysInput.min = "1";
      daysInput.placeholder = "Days";
      daysInput.value = String(rule.days);
      daysInput.addEventListener("input", () => {
        this.rules[index].days = Math.max(1, Math.trunc(Number(daysInput.value) || 1));
      });

      const cycleInput = row.createEl("input", { cls: "time-collection-editor__input" });
      cycleInput.type = "number";
      cycleInput.min = "1";
      cycleInput.placeholder = "Cycle";
      cycleInput.value = String(rule.cycleYears);
      cycleInput.addEventListener("input", () => {
        const cycleYears = Math.max(1, Math.trunc(Number(cycleInput.value) || 1));
        this.rules[index].cycleYears = cycleYears;
        this.rules[index].leapYearPositions = sanitizeLeapYearPositions(
          this.rules[index].leapYearPositions,
          cycleYears
        );
      });

      const positionsInput = row.createEl("input", { cls: "time-collection-editor__input" });
      positionsInput.type = "text";
      positionsInput.placeholder = "Positions, e.g. 4";
      positionsInput.value = formatLeapYearPositions(rule.leapYearPositions);
      positionsInput.addEventListener("change", () => {
        this.rules[index].leapYearPositions = parseLeapYearPositions(
          positionsInput.value,
          this.rules[index].cycleYears
        );
        positionsInput.value = formatLeapYearPositions(this.rules[index].leapYearPositions);
      });

      createDeleteIconButton(row, () => {
        this.rules.splice(index, 1);
        this.render();
      });
    });

    const toolbar = contentEl.createDiv({ cls: "time-collection-editor__toolbar" });
    createManagerButton(toolbar, "Add leap day", () => {
      const name = `Leap Day ${this.rules.length + 1}`;
      this.rules.push({
        id: slugify(name),
        name,
		placement: "standalone",
        insertAfterMonthIndex: Math.max(0, this.months.length - 1),
        days: 1,
        cycleYears: 4,
        leapYearPositions: [4]
      });
      this.render();
    }, false, true);

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => this.submit());
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private submit(): void {
    this.onSave(this.rules);
    this.close();
  }
}

interface LeapSettingsModalResult {
  leapMonths: FantasyLeapMonthRule[];
  leapDays: FantasyLeapDayRule[];
  weatherProfile: FantasyWeatherProfileMapping;
}

class LeapSettingsModal extends Modal {
  private readonly months: MonthDraft[];
  private leapMonths: FantasyLeapMonthRule[];
  private leapDays: FantasyLeapDayRule[];
  private weatherProfile: FantasyWeatherProfileMapping;
  private readonly onSave: (result: LeapSettingsModalResult) => void;

  constructor(
    app: App,
    months: MonthDraft[],
    leapMonths: FantasyLeapMonthRule[],
    leapDays: FantasyLeapDayRule[],
    weatherProfile: FantasyWeatherProfileMapping,
    onSave: (result: LeapSettingsModalResult) => void
  ) {
    super(app);
    this.months = months.map((month) => ({ ...month }));
    this.leapMonths = cloneLeapMonthRules(leapMonths);
    this.leapDays = cloneLeapDayRules(leapDays);
    this.weatherProfile = { ...weatherProfile };
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", {
      text: "Configure leap & weather cycle"
    });

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Leap rules change the calendar year length. Weather mapping controls how seasons/weather follow those calendar changes."
    });

    contentEl.createEl("h3", {
      text: "Leap rules"
    });

    new Setting(contentEl)
      .setName("Leap months")
      .setDesc(`${this.leapMonths.length} leap month rule${this.leapMonths.length === 1 ? "" : "s"} defined.`)
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          new LeapMonthEditorModal(
            this.app,
            this.months,
            this.leapMonths,
            (nextRules) => {
              this.leapMonths = cloneLeapMonthRules(nextRules);
              this.render();
            }
          ).open();
        });
      });

    new Setting(contentEl)
      .setName("Leap days")
      .setDesc(`${this.leapDays.length} leap day rule${this.leapDays.length === 1 ? "" : "s"} defined.`)
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          new LeapDayEditorModal(
            this.app,
            this.months,
            this.leapDays,
            (nextRules) => {
              this.leapDays = cloneLeapDayRules(nextRules);
              this.render();
            }
          ).open();
        });
      });

    contentEl.createEl("h3", {
      text: "Weather cycle"
    });

    new Setting(contentEl)
      .setName("Weather year mapping")
      .setDesc(
        this.weatherProfile.mode === "absolute-day-cycle"
          ? `Weather and seasons use a fixed ${this.weatherProfile.climateYearLength}-day climate cycle.`
          : "Weather and seasons follow the actual calendar year, including leap months/days."
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("calendar", "Calendar year/months");
        dropdown.addOption("absolute-day-cycle", "Fixed climate cycle");
        dropdown.setValue(this.weatherProfile.mode);
        dropdown.onChange((value) => {
          this.weatherProfile = {
            ...this.weatherProfile,
            mode: value === "absolute-day-cycle" ? "absolute-day-cycle" : "calendar"
          };
          this.render();
        });
      });

    if (this.weatherProfile.mode === "absolute-day-cycle") {
      const weatherCycleRow = contentEl.createDiv({
        cls: "time-inline-fields time-inline-fields--triple"
      });

      createInlineNumberField(weatherCycleRow, {
        label: "Climate year length",
        value: String(this.weatherProfile.climateYearLength),
        min: 1,
        onChange: (value) => {
          this.weatherProfile = {
            ...this.weatherProfile,
            climateYearLength: Math.max(1, value)
          };
        }
      });

      createInlineNumberField(weatherCycleRow, {
        label: "Base offset days",
        value: String(this.weatherProfile.baseOffsetDays),
        onChange: (value) => {
          this.weatherProfile = {
            ...this.weatherProfile,
            baseOffsetDays: value
          };
        }
      });

      new Setting(contentEl)
        .setName("Climate cycle reset")
        .setDesc("Controls whether the climate cycle restarts with the calendar intercalation cycle.")
        .addDropdown((dropdown) => {
          dropdown.addOption("intercalation-cycle", "Reset at intercalation cycle");
          dropdown.addOption("none", "Never reset");
          dropdown.setValue(this.weatherProfile.cycleReset);
          dropdown.onChange((value) => {
            this.weatherProfile = {
              ...this.weatherProfile,
              cycleReset: value === "none" ? "none" : "intercalation-cycle"
            };
          });
        });
    }

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => {
        this.onSave({
          leapMonths: cloneLeapMonthRules(this.leapMonths),
          leapDays: cloneLeapDayRules(this.leapDays),
          weatherProfile: { ...this.weatherProfile }
        });
        this.close();
      });
    });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }
}

class MoonEditorModal extends Modal {
  private readonly plugin: TtrpgToolsTimePlugin;
  private moons: MoonDraft[];
  private readonly onSave: (moons: MoonDraft[]) => void;

  constructor(
    plugin: TtrpgToolsTimePlugin,
    moons: MoonDraft[],
    onSave: (moons: MoonDraft[]) => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.moons = moons.map((moon) => ({ ...moon }));
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");
    contentEl.createEl("h2", { text: "Configure moons" });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });

    if (this.moons.length === 0) {
      list.createDiv({ cls: "time-collection-editor__empty", text: "No moons defined yet." });
    } else {
      const header = list.createDiv({
        cls: "time-collection-editor__row time-collection-editor__row--moon time-collection-editor__row--moon-header"
      });
      [
        "Name",
        "Cycle",
        "Offset",
		"Anchor",
        "Phases",
        "Size",
        "Color",
		"Labels",
        "Images",
        ""
      ].forEach((label) => {
        header.createDiv({
          cls: "time-collection-editor__column-label",
          text: label
        });
      });
	}

    this.moons.forEach((moon, index) => {
      const row = list.createDiv({ cls: "time-collection-editor__row time-collection-editor__row--moon" });

      const nameInput = row.createEl("input", { cls: "time-collection-editor__input" });
      nameInput.type = "text";
      nameInput.placeholder = "Moon name";
      nameInput.setAttr("aria-label", "Moon name");
      nameInput.title = "Moon name";
      nameInput.value = moon.name;
      nameInput.addEventListener("input", () => {
        this.moons[index].name = nameInput.value;
      });

      const cycleInput = row.createEl("input", { cls: "time-collection-editor__input" });
      cycleInput.type = "number";
      cycleInput.min = "1";
	  cycleInput.step = "any";
      cycleInput.placeholder = "Cycle days";
      cycleInput.setAttr("aria-label", "Cycle days");
      cycleInput.title = "Cycle days";
      cycleInput.value = String(moon.cycleDays);
      cycleInput.addEventListener("input", () => {
        const next = Number(cycleInput.value);
        this.moons[index].cycleDays = Number.isFinite(next) && next > 0 ? next : 1;
      });

      const offsetInput = row.createEl("input", { cls: "time-collection-editor__input" });
      offsetInput.type = "number";
	  offsetInput.step = "any";
      offsetInput.placeholder = "Offset";
      offsetInput.setAttr("aria-label", "Offset days");
      offsetInput.title = "Offset days";
      offsetInput.value = String(moon.offsetDays);
      offsetInput.addEventListener("input", () => {
        const next = Number(offsetInput.value);
        this.moons[index].offsetDays = Number.isFinite(next) ? next : 0;
      });
	  
      const anchorSelect = row.createEl("select", { cls: "time-collection-editor__input" });
      anchorSelect.setAttr("aria-label", "Moon cycle anchor");
      anchorSelect.title = "Moon cycle anchor";

      const absoluteOption = anchorSelect.createEl("option", {
        text: "Continuous"
      });
      absoluteOption.value = "absolute";
      const monthOption = anchorSelect.createEl("option", {
        text: "Month reset"
      });
      monthOption.value = "month";

      anchorSelect.value = moon.cycleAnchor;
      anchorSelect.addEventListener("change", () => {
        this.moons[index].cycleAnchor = normalizeMoonCycleAnchor(anchorSelect.value);
      });

      const phaseCountInput = row.createEl("input", { cls: "time-collection-editor__input" });
      phaseCountInput.type = "number";
      phaseCountInput.min = "1";
      phaseCountInput.placeholder = "Phases";
      phaseCountInput.setAttr("aria-label", "Visible phase count");
      phaseCountInput.title = "Visible phase count";
      phaseCountInput.value = String(moon.phaseCount);
      phaseCountInput.addEventListener("input", () => {
        const nextPhaseCount = Math.max(1, Math.trunc(Number(phaseCountInput.value) || 1));
        this.moons[index].phaseCount = nextPhaseCount;
        this.moons[index].phaseImages = sanitizeMoonPhaseImages(
          this.moons[index].phaseImages,
          nextPhaseCount
        );
      });

      const sizeInput = row.createEl("input", { cls: "time-collection-editor__input" });
      sizeInput.type = "number";
      sizeInput.min = "12";
      sizeInput.max = "300";
      sizeInput.placeholder = "Size";
      sizeInput.setAttr("aria-label", "Moon size");
      sizeInput.title = "Moon size";
      sizeInput.value = String(moon.size);
      sizeInput.addEventListener("input", () => {
        this.moons[index].size = normalizeMoonSize(Number(sizeInput.value) || 28);
      });

      const colorInput = row.createEl("input", { cls: "time-season-editor__color" });
      colorInput.type = "color";
      colorInput.setAttr("aria-label", "Moon color");
      colorInput.title = "Moon color";
      colorInput.value = normalizeColor(moon.color);

      colorInput.addEventListener("input", () => {
        this.moons[index].color = colorInput.value;
      });
	  
      const phaseLabelsButton = row.createEl("button", {
        cls: "time-manager__button",
        text: `Labels (${this.moons[index].phaseLabels.filter((entry) => entry.trim().length > 0).length}/${this.moons[index].phaseCount})`
      });
      phaseLabelsButton.type = "button";
      phaseLabelsButton.addEventListener("click", () => {
        new MoonPhaseLabelsModal(
          this.app,
          this.moons[index].phaseCount,
          this.moons[index].phaseLabels,
          (nextLabels) => {
            this.moons[index].phaseLabels = sanitizeMoonPhaseLabels(nextLabels, this.moons[index].phaseCount);
            this.render();
          }
        ).open();
      });

      const phaseImagesButton = row.createEl("button", {
        cls: "time-manager__button",
        text: `Images (${this.moons[index].phaseImages.length}/${this.moons[index].phaseCount})`
      });
      phaseImagesButton.type = "button";
      phaseImagesButton.setAttr("aria-label", "Configure moon phase images");
      phaseImagesButton.title = "Configure moon phase images";
      phaseImagesButton.addEventListener("click", () => {
        new MoonPhaseImagesModal(
          this.plugin.app,
          this.moons[index].phaseCount,
          this.moons[index].phaseImages,
          (nextImages) => {
            this.moons[index].phaseImages = sanitizeMoonPhaseImages(
              nextImages,
              this.moons[index].phaseCount
            );
            this.render();
          }
        ).open();
      });

      createDeleteIconButton(row, () => {
        this.moons.splice(index, 1);
        this.render();
      });
    });

    const toolbar = contentEl.createDiv({ cls: "time-collection-editor__toolbar" });
    createManagerButton(toolbar, "Add moon", () => {
      this.moons.push({
        id: "",
        name: `Moon ${this.moons.length + 1}`,
        cycleDays: 28,
        offsetDays: 0,
		cycleAnchor: "absolute",
        color: "#d46b65",
        phaseCount: 8,
        size: 28,
        phaseImages: [],
        phaseLabels: []
      });
      this.render();
    }, false, true);

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => this.submit());
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private submit(): void {
    const sanitized = this.moons.map((moon, index) => {
      const safeName = moon.name.trim().length > 0 ? moon.name.trim() : `Moon ${index + 1}`;
      const safePhaseCount = Math.max(1, Math.trunc(moon.phaseCount || 8));
	  return {
        id: slugify(moon.id || safeName),
        name: safeName,
        cycleDays: normalizePositiveDecimal(moon.cycleDays, 1),
        offsetDays: normalizeFiniteDecimal(moon.offsetDays, 0),
        cycleAnchor: normalizeMoonCycleAnchor(moon.cycleAnchor),
        color: normalizeColor(moon.color),
        phaseCount: safePhaseCount,
        size: normalizeMoonSize(moon.size),
        phaseImages: sanitizeMoonPhaseImages(moon.phaseImages, safePhaseCount),
        phaseLabels: sanitizeMoonPhaseLabels(moon.phaseLabels, safePhaseCount)
      };
    });

    this.onSave(sanitized);
    this.close();
  }
}

class MoonPhaseLabelsModal extends Modal {
  private phaseCount: number;
  private phaseLabels: string[];
  private readonly onSave: (phaseLabels: string[]) => void;

  constructor(
    app: App,
    phaseCount: number,
    phaseLabels: string[],
    onSave: (phaseLabels: string[]) => void
  ) {
    super(app);
    this.phaseCount = Math.max(1, Math.trunc(phaseCount || 1));
    this.phaseLabels = sanitizeMoonPhaseLabels(phaseLabels, this.phaseCount);
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");
    contentEl.createEl("h2", { text: "Configure moon phase labels" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Leave a label empty to fall back to the default phase name."
    });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });

    for (let phaseIndex = 0; phaseIndex < this.phaseCount; phaseIndex += 1) {
      const row = list.createDiv({ cls: "time-moon-phase-editor__row" });

      row.createDiv({
        cls: "time-moon-phase-editor__label",
        text: `${phaseIndex + 1}. ${getMoonPhaseLabel(this.phaseCount, phaseIndex)}`
      });

      const input = row.createEl("input", { cls: "time-collection-editor__input" });
      input.type = "text";
      input.placeholder = "Custom label";
      input.value = this.phaseLabels[phaseIndex] ?? "";
      input.addEventListener("input", () => {
        this.phaseLabels[phaseIndex] = input.value;
      });
    }

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => {
        this.onSave(sanitizeMoonPhaseLabels(this.phaseLabels, this.phaseCount));
        this.close();
      });
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }
}

class MoonPhaseImagesModal extends Modal {
  private phaseCount: number;
  private phaseImages: MoonPhaseImageDefinition[];
  private readonly onSave: (phaseImages: MoonPhaseImageDefinition[]) => void;

  constructor(
    app: App,
    phaseCount: number,
    phaseImages: MoonPhaseImageDefinition[],
    onSave: (phaseImages: MoonPhaseImageDefinition[]) => void
  ) {
    super(app);
    this.phaseCount = Math.max(1, Math.trunc(phaseCount || 1));
    this.phaseImages = sanitizeMoonPhaseImages(phaseImages, this.phaseCount);
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");
    contentEl.createEl("h2", { text: "Configure moon phase images" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: `Assign one image per visible moon phase. Current phase count: ${this.phaseCount}.`
    });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });

    for (let phaseIndex = 0; phaseIndex < this.phaseCount; phaseIndex += 1) {
      const current = this.phaseImages.find((entry) => entry.phaseIndex === phaseIndex);
      const row = list.createDiv({ cls: "time-moon-phase-editor__row" });

      row.createDiv({
        cls: "time-moon-phase-editor__label",
        text: `${phaseIndex + 1}. ${getMoonPhaseLabel(this.phaseCount, phaseIndex)}`
      });

      const input = row.createEl("input", { cls: "time-collection-editor__input" });
      input.type = "text";
      input.readOnly = true;
      input.placeholder = "No image selected";
      input.value = current?.imageRef ?? "";

      const browseButton = row.createEl("button", {
        cls: "time-manager__button",
        text: "Browse"
      });
      browseButton.type = "button";
      browseButton.addEventListener("click", () => {
        new VaultImagePickerModal(this.app, (file) => {
          this.upsertPhaseImage(phaseIndex, file.path);
          this.render();
        }).open();
      });

      const clearButton = row.createEl("button", {
        cls: "time-manager__button",
        text: "Clear"
      });
      clearButton.type = "button";
      clearButton.addEventListener("click", () => {
        this.phaseImages = this.phaseImages.filter((entry) => entry.phaseIndex !== phaseIndex);
        this.render();
      });
    }

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => {
        this.onSave(sanitizeMoonPhaseImages(this.phaseImages, this.phaseCount));
        this.close();
      });
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private upsertPhaseImage(phaseIndex: number, imageRef: string): void {
    const next = sanitizeMoonPhaseImages(
      [
        ...this.phaseImages.filter((entry) => entry.phaseIndex !== phaseIndex),
        { phaseIndex, imageRef }
      ],
      this.phaseCount
    );
    this.phaseImages = next;
  }
}

class VaultImagePickerModal extends FuzzySuggestModal<TFile> {
  private readonly files: TFile[];
  private readonly onChooseFile: (file: TFile) => void;

  constructor(app: App, onChooseFile: (file: TFile) => void) {
    super(app);
    this.files = app.vault
      .getFiles()
      .filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()))
      .sort((left, right) =>
        left.path.localeCompare(right.path, undefined, { sensitivity: "base" })
      );
    this.onChooseFile = onChooseFile;
    this.setPlaceholder("Choose moon phase image");
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(item: TFile): string {
    return `${item.basename} ${item.path}`;
  }

  renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
    const file = match.item;
    el.empty();
    el.addClass("time-file-picker__suggestion");
    el.createDiv({
      cls: "time-file-picker__title",
      text: file.basename
    });
    el.createDiv({
      cls: "time-file-picker__path",
      text: file.path
    });
  }

  onChooseItem(item: TFile): void {
    this.onChooseFile(item);
  }
}

function getDisplayFileName(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.split("/").pop() ?? trimmed;
}

class NamedYearEditorModal extends Modal {
  private namedYears: NamedYearDraft[];
  private readonly onSave: (namedYears: NamedYearDraft[]) => void;

  constructor(app: App, namedYears: NamedYearDraft[], onSave: (namedYears: NamedYearDraft[]) => void) {
    super(app);
    this.namedYears = namedYears.map((entry) => ({ ...entry }));
    this.onSave = onSave;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");
    contentEl.createEl("h2", { text: "Configure named years" });

    const list = contentEl.createDiv({ cls: "time-collection-editor__list" });

    if (this.namedYears.length === 0) {
      list.createDiv({ cls: "time-collection-editor__empty", text: "No named years defined yet." });
    }

    this.namedYears.forEach((entry, index) => {
      const row = list.createDiv({ cls: "time-collection-editor__row time-collection-editor__row--named-year" });

      const yearInput = row.createEl("input", { cls: "time-collection-editor__input" });
      yearInput.type = "number";
      yearInput.value = String(entry.year);
      yearInput.addEventListener("input", () => {
        this.namedYears[index].year = Math.trunc(Number(yearInput.value) || 0);
      });

      const nameInput = row.createEl("input", { cls: "time-collection-editor__input" });
      nameInput.type = "text";
      nameInput.placeholder = "Named year";
      nameInput.value = entry.name;
      nameInput.addEventListener("input", () => {
        this.namedYears[index].name = nameInput.value;
      });

      createDeleteIconButton(row, () => {
        this.namedYears.splice(index, 1);
        this.render();
      });
    });

    const toolbar = contentEl.createDiv({ cls: "time-collection-editor__toolbar" });
    createManagerButton(toolbar, "Add named year", () => {
      this.namedYears.push({ year: 1, name: "" });
      this.render();
    }, false, true);

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => this.submit());
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => this.close());
    });
  }

  private submit(): void {
    this.onSave(
      this.namedYears
        .map((entry, index) => ({
          year: Math.trunc(entry.year || index + 1),
          name: entry.name.trim()
        }))
        .filter((entry) => entry.name.length > 0)
    );
    this.close();
  }
}

class SeasonEditorModal extends Modal {
  private readonly cycleLength: number;
  private seasons: SeasonDraft[];
  private readonly onSave: (seasons: SeasonDraft[]) => void;

  constructor(
    app: App,
    cycleLength: number,
    seasons: SeasonDraft[],
    onSave: (seasons: SeasonDraft[]) => void
  ) {
    super(app);
    this.cycleLength = cycleLength;
    this.seasons = seasons.map((season) => ({ ...season }));
    this.onSave = onSave;
  }

  onOpen(): void {
	prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", { text: "Configure seasons" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Define start, end, and color for each season. These colors are used for the top line in calendar cells."
    });

    const list = contentEl.createDiv({ cls: "time-season-editor__list" });

    if (this.seasons.length === 0) {
      list.createDiv({
        cls: "time-season-editor__empty",
        text: "No seasons defined yet."
      });
    }

	this.seasons.forEach((season, index) => {
	  const row = list.createDiv({ cls: "time-season-editor__row" });

	  const nameInput = row.createEl("input", {
		cls: "time-season-editor__input time-season-editor__name"
	  });
	  nameInput.type = "text";
	  nameInput.placeholder = "Season name";
	  nameInput.value = season.name;
	  nameInput.addEventListener("input", () => {
		this.seasons[index].name = nameInput.value;
	  });

	  const startDayInput = row.createEl("input", {
		cls: "time-season-editor__input time-season-editor__day"
	  });
	  startDayInput.type = "number";
	  startDayInput.min = "1";
	  startDayInput.max = String(this.cycleLength);
	  startDayInput.value = String(season.startDay);
	  startDayInput.addEventListener("input", () => {
		this.seasons[index].startDay = clamp(
		  Number(startDayInput.value) || 1,
		  1,
		  this.cycleLength
		);
	  });

	  const endDayInput = row.createEl("input", {
		cls: "time-season-editor__input time-season-editor__day"
	  });
	  endDayInput.type = "number";
	  endDayInput.min = "1";
	  endDayInput.max = String(this.cycleLength);
	  endDayInput.value = String(season.endDay);
	  endDayInput.addEventListener("input", () => {
		this.seasons[index].endDay = clamp(
		  Number(endDayInput.value) || 1,
		  1,
		  this.cycleLength
		);
	  });

	  const colorInput = row.createEl("input", {
		cls: "time-season-editor__color"
	  });
	  colorInput.type = "color";
	  colorInput.value = normalizeColor(season.color);

	  const colorText = row.createEl("input", {
		cls: "time-season-editor__input time-season-editor__hex"
	  });
	  colorText.type = "text";
	  colorText.value = normalizeColor(season.color);

	  colorInput.addEventListener("input", () => {
		this.seasons[index].color = colorInput.value;
		colorText.value = colorInput.value;
	  });

	  colorText.addEventListener("change", () => {
		const next = normalizeColor(colorText.value);
		this.seasons[index].color = next;
		colorInput.value = next;
		colorText.value = next;
	  });

	  const deleteButton = row.createEl("button", {
		cls: "time-season-editor__delete",
		text: "Delete"
	  });
	  deleteButton.type = "button";
	  deleteButton.addEventListener("click", () => {
		this.seasons.splice(index, 1);
		this.render();
	  });
	});

    const toolbar = contentEl.createDiv({ cls: "time-season-editor__toolbar" });
    createManagerButton(
      toolbar,
      "Add season",
      () => {
        this.seasons.push({
          id: "",
          name: `Season ${this.seasons.length + 1}`,
          startDay: 1,
          endDay: this.cycleLength,
          color: "#a7d36d"
        });
        this.render();
      },
      false,
      true
    );

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => {
        this.submit();
      });
    });
    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => {
        this.close();
      });
    });
  }

  private submit(): void {
    if (this.seasons.length === 0) {
      new Notice("Please define at least one season.");
      return;
    }

    const sanitized = this.seasons.map((season, index) => {
      const safeName = season.name.trim().length > 0 ? season.name.trim() : `Season ${index + 1}`;

      return {
        id: slugify(season.id || safeName),
        name: safeName,
        startDay: clamp(season.startDay, 1, this.cycleLength),
        endDay: clamp(season.endDay, 1, this.cycleLength),
        color: normalizeColor(season.color)
      };
    });

    this.onSave(sanitized);
    this.close();
  }
}

export class TagPackEditorModal extends Modal {
  private readonly plugin: TtrpgToolsTimePlugin;
  private readonly existing: TagPackFile | null;
  private readonly onSaved?: () => void;

  private name: string;
  private id: string;
  private description: string;
  private tags: TagRowDraft[];

  constructor(
    plugin: TtrpgToolsTimePlugin,
    existing?: TagPackFile | null,
    onSaved?: () => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
	this.existing = existing ?? null;
    this.onSaved = onSaved;

    this.name = existing?.name ?? "New Tag Pack";
    this.id = existing?.id ?? slugify(this.name);
    this.description = existing?.description ?? "";
    this.tags = existing?.tags?.length
      ? existing.tags.map((tag) => ({
          name: tag.name,
          color: normalizeColor(tag.color)
        }))
      : DEFAULT_TAG_ROWS.map((tag) => ({ ...tag }));
  }

  onOpen(): void {
	prepareFlexibleModal(this);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");
    contentEl.createEl("h2", { text: this.existing ? "Edit tag pack" : "Create tag pack" });

    new Setting(contentEl)
      .setName("Pack name")
      .setDesc("Display name of the tag pack.")
      .addText((text) => {
        text.setValue(this.name);
        text.onChange((value) => {
          this.name = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Pack ID")
      .setDesc("Stable file identifier. Locked for existing packs.")
      .addText((text) => {
        text.setValue(this.id);
        text.setDisabled(this.existing !== null);
        text.onChange((value) => {
          if (this.existing) {
            return;
          }
          this.id = slugify(value);
        });
      });

    new Setting(contentEl)
      .setName("Description")
      .setDesc("Optional.")
      .addTextArea((text) => {
        text.setValue(this.description);
        text.inputEl.rows = 3;
        text.onChange((value) => {
          this.description = value.trim();
        });
      });

    contentEl.createEl("h3", { text: "Tags" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Define each tag as its own row. These tags will later be used to build timeline filters."
    });
	
    const tagList = contentEl.createDiv({ cls: "time-tag-editor__list" });

    this.tags.forEach((tag, index) => {
      const row = tagList.createDiv({ cls: "time-tag-editor__row" });

      const nameInput = row.createEl("input", { cls: "time-tag-editor__name" });
      nameInput.type = "text";
      nameInput.placeholder = "Tag name";
      nameInput.value = tag.name;
      nameInput.addEventListener("input", () => {
        this.tags[index].name = nameInput.value;
      });

      const colorInput = row.createEl("input", { cls: "time-tag-editor__color" });
      colorInput.type = "color";
      colorInput.value = normalizeColor(tag.color);
      colorInput.addEventListener("input", () => {
        this.tags[index].color = colorInput.value;
      });

      const deleteButton = row.createEl("button", {
        cls: "time-tag-editor__delete",
        text: "Delete"
      });
      deleteButton.type = "button";
      deleteButton.addEventListener("click", () => {
        this.tags.splice(index, 1);
        this.render();
      });
    });

    const addRow = contentEl.createDiv({ cls: "time-tag-editor__toolbar" });
    createManagerButton(
      addRow,
      "Add tag",
      () => {
        this.tags.push({
          name: "",
          color: "#d46b65"
        });
        this.render();
      },
      false,
      true
    );

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText(this.existing ? "Save" : "Create pack");
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
    const name = this.name.trim();
    const id = slugify(this.id || this.name);

    if (name.length === 0) {
      new Notice("Please provide a tag-pack name.");
      return;
    }

    if (!this.existing && (await this.plugin.tagPackExists(id))) {
      new Notice(`A tag pack with the ID "${id}" already exists.`);
      return;
    }

    const tags = this.tags
      .map((tag) => ({
        id: slugify(tag.name),
        name: tag.name.trim(),
        color: normalizeColor(tag.color)
      }))
      .filter((tag) => tag.name.length > 0);

    if (tags.length === 0) {
      new Notice("Please add at least one tag.");
      return;
    }
    const pack: TagPackFile = normalizeTagPackFile({
      version: 1,
      kind: "tag-pack",
      id,
      name,
      description: this.description,
      tags
    });

    await this.plugin.saveTagPack(pack);
    this.close();
    this.onSaved?.();
    new Notice(`Saved tag pack "${pack.name}".`);
  }
}

export class CalendarManagerModal extends Modal {
  private readonly plugin: TtrpgToolsTimePlugin;

  constructor(plugin: TtrpgToolsTimePlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen(): void {
	prepareFlexibleModal(this);
	void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const calendars = await this.plugin.listCalendars();
    const activeCalendarId = this.plugin.settings.activeCalendarId;

    contentEl.empty();
    contentEl.addClass("time-modal", "time-manager");
    contentEl.createEl("h2", { text: "Manage calendars" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Set the active calendar, edit existing calendars, or create new ones."
    });

    const list = contentEl.createDiv({ cls: "time-manager__list" });

    if (calendars.length === 0) {
      list.createDiv({
        cls: "time-manager__empty",
        text: "No calendars found."
      });
    }

    calendars.forEach((calendar) => {
      const isActive = calendar.id === activeCalendarId;
      const row = list.createDiv({ cls: "time-manager__item" });

      const toggle = row.createEl("button", {
        cls: "time-manager__toggle",
        text: isActive ? "✓" : ""
      });
      toggle.type = "button";
      toggle.setAttr(
        "aria-label",
        isActive ? "Active calendar" : `Set ${calendar.name} as active calendar`
      );

      if (isActive) {
        toggle.addClass("is-selected");
      }

      toggle.addEventListener("click", () => {
        void (async () => {
          await this.plugin.setActiveCalendarById(calendar.id);
          await this.render();
        })();
      });

      const body = row.createDiv({ cls: "time-manager__body" });
      body.createDiv({
        cls: "time-manager__title",
        text: isActive ? `${calendar.name} (Active)` : calendar.name
      });
      body.createDiv({
        cls: "time-manager__meta",
        text: `${calendar.definition.months.length} months • ${calendar.definition.weekdays.length} weekdays • ${calendar.linkedTagPackIds.length} linked tag packs`
      });

      const actions = row.createDiv({ cls: "time-manager__actions" });
      createManagerButton(actions, "Edit", () => {
        this.plugin.openEditCalendarModal(calendar, () => {
          void this.render();
        });
      });
      createManagerButton(
        actions,
        "Delete",
        async () => {
          const confirmed = await confirmAction(this.app, {
            title: "Delete calendar",
            message: `Delete calendar "${calendar.name}"?`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel"
          });
          if (!confirmed) {
            return;
          }

          const deleted = await this.plugin.deleteCalendarById(calendar.id);
          if (deleted) {
            await this.render();
          }
        },
        calendars.length <= 1
      );
    });

    const footer = contentEl.createDiv({ cls: "time-manager__footer" });
    createManagerButton(
      footer,
      "Add calendar",
      () => {
        this.plugin.openCreateCalendarModal(() => {
          void this.render();
        });
      },
      false,
      true
    );
    createManagerButton(footer, "Close", () => {
      this.close();
    });
  }
}

export class TagPackManagerModal extends Modal {
  private readonly plugin: TtrpgToolsTimePlugin;

  constructor(plugin: TtrpgToolsTimePlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen(): void {
	prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const activeCalendar = this.plugin.activeCalendar;
    const packs = await this.plugin.listTagPacks();

    contentEl.empty();
    contentEl.addClass("time-modal", "time-manager");
    contentEl.createEl("h2", { text: "Manage tag packs" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: activeCalendar
        ? `Toggle which packs are linked to the active calendar: ${activeCalendar.name}.`
        : "Select an active calendar before linking tag packs."
    });

    const list = contentEl.createDiv({ cls: "time-manager__list" });

    if (packs.length === 0) {
      list.createDiv({
        cls: "time-manager__empty",
        text: "No tag packs found."
      });
    }

    packs.forEach((pack) => {
      const isLinked = activeCalendar?.linkedTagPackIds.includes(pack.id) ?? false;
      const row = list.createDiv({ cls: "time-manager__item" });

      const toggle = row.createEl("button", {
        cls: "time-manager__toggle",
        text: isLinked ? "✓" : ""
      });
      toggle.type = "button";
      toggle.setAttr(
        "aria-label",
        isLinked
          ? `Unlink ${pack.name} from the active calendar`
          : `Link ${pack.name} to the active calendar`
      );

      if (isLinked) {
        toggle.addClass("is-selected");
      }

      toggle.disabled = !activeCalendar;
      toggle.addEventListener("click", () => {
        if (!activeCalendar) {
          return;
        }

        void (async () => {
          await this.plugin.setTagPackLinked(pack.id, !isLinked);
          await this.render();
        })();
      });

      const body = row.createDiv({ cls: "time-manager__body" });
      body.createDiv({
        cls: "time-manager__title",
        text: pack.name
      });
      body.createDiv({
        cls: "time-manager__meta",
        text: `${pack.tags.length} tags${isLinked ? " • linked to active calendar" : ""}`
      });

      const actions = row.createDiv({ cls: "time-manager__actions" });
      createManagerButton(actions, "Edit", () => {
        this.plugin.openEditTagPackModal(pack, () => {
          void this.render();
        });
      });
      createManagerButton(actions, "Delete", async () => {
        const confirmed = await confirmAction(this.app, {
          title: "Delete tag pack",
          message: `Delete tag pack "${pack.name}"?`,
          confirmLabel: "Delete",
          cancelLabel: "Cancel"
        });
        if (!confirmed) {
          return;
        }

        const deleted = await this.plugin.deleteTagPackById(pack.id);
        if (deleted) {
          await this.render();
        }
      });
    });

    const footer = contentEl.createDiv({ cls: "time-manager__footer" });
    createManagerButton(
      footer,
      "Add pack",
      () => {
        this.plugin.openCreateTagPackModal(() => {
          void this.render();
        });
      },
      false,
      true
    );
    createManagerButton(footer, "Close", () => {
      this.close();
    });
  }
}

class ConfirmActionModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly options: ConfirmOptions,
    private readonly resolveResult: (value: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
	prepareFlexibleModal(this);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", { text: this.options.title });
    contentEl.createEl("p", { text: this.options.message });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    createManagerButton(footer, this.options.confirmLabel ?? "Confirm", () => {
      this.finish(true);
    }, false, true);
    createManagerButton(footer, this.options.cancelLabel ?? "Cancel", () => {
      this.finish(false);
    });
  }

  onClose(): void {
    this.contentEl.empty();

    if (!this.settled) {
      this.settled = true;
      this.resolveResult(false);
    }
  }

  private finish(value: boolean): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.resolveResult(value);
    this.close();
  }
}

function confirmAction(app: App, options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmActionModal(app, options, resolve).open();
  });
}

function parseMonthLines(value: string): Array<{ id: string; name: string; days: number }> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const [nameRaw, daysRaw] = line.split("|").map((part) => part.trim());
      const name = nameRaw || `Monat ${index + 1}`;
      const days = Math.max(1, Math.trunc(Number(daysRaw || "1")));

      return {
        id: slugify(name),
        name,
        days
      };
    });
}

function createMonthInsertionSelect(
  parent: HTMLElement,
  months: Array<{ id: string; name: string; days: number }>,
  selectedIndex: number,
  className: string
): HTMLSelectElement {
  const select = parent.createEl("select", { cls: className });
  const beforeOption = select.createEl("option", {
    text: "Before first month"
  });
  beforeOption.value = "-1";
  beforeOption.selected = selectedIndex === -1;

  months.forEach((month, index) => {
    const option = select.createEl("option", {
      text: `After ${month.name}`
    });
    option.value = String(index);
    option.selected = index === selectedIndex;
  });

  return select;
}

function parseLeapYearPositions(value: string, cycleYears: number): number[] {
  const parsed = value
    .split(/[,\s]+/g)
    .map((entry) => Math.trunc(Number(entry)))
    .filter((entry) => Number.isFinite(entry))
    .filter((entry) => entry >= 1 && entry <= cycleYears);

  return sanitizeLeapYearPositions(parsed, cycleYears);
}

function sanitizeLeapYearPositions(values: number[], cycleYears: number): number[] {
  const sanitized = [...new Set(
    values
      .map((value) => Math.trunc(value))
      .filter((value) => value >= 1 && value <= cycleYears)
  )].sort((left, right) => left - right);

  return sanitized.length > 0 ? sanitized : [cycleYears];
}

function formatLeapYearPositions(values: number[]): string {
  return values.join(", ");
}

function getSeasonCycleLengthForDraft(
  weatherProfile: FantasyWeatherProfileMapping,
  months: Array<{ days: number }>
): number {
  if (weatherProfile.mode === "absolute-day-cycle") {
    return Math.max(1, Math.trunc(weatherProfile.climateYearLength || 1));
  }

  return Math.max(1, months.reduce((sum, month) => sum + Math.max(1, Math.trunc(month.days || 1)), 0));
}

function createMonthSelect(
  parent: HTMLElement,
  months: Array<{ id: string; name: string; days: number }>,
  selectedIndex: number,
  className: string
): HTMLSelectElement {
  const select = parent.createEl("select", { cls: className });

  months.forEach((month, index) => {
    const option = select.createEl("option", { text: month.name });
    option.value = String(index);
    option.selected = index === selectedIndex;
  });

  return select;
}

function createOptionalMonthSelect(
  parent: HTMLElement,
  months: Array<{ id: string; name: string; days: number }>,
  selectedIndex: number | null,
  className: string
): HTMLSelectElement {
  const select = parent.createEl("select", { cls: className });
  const emptyOption = select.createEl("option", { text: "Open" });
  emptyOption.value = "";

  months.forEach((month, index) => {
    const option = select.createEl("option", { text: month.name });
    option.value = String(index);
    option.selected = index === selectedIndex;
  });

  select.value = selectedIndex == null ? "" : String(selectedIndex);
  return select;
}

function parseNullableInt(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return Math.trunc(Number(trimmed) || 0);
}

function normalizeEraEndDraft(
  era: EraDraft,
  months: Array<{ days: number }>
): Pick<EraDraft, "endYear" | "endMonthIndex" | "endDay"> {
  if (era.endYear == null && era.endMonthIndex == null && era.endDay == null) {
    return {
      endYear: undefined as unknown as number | null,
      endMonthIndex: undefined as unknown as number | null,
      endDay: undefined as unknown as number | null
    };
  }

  const endMonthIndex = clamp(era.endMonthIndex ?? Math.max(0, months.length - 1), 0, Math.max(0, months.length - 1));
  const endDay = clamp(era.endDay ?? (months[endMonthIndex]?.days ?? 1), 1, months[endMonthIndex]?.days ?? 1);

  return {
    endYear: era.endYear ?? era.startYear,
    endMonthIndex,
    endDay
  };
}

function cloneLeapMonthRules(rules: FantasyLeapMonthRule[]): FantasyLeapMonthRule[] {
  return rules.map((rule) => ({
    ...rule,
    month: { ...rule.month },
    leapYearPositions: [...rule.leapYearPositions]
  }));
}

function cloneLeapDayRules(rules: FantasyLeapDayRule[]): FantasyLeapDayRule[] {
  return rules.map((rule) => ({
    ...rule,
	placement: rule.placement ?? "standalone",
    leapYearPositions: [...rule.leapYearPositions]
  }));
}

function createInlineNumberField(
  parent: HTMLElement,
  options: {
    label: string;
    value: string;
    min?: number;
    onChange: (value: number) => void;
  }
): HTMLInputElement {
  const field = parent.createDiv({ cls: "time-inline-field" });
  field.createEl("label", {
    cls: "time-inline-field__label",
    text: options.label
  });

  const input = field.createEl("input", { cls: "time-inline-field__input" });
  input.type = "number";
  if (typeof options.min === "number") {
    input.min = String(options.min);
  }
  input.value = options.value;
  input.addEventListener("input", () => {
    const parsed = Number(input.value);
    if (!Number.isNaN(parsed)) {
      options.onChange(Math.trunc(parsed));
    }
  });
  return input;
}

function createCompactTextField(
  parent: HTMLElement,
  options: {
    label: string;
    value: string;
    placeholder?: string;
    disabled?: boolean;
    onChange: (value: string) => void;
  }
): HTMLInputElement {
  const field = parent.createDiv({ cls: "time-calendar-editor__compact-field" });
  field.createEl("label", {
    cls: "time-calendar-editor__compact-label",
    text: options.label
  });

  const input = field.createEl("input", {
    cls: "time-calendar-editor__compact-input"
  });
  input.type = "text";
  input.value = options.value;
  input.placeholder = options.placeholder ?? "";
  input.disabled = options.disabled ?? false;
  input.addEventListener("input", () => {
    options.onChange(input.value);
  });

  return input;
}

function createCompactNumberField(
  parent: HTMLElement,
  options: {
    label: string;
    value: string;
    min?: number;
    onChange: (value: number) => void;
  }
): HTMLInputElement {
  const field = parent.createDiv({ cls: "time-calendar-editor__mini-field" });
  field.createEl("label", {
    cls: "time-calendar-editor__mini-label",
    text: options.label
  });

  const input = field.createEl("input", {
    cls: "time-calendar-editor__mini-input"
  });
  input.type = "number";
  input.value = options.value;
  if (typeof options.min === "number") {
    input.min = String(options.min);
  }

  input.addEventListener("input", () => {
    const parsed = Number(input.value);
    if (!Number.isNaN(parsed)) {
      options.onChange(Math.trunc(parsed));
    }
  });

  return input;
}

function createCompactCheckbox(
  parent: HTMLElement,
  options: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }
): HTMLInputElement {
  const row = parent.createDiv({ cls: "time-calendar-editor__checkbox-row" });
  const input = row.createEl("input");
  input.type = "checkbox";
  input.checked = options.checked;
  input.addEventListener("change", () => {
    options.onChange(input.checked);
  });

  row.createEl("label", {
    text: options.label
  });

  return input;
}

function createDeleteIconButton(parent: HTMLElement, onClick: () => void): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "time-collection-editor__delete"
  });
  button.type = "button";
  button.setAttr("aria-label", "Delete row");
  button.title = "Delete";
  setIcon(button, "trash-2");
  button.addEventListener("click", onClick);
  return button;
}

function prepareFlexibleModal(modal: Modal): void {
  modal.modalEl.addClass("time-flex-modal");
  modal.contentEl.addClass("time-flex-modal__content");
}

function normalizeColor(value: string | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : "#d46b65";
}

function normalizeMoonSize(value: number): number {
  return clamp(Math.trunc(value || 28), 12, 300);
}

function normalizePositiveDecimal(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeFiniteDecimal(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeMoonCycleAnchor(value: string | undefined): MoonCycleAnchor {
  return value === "month" ? "month" : "absolute";
}

function sanitizeMoonPhaseImages(
  phaseImages: MoonPhaseImageDefinition[],
  phaseCount: number
): MoonPhaseImageDefinition[] {
  const deduped = new Map<number, MoonPhaseImageDefinition>();

  phaseImages.forEach((entry) => {
    const imageRef = entry.imageRef?.trim();
    if (!imageRef) {
      return;
    }

    const phaseIndex = clamp(
      Math.trunc(entry.phaseIndex || 0),
      0,
      Math.max(0, phaseCount - 1)
    );

    deduped.set(phaseIndex, {
      phaseIndex,
      imageRef
    });
  });

  return [...deduped.values()].sort((left, right) => left.phaseIndex - right.phaseIndex);
}

function sanitizeMoonPhaseLabels(
  phaseLabels: string[],
  phaseCount: number
): string[] {
  const next: string[] = [];

  for (let index = 0; index < phaseCount; index += 1) {
    next.push(typeof phaseLabels[index] === "string" ? phaseLabels[index].trim() : "");
  }

  return next;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

function createManagerButton(
  parent: HTMLElement,
  label: string,
  onClick: () => void | Promise<void>,
  disabled = false,
  primary = false
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "time-manager__button",
    text: label
  });
  button.type = "button";
  button.disabled = disabled;

  if (primary) {
    button.addClass("mod-cta");
  }

  button.addEventListener("click", () => {
    void onClick();
  });

  return button;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function cloneCalendarTimelineStyle(
  timeline: CalendarTimelineStyle | undefined
): CalendarTimelineStyle | undefined {
  if (!timeline) {
    return undefined;
  }

  return {
    ...timeline,
    colors: timeline.colors ? { ...timeline.colors } : undefined,
    monthNames: timeline.monthNames ? [...timeline.monthNames] : undefined
  };
}

function normalizeCalendarTimelineStyle(
  timeline: CalendarTimelineStyle | undefined
): CalendarTimelineStyle | undefined {
  if (!timeline) {
    return undefined;
  }

  const colors = normalizeCalendarTimelineColors(timeline.colors);
  const monthNames = (timeline.monthNames ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const result: CalendarTimelineStyle = {
    name: timeline.name?.trim() || undefined,
    align:
      timeline.align === "right"
        ? "right"
        : timeline.align === "left"
          ? "left"
          : undefined,
    showMoons: timeline.showMoons === true ? true : undefined,
    moonSize: normalizePositiveInteger(timeline.moonSize),
    maxSummaryLines: normalizeOptionalInteger(timeline.maxSummaryLines),
    cardWidth: normalizeOptionalInteger(timeline.cardWidth),
    cardHeight: normalizeOptionalInteger(timeline.cardHeight),
    boxHeight: normalizeOptionalInteger(timeline.boxHeight),
    sideGapLeft: normalizeOptionalInteger(timeline.sideGapLeft),
    sideGapRight: normalizeOptionalInteger(timeline.sideGapRight),
    colors,
    monthNames: monthNames.length > 0 ? monthNames : undefined
  };

  return hasCalendarTimelineStyleValues(result) ? result : undefined;
}

function normalizeCalendarTimelineColors(
  colors: CalendarTimelineStyle["colors"] | undefined
): CalendarTimelineStyle["colors"] | undefined {
  if (!colors) {
    return undefined;
  }

  const result = {
    bg: normalizeOptionalColor(colors.bg),
    accent: normalizeOptionalColor(colors.accent),
    hover: normalizeOptionalColor(colors.hover),
    title: normalizeOptionalColor(colors.title),
    date: normalizeOptionalColor(colors.date)
  };

  return Object.values(result).some((value) => typeof value === "string" && value.length > 0)
    ? result
    : undefined;
}

function parseTimelineMonthNames(value: string): string[] | undefined {
  const entries = value
    .split(/[,\n;]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return entries.length > 0 ? entries : undefined;
}

function formatTimelineMonthNames(monthNames: string[] | undefined): string {
  return monthNames?.join(", ") ?? "";
}

function normalizeOptionalInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;
}

function normalizeOptionalColor(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    && /^#[0-9a-fA-F]{6}$/.test(value.trim())
    ? value.trim()
    : undefined;
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Math.trunc(value) > 0
    ? Math.trunc(value)
    : undefined;
}

function hasCalendarTimelineStyleValues(value: CalendarTimelineStyle): boolean {
  return (
    typeof value.name === "string" ||
    typeof value.align === "string" ||
    value.showMoons === true ||
    typeof value.moonSize === "number" ||
    typeof value.maxSummaryLines === "number" ||
    typeof value.cardWidth === "number" ||
    typeof value.cardHeight === "number" ||
    typeof value.boxHeight === "number" ||
    typeof value.sideGapLeft === "number" ||
    typeof value.sideGapRight === "number" ||
    (Array.isArray(value.monthNames) && value.monthNames.length > 0) ||
    Object.values(value.colors ?? {}).some((entry) => typeof entry === "string" && entry.length > 0)
  );
}

function compareEraDateParts(
  left: { year: number; monthIndex: number; day: number },
  right: { year: number; monthIndex: number; day: number }
): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
  return left.day - right.day;
}

function doErasOverlap(
  left: EraDraft,
  right: EraDraft,
  months: Array<{ days: number }>
): boolean {
  const leftStart = { year: left.startYear, monthIndex: left.startMonthIndex, day: left.startDay };
  const rightStart = { year: right.startYear, monthIndex: right.startMonthIndex, day: right.startDay };
  const leftEnd = left.endYear == null
    ? null
    : {
        year: left.endYear,
        monthIndex: left.endMonthIndex ?? Math.max(0, months.length - 1),
        day: left.endDay ?? (months[left.endMonthIndex ?? Math.max(0, months.length - 1)]?.days ?? 1)
      };

  if (leftEnd === null) {
    return compareEraDateParts(leftStart, rightStart) <= 0;
  }

  return compareEraDateParts(leftEnd, rightStart) >= 0;
}

function addSelectOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = select.createEl("option", { text: label });
  option.value = value;
}