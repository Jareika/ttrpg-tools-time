import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import { slugify } from "./calendar";
import type {
  FantasyMonth,
  TemperatureUnit,
  WeatherPackFile,
  WeatherPackMonthProfile
} from "./types";
import {
  DEFAULT_WEATHER_PACK,
  createWeatherPreviewReferenceYear,
  formatTemperatureForDisplay,
  formatTemperatureRangeForDisplay,
  fromDisplayTemperature,
  getTemperatureUnitLabel,
  getWeatherConditionLabel,
  getWeatherProfileMonths,
  toDisplayTemperature,
  normalizeWeatherPackFile,
  resolveWeatherPackMonthProfiles
} from "./weather";

const FALLBACK_MONTHS: FantasyMonth[] = Array.from({ length: 12 }, (_, index) => ({
  id: `month-${index + 1}`,
  name: `Month ${index + 1}`,
  days: 30
}));

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export class WeatherPackEditorModal extends Modal {
  private readonly plugin: TtrpgToolsTimePlugin;
  private readonly existing: WeatherPackFile | null;
  private readonly onSaved?: () => void;
  private readonly months: FantasyMonth[];
  private readonly temperatureUnit: TemperatureUnit;

  private name: string;
  private id: string;
  private description: string;
  private temperatureMin: number;
  private temperatureMax: number;
  private humidity: number;
  private precipitation: number;
  private storminess: number;
  private cloudiness: number;
  private fogginess: number;
  private windiness: number;
  private seasonality: number;
  private frontFrequency: number;
  private frontStrength: number;
  private volatility: number;
  private stableSpanMin: number;
  private stableSpanMax: number;
  private frontSpanMin: number;
  private frontSpanMax: number;
  private snowTemperature: number;
  private monthProfiles: WeatherPackMonthProfile[];
  private previewRefreshTimer: number | null = null;
  private readonly previewHosts = new Map<number, HTMLElement>();

  constructor(
    plugin: TtrpgToolsTimePlugin,
    existing?: WeatherPackFile | null,
    onSaved?: () => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.existing = existing ?? null;
    this.onSaved = onSaved;
    this.months = buildWeatherEditorMonths(plugin, this.existing);
	this.temperatureUnit = plugin.settings.temperatureUnit;

    const source = existing ?? DEFAULT_WEATHER_PACK;

    this.name = source.name;
    this.id = existing?.id ?? slugify(source.name);
    this.description = source.description ?? "";
    this.temperatureMin = source.temperatureMin;
    this.temperatureMax = source.temperatureMax;
    this.humidity = source.humidity;
    this.precipitation = source.precipitation;
    this.storminess = source.storminess;
    this.cloudiness = source.cloudiness;
    this.fogginess = source.fogginess;
    this.windiness = source.windiness;
    this.seasonality = source.seasonality;
    this.frontFrequency = source.frontFrequency;
    this.frontStrength = source.frontStrength;
    this.volatility = source.volatility;
    this.stableSpanMin = source.stableSpanMin;
    this.stableSpanMax = source.stableSpanMax;
    this.frontSpanMin = source.frontSpanMin;
    this.frontSpanMax = source.frontSpanMax;
    this.snowTemperature = source.snowTemperature;
    this.monthProfiles = resolveWeatherPackMonthProfiles(source, this.months).map((profile) => ({ ...profile }));
  }

  onOpen(): void {
    prepareFlexibleModal(this);
	this.modalEl.addClass("time-weather-pack-editor-modal");
    this.render();
  }
  
  onClose(): void {
    if (this.previewRefreshTimer !== null) {
      window.clearTimeout(this.previewRefreshTimer);
      this.previewRefreshTimer = null;
    }

    this.previewHosts.clear();
    this.contentEl.empty();
  }

  private render(): void {
    this.renderCompactEditor();
  }

  private renderCompactEditor(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal", "time-weather-pack-editor");
    this.previewHosts.clear();

    contentEl.createEl("h2", {
      text: this.existing ? "Edit weather pack" : "Create weather pack"
    });

    const monthSourceText = this.plugin.activeCalendar
      ? `Month profiles are aligned to the active calendar: ${this.plugin.activeCalendar.name} (${this.months.length} rows).`
      : `No active calendar found. Editor uses ${this.months.length} generic month rows.`;

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: monthSourceText
    });

    const identitySection = this.createEditorSection(
      contentEl,
      "Pack details",
      "Name, technical id, and an optional description for this weather pack."
    );
    const identityGrid = identitySection.createDiv({
      cls: "time-weather-pack-editor__field-grid time-weather-pack-editor__field-grid--identity"
    });

    this.createTextField(identityGrid, {
      label: "Pack name",
      tooltip: "The display name shown for this weather pack.",
      value: this.name,
      onInput: (value) => {
        this.name = value;
      }
    });

    this.createTextField(identityGrid, {
      label: "Pack ID",
      tooltip: "Stable technical identifier. It is locked for existing weather packs.",
      value: this.id,
      disabled: this.existing !== null,
      onInput: (value) => {
        if (!this.existing) {
          this.id = slugify(value);
        }
      }
    });

    this.createTextField(identityGrid, {
      label: "Description",
      tooltip: "Optional description used to identify this weather pack.",
      value: this.description,
      onInput: (value) => {
        this.description = value;
      }
    });

    const topSections = contentEl.createDiv({
      cls: "time-weather-pack-editor__section-grid"
    });

    const temperatureSection = this.createEditorSection(
      topSections,
      "Temperature & seasonality",
      "Base temperatures, seasonal variation, and short-term weather changes."
    );

    const temperatureGrid = temperatureSection.createDiv({
      cls: "time-weather-pack-editor__field-grid"
    });

    this.createNumberField(temperatureGrid, {
      label: `Temp min (${getTemperatureUnitLabel(this.temperatureUnit)})`,
	  isTemperature: true,
      tooltip: "Absolute lower temperature limit. Generated temperatures will not fall below it.",
      value: this.temperatureMin,
      onInput: (value) => {
        this.temperatureMin = fromDisplayTemperature(value, this.temperatureUnit);
      }
    });

    this.createNumberField(temperatureGrid, {
      label: `Temp max (${getTemperatureUnitLabel(this.temperatureUnit)})`,
      isTemperature: true,
	  tooltip: "Absolute upper temperature limit. Generated temperatures will not exceed it.",
      value: this.temperatureMax,
      onInput: (value) => {
        this.temperatureMax = fromDisplayTemperature(value, this.temperatureUnit);
      }
    });

    this.createNumberField(temperatureGrid, {
      label: "Seasonality",
      tooltip: "Strength of the annual temperature cycle. Higher values increase the difference between cold and warm seasons.",
      value: this.seasonality,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.seasonality = clamp(value, 0, 100);
      }
    });

    this.createNumberField(temperatureGrid, {
      label: `Snow temp (${getTemperatureUnitLabel(this.temperatureUnit)})`,
      isTemperature: true,
	  tooltip: "Temperature threshold below which precipitation is more likely to become snow, flurries, or sleet.",
      value: this.snowTemperature,
      onInput: (value) => {
        this.snowTemperature = fromDisplayTemperature(value, this.temperatureUnit);
      }
    });

    this.createNumberField(temperatureGrid, {
      label: "Volatility",
      tooltip: "How strongly weather may vary in the short term. Higher values create more warm spells and cold snaps.",
      value: this.volatility,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.volatility = clamp(value, 0, 100);
      }
    });

    const atmosphereSection = this.createEditorSection(
      topSections,
      "Humidity, sky & wind",
      "Global defaults. Monthly values below can refine this baseline.",
      "time-weather-pack-editor__section--atmosphere"
    );

    const atmosphereGrid = atmosphereSection.createDiv({
      cls: "time-weather-pack-editor__field-grid"
    });

    this.createNumberField(atmosphereGrid, {
      label: "Humidity",
      tooltip: "Global humidity level. Higher values favor damp, foggy, and precipitation-heavy weather.",
      value: this.humidity,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.humidity = clamp(value, 0, 100);
      }
    });

    this.createNumberField(atmosphereGrid, {
      label: "Rain",
      tooltip: "Global precipitation tendency. Higher values increase the chance of drizzle, rain, or snow.",
      value: this.precipitation,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.precipitation = clamp(value, 0, 100);
      }
    });

    this.createNumberField(atmosphereGrid, {
      label: "Storm",
      tooltip: "Increases the chance of thunderstorms and heavy rain, especially at warmer temperatures.",
      value: this.storminess,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.storminess = clamp(value, 0, 100);
      }
    });

    this.createNumberField(atmosphereGrid, {
      label: "Clouds",
      tooltip: "Global cloud-cover tendency. Higher values produce overcast conditions more often.",
      value: this.cloudiness,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.cloudiness = clamp(value, 0, 100);
      }
    });

    this.createNumberField(atmosphereGrid, {
      label: "Fog",
      tooltip: "Global fog tendency. It is especially effective with high humidity and low wind.",
      value: this.fogginess,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.fogginess = clamp(value, 0, 100);
      }
    });

    this.createNumberField(atmosphereGrid, {
      label: "Wind",
      tooltip: "Global wind strength. Higher values produce stronger winds and gusts more often.",
      value: this.windiness,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.windiness = clamp(value, 0, 100);
      }
    });

    const frontsSection = this.createEditorSection(
      topSections,
      "Fronts & durations",
      "Controls how often weather phases change and how long stable or front-based conditions last.",
      "time-weather-pack-editor__section--wide"
    );

    const frontsGrid = frontsSection.createDiv({
      cls: "time-weather-pack-editor__field-grid"
    });

    this.createNumberField(frontsGrid, {
      label: "Front frequency",
      tooltip: "Global tendency for weather fronts. The monthly Front value can override this baseline.",
      value: this.frontFrequency,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.frontFrequency = clamp(value, 0, 100);
      }
    });

    this.createNumberField(frontsGrid, {
      label: "Front strength",
      tooltip: "Strength of temperature and weather changes during a front.",
      value: this.frontStrength,
      min: 0,
      max: 100,
      onInput: (value) => {
        this.frontStrength = clamp(value, 0, 100);
      }
    });

    this.createNumberField(frontsGrid, {
      label: "Stable span min",
      tooltip: "Minimum number of days for a stable weather phase.",
      value: this.stableSpanMin,
      min: 1,
      onInput: (value) => {
        this.stableSpanMin = Math.max(1, value);
      }
    });

    this.createNumberField(frontsGrid, {
      label: "Stable span max",
      tooltip: "Maximum number of days for a stable weather phase.",
      value: this.stableSpanMax,
      min: 1,
      onInput: (value) => {
        this.stableSpanMax = Math.max(1, value);
      }
    });

    this.createNumberField(frontsGrid, {
      label: "Front span min",
      tooltip: "Minimum number of days for a weather front.",
      value: this.frontSpanMin,
      min: 1,
      onInput: (value) => {
        this.frontSpanMin = Math.max(1, value);
      }
    });

    this.createNumberField(frontsGrid, {
      label: "Front span max",
      tooltip: "Maximum number of days for a weather front.",
      value: this.frontSpanMax,
      min: 1,
      onInput: (value) => {
        this.frontSpanMax = Math.max(1, value);
      }
    });

    const baselineSection = this.createEditorSection(
      contentEl,
      "Month baselines & preview",
      "Changes update the preview immediately. The preview is not saved and remains reproducible for identical values."
    );

    const baselineScroll = baselineSection.createDiv({
      cls: "time-weather-pack-editor__baseline-scroll"
    });
    const baselineTable = baselineScroll.createDiv({
      cls: "time-weather-pack-editor__baseline-table"
    });

    const header = baselineTable.createDiv({
      cls: "time-weather-pack-editor__baseline-header"
    });

    [
      "Month",
      `Temp (${getTemperatureUnitLabel(this.temperatureUnit)})`,
      "Hum",
      "Prec",
      "Cloud",
      "Fog",
      "Wind",
      "Front"
    ].forEach((label) => {
      header.createDiv({
        cls: "time-weather-pack-editor__baseline-label",
        text: label
      });
    });

    this.months.forEach((month, monthIndex) => {
      const profile = this.monthProfiles[monthIndex] ?? {
        monthIndex,
        temperatureOffset: 0,
        humidity: this.humidity,
        precipitation: this.precipitation,
        cloudiness: this.cloudiness,
        fogginess: this.fogginess,
        windiness: this.windiness,
        frontBias: this.frontFrequency
      };

      this.monthProfiles[monthIndex] = {
        ...profile,
        monthIndex
      };

      const row = baselineTable.createDiv({
        cls: "time-weather-pack-editor__baseline-row"
      });

      row.createDiv({
        cls: "time-weather-pack-editor__month-name",
        text: month.name
      });

      const draft = this.monthProfiles[monthIndex];

      this.createBaselineInput(
        row,
        "Monthly temperature baseline",
        "Target daily high temperature for this month. Different monthly values replace the global seasonal temperature curve.",
        formatEditableTemperature(draft.temperatureOffset, this.temperatureUnit),
        (value) => {
          draft.temperatureOffset = fromDisplayTemperature(value, this.temperatureUnit);
        }
      );
      this.createBaselineInput(row, "Monthly humidity", "Humidity for this month.", String(draft.humidity), (value) => {
        draft.humidity = clamp(value, 0, 100);
      });

      this.createBaselineInput(row, "Monthly precipitation", "Precipitation tendency for this month.", String(draft.precipitation), (value) => {
        draft.precipitation = clamp(value, 0, 100);
      });

      this.createBaselineInput(row, "Monthly cloudiness", "Cloud-cover tendency for this month.", String(draft.cloudiness), (value) => {
        draft.cloudiness = clamp(value, 0, 100);
      });
      this.createBaselineInput(row, "Monthly fogginess", "Fog tendency for this month.", String(draft.fogginess), (value) => {
        draft.fogginess = clamp(value, 0, 100);
      });
      this.createBaselineInput(row, "Monthly windiness", "Wind strength for this month.", String(draft.windiness), (value) => {
        draft.windiness = clamp(value, 0, 100);
      });
      this.createBaselineInput(row, "Monthly front frequency", "Weather-front tendency for this month.", String(draft.frontBias), (value) => {
        draft.frontBias = clamp(value, 0, 100);
      });

      const preview = baselineTable.createDiv({
        cls: "time-weather-pack-editor__preview-row"
      });
      const previewColumnCount = Math.min(31, Math.max(1, month.days));
	  preview.style.setProperty(
        "--time-weather-preview-columns",
        String(previewColumnCount)
      );
      preview.toggleClass("is-wrapped", month.days > previewColumnCount);
      this.previewHosts.set(monthIndex, preview);
    });
	
	const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    const saveButton = footer.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: this.existing ? "Save weather pack" : "Create weather pack"
    });

    saveButton.type = "button";
    saveButton.addEventListener("click", () => {
      void this.submit();
    });

    const cancelButton = footer.createEl("button", {
      cls: "time-manager__button",
      text: "Cancel"
    });
    cancelButton.type = "button";
    cancelButton.addEventListener("click", () => this.close());

    this.refreshPreview();
  }

  private createEditorSection(
    parent: HTMLElement,
    title: string,
    description: string,
    extraClass = ""
  ): HTMLElement {
    const section = parent.createDiv({
      cls: [
        "time-weather-pack-editor__section",
        extraClass
      ].filter((className) => className.length > 0).join(" ")
    });

    section.createEl("h3", {
      cls: "time-weather-pack-editor__section-title",
      text: title
    });
    section.createDiv({
      cls: "time-weather-pack-editor__section-description",
      text: description
    });

    return section;
  }

  private createTextField(
    parent: HTMLElement,
    options: {
      label: string;
      tooltip: string;
      value: string;
      disabled?: boolean;
      onInput: (value: string) => void;
    }
  ): void {
    const field = parent.createDiv({
      cls: "time-weather-pack-editor__field"
    });
    field.createEl("label", {
      cls: "time-weather-pack-editor__field-label",
      text: options.label
    });

    const input = field.createEl("input", {
      cls: "time-weather-pack-editor__input"
    });
    input.type = "text";
    input.value = options.value;
    input.disabled = options.disabled ?? false;
    input.title = options.tooltip;
    input.setAttr("aria-label", `${options.label}. ${options.tooltip}`);
    input.addEventListener("input", () => options.onInput(input.value));
  }

  private createNumberField(
    parent: HTMLElement,
    options: {
      label: string;
      tooltip: string;
      value: number;
      min?: number;
      max?: number;
	  isTemperature?: boolean;
      onInput: (value: number) => void;
    }
  ): void {
    const field = parent.createDiv({
      cls: "time-weather-pack-editor__field"
    });
    field.createEl("label", {
      cls: "time-weather-pack-editor__field-label",
      text: options.label
    });

    const input = field.createEl("input", {
      cls: "time-weather-pack-editor__input"
    });
    input.type = "number";
    input.step = "any";
    input.value = options.isTemperature
      ? formatEditableTemperature(options.value, this.temperatureUnit)
      : String(options.value);
    input.title = options.tooltip;
    input.setAttr("aria-label", `${options.label}. ${options.tooltip}`);

    if (typeof options.min === "number") input.min = String(options.min);
    if (typeof options.max === "number") input.max = String(options.max);

    input.addEventListener("input", () => {
      options.onInput(Number(input.value) || 0);
      this.schedulePreviewRefresh();
    });
  }

  private createBaselineInput(
    parent: HTMLElement,
    label: string,
    tooltip: string,
    value: string,
    onInput: (value: number) => void
  ): void {
    const input = parent.createEl("input", {
      cls: "time-weather-pack-editor__baseline-input"
    });
    input.type = "number";
    input.step = "any";
    input.value = value;
    input.title = tooltip;
    input.setAttr("aria-label", `${label}. ${tooltip}`);
    input.addEventListener("input", () => {
      onInput(Number(input.value) || 0);
      this.schedulePreviewRefresh();
    });
  }

  private schedulePreviewRefresh(): void {
    if (this.previewRefreshTimer !== null) {
      window.clearTimeout(this.previewRefreshTimer);
    }

    this.previewRefreshTimer = window.setTimeout(() => {
      this.previewRefreshTimer = null;
      this.refreshPreview();
    }, 120);
  }

  private refreshPreview(): void {
    const previewCalendar = this.createPreviewCalendar();

    if (!previewCalendar) {
      this.previewHosts.forEach((host) => {
        host.empty();
        host.createDiv({
          cls: "time-weather-pack-editor__preview-empty",
          text: "An active calendar is required for the weather preview."
        });
      });
      return;
    }

    const preview = createWeatherPreviewReferenceYear(
      previewCalendar,
      this.buildPreviewPack()
    );

    this.months.forEach((month, monthIndex) => {
      const host = this.previewHosts.get(monthIndex);
      if (!host) return;

      host.empty();

      for (let day = 1; day <= month.days; day += 1) {
        const entry = preview.days[`${monthIndex}-${day}`];
        if (!entry) continue;

        const cell = host.createDiv({
          cls: "time-weather-pack-editor__preview-day"
        });

        cell.title = [
          `${month.name} • Day ${day}`,
          formatTemperatureRangeForDisplay(
            entry.tempLow,
            entry.tempHigh,
            this.temperatureUnit
          ),
          getWeatherConditionLabel(entry.condition),
          entry.windLabel,
          entry.cloudsLabel
        ].join(" • ");

        cell.createSpan({
          cls: "time-weather-pack-editor__preview-day-number",
          text: String(day)
        });

        const icon = cell.createSpan({
          cls: "time-weather-pack-editor__preview-icon"
        });
        setIcon(icon, entry.icon);

        cell.createSpan({
          cls: "time-weather-pack-editor__preview-temperature",
          text: formatTemperatureForDisplay(entry.tempHigh, this.temperatureUnit)
        });
      }
    });
  }

  private createPreviewCalendar(): import("./types").CalendarFile | null {
    const activeCalendar = this.plugin.activeCalendar;
    if (!activeCalendar || this.months.length === 0) {
      return null;
    }

    const previewMonths = this.months.map((month) => ({
      id: month.id,
      name: month.name,
      days: Math.max(1, Math.trunc(month.days)),
      color: month.color
    }));
    const previewYearLength = previewMonths.reduce(
      (sum, month) => sum + month.days,
      0
    );

    return {
      ...activeCalendar,
      id: `${activeCalendar.id}-weather-preview`,
      markers: [],
      definition: {
        ...activeCalendar.definition,
        id: `${activeCalendar.definition.id}-weather-preview`,
        months: previewMonths,
        leapMonths: [],
        leapDays: [],
        intercalaryDays: [],
        weatherProfile: {
          mode: "calendar",
          climateYearLength: previewYearLength,
          baseOffsetDays: 0,
          cycleReset: "none"
        }
      },
      state: {
        ...activeCalendar.state,
        todayDate: { year: 1, monthIndex: 0, day: 1 },
        cursorDate: { year: 1, monthIndex: 0, day: 1 }
      }
    };
  }

  private buildPreviewPack(): WeatherPackFile {
    return normalizeWeatherPackFile({
      version: 1,
      kind: "weather-pack",
      id: slugify(this.id || this.name || "weather-preview"),
      name: this.name.trim() || "Weather preview",
      description: this.description.trim() || undefined,
      temperatureMin: Math.min(this.temperatureMin, this.temperatureMax),
      temperatureMax: Math.max(this.temperatureMin, this.temperatureMax),
      humidity: clamp(this.humidity, 0, 100),
      precipitation: clamp(this.precipitation, 0, 100),
      storminess: clamp(this.storminess, 0, 100),
      cloudiness: clamp(this.cloudiness, 0, 100),
      fogginess: clamp(this.fogginess, 0, 100),
      windiness: clamp(this.windiness, 0, 100),
      seasonality: clamp(this.seasonality, 0, 100),
      frontFrequency: clamp(this.frontFrequency, 0, 100),
      frontStrength: clamp(this.frontStrength, 0, 100),
      volatility: clamp(this.volatility, 0, 100),
      stableSpanMin: Math.max(1, Math.trunc(this.stableSpanMin)),
      stableSpanMax: Math.max(this.stableSpanMin, Math.trunc(this.stableSpanMax)),
      frontSpanMin: Math.max(1, Math.trunc(this.frontSpanMin)),
      frontSpanMax: Math.max(this.frontSpanMin, Math.trunc(this.frontSpanMax)),
      snowTemperature: this.snowTemperature,
      monthProfiles: this.monthProfiles.map((profile, monthIndex) => ({
        monthIndex,
        temperatureOffset: Number(profile.temperatureOffset) || 0,
        humidity: clamp(Number(profile.humidity) || 0, 0, 100),
        precipitation: clamp(Number(profile.precipitation) || 0, 0, 100),
        cloudiness: clamp(Number(profile.cloudiness) || 0, 0, 100),
        fogginess: clamp(Number(profile.fogginess) || 0, 0, 100),
        windiness: clamp(Number(profile.windiness) || 0, 0, 100),
        frontBias: clamp(Number(profile.frontBias) || 0, 0, 100)
      }))
    });
  }

  private async submit(): Promise<void> {
    const name = this.name.trim();
    const id = slugify(this.id || this.name);

    if (name.length === 0) {
      new Notice("Please provide a weather pack name.");
      return;
    }

    if (!this.existing && (await this.plugin.weatherPackExists(id))) {
      new Notice(`A weather pack with the ID "${id}" already exists.`);
      return;
    }

    const temperatureMin = Math.min(this.temperatureMin, this.temperatureMax);
    const temperatureMax = Math.max(this.temperatureMin, this.temperatureMax);
    const stableSpanMin = Math.max(1, Math.trunc(this.stableSpanMin));
    const stableSpanMax = Math.max(stableSpanMin, Math.trunc(this.stableSpanMax));
    const frontSpanMin = Math.max(1, Math.trunc(this.frontSpanMin));
    const frontSpanMax = Math.max(frontSpanMin, Math.trunc(this.frontSpanMax));

    const pack = normalizeWeatherPackFile({
      version: 1,
      kind: "weather-pack",
      id,
      name,
      description: this.description,
      temperatureMin,
      temperatureMax,
      humidity: clamp(this.humidity, 0, 100),
      precipitation: clamp(this.precipitation, 0, 100),
      storminess: clamp(this.storminess, 0, 100),
      cloudiness: clamp(this.cloudiness, 0, 100),
      fogginess: clamp(this.fogginess, 0, 100),
      windiness: clamp(this.windiness, 0, 100),
      seasonality: clamp(this.seasonality, 0, 100),
      frontFrequency: clamp(this.frontFrequency, 0, 100),
      frontStrength: clamp(this.frontStrength, 0, 100),
      volatility: clamp(this.volatility, 0, 100),
      stableSpanMin,
      stableSpanMax,
      frontSpanMin,
      frontSpanMax,
      snowTemperature: this.snowTemperature,
      monthProfiles: this.monthProfiles
        .map((profile, monthIndex) => ({
          monthIndex,
          temperatureOffset: Number(profile.temperatureOffset) || 0,
          humidity: clamp(Number(profile.humidity) || 0, 0, 100),
          precipitation: clamp(Number(profile.precipitation) || 0, 0, 100),
          cloudiness: clamp(Number(profile.cloudiness) || 0, 0, 100),
          fogginess: clamp(Number(profile.fogginess) || 0, 0, 100),
          windiness: clamp(Number(profile.windiness) || 0, 0, 100),
          frontBias: clamp(Number(profile.frontBias) || 0, 0, 100)
        }))
        .sort((left, right) => left.monthIndex - right.monthIndex)
    });

    await this.plugin.saveWeatherPack(pack);
    this.close();
    this.onSaved?.();
    new Notice(`Saved weather pack "${pack.name}".`);
  }
}

