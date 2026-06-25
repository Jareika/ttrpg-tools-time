import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import type { TimeAdvanceButtonConfig } from "./types";

export class TimeSettingTab extends PluginSettingTab {
  plugin: TtrpgToolsTimePlugin;
  private pendingDataFolder = "";
  private pendingControlTimeButtons: TimeAdvanceButtonConfig[] = [];

  constructor(app: App, plugin: TtrpgToolsTimePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.pendingDataFolder = this.plugin.settings.dataFolder;
    this.pendingControlTimeButtons = this.plugin.settings.controlTimeButtons.map((button) => ({
      ...button
    }));
    void this.render();
  }

  private async render(): Promise<void> {
    const { containerEl } = this;
    const [calendars, tagPacks, weatherPacks] = await Promise.all([
      this.plugin.listCalendars(),
      this.plugin.listTagPacks(),
      this.plugin.listWeatherPacks()
    ]);
    const activeCalendar = this.plugin.activeCalendar;

    containerEl.empty();
	containerEl.addClass("time-plugin-settings");

    new Setting(containerEl).setName("Calendar").setHeading();

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Fantasy calendar tooling for ttrpg campaigns."
    });

    new Setting(containerEl)
      .setName("Open calendar side pane")
      .setDesc("Open or focus the calendar view.")
      .addButton((button) =>
        button.setButtonText("Open").onClick(() => {
          void this.plugin.activateView();
        })
      );

    new Setting(containerEl)
      .setName("Open timeline view")
      .setDesc("Open or focus the event timeline view.")
      .addButton((button) =>
        button.setButtonText("Open").onClick(() => {
          void this.plugin.activateTimelineView();
        })
      );

    new Setting(containerEl)
      .setName("Open timeline filter pane")
      .setDesc("Open or focus the timeline tag filter pane. Click = include, double-click = exclude.")
      .addButton((button) =>
        button.setButtonText("Open").onClick(() => {
          void this.plugin.activateTimelineFilterView();
        })
      );
	  
    new Setting(containerEl)
      .setName("Open control pane")
      .setDesc("Open or focus the control side pane.")
      .addButton((button) =>
        button.setButtonText("Open").onClick(() => {
          void this.plugin.activateControlView();
        })
      );

    new Setting(containerEl)
      .setName("Data folder")
      .setDesc("Base folder for calendar and tag-pack JSON files.")
      .addText((text) => {
        text.setPlaceholder("Ttrpg/time");
        text.setValue(this.pendingDataFolder);
        text.onChange((value) => {
          this.pendingDataFolder = value.trim();
        });
      })
      .addButton((button) => {
        button.setButtonText("Save");
        button.onClick(() => {
          void this.applyDataFolder();
        });
      });

    new Setting(containerEl)
      .setName("Manage calendars")
      .setDesc("Create, edit, delete, and switch calendars.")
      .addButton((button) =>
        button.setButtonText("Open").onClick(() => {
          this.plugin.openManageCalendarsModal();
        })
      );

    new Setting(containerEl)
      .setName("Manage tag packs")
      .setDesc("Create, edit, delete, and link tag packs to the active calendar.")
      .addButton((button) =>
        button.setButtonText("Open").onClick(() => {
          this.plugin.openManageTagPacksModal();
        })
      );
	  
    new Setting(containerEl)
      .setName("Manage weather packs")
      .setDesc("Create, edit, delete, and reuse regional/general weather packs.")
      .addButton((button) =>
        button.setButtonText("Open").onClick(() => {
          this.plugin.openManageWeatherPacksModal();
        })
      );

    new Setting(containerEl)
      .setName("Reload JSON data")
      .setDesc("Reload all calendar and tag-pack files from the vault.")
      .addButton((button) =>
        button.setButtonText("Reload").onClick(() => {
          void this.reloadData();
        })
      );

    new Setting(containerEl)
      .setName("Open on startup")
      .setDesc("Open the calendar view when the workspace is ready.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openOnStartup).onChange((value) => {
          void this.updateOpenOnStartup(value);
        })
      );
	  
    new Setting(containerEl)
      .setName("Day view date format")
      .setDesc(
        "Custom format for the date in day view. Tokens: YYYY, YY, MM, M, DD, D, MonthName, MonthShort, WW, YW, ERA, WeekdayName, WeekdayShort"
      )
      .addText((text) =>
        text
          .setPlaceholder("D-MonthName-YYYY")
          .setValue(this.plugin.settings.dayViewDateFormat)
          .onChange((value) => {
            void this.updateDayViewDateFormat(value);
          })
      );

    new Setting(containerEl)
      .setName("Show calendar week numbers")
      .setDesc("Show an optional week-number column in calendar month/week/year views.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showCalendarWeekNumbers).onChange((value) => {
          void this.updateShowCalendarWeekNumbers(value);
        }));

    new Setting(containerEl).setName("Control pane & fantasy time").setHeading();

    const timeButtonsInfo = containerEl.createDiv({ cls: "time-settings-note" });
    timeButtonsInfo.createDiv({
      text: "These buttons are shown in the control pane. If none are configured, the fantasy-time section stays hidden."
    });
    timeButtonsInfo.createDiv({
      cls: "setting-item-description",
      text: "Icon = any Obsidian icon name. Time overflow advances the current calendar day automatically."
    });

    const buttonList = timeButtonsInfo.createDiv({ cls: "time-settings-button-list" });

    if (this.pendingControlTimeButtons.length > 0) {
      const header = buttonList.createDiv({ cls: "time-settings-button-row time-settings-button-header" });
      ["Label", "Icon", "Hours", "Minutes", ""].forEach((label) => {
        header.createDiv({
          cls: "time-collection-editor__column-label",
          text: label
        });
      });
    } else {
      buttonList.createDiv({
        cls: "time-manager__empty",
        text: "No time-advance buttons configured."
      });
    }

    this.pendingControlTimeButtons.forEach((button, index) => {
      const row = buttonList.createDiv({ cls: "time-settings-button-row" });

      const labelInput = row.createEl("input", { cls: "time-collection-editor__input" });
      labelInput.type = "text";
      labelInput.placeholder = "+8h";
      labelInput.value = button.label;
      labelInput.addEventListener("input", () => {
        this.pendingControlTimeButtons[index].label = labelInput.value;
      });

      const iconInput = row.createEl("input", { cls: "time-collection-editor__input" });
      iconInput.type = "text";
      iconInput.placeholder = "timer";
      iconInput.value = button.icon ?? "";
      iconInput.addEventListener("input", () => {
        this.pendingControlTimeButtons[index].icon = iconInput.value.trim() || undefined;
      });

      const hoursInput = row.createEl("input", { cls: "time-collection-editor__input" });
      hoursInput.type = "number";
      hoursInput.value = String(button.hours);
      hoursInput.addEventListener("input", () => {
        this.pendingControlTimeButtons[index].hours = Math.trunc(Number(hoursInput.value) || 0);
      });

      const minutesInput = row.createEl("input", { cls: "time-collection-editor__input" });
      minutesInput.type = "number";
      minutesInput.value = String(button.minutes);
      minutesInput.addEventListener("input", () => {
        this.pendingControlTimeButtons[index].minutes = Math.trunc(Number(minutesInput.value) || 0);
      });

      const deleteButton = row.createEl("button", {
        cls: "time-collection-editor__delete"
      });
      deleteButton.type = "button";
      deleteButton.setAttr("aria-label", "Delete time button");
      deleteButton.title = "Delete";
      setIcon(deleteButton, "trash-2");
      deleteButton.addEventListener("click", () => {
        this.pendingControlTimeButtons.splice(index, 1);
        void this.render();
      });
    });

    const buttonToolbar = timeButtonsInfo.createDiv({ cls: "time-settings-button-toolbar" });

    const addTimeButton = buttonToolbar.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: "Add button"
    });
    addTimeButton.type = "button";
    addTimeButton.addEventListener("click", () => {
      this.pendingControlTimeButtons.push({
        id: `time-button-${Date.now()}-${this.pendingControlTimeButtons.length + 1}`,
        label: "+8h",
        icon: "timer",
        hours: 8,
        minutes: 0
      });
      void this.render();
    });

    const saveTimeButtons = buttonToolbar.createEl("button", {
      cls: "time-manager__button",
      text: "Save buttons"
    });
    saveTimeButtons.type = "button";
    saveTimeButtons.addEventListener("click", () => {
      void this.updateControlTimeButtons();
    });

    new Setting(containerEl).setName("Overview").setHeading();

    const calendarInfo = containerEl.createDiv({ cls: "time-settings-note" });

    if (activeCalendar) {
      calendarInfo.createDiv({
        text: `Active calendar: ${activeCalendar.name}`
      });

      calendarInfo.createDiv({
		text: `${activeCalendar.definition.weekdays.length} weekdays • ${activeCalendar.definition.months.length} months • ${activeCalendar.definition.moons.length} moons`
      });

      calendarInfo.createDiv({
        text: `${activeCalendar.linkedTagPackIds.length} linked tag packs`
      });
	  
      calendarInfo.createDiv({
        text: `Default weather pack: ${
          weatherPacks.find((pack) => pack.id === activeCalendar.defaultWeatherPackId)?.name ??
          activeCalendar.defaultWeatherPackId ??
          "—"
        }`
      });

      calendarInfo.createDiv({
        text: `Today: ${activeCalendar.state.todayDate.day}-${activeCalendar.state.todayDate.monthIndex + 1}-${activeCalendar.state.todayDate.year}`
      });
    } else {
      calendarInfo.createDiv({
        text: "No active calendar loaded."
      });
    }

    const calendarList = containerEl.createDiv({ cls: "time-settings-note" });
    calendarList.createDiv({
      text: `Available calendars: ${calendars.length}`
    });

    const calendarEntries = calendarList.createEl("ul");
    calendars.forEach((calendar) => {
      calendarEntries.createEl("li", {
        text: `${calendar.name} [${calendar.id}]`
      });
    });

    new Setting(containerEl).setName("Tag packs").setHeading();

    const packsInfo = containerEl.createDiv({ cls: "time-settings-note" });
    packsInfo.createDiv({
       text: `Available tag packs: ${tagPacks.length}`
    });

    const tagList = packsInfo.createEl("ul");
    tagPacks.forEach((pack) => {
      tagList.createEl("li", {
        text: `${pack.name} (${pack.tags.length} tags)`
      });
    });
	
    new Setting(containerEl).setName("Weather packs").setHeading();

    const weatherInfo = containerEl.createDiv({ cls: "time-settings-note" });
    weatherInfo.createDiv({
      text: `Available weather packs: ${weatherPacks.length}`
    });

    const weatherList = weatherInfo.createEl("ul");
    weatherPacks.forEach((pack) => {
      weatherList.createEl("li", {
        text: `${pack.name} (${pack.monthProfiles.length} month baselines)`
      });
    });
  }

  private async applyDataFolder(): Promise<void> {
    const nextFolder = this.pendingDataFolder.trim();

    if (nextFolder.length === 0) {
      return;
    }

    await this.plugin.replaceSettings({
      ...this.plugin.settings,
      dataFolder: nextFolder
    });

    await this.plugin.reloadDataFromDisk();
    this.display();
  }

  private async reloadData(): Promise<void> {
    await this.plugin.reloadDataFromDisk();
    this.display();
  }

  private async updateOpenOnStartup(value: boolean): Promise<void> {
    await this.plugin.replaceSettings({
      ...this.plugin.settings,
      openOnStartup: value
    });
  }

  private async updateDayViewDateFormat(value: string): Promise<void> {
    await this.plugin.replaceSettings({
      ...this.plugin.settings,
      dayViewDateFormat: value.trim().length > 0 ? value.trim() : "D-M-YYYY"
    });
    this.plugin.refreshOpenViews();
  }

  private async updateShowCalendarWeekNumbers(value: boolean): Promise<void> {
    await this.plugin.replaceSettings({
      ...this.plugin.settings,
      showCalendarWeekNumbers: value
    });
    this.plugin.refreshOpenViews();
  }
  private async updateControlTimeButtons(): Promise<void> {
    const nextButtons = this.pendingControlTimeButtons
      .map((button, index) => {
        const label = button.label.trim().length > 0
          ? button.label.trim()
          : `Advance ${index + 1}`;

        return {
          id: button.id.trim().length > 0 ? button.id.trim() : `time-button-${index + 1}`,
          label,
          icon: button.icon?.trim() ? button.icon.trim() : undefined,
          hours: Math.trunc(button.hours || 0),
          minutes: Math.trunc(button.minutes || 0)
        };
      })
      .filter((button) => button.hours !== 0 || button.minutes !== 0);

    await this.plugin.replaceSettings({
      ...this.plugin.settings,
      controlTimeButtons: nextButtons
    });

    this.plugin.refreshOpenViews();
    this.display();
  }
}