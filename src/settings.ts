import { App, PluginSettingTab, Setting } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";

export class TimeSettingTab extends PluginSettingTab {
  plugin: TtrpgToolsTimePlugin;
  private pendingDataFolder = "";

  constructor(app: App, plugin: TtrpgToolsTimePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
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
    this.pendingDataFolder = this.plugin.settings.dataFolder;

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
}