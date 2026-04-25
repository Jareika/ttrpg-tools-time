import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import {
  buildDefaultSeasons,
  normalizeCalendarFile,
  normalizeTagPackFile,
  slugify
} from "./calendar";
import { WeatherPackPickerModal } from "./weather-pack-modals";
import type {
  CalendarFile,
  CalendarViewMode,
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
  startDay: number;
}

interface MonthDraft {
  id: string;
  name: string;
  days: number;
}

interface MoonDraft {
  id: string;
  name: string;
  cycleDays: number;
  offsetDays: number;
  color: string;
}

interface NamedYearDraft {
  year: number;
  name: string;
}

interface SeasonDraft {
  id: string;
  name: string;
  startMonthIndex: number;
  startDay: number;
  endMonthIndex: number;
  endDay: number;
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

export class CalendarEditorModal extends Modal {
  private readonly plugin: TtrpgToolsTimePlugin;
  private readonly existing: CalendarFile | null;
  private readonly onSaved?: () => void;

  private name: string;
  private id: string;
  private description: string;
  private eras: EraDraft[];
  private weekdays: string[];
  private months: MonthDraft[];
  private moons: MoonDraft[];
  private namedYears: NamedYearDraft[];
  private startWeekdayIndex: number;
  private todayYear: number;
  private todayMonthIndex: number;
  private todayDay: number;
  private savedActiveView: CalendarViewMode;
  private seasons: SeasonDraft[];
  private defaultWeatherPackId: string;
  private readonly selectedTagPackIds: Set<string>;

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
      ? definition.months.map((month) => ({ ...month }))
      : parseMonthLines(DEFAULT_MONTH_LINES).map((month) => ({ ...month }));

    this.name = definition?.name ?? "New Calendar";
    this.id = existing?.id ?? slugify(this.name);
    this.description = source?.description ?? "";
    this.eras =
      definition?.eras?.length
        ? definition.eras.map((era) => ({ ...era }))
        : [
            {
              id: slugify(definition?.eraLabel ?? "NV"),
              name: "Era 1",
              shortName: definition?.eraLabel ?? "NV",
              startYear: 0,
              startMonthIndex: 0,
              startDay: 1
            }
          ];
    this.weekdays = [...(definition?.weekdays ?? ["RAU", "ZAR", "VEL", "KRA", "LUM"])];
    this.months = monthDefaults.map((month) => ({ ...month }));
    this.moons = (definition?.moons ?? []).map((moon) => ({
      ...moon,
      color: normalizeColor(moon.color)
    }));
    this.namedYears = (definition?.yearNames ?? []).map((entry) => ({ ...entry }));
    this.startWeekdayIndex = definition?.startWeekdayIndex ?? 0;
    this.todayYear = state?.todayDate.year ?? 1166;
    this.todayMonthIndex = state?.todayDate.monthIndex ?? 0;
    this.todayDay = state?.todayDate.day ?? 1;
	this.savedActiveView = state?.activeView ?? "year";

    const seasons = definition?.seasons?.length
      ? definition.seasons
      : buildDefaultSeasons(this.months);

    this.seasons = seasons.map((season) => ({
      id: season.id,
      name: season.name,
      startMonthIndex: season.start.monthIndex,
      startDay: season.start.day,
      endMonthIndex: season.end.monthIndex,
      endDay: season.end.day,
      color: normalizeColor(season.color)
    }));

	this.defaultWeatherPackId = source?.defaultWeatherPackId ?? "general";
    this.selectedTagPackIds = new Set(source?.linkedTagPackIds ?? []);
  }

