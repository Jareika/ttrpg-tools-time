import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  setIcon,
  type SettingDefinitionItem
} from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import type { TimeAdvanceButtonConfig } from "./types";

export class TimeSettingTab extends PluginSettingTab {
  private readonly plugin: TtrpgToolsTimePlugin;
  private timeButtonDrafts: TimeAdvanceButtonConfig[] | null = null;

  constructor(app: App, plugin: TtrpgToolsTimePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Calendar",
        cls: "time-plugin-settings",
        items: [
          {
            name: "Open control pane",
            desc: "Open or focus the control side pane.",
            aliases: ["controls", "quick actions"],
            action: () => {
              void this.plugin.activateControlView();
            }
          },
          {
            name: "Manage frontmatter",
            desc: "Configure manual frontmatter import mappings and scan behaviour.",
            aliases: ["import", "export", "metadata"],
            action: () => {
              this.plugin.openFrontmatterManagerModal();
            }
          },
          {
            name: "Manage calendars",
            desc: "Create, edit, delete, and switch calendars.",
            aliases: ["calendar manager"],
            action: () => {
              this.plugin.openManageCalendarsModal();
            }
          },
          {
            name: "Manage tag packs",
            desc: "Create, edit, delete, and link tag packs to the active calendar.",
            aliases: ["tags"],
            action: () => {
              this.plugin.openManageTagPacksModal();
            }
          },
          {
            name: "Manage weather packs",
            desc: "Create, edit, delete, and reuse regional/general weather packs.",
            aliases: ["weather"],
            action: () => {
              this.plugin.openManageWeatherPacksModal();
            }
          },
          {
            name: "Data folder",
            desc: "Base folder for calendar and tag-pack JSON files. Saving reloads plugin data from the new location.",
            aliases: ["storage", "JSON folder"],
            render: (setting) => {
              this.renderDataFolderSetting(setting);
            }
          },
          {
            name: "Day view date format",
            desc: "Tokens: YYYY, YY, EraYear, MM, M, DD, D, MonthName, MonthShort, WW, YW, WeekName, ERA, WeekdayName, WeekdayShort.",
            aliases: ["date", "format"],
            control: {
              type: "text",
              key: "dayViewDateFormat",
              placeholder: "D-MonthName-YYYY",
              defaultValue: "D-M-YYYY",
              validate: (value) =>
                value.trim().length > 0
                  ? undefined
                  : "Please provide at least one date-format token or character."
            }
          },
          {
            name: "Show calendar week numbers",
            desc: "Show an optional week-number column in calendar month, week, and year views.",
            aliases: ["week numbers"],
            control: {
              type: "toggle",
              key: "showCalendarWeekNumbers",
              defaultValue: false
            }
          },
          {
            name: "Temperature unit",
            desc: "Display temperatures in weather UI and weather editors.",
            aliases: ["weather", "celsius", "fahrenheit"],
            control: {
              type: "dropdown",
              key: "temperatureUnit",
              defaultValue: "c",
              options: {
                c: "Celsius (°C)",
                f: "Fahrenheit (°F)"
              }
            }
          }
        ]
      },
      {
        type: "group",
        heading: "Control pane & fantasy time",
        cls: "time-plugin-settings",
        items: [
          {
            name: "Fantasy-time buttons",
            desc: "Configure label, icon, hours, and minutes for the fantasy-time controls.",
            aliases: ["fantasy time", "advance time", "time buttons"],
            render: (setting) => {
              this.renderFantasyTimeButtons(setting);
            }
          }
        ]
      },
      {
        type: "group",
        heading: "Overview",
        cls: "time-plugin-settings",
        items: [
          {
            name: "Calendar overview",
            desc: "Shows the active calendar and all available calendars.",
            aliases: ["calendar", "active calendar", "overview"],
            render: (setting) => {
              this.renderCalendarOverview(setting);
            }
          }
        ]
      },
      {
        type: "group",
        heading: "Tag packs",
        cls: "time-plugin-settings",
        items: [
          {
            name: "Tag-pack overview",
            desc: "Shows all available tag packs.",
            aliases: ["tags", "tag packs", "overview"],
            render: (setting) => {
              this.renderTagPackOverview(setting);
            }
          }
        ]
      },
      {
        type: "group",
        heading: "Weather packs",
        cls: "time-plugin-settings",
        items: [
          {
            name: "Weather-pack overview",
            desc: "Shows all available weather packs.",
            aliases: ["weather", "weather packs", "overview"],
            render: (setting) => {
              this.renderWeatherPackOverview(setting);
            }
          }
        ]
      }
    ];
  }

  override getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof typeof this.plugin.settings];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case "dayViewDateFormat":
        await this.plugin.replaceSettings({
          ...this.plugin.settings,
          dayViewDateFormat:
            typeof value === "string" && value.trim().length > 0
              ? value.trim()
              : "D-M-YYYY"
        });
        break;
      case "showCalendarWeekNumbers":
        await this.plugin.replaceSettings({
          ...this.plugin.settings,
          showCalendarWeekNumbers: value === true
        });
        break;
      case "temperatureUnit":
        await this.plugin.replaceSettings({
          ...this.plugin.settings,
          temperatureUnit: value === "f" ? "f" : "c"
        });
        break;
      default:
        return;
    }

    this.plugin.refreshOpenViews();
  }

  private renderDataFolderSetting(setting: Setting): void {
    let nextFolder = this.plugin.settings.dataFolder;

    setting
      .addText((text) => {
        text.setPlaceholder("TTRPG/Time");
        text.setValue(nextFolder);
        text.onChange((value) => {
          nextFolder = value.trim();
        });
      })
      .addButton((button) => {
        button.setButtonText("Save");
        button.onClick(() => {
          void this.applyDataFolder(nextFolder);
        });
      });
  }

  private renderFantasyTimeButtons(setting: Setting): void {
    const card = this.createCustomSettingsCard(
      setting,
      "time-settings-time-buttons-card"
    );
    const drafts = this.getTimeButtonDrafts();

    card.createDiv({
      text: "These buttons are shown in the control pane. If none are configured, the fantasy-time section stays hidden."
    });
    card.createDiv({
      cls: "setting-item-description",
      text: "Icon = any Obsidian icon name. Time overflow advances the current calendar day automatically."
    });

    const buttonList = card.createDiv({ cls: "time-settings-button-list" });

    if (drafts.length === 0) {
      buttonList.createDiv({
        cls: "time-manager__empty",
        text: "No time-advance buttons configured."
      });
    } else {
      const header = buttonList.createDiv({
        cls: "time-settings-button-row time-settings-button-header"
      });

      ["Label", "Icon", "Hours", "Minutes", ""].forEach((label) => {
        header.createDiv({
          cls: "time-collection-editor__column-label",
          text: label
        });
      });
    }

    drafts.forEach((button, index) => {
      const row = buttonList.createDiv({ cls: "time-settings-button-row" });

      const labelInput = row.createEl("input", {
        cls: "time-collection-editor__input"
      });
      labelInput.type = "text";
      labelInput.placeholder = "+8h";
      labelInput.value = button.label;
      labelInput.setAttr("aria-label", "Time button label");
      labelInput.addEventListener("input", () => {
        const draft = drafts[index];
        if (draft) {
          draft.label = labelInput.value;
        }
      });

      const iconInput = row.createEl("input", {
        cls: "time-collection-editor__input"
      });
      iconInput.type = "text";
      iconInput.placeholder = "Timer";
      iconInput.value = button.icon ?? "";
      iconInput.setAttr("aria-label", "Obsidian icon name");
      iconInput.addEventListener("input", () => {
        const draft = drafts[index];
        if (draft) {
          draft.icon = iconInput.value.trim() || undefined;
        }
      });

      const hoursInput = row.createEl("input", {
        cls: "time-collection-editor__input"
      });
      hoursInput.type = "number";
      hoursInput.value = String(button.hours);
      hoursInput.setAttr("aria-label", "Hours to advance");
      hoursInput.addEventListener("input", () => {
        const draft = drafts[index];
        if (draft) {
          draft.hours = Math.trunc(Number(hoursInput.value) || 0);
        }
      });

      const minutesInput = row.createEl("input", {
        cls: "time-collection-editor__input"
      });
      minutesInput.type = "number";
      minutesInput.value = String(button.minutes);
      minutesInput.setAttr("aria-label", "Minutes to advance");
      minutesInput.addEventListener("input", () => {
        const draft = drafts[index];
        if (draft) {
          draft.minutes = Math.trunc(Number(minutesInput.value) || 0);
        }
      });

      const deleteButton = row.createEl("button", {
        cls: "time-collection-editor__delete"
      });
      deleteButton.type = "button";
      deleteButton.setAttr("aria-label", `Delete time button ${index + 1}`);
      deleteButton.title = "Delete";
      setIcon(deleteButton, "trash-2");
      deleteButton.addEventListener("click", () => {
        drafts.splice(index, 1);
        this.update();
      });
    });

    const toolbar = card.createDiv({ cls: "time-settings-button-toolbar" });

    const addButton = toolbar.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: "Add button"
    });
    addButton.type = "button";
    addButton.addEventListener("click", () => {
      drafts.push({
        id: `time-button-${Date.now()}-${drafts.length + 1}`,
        label: "+8h",
        icon: "timer",
        hours: 8,
        minutes: 0
      });
      this.update();
    });

    const saveButton = toolbar.createEl("button", {
      cls: "time-manager__button",
      text: "Save buttons"
    });
    saveButton.type = "button";
    saveButton.addEventListener("click", () => {
      void this.saveTimeAdvanceButtons();
    });
  }

  private renderCalendarOverview(setting: Setting): void {
    const card = this.createCustomSettingsCard(
      setting,
      "time-settings-overview-card"
    );
    card.createDiv({
      cls: "time-settings-overview-loading",
      text: "Loading calendar overview…"
    });
    void this.populateCalendarOverview(card);
  }

  private renderTagPackOverview(setting: Setting): void {
    const card = this.createCustomSettingsCard(
      setting,
      "time-settings-overview-card"
    );
    card.createDiv({
      cls: "time-settings-overview-loading",
      text: "Loading tag-pack overview…"
    });
    void this.populateTagPackOverview(card);
  }

  private renderWeatherPackOverview(setting: Setting): void {
    const card = this.createCustomSettingsCard(
      setting,
      "time-settings-overview-card"
    );
    card.createDiv({
      cls: "time-settings-overview-loading",
      text: "Loading weather-pack overview…"
    });
    void this.populateWeatherPackOverview(card);
  }

  private createCustomSettingsCard(
    setting: Setting,
    className: string
  ): HTMLElement {
    setting.settingEl.empty();
    setting.settingEl.addClass("time-settings-custom-row");

    return setting.settingEl.createDiv({
      cls: `time-settings-note ${className}`
    });
  }

  private getTimeButtonDrafts(): TimeAdvanceButtonConfig[] {
    if (this.timeButtonDrafts === null) {
      this.timeButtonDrafts = this.plugin.settings.controlTimeButtons.map(
        (button) => ({ ...button })
      );
    }

    return this.timeButtonDrafts;
  }

  private async applyDataFolder(nextFolder: string): Promise<void> {
    const normalizedFolder = nextFolder.trim();

    if (normalizedFolder.length === 0) {
      new Notice("The time data folder cannot be empty.");
      return;
    }
	
    if (normalizedFolder === this.plugin.settings.dataFolder) {
      return;
    }

    await this.plugin.replaceSettings({
      ...this.plugin.settings,
      dataFolder: normalizedFolder
    });

    await this.plugin.reloadDataFromDisk();
    this.update();
  }

  private async saveTimeAdvanceButtons(): Promise<void> {
    const drafts = this.getTimeButtonDrafts();
    const nextButtons = drafts
      .map((button, index) => {
        const label = button.label.trim() || `Advance ${index + 1}`;

        return {
          id: button.id.trim() || `time-button-${index + 1}`,
          label,
          icon: button.icon?.trim() || undefined,
          hours: Math.trunc(button.hours || 0),
          minutes: Math.trunc(button.minutes || 0)
        };
      })
      .filter((button) => button.hours !== 0 || button.minutes !== 0);

    await this.plugin.replaceSettings({
      ...this.plugin.settings,
      controlTimeButtons: nextButtons
    });
	
    this.timeButtonDrafts = null;
    this.plugin.refreshOpenViews();
    this.update();
  }

  private async populateCalendarOverview(card: HTMLElement): Promise<void> {
    try {
      const [calendars, weatherPacks] = await Promise.all([
        this.plugin.listCalendars(),
        this.plugin.listWeatherPacks()
      ]);

      if (!card.isConnected) {
        return;
      }

      card.empty();

      const activeCalendar = this.plugin.activeCalendar;
      if (activeCalendar) {
        card.createDiv({ text: `Active calendar: ${activeCalendar.name}` });
        card.createDiv({
          text: `${activeCalendar.definition.weekdays.length} weekdays • ${activeCalendar.definition.months.length} months • ${activeCalendar.definition.moons.length} moons`
        });
        card.createDiv({
          text: `${activeCalendar.linkedTagPackIds.length} linked tag packs`
        });
        card.createDiv({
          text: `Default weather pack: ${
            weatherPacks.find(
              (pack) => pack.id === activeCalendar.defaultWeatherPackId
            )?.name ??
            activeCalendar.defaultWeatherPackId ??
            "—"
          }`
        });
        card.createDiv({
          text: `Today: ${activeCalendar.state.todayDate.day}-${activeCalendar.state.todayDate.monthIndex + 1}-${activeCalendar.state.todayDate.year}`
        });
      } else {
        card.createDiv({ text: "No active calendar loaded." });
      }

      card.createDiv({
        cls: "time-settings-overview-spacer",
        text: `Available calendars: ${calendars.length}`
      });

      this.renderOverviewList(
        card,
        calendars.map((calendar) => `${calendar.name} [${calendar.id}]`)
      );
    } catch (error) {
      this.renderOverviewLoadError(card, error);
    }
  }

  private async populateTagPackOverview(card: HTMLElement): Promise<void> {
    try {
      const packs = await this.plugin.listTagPacks();

      if (!card.isConnected) {
        return;
      }

      card.empty();
      card.createDiv({ text: `Available tag packs: ${packs.length}` });
      this.renderOverviewList(
        card,
        packs.map((pack) => `${pack.name} (${pack.tags.length} tags)`)
      );
    } catch (error) {
      this.renderOverviewLoadError(card, error);
    }
  }

  private async populateWeatherPackOverview(card: HTMLElement): Promise<void> {
    try {
      const packs = await this.plugin.listWeatherPacks();

      if (!card.isConnected) {
        return;
      }

      card.empty();
      card.createDiv({ text: `Available weather packs: ${packs.length}` });
      this.renderOverviewList(
        card,
        packs.map(
          (pack) => `${pack.name} (${pack.monthProfiles.length} month baselines)`
        )
      );
    } catch (error) {
      this.renderOverviewLoadError(card, error);
    }
  }

  private renderOverviewList(parent: HTMLElement, entries: string[]): void {
    if (entries.length === 0) {
      parent.createDiv({
        cls: "time-manager__empty",
        text: "No entries available."
      });
      return;
    }

    const list = parent.createEl("ul", {
      cls: "time-settings-overview-list"
    });

    entries.forEach((entry) => {
      list.createEl("li", { text: entry });
    });
  }

  private renderOverviewLoadError(card: HTMLElement, error: unknown): void {
    if (!card.isConnected) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    card.empty();
    card.createDiv({
      cls: "time-manager__empty",
      text: `Could not load overview data: ${message}`
    });
  }
}