class ReferenceYearRegenerateModal extends Modal {
  private year: number;
  private resetDerivedYear = true;

  constructor(
    private readonly plugin: TtrpgToolsTimePlugin,
    private readonly calendarId: string,
    private readonly calendarName: string,
    private readonly weatherPack: WeatherPackFile,
    initialYear: number,
    private readonly onDone?: () => void
  ) {
    super(plugin.app);
    this.year = initialYear;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const existingYears = await this.plugin.listWeatherReferenceYears(
      this.calendarId,
      this.weatherPack.id
    );

    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", {
      text: `Regenerate reference year • ${this.weatherPack.name}`
    });

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: `Calendar: ${this.calendarName}`
    });

    if (existingYears.length > 0) {
      contentEl.createEl("p", {
        cls: "setting-item-description",
        text: `Existing reference years: ${existingYears.join(", ")}`
      });
    } else {
      contentEl.createEl("p", {
        cls: "setting-item-description",
        text: "No reference years exist yet for this pack. A new one will be created."
      });
    }

    new Setting(contentEl)
      .setName("Year")
      .setDesc("Reference year to regenerate/reset.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.year));
        text.onChange((value) => {
          this.year = Math.trunc(Number(value) || 0);
        });
      });

    new Setting(contentEl)
      .setName("Reset derived day-view year")
      .setDesc("If the day-view year is based on this pack, replace it with a fresh derived year.")
      .addToggle((toggle) => {
        toggle.setValue(this.resetDerivedYear);
        toggle.onChange((value) => {
          this.resetDerivedYear = value;
        });
      });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Regenerate");
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
    const ok = await this.plugin.regenerateWeatherReferenceYear(
      this.calendarId,
      this.weatherPack.id,
      this.year,
      this.resetDerivedYear
    );

    if (!ok) {
      return;
    }

    this.close();
    this.onDone?.();
  }
}