  onOpen(): void {
	prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
	const weatherPacks = await this.plugin.listWeatherPacks();
    contentEl.empty();
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", {
      text: this.existing ? "Edit calendar" : "Create calendar"
    });

    new Setting(contentEl)
      .setName("Calendar name")
      .setDesc("Display name of the calendar.")
      .addText((text) => {
        text.setValue(this.name);
        text.onChange((value) => {
          this.name = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Calendar ID")
      .setDesc("Stable file identifier. Locked for existing calendars.")
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
      .setDesc("Optional description.")
      .addTextArea((text) => {
        text.setValue(this.description);
        text.inputEl.rows = 3;
        text.onChange((value) => {
          this.description = value.trim();
        });
      });

    new Setting(contentEl)
      .setName("Eras")
      .setDesc(`${this.eras.length} era${this.eras.length === 1 ? "" : "s"} defined.`)
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          this.openEraEditorModal();
        });
      });

    new Setting(contentEl)
      .setName("Weekdays")
      .setDesc(
        `${this.weekdays.length} weekday${this.weekdays.length === 1 ? "" : "s"} defined. Start weekday: ${this.getStartWeekdayName()}`
      )
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          this.openWeekdayEditorModal();
        });
      });

    new Setting(contentEl)
      .setName("Months")
      .setDesc(`${this.months.length} month${this.months.length === 1 ? "" : "s"} defined.`)
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          this.openMonthEditorModal();
        });
      });

    new Setting(contentEl)
      .setName("Moons")
      .setDesc(`${this.moons.length} moon${this.moons.length === 1 ? "" : "s"} defined.`)
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          this.openMoonEditorModal();
        });
      });

    new Setting(contentEl)
      .setName("Named years")
      .setDesc(`${this.namedYears.length} named year${this.namedYears.length === 1 ? "" : "s"} defined.`)
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          this.openNamedYearEditorModal();
        });
      });

    const todayRow = contentEl.createDiv({
      cls: "time-inline-fields time-inline-fields--triple"
    });

    createInlineNumberField(todayRow, {
      label: "Today: Year",
      value: String(this.todayYear),
      onChange: (value) => {
        this.todayYear = value;
      }
    });

    createInlineNumberField(todayRow, {
      label: "Today: Month",
      value: String(this.todayMonthIndex + 1),
      min: 1,
      onChange: (value) => {
        this.todayMonthIndex = Math.max(0, value - 1);
      }
    });

    createInlineNumberField(todayRow, {
      label: "Today: Day",
      value: String(this.todayDay),
      min: 1,
      onChange: (value) => {
        this.todayDay = Math.max(1, value);
      }
    });
	  
    new Setting(contentEl)
      .setName("Seasons")
      .setDesc(
        `${this.seasons.length} season${this.seasons.length === 1 ? "" : "s"} defined.`
      )
      .addButton((button) => {
        button.setButtonText("Configure");
        button.onClick(() => {
          this.openSeasonEditorModal();
        });
      });

    new Setting(contentEl)
      .setName("Default weather pack")
      .setDesc(
        `Used when a day-view weather year is created. Current: ${
          weatherPacks.find((pack) => pack.id === this.defaultWeatherPackId)?.name ??
          this.defaultWeatherPackId
        }`
      )
      .addButton((button) => {
        button.setButtonText("Choose");
        button.onClick(() => {
          new WeatherPackPickerModal(
            this.plugin,
            this.defaultWeatherPackId,
            (packId) => {
              this.defaultWeatherPackId = packId;
              void this.render();
            },
            "Choose default weather pack"
          ).open();
        });
      })
      .addExtraButton((button) => {
        button.setIcon("settings");
        button.setTooltip("Manage weather packs");
        button.onClick(() => {
          this.plugin.openManageWeatherPacksModal();
        });
      });

    this.renderPackSelector(
      contentEl,
      "Linked tag packs",
      "These tag packs will be available to this calendar when event support is added.",
      (await this.plugin.listTagPacks()).map((pack) => ({ id: pack.id, name: pack.name })),
      this.selectedTagPackIds
    );

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
    new MonthEditorModal(this.app, this.months, (nextMonths) => {
      this.months = nextMonths;
      void this.render();
    }).open();
  }

  private openMoonEditorModal(): void {
    new MoonEditorModal(this.app, this.moons, (nextMoons) => {
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
      this.getMonthOptions(),
      this.seasons,
      (nextSeasons) => {
        this.seasons = nextSeasons;
        void this.render();
      }
    ).open();
  }

  private getMonthOptions(): Array<{ id: string; name: string; days: number }> {
    return this.months.length > 0
      ? this.months.map((month) => ({ ...month }))
      : [{ id: "month-1", name: "Month 1", days: 30 }];
  }

  private renderPackSelector(
    parent: HTMLElement,
    name: string,
    desc: string,
    options: Array<{ id: string; name: string }>,
    selected: Set<string>
  ): void {
    const wrapper = parent.createDiv({ cls: "time-modal__pack-selector" });
    wrapper.createEl("h3", { text: name });
    wrapper.createEl("p", { text: desc });

    if (options.length === 0) {
      wrapper.createDiv({
        cls: "setting-item-description",
        text: "No packs available yet."
      });
      return;
    }

    options.forEach((option) => {
      new Setting(wrapper)
        .setName(option.name)
        .addToggle((toggle) => {
          toggle.setValue(selected.has(option.id));
          toggle.onChange((value) => {
            if (value) {
              selected.add(option.id);
            } else {
              selected.delete(option.id);
            }
          });
        });
    });
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
        days: Math.max(1, Math.trunc(month.days || 1))
      };
    });

    const sanitizedEras = (this.eras.length > 0 ? this.eras : [{
      id: "era",
      name: "Era 1",
      shortName: "ERA",
      startYear: 0,
      startMonthIndex: 0,
      startDay: 1
    }])
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
        return {
          id: slugify(moon.id || safeName),
          name: safeName,
          cycleDays: Math.max(1, Math.trunc(moon.cycleDays || 1)),
          offsetDays: Math.trunc(moon.offsetDays || 0),
          color: normalizeColor(moon.color)
        };
      });

    const sanitizedNamedYears = this.namedYears
      .map((entry, index) => ({
        year: Math.trunc(entry.year || index + 1),
        name: entry.name.trim()
      }))
      .filter((entry) => entry.name.length > 0);

    const sanitizedSeasons = this.seasons.map((season, index) => {
      const safeStartMonthIndex = clamp(season.startMonthIndex, 0, sanitizedMonths.length - 1);
      const safeEndMonthIndex = clamp(season.endMonthIndex, 0, sanitizedMonths.length - 1);
      const safeStartDay = clamp(season.startDay, 1, sanitizedMonths[safeStartMonthIndex]?.days ?? 1);
      const safeEndDay = clamp(season.endDay, 1, sanitizedMonths[safeEndMonthIndex]?.days ?? 1);
      const safeName = season.name.trim().length > 0 ? season.name.trim() : `Season ${index + 1}`;

      return {
        id: slugify(season.id || safeName),
        name: safeName,
        start: {
          monthIndex: safeStartMonthIndex,
          day: safeStartDay
        },
        end: {
          monthIndex: safeEndMonthIndex,
          day: safeEndDay
        },
        color: normalizeColor(season.color)
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
        eraLabel: sanitizedEras[0]?.shortName ?? "ERA",
        eras: sanitizedEras,
        weekdays: sanitizedWeekdays,
        months: sanitizedMonths,
        moons: sanitizedMoons,
        yearNames: sanitizedNamedYears,
        startWeekdayIndex: clamp(this.startWeekdayIndex, 0, sanitizedWeekdays.length - 1),
        seasons: sanitizedSeasons
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
	  defaultWeatherPackId: this.defaultWeatherPackId,
      linkedTagPackIds: [...this.selectedTagPackIds],
	  linkedWeatherPackIds: this.existing?.linkedWeatherPackIds ?? [],
      markers: this.existing?.markers ?? []
    });

    await this.plugin.saveCalendar(calendar, true);
    this.close();
    this.onSaved?.();
    new Notice(`Saved calendar "${calendar.name}".`);
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
        this.months.length > 0 ? this.months : [{ id: "month-1", name: "Month 1", days: 30 }],
        era.startMonthIndex,
        "time-collection-editor__input"
      );
      startMonthSelect.addEventListener("change", () => {
        this.eras[index].startMonthIndex = Math.trunc(Number(startMonthSelect.value) || 0);
      });
      row.appendChild(startMonthSelect);

      const startDayInput = row.createEl("input", { cls: "time-collection-editor__input" });
      startDayInput.type = "number";
      startDayInput.min = "1";
      startDayInput.value = String(era.startDay);
      startDayInput.addEventListener("input", () => {
        this.eras[index].startDay = Math.max(1, Math.trunc(Number(startDayInput.value) || 1));
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

      return {
        id: slugify(era.id || safeShortName || safeName),
        name: safeName,
        shortName: safeShortName,
        startYear: Math.trunc(era.startYear || 0),
        startMonthIndex: safeStartMonthIndex,
        startDay: safeStartDay
      };
    }).sort((left, right) => {
      if (left.startYear !== right.startYear) return left.startYear - right.startYear;
      if (left.startMonthIndex !== right.startMonthIndex) return left.startMonthIndex - right.startMonthIndex;
      return left.startDay - right.startDay;
    });

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
  private months: MonthDraft[];
  private readonly onSave: (months: MonthDraft[]) => void;

  constructor(app: App, months: MonthDraft[], onSave: (months: MonthDraft[]) => void) {
    super(app);
    this.months = months.map((month) => ({ ...month }));
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
        days: 30
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
        days: Math.max(1, Math.trunc(month.days || 1))
      };
    });

    if (sanitized.length === 0) {
      new Notice("Please define at least one month.");
      return;
    }

    this.onSave(sanitized);
    this.close();
  }
}

