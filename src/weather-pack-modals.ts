import { App, Modal, Notice, Setting } from "obsidian";
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
  fromDisplayTemperature,
  getTemperatureUnitLabel,
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
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal");

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

    new Setting(contentEl)
      .setName("Pack name")
      .setDesc("Display name of the weather pack.")
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
      .addTextArea((text) => {
        text.setValue(this.description);
        text.inputEl.rows = 3;
        text.onChange((value) => {
          this.description = value.trim();
        });
      });

    contentEl.createEl("h3", { text: "Temperature & seasonality" });

    createTemperatureSetting(contentEl, "Temperature min", this.temperatureMin, this.temperatureUnit, (value) => {
      this.temperatureMin = value;
    });

    createTemperatureSetting(contentEl, "Temperature max", this.temperatureMax, this.temperatureUnit, (value) => {
      this.temperatureMax = value;
    });

    createNumberSetting(contentEl, "Seasonality", this.seasonality, (value) => {
      this.seasonality = clamp(value, 0, 100);
    }, "0–100");

    createTemperatureSetting(contentEl, "Snow temperature", this.snowTemperature, this.temperatureUnit, (value) => {
      this.snowTemperature = value;
    });

    createNumberSetting(contentEl, "Volatility", this.volatility, (value) => {
      this.volatility = clamp(value, 0, 100);
    }, "0–100");

    contentEl.createEl("h3", { text: "Humidity, sky & wind" });

    createNumberSetting(contentEl, "Humidity", this.humidity, (value) => {
      this.humidity = clamp(value, 0, 100);
    }, "0–100");

    createNumberSetting(contentEl, "Precipitation", this.precipitation, (value) => {
      this.precipitation = clamp(value, 0, 100);
    }, "0–100");

    createNumberSetting(contentEl, "Storminess", this.storminess, (value) => {
      this.storminess = clamp(value, 0, 100);
    }, "0–100");

    createNumberSetting(contentEl, "Cloudiness", this.cloudiness, (value) => {
      this.cloudiness = clamp(value, 0, 100);
    }, "0–100");

    createNumberSetting(contentEl, "Fogginess", this.fogginess, (value) => {
      this.fogginess = clamp(value, 0, 100);
    }, "0–100");

    createNumberSetting(contentEl, "Windiness", this.windiness, (value) => {
      this.windiness = clamp(value, 0, 100);
    }, "0–100");

    contentEl.createEl("h3", { text: "Fronts & durations" });

    createNumberSetting(contentEl, "Front frequency", this.frontFrequency, (value) => {
      this.frontFrequency = clamp(value, 0, 100);
    }, "0–100");

    createNumberSetting(contentEl, "Front strength", this.frontStrength, (value) => {
      this.frontStrength = clamp(value, 0, 100);
    }, "0–100");

    createNumberSetting(contentEl, "Stable span min", this.stableSpanMin, (value) => {
      this.stableSpanMin = Math.max(1, value);
    });

    createNumberSetting(contentEl, "Stable span max", this.stableSpanMax, (value) => {
      this.stableSpanMax = Math.max(1, value);
    });

    createNumberSetting(contentEl, "Front span min", this.frontSpanMin, (value) => {
      this.frontSpanMin = Math.max(1, value);
    });

    createNumberSetting(contentEl, "Front span max", this.frontSpanMax, (value) => {
      this.frontSpanMax = Math.max(1, value);
    });

    new Setting(contentEl)
      .setName("Month baselines")
      .setDesc(
        `${this.monthProfiles.length} month profile${this.monthProfiles.length === 1 ? "" : "s"} configured. Use these values to shape the yearly baseline per month.`
      )
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          new WeatherPackMonthProfilesModal(
            this.app,
            this.months,
            this.monthProfiles,
			this.temperatureUnit,
            (nextProfiles) => {
              this.monthProfiles = nextProfiles.map((profile) => ({ ...profile }));
              this.render();
            }
          ).open();
        });
      });

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

class WeatherPackMonthProfilesModal extends Modal {
  private readonly months: FantasyMonth[];
  private profiles: WeatherPackMonthProfile[];
  private readonly temperatureUnit: TemperatureUnit;
  private readonly onSave: (profiles: WeatherPackMonthProfile[]) => void;