export class WeatherPackManagerModal extends Modal {
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
    const packs = await this.plugin.listWeatherPacks();
    const activeCalendar = this.plugin.activeCalendar;

    contentEl.empty();
    contentEl.addClass("time-modal", "time-manager");
    contentEl.createEl("h2", { text: "Manage weather packs" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: activeCalendar
        ? `Active calendar: ${activeCalendar.name}. If no weather pack is linked to a calendar, all packs remain visible for that calendar.`
        : "No active calendar loaded."
    });

    const list = contentEl.createDiv({ cls: "time-manager__list" });

    if (packs.length === 0) {
      list.createDiv({
        cls: "time-manager__empty",
        text: "No weather packs found."
      });
    }

    packs.forEach((pack) => {
      const isDefault = activeCalendar?.defaultWeatherPackId === pack.id;
      const isLinked = activeCalendar?.linkedWeatherPackIds.includes(pack.id) ?? false;

      const row = list.createDiv({ cls: "time-manager__item" });

      const toggle = row.createEl("button", {
        cls: "time-manager__toggle",
        text: isLinked ? "✓" : ""
      });
      toggle.type = "button";
      toggle.disabled = !activeCalendar;
      toggle.setAttr(
        "aria-label",
        isLinked
          ? `Unlink ${pack.name} from the active calendar`
          : `Link ${pack.name} to the active calendar`
      );
      if (isLinked) {
        toggle.addClass("is-selected");
      }
      toggle.addEventListener("click", () => {
        if (!activeCalendar) {
          return;
        }

        void (async () => {
          await this.plugin.setWeatherPackLinked(pack.id, !isLinked);
          await this.render();
        })();
      });

      const body = row.createDiv({ cls: "time-manager__body" });
      body.createDiv({
        cls: "time-manager__title",
        text: isDefault ? `${pack.name} (Default)` : pack.name
      });

      const metaBits = [
        pack.id,
        `${pack.monthProfiles.length} month profiles`,
        isLinked ? "linked" : null
      ].filter((entry): entry is string => Boolean(entry));

      body.createDiv({
        cls: "time-manager__meta",
        text: metaBits.join(" • ")
      });

      const actions = row.createDiv({ cls: "time-manager__actions" });

      createManagerButton(
        actions,
        "Set default",
        async () => {
          if (!activeCalendar) {
            return;
          }

          const nextLinked = new Set(activeCalendar.linkedWeatherPackIds);
          if (nextLinked.size > 0) {
            nextLinked.add(pack.id);
          }

          await this.plugin.saveCalendar(
            {
              ...activeCalendar,
              defaultWeatherPackId: pack.id,
              linkedWeatherPackIds: [...nextLinked]
            },
            true
          );

          await this.render();
        },
        !activeCalendar || isDefault
      );

      createManagerButton(actions, "Edit", () => {
        new WeatherPackEditorModal(this.plugin, pack, () => {
          void this.render();
        }).open();
      });

      createManagerButton(actions, "Export", () => {
        exportWeatherPack(this.contentEl.doc, pack);
      });

      createManagerButton(
        actions,
        "Regenerate year",
        () => {
          if (!activeCalendar) {
            return;
          }

          new ReferenceYearRegenerateModal(
            this.plugin,
            activeCalendar.id,
            activeCalendar.name,
            pack,
            activeCalendar.state.cursorDate.year,
            () => {
              void this.render();
            }
          ).open();
        },
        !activeCalendar
      );

      createManagerButton(
        actions,
        "Regenerate all refs",
        async () => {
          if (!activeCalendar) {
            return;
          }

          const confirmed = await confirmAction(this.app, {
            title: "Regenerate all reference years",
            message: `Regenerate all existing reference years for "${pack.name}" in calendar "${activeCalendar.name}"?`,
            confirmLabel: "Regenerate",
            cancelLabel: "Cancel"
          });

          if (!confirmed) {
            return;
          }

          await this.plugin.regenerateAllWeatherReferenceYearsForPack(
            activeCalendar.id,
            pack.id,
            true
          );
          await this.render();
        },
        !activeCalendar
      );

      createManagerButton(
        actions,
        "Delete",
        async () => {
          const confirmed = await confirmAction(this.app, {
            title: "Delete weather pack",
            message: `Delete weather pack "${pack.name}"?`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel"
          });

          if (!confirmed) {
            return;
          }

          const deleted = await this.plugin.deleteWeatherPackById(pack.id);
          if (deleted) {
            await this.render();
          }
        },
        packs.length <= 1
      );
    });