class MoonEditorModal extends Modal {
  private moons: MoonDraft[];
  private readonly onSave: (moons: MoonDraft[]) => void;

  constructor(app: App, moons: MoonDraft[], onSave: (moons: MoonDraft[]) => void) {
    super(app);
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
    }

    this.moons.forEach((moon, index) => {
      const row = list.createDiv({ cls: "time-collection-editor__row time-collection-editor__row--moon" });

      const nameInput = row.createEl("input", { cls: "time-collection-editor__input" });
      nameInput.type = "text";
      nameInput.placeholder = "Moon name";
      nameInput.value = moon.name;
      nameInput.addEventListener("input", () => {
        this.moons[index].name = nameInput.value;
      });

      const cycleInput = row.createEl("input", { cls: "time-collection-editor__input" });
      cycleInput.type = "number";
      cycleInput.min = "1";
      cycleInput.value = String(moon.cycleDays);
      cycleInput.addEventListener("input", () => {
        this.moons[index].cycleDays = Math.max(1, Math.trunc(Number(cycleInput.value) || 1));
      });

      const offsetInput = row.createEl("input", { cls: "time-collection-editor__input" });
      offsetInput.type = "number";
      offsetInput.value = String(moon.offsetDays);
      offsetInput.addEventListener("input", () => {
        this.moons[index].offsetDays = Math.trunc(Number(offsetInput.value) || 0);
      });

      const colorInput = row.createEl("input", { cls: "time-season-editor__color" });
      colorInput.type = "color";
      colorInput.value = normalizeColor(moon.color);

      const colorText = row.createEl("input", { cls: "time-collection-editor__input" });
      colorText.type = "text";
      colorText.value = normalizeColor(moon.color);

      colorInput.addEventListener("input", () => {
        this.moons[index].color = colorInput.value;
        colorText.value = colorInput.value;
      });
      colorText.addEventListener("change", () => {
        const next = normalizeColor(colorText.value);
        this.moons[index].color = next;
        colorInput.value = next;
        colorText.value = next;
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
        color: "#d46b65"
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
      return {
        id: slugify(moon.id || safeName),
        name: safeName,
        cycleDays: Math.max(1, Math.trunc(moon.cycleDays || 1)),
        offsetDays: Math.trunc(moon.offsetDays || 0),
        color: normalizeColor(moon.color)
      };
    });

    this.onSave(sanitized);
    this.close();
  }
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
  private readonly months: Array<{ id: string; name: string; days: number }>;
  private seasons: SeasonDraft[];
  private readonly onSave: (seasons: SeasonDraft[]) => void;

  constructor(
    app: App,
    months: Array<{ id: string; name: string; days: number }>,
    seasons: SeasonDraft[],
    onSave: (seasons: SeasonDraft[]) => void
  ) {
    super(app);
    this.months = months;
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

      const startMonthSelect = createMonthSelect(
        this.months,
        season.startMonthIndex,
        "time-season-editor__input"
      );
      startMonthSelect.addEventListener("change", () => {
        this.seasons[index].startMonthIndex = Number(startMonthSelect.value);
      });
      row.appendChild(startMonthSelect);

      const startDayInput = row.createEl("input", {
        cls: "time-season-editor__input time-season-editor__day"
      });
      startDayInput.type = "number";
      startDayInput.min = "1";
      startDayInput.value = String(season.startDay);
      startDayInput.addEventListener("input", () => {
        this.seasons[index].startDay = Math.max(1, Math.trunc(Number(startDayInput.value) || 1));
      });

      const endMonthSelect = createMonthSelect(
        this.months,
        season.endMonthIndex,
        "time-season-editor__input"
      );
      endMonthSelect.addEventListener("change", () => {
        this.seasons[index].endMonthIndex = Number(endMonthSelect.value);
      });
      row.appendChild(endMonthSelect);

      const endDayInput = row.createEl("input", {
        cls: "time-season-editor__input time-season-editor__day"
      });
      endDayInput.type = "number";
      endDayInput.min = "1";
      endDayInput.value = String(season.endDay);
      endDayInput.addEventListener("input", () => {
        this.seasons[index].endDay = Math.max(1, Math.trunc(Number(endDayInput.value) || 1));
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
          startMonthIndex: 0,
          startDay: 1,
          endMonthIndex: Math.max(0, this.months.length - 1),
          endDay: this.months[this.months.length - 1]?.days ?? 30,
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
      const safeStart = sanitizeMonthDay(season.startMonthIndex, season.startDay, this.months);
      const safeEnd = sanitizeMonthDay(season.endMonthIndex, season.endDay, this.months);

      return {
        id: slugify(season.id || safeName),
        name: safeName,
        startMonthIndex: safeStart.monthIndex,
        startDay: safeStart.day,
        endMonthIndex: safeEnd.monthIndex,
        endDay: safeEnd.day,
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

function sanitizeMonthDay(
  monthIndex: number,
  day: number,
  months: Array<{ id: string; name: string; days: number }>
): { monthIndex: number; day: number } {
  const safeMonthIndex = clamp(monthIndex, 0, months.length - 1);
  return {
    monthIndex: safeMonthIndex,
    day: clamp(day, 1, months[safeMonthIndex]?.days ?? 1)
  };
}

function createMonthSelect(
  months: Array<{ id: string; name: string; days: number }>,
  selectedIndex: number,
  className: string
): HTMLSelectElement {
  const select = document.createElement("select");
  if (className.trim().length > 0) {
    select.className = className;
  }
  months.forEach((month, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.text = month.name;
    option.selected = index === selectedIndex;
    select.add(option);
  });
  return select;
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