  constructor(
    app: App,
    months: FantasyMonth[],
    profiles: WeatherPackMonthProfile[],
	temperatureUnit: TemperatureUnit,
    onSave: (profiles: WeatherPackMonthProfile[]) => void
  ) {
    super(app);
    this.months = months.map((month) => ({ ...month }));
    this.profiles = profiles.map((profile) => ({ ...profile }));
	this.temperatureUnit = temperatureUnit;
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

    contentEl.createEl("h2", { text: "Configure month baselines" });
    contentEl.createEl("p", {
      cls: "time-weather-pack-months__meta",
      text: "Each row defines the baseline for a month. The generator interpolates these values across the year."
    });

    const table = contentEl.createDiv({ cls: "time-weather-pack-months__table" });
    const header = table.createDiv({ cls: "time-weather-pack-months__header" });
    createHeaderCell(header, "Month");
    createHeaderCell(header, `Temp (${getTemperatureUnitLabel(this.temperatureUnit)})`);
    createHeaderCell(header, "Hum");
    createHeaderCell(header, "Prec");
    createHeaderCell(header, "Cloud");
    createHeaderCell(header, "Fog");
    createHeaderCell(header, "Wind");
    createHeaderCell(header, "Front");

    this.months.forEach((month, index) => {
      const profile = this.profiles[index] ?? {
        monthIndex: index,
        temperatureOffset: 0,
        humidity: 50,
        precipitation: 50,
        cloudiness: 50,
        fogginess: 10,
        windiness: 30,
        frontBias: 40
      };

      this.profiles[index] = { ...profile, monthIndex: index };

      const row = table.createDiv({ cls: "time-weather-pack-months__row" });
      row.createDiv({
        cls: "time-weather-pack-months__label",
        text: month.name
      });

      createRowNumberInput(
        row,
        formatEditableTemperature(profile.temperatureOffset, this.temperatureUnit),
        (value) => {
          this.profiles[index].temperatureOffset = fromDisplayTemperature(value, this.temperatureUnit);
        }
      );

      createRowNumberInput(row, String(profile.humidity), (value) => {
        this.profiles[index].humidity = clamp(value, 0, 100);
      });

      createRowNumberInput(row, String(profile.precipitation), (value) => {
        this.profiles[index].precipitation = clamp(value, 0, 100);
      });

      createRowNumberInput(row, String(profile.cloudiness), (value) => {
        this.profiles[index].cloudiness = clamp(value, 0, 100);
      });

      createRowNumberInput(row, String(profile.fogginess), (value) => {
        this.profiles[index].fogginess = clamp(value, 0, 100);
      });

      createRowNumberInput(row, String(profile.windiness), (value) => {
        this.profiles[index].windiness = clamp(value, 0, 100);
      });

      createRowNumberInput(row, String(profile.frontBias), (value) => {
        this.profiles[index].frontBias = clamp(value, 0, 100);
      });
    });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Save");
      button.setCta();
      button.onClick(() => {
        this.onSave(
          this.profiles.map((profile, index) => ({
            monthIndex: index,
            temperatureOffset: Number(profile.temperatureOffset) || 0,
            humidity: clamp(Number(profile.humidity) || 0, 0, 100),
            precipitation: clamp(Number(profile.precipitation) || 0, 0, 100),
            cloudiness: clamp(Number(profile.cloudiness) || 0, 0, 100),
            fogginess: clamp(Number(profile.fogginess) || 0, 0, 100),
            windiness: clamp(Number(profile.windiness) || 0, 0, 100),
            frontBias: clamp(Number(profile.frontBias) || 0, 0, 100)
          }))
        );
        this.close();
      });
    });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Cancel");
      button.onClick(() => {
        this.close();
      });
    });
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
  const input: HTMLInputElement = doc.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";

  input.addEventListener("change", () => {
    void (async () => {
      const file = input.files?.[0];
      if (!file) {
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
      }
    })();
  });

  input.click();
}

function exportWeatherPack(doc: Document, pack: WeatherPackFile): void {
  const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = doc.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(pack.id)}.weather-pack.json`;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);

  new Notice(`Exported weather pack "${pack.name}".`);
}

function createNumberSetting(
  parent: HTMLElement,
  name: string,
  value: number,
  onChange: (value: number) => void,
  desc?: string
): void {
  new Setting(parent)
    .setName(name)
    .setDesc(desc ?? "")
    .addText((text) => {
      text.inputEl.type = "number";
      text.setValue(String(value));
      text.onChange((nextValue) => {
        onChange(Number(nextValue) || 0);
      });
    });
}

function createTemperatureSetting(
  parent: HTMLElement,
  name: string,
  value: number,
  unit: TemperatureUnit,
  onChange: (value: number) => void,
  desc?: string
): void {
  new Setting(parent)
    .setName(`${name} (${getTemperatureUnitLabel(unit)})`)
    .setDesc(desc ?? "")
    .addText((text) => {
      text.inputEl.type = "number";
      text.setValue(formatEditableTemperature(value, unit));
      text.onChange((nextValue) => {
        onChange(fromDisplayTemperature(Number(nextValue) || 0, unit));
      });
    });
}

function formatEditableTemperature(value: number, unit: TemperatureUnit): string {
  const converted = Math.round(toDisplayTemperature(value, unit) * 10) / 10;
  return String(converted);
}

function createHeaderCell(parent: HTMLElement, text: string): void {
  parent.createDiv({
    cls: "time-weather-pack-months__header-cell",
    text
  });
}

function createRowNumberInput(
  parent: HTMLElement,
  value: string,
  onChange: (value: number) => void
): HTMLInputElement {
  const input = parent.createEl("input", {
    cls: "time-weather-pack-months__input"
  });
  input.type = "number";
  input.value = value;
  input.addEventListener("input", () => {
    onChange(Number(input.value) || 0);
  });
  return input;
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