    const footer = contentEl.createDiv({ cls: "time-manager__footer" });
    createManagerButton(
      footer,
      "Add pack",
      () => {
        new WeatherPackEditorModal(this.plugin, null, () => {
          void this.render();
        }).open();
      },
      false,
      true
    );
    createManagerButton(footer, "Import", () => {
      void importWeatherPackFromDisk(this.contentEl.doc, this.plugin, () => {
        void this.render();
      });
    });
    createManagerButton(footer, "Close", () => {
      this.close();
    });
  }
}

export class WeatherPackPickerModal extends Modal {
  private readonly plugin: TtrpgToolsTimePlugin;
  private readonly selectedPackId?: string;
  private readonly onChoose: (packId: string) => void;
  private readonly titleText: string;

  constructor(
    plugin: TtrpgToolsTimePlugin,
    selectedPackId: string | undefined,
    onChoose: (packId: string) => void,
    titleText = "Choose weather pack"
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.selectedPackId = selectedPackId;
    this.onChoose = onChoose;
    this.titleText = titleText;
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const packs = await this.plugin.listVisibleWeatherPacks(this.plugin.activeCalendar);

    contentEl.empty();
    contentEl.addClass("time-modal", "time-manager");
    contentEl.createEl("h2", { text: this.titleText });

    const list = contentEl.createDiv({ cls: "time-manager__list" });

    if (packs.length === 0) {
      list.createDiv({
        cls: "time-manager__empty",
        text: "No visible weather packs found for the current calendar."
      });
    }

    packs.forEach((pack) => {
      const isSelected = pack.id === this.selectedPackId;
      const row = list.createDiv({ cls: "time-manager__item" });

      const toggle = row.createEl("button", {
        cls: "time-manager__toggle",
        text: isSelected ? "✓" : ""
      });
      toggle.type = "button";
      if (isSelected) {
        toggle.addClass("is-selected");
      }
      toggle.addEventListener("click", () => {
        this.onChoose(pack.id);
        this.close();
      });

      const body = row.createDiv({ cls: "time-manager__body" });
      body.createDiv({
        cls: "time-manager__title",
        text: pack.name
      });
      body.createDiv({
        cls: "time-manager__meta",
        text: pack.id
      });

      const actions = row.createDiv({ cls: "time-manager__actions" });
      createManagerButton(actions, "Choose", () => {
        this.onChoose(pack.id);
        this.close();
      }, false, true);
    });

    const footer = contentEl.createDiv({ cls: "time-manager__footer" });
    createManagerButton(
      footer,
      "Manage packs",
      () => {
        new WeatherPackManagerModal(this.plugin).open();
      }
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
    createManagerButton(
      footer,
      this.options.confirmLabel ?? "Confirm",
      () => {
        this.finish(true);
      },
      false,
      true
    );
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

async function importWeatherPackFromDisk(
  doc: Document,
  plugin: TtrpgToolsTimePlugin,
  onImported?: () => void
): Promise<void> {
  const input = doc.body.createEl("input");
  input.type = "file";
  input.accept = ".json,application/json";

  input.addEventListener("change", () => {
    void (async () => {
      const file = input.files?.[0];
      if (!file) {
		input.remove();
        return;
      }

      try {
        const rawText: string = await file.text();
        const parsed: unknown = JSON.parse(rawText);
        const pack = normalizeWeatherPackFile(parsed);
        const exists = await plugin.weatherPackExists(pack.id);

        if (exists) {
          const overwrite = await confirmAction(plugin.app, {
            title: "Overwrite weather pack",
            message: `A weather pack with the ID "${pack.id}" already exists. Overwrite it?`,
            confirmLabel: "Overwrite",
            cancelLabel: "Cancel"
          });

          if (!overwrite) {
            return;
          }
        }

        await plugin.saveWeatherPack(pack);
        new Notice(`Imported weather pack "${pack.name}".`);
        onImported?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Failed to import weather pack: ${message}`);
      } finally {
        input.remove();
      }
    })();
  }, { once: true });

  input.click();
}

function exportWeatherPack(doc: Document, pack: WeatherPackFile): void {
  const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = doc.body.createEl("a");
  anchor.href = url;
  anchor.download = `${slugify(pack.id)}.weather-pack.json`;
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);

  new Notice(`Exported weather pack "${pack.name}".`);
}

function formatEditableTemperature(value: number, unit: TemperatureUnit): string {
  const converted = Math.round(toDisplayTemperature(value, unit) * 10) / 10;
  return String(converted);
}


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

function prepareFlexibleModal(modal: Modal): void {
  modal.modalEl.addClass("time-flex-modal");
  modal.contentEl.addClass("time-flex-modal__content");
}

function buildWeatherEditorMonths(
  plugin: TtrpgToolsTimePlugin,
  existing: WeatherPackFile | null
): FantasyMonth[] {
  const activeCalendar = plugin.activeCalendar;
  const activeMonths = activeCalendar
    ? getWeatherProfileMonths(
        activeCalendar,
        existing ?? undefined,
        activeCalendar.state.cursorDate.year
      )
    : [];
  const existingProfileCount = existing?.monthProfiles.length ?? 0;

  if (activeMonths.length > 0 && existingProfileCount <= activeMonths.length) {
    return activeMonths;
  }

  const targetCount = Math.max(
    activeMonths.length,
    existingProfileCount,
    activeMonths.length > 0 ? 0 : FALLBACK_MONTHS.length
  );

  return Array.from({ length: Math.max(1, targetCount) }, (_, index) => {
    const existingMonth = activeMonths[index] ?? FALLBACK_MONTHS[index];
    return existingMonth
      ? { ...existingMonth }
      : { id: `month-${index + 1}`, name: `Month ${index + 1}`, days: 30 };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}