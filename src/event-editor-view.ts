import { App, FuzzySuggestModal, ItemView, Notice, TFile, WorkspaceLeaf, setIcon, type FuzzyMatch } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import { clampDate, getAbsoluteDay, getMonthsForYear, shiftDay, slugify } from "./calendar";
import { createEventId } from "./events";
import { clampTimeOfDay } from "./moons";
import type {
  CalendarEventDefinition,
  CalendarFile,
  EventRecurrenceEndMode,
  EventRecurrenceFrequency,
  FantasyDate
} from "./types";

export const EVENT_EDITOR_VIEW_TYPE = "time-event-editor-view";
const DEFAULT_EVENT_COLOR = "#4e3e3e";
type PatternRecurrenceDraft = Extract<NonNullable<CalendarEventDefinition["recurrence"]>, { kind: "pattern" }>;

export class TimeEventEditorView extends ItemView {
  private readonly plugin: TtrpgToolsTimePlugin;

  private initialized = false;
  private isSubmitting = false;
  private selectedPresetId = "";
  private selectedWeatherPackId = "";
  private title = "";
  private description = "";
  private color = DEFAULT_EVENT_COLOR;
  private startYear = 1;
  private startHour: number | null = null;
  private startMinute: number | null = null;
  private endHour: number | null = null;
  private endMinute: number | null = null;
  private startMonthIndex = 0;
  private startDay = 1;
  private noteRef = "";
  private imageRef = "";
  private saveAsPresetName = "";
  private recurrenceEnabled = false;
  private recurrenceMode: "interval" | "pattern" = "interval";
  private recurrenceFrequency: EventRecurrenceFrequency = "yearly";
  private recurrenceInterval = 1;
  private recurrenceEndMode: EventRecurrenceEndMode = "never";
  private recurrenceCount = 10;
  private recurrenceUntilYear = 1;
  private recurrenceUntilMonthIndex = 0;
  private recurrenceUntilDay = 1;
  private recurrenceExcludedDates: FantasyDate[] = [];
  private patternRecurrenceDraft: PatternRecurrenceDraft | null = null;
  private endYear = 1;
  private endMonthIndex = 0;
  private endDay = 1;
  private selectedTagRefs = new Set<string>();
  private editingOriginalEvent: CalendarEventDefinition | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TtrpgToolsTimePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return EVENT_EDITOR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Time event editor";
  }

  getIcon(): string {
    return "plus-circle";
  }

  onOpen(): Promise<void> {
    void this.refresh();
	return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  refresh(): void {
    this.contentEl.empty();
    this.contentEl.addClass("time-event-editor-view");
    void this.render();
  }
  
  editEvent(event: CalendarEventDefinition): void {
    const endDate = event.endDate ?? event.date;
    const startTime = event.startTime;
    const endTime = event.endTime ?? event.startTime;
    const recurrence = event.recurrence;
    const recurrenceUntil = recurrence?.until ?? event.date;

    this.editingOriginalEvent = cloneCalendarEvent(event);
    this.initialized = true;
    this.selectedPresetId = "";
    this.selectedWeatherPackId = event.weatherPackId ?? "";
    this.title = event.title;
    this.description = event.description ?? "";
    this.color = normalizeColor(event.color ?? DEFAULT_EVENT_COLOR);
    this.noteRef = event.noteRef ?? "";
    this.imageRef = event.imageRef ?? "";
    this.saveAsPresetName = "";
    this.selectedTagRefs = new Set(event.tagRefs);
    this.applyStartDate(event.date);
    this.applyEndDate(endDate);
    this.startHour = startTime?.hour ?? null;
    this.startMinute = startTime?.minute ?? null;
    this.endHour = endTime?.hour ?? null;
    this.endMinute = endTime?.minute ?? null;
    this.recurrenceEnabled = Boolean(recurrence);
	this.recurrenceMode = recurrence?.kind === "pattern" ? "pattern" : "interval";
    this.patternRecurrenceDraft =
      recurrence?.kind === "pattern"
        ? clonePatternRecurrence(recurrence)
        : null;
    this.recurrenceFrequency =
      recurrence?.kind === "interval"
        ? recurrence.frequency
        : "yearly";
    this.recurrenceInterval =
      recurrence?.kind === "interval"
        ? recurrence.interval
        : 1;
    this.recurrenceEndMode =
      recurrence?.kind === "interval"
        ? recurrence.endMode
        : "never";
    this.recurrenceCount =
      recurrence?.kind === "interval"
        ? recurrence.count ?? 10
        : 10;
    this.recurrenceUntilYear = recurrenceUntil.year;
    this.recurrenceUntilMonthIndex = recurrenceUntil.monthIndex;
    this.recurrenceUntilDay = recurrenceUntil.day;
	this.recurrenceExcludedDates = recurrence?.excludedDates?.map((date) => ({ ...date })) ?? [];
    this.refresh();
  }
  
  createEventForDate(date: FantasyDate): void {
    const calendar = this.plugin.activeCalendar;

    if (!calendar) {
      return;
    }

    this.resetForm(calendar, clampDate(date, calendar.definition));
    this.refresh();
  }

  private async render(): Promise<void> {
    const root = this.contentEl.createDiv({ cls: "time-event-editor" });
    const calendar = this.plugin.activeCalendar;

    if (!calendar) {
      const empty = root.createDiv({ cls: "time-calendar__empty" });
      empty.createEl("h2", { text: "No calendar loaded" });
      empty.createEl("p", {
        text: "Load a calendar first before creating events."
      });
      return;
    }

    const [presets, weatherPacks] = await Promise.all([
      this.plugin.listEventPresets(calendar.id),
	  this.plugin.listVisibleWeatherPacks(calendar)
    ]);
    this.seedFromCalendar(calendar);
    const linkedTagPacks = (await this.plugin.listTagPacks()).filter((pack) =>
      calendar.linkedTagPackIds.includes(pack.id)
    );
    const availableTagRefs = new Set(
      linkedTagPacks.flatMap((pack) => pack.tags.map((tag) => buildTagRef(pack.id, tag.id)))
    );
    this.selectedTagRefs = new Set(
      [...this.selectedTagRefs].filter((tagRef) => availableTagRefs.has(tagRef))
    );

    const normalizedStartDate = clampDate(
      { year: this.startYear, monthIndex: this.startMonthIndex, day: this.startDay },
      calendar.definition
    );
    const normalizedEndDate = clampDate(
      { year: this.endYear, monthIndex: this.endMonthIndex, day: this.endDay },
      calendar.definition
    );
    this.applyStartDate(normalizedStartDate);
    this.applyEndDate(normalizedEndDate);
    if (this.recurrenceEnabled && this.recurrenceMode === "pattern" && !this.patternRecurrenceDraft) {
      this.patternRecurrenceDraft = createPatternRecurrenceDraftFromDate(normalizedStartDate);
    }

	const preservePatternRecurrence = this.recurrenceEnabled && this.recurrenceMode === "pattern";

    const panel = root.createDiv({ cls: "time-event-editor__panel" });

    const header = panel.createDiv({ cls: "time-event-editor__header" });
    header.createEl("h1", {
      cls: "time-event-editor__title",
      text: this.editingOriginalEvent ? "Edit event" : "Create event"
    });
    header.createEl("p", {
      cls: "time-event-editor__meta",
      text: this.editingOriginalEvent
        ? `Editing: ${this.editingOriginalEvent.title} • Calendar: ${calendar.name}`
        : `Calendar: ${calendar.name}`
    });

    const form = panel.createDiv({ cls: "time-event-editor__form" });

    const topGrid = form.createDiv({ cls: "time-event-editor__grid time-event-editor__grid--top" });

    this.renderField(topGrid, "Title", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "text";
      input.placeholder = "Event title";
      input.value = this.title;
      input.addEventListener("input", () => {
        this.title = input.value;
      });
    }, {
      hideLabel: true,
      className: "time-event-editor__field--span-3 time-event-editor__field--no-label"
    });

    const quickGrid = form.createDiv({ cls: "time-event-editor__grid time-event-editor__grid--top" });

    this.renderField(quickGrid, "Preset", (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });
      const emptyOption = select.createEl("option", { text: "Presets" });
      emptyOption.value = "";

      presets.forEach((preset) => {
        const option = select.createEl("option", { text: preset.name });
        option.value = preset.id;
        option.selected = preset.id === this.selectedPresetId;
      });

      select.value = this.selectedPresetId;
      select.disabled = presets.length === 0;
      select.addEventListener("change", () => {
        const preset = presets.find((candidate) => candidate.id === select.value);
        this.selectedPresetId = preset?.id ?? "";

        if (!preset) {
          return;
        }

        this.color = normalizeColor(preset.color ?? this.color);
		this.selectedWeatherPackId = preset.weatherPackId ?? "";
        this.selectedTagRefs = new Set(preset.tagRefs.filter((tagRef) => availableTagRefs.has(tagRef)));
        this.refresh();
      });
    }, {
      hideLabel: true,
      className: "time-event-editor__field--no-label"
    });

    this.renderField(quickGrid, "Weather source", (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });

      const noneOption = select.createEl("option", { text: "Weather" });
      noneOption.value = "";

      weatherPacks.forEach((pack) => {
        const option = select.createEl("option", { text: pack.name });
        option.value = pack.id;
        option.selected = pack.id === this.selectedWeatherPackId;
      });

      select.value = this.selectedWeatherPackId;
      select.addEventListener("change", () => {
        this.selectedWeatherPackId = select.value;
      });
    }, {
      hideLabel: true,
      className: "time-event-editor__field--no-label"
    });

    this.renderField(quickGrid, "Dot color", (field) => {
      const row = field.createDiv({ cls: "time-event-editor__color-row" });

      const colorInput = row.createEl("input", { cls: "time-event-editor__color" });
      colorInput.type = "color";
      colorInput.value = this.color;

      const textInput = row.createEl("input", { cls: "time-event-editor__input" });
      textInput.type = "text";
      textInput.value = this.color;

      colorInput.addEventListener("input", () => {
        this.color = colorInput.value;
        textInput.value = colorInput.value;
      });
      textInput.addEventListener("change", () => {
        const next = normalizeColor(textInput.value);
        this.color = next;
        colorInput.value = next;
        textInput.value = next;
      });
    }, {
      hideLabel: true,
      className: "time-event-editor__field--no-label"
    });

    const dateSections = form.createDiv({ cls: "time-event-editor__date-sections" });

    const startBlock = dateSections.createDiv({ cls: "time-event-editor__date-block" });
    startBlock.createDiv({
      cls: "time-event-editor__block-title",
      text: "Start"
    });

    this.renderField(startBlock, "Year", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "number";
      input.value = String(this.startYear);
	  input.disabled = preservePatternRecurrence;
      input.addEventListener("input", () => {
        this.startYear = Math.trunc(Number(input.value) || 0);
      });
    });

    this.renderField(startBlock, "Month", (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });
      getMonthsForYear(calendar.definition, this.startYear).forEach((month, index) => {
        const option = select.createEl("option", { text: month.name });
        option.value = String(index);
        option.selected = index === this.startMonthIndex;
      });
	  select.disabled = preservePatternRecurrence;
      select.addEventListener("change", () => {
        this.startMonthIndex = Math.max(0, Number(select.value) || 0);
      });
    });

    this.renderField(startBlock, "Day", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "number";
      input.min = "1";
      input.value = String(this.startDay);
	  input.disabled = preservePatternRecurrence;
      input.addEventListener("input", () => {
        this.startDay = Math.max(1, Math.trunc(Number(input.value) || 1));
      });
    });

    const endBlock = dateSections.createDiv({ cls: "time-event-editor__date-block" });
    endBlock.createDiv({
      cls: "time-event-editor__block-title",
      text: "End"
    });

    this.renderField(endBlock, "Year", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "number";
      input.value = String(this.endYear);
	  input.disabled = preservePatternRecurrence;
      input.addEventListener("input", () => {
        this.endYear = Math.trunc(Number(input.value) || 0);
      });
    });

    this.renderField(endBlock, "Month", (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });
      getMonthsForYear(calendar.definition, this.endYear).forEach((month, index) => {
        const option = select.createEl("option", { text: month.name });
        option.value = String(index);
        option.selected = index === this.endMonthIndex;
      });
	  select.disabled = preservePatternRecurrence;
      select.addEventListener("change", () => {
        this.endMonthIndex = Math.max(0, Number(select.value) || 0);
      });
    });

    this.renderField(endBlock, "Day", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "number";
      input.min = "1";
      input.value = String(this.endDay);
	  input.disabled = preservePatternRecurrence;
      input.addEventListener("input", () => {
        this.endDay = Math.max(1, Math.trunc(Number(input.value) || 1));
      });
    });
	
    if (calendar.definition.time.enabled) {
      const timeBlock = dateSections.createDiv({ cls: "time-event-editor__date-block" });
      timeBlock.createDiv({
        cls: "time-event-editor__block-title",
        text: "Time"
      });

      const hourRow = timeBlock.createDiv({ cls: "time-event-editor__time-row" });
      this.renderTimeSelectField(
        hourRow,
        "Start hour",
        this.startHour,
        calendar.definition.time.hoursPerDay,
        (value) => {
          this.startHour = value;
        }
      );
      this.renderTimeSelectField(
        hourRow,
        "End hour",
        this.endHour,
        calendar.definition.time.hoursPerDay,
        (value) => {
          this.endHour = value;
        }
      );

      const minuteRow = timeBlock.createDiv({ cls: "time-event-editor__time-row" });
      this.renderTimeSelectField(
        minuteRow,
        "Start minute",
        this.startMinute,
        calendar.definition.time.minutesPerHour,
        (value) => {
          this.startMinute = value;
        }
      );
      this.renderTimeSelectField(
        minuteRow,
        "End minute",
        this.endMinute,
        calendar.definition.time.minutesPerHour,
        (value) => {
          this.endMinute = value;
        }
      );
    }

    const repeatToggleRow = form.createDiv({ cls: "time-event-editor__toggle-row" });
    const repeatToggle = repeatToggleRow.createEl("input");
    repeatToggle.type = "checkbox";
    repeatToggle.checked = this.recurrenceEnabled;
    repeatToggle.addEventListener("change", () => {
      this.recurrenceEnabled = repeatToggle.checked;
      this.refresh();
    });
    repeatToggleRow.createEl("label", {
      cls: "time-event-editor__toggle-label",
      text: "Repeat event"
    });

    if (this.recurrenceEnabled) {
      const recurrenceModeGrid = form.createDiv({ cls: "time-event-editor__grid time-event-editor__grid--two" });
      this.renderField(recurrenceModeGrid, "Recurrence type", (field) => {
        const select = field.createEl("select", { cls: "time-event-editor__input" });
        addSelectOption(select, "interval", "Interval recurrence");
        addSelectOption(select, "pattern", "Calendarium pattern recurrence");
        select.value = this.recurrenceMode;
        select.addEventListener("change", () => {
          this.recurrenceMode = select.value === "pattern" ? "pattern" : "interval";
          if (this.recurrenceMode === "pattern" && !this.patternRecurrenceDraft) {
            this.patternRecurrenceDraft = createPatternRecurrenceDraftFromDate({
              year: this.startYear,
              monthIndex: this.startMonthIndex,
              day: this.startDay
            });
          }
          this.refresh();
        });
      });

      if (this.recurrenceMode === "pattern") {
        const patternDraft =
          this.patternRecurrenceDraft ??
          createPatternRecurrenceDraftFromDate(normalizedStartDate);
        this.patternRecurrenceDraft = patternDraft;
        const hasMonthConstraint = typeof patternDraft.monthIndex === "number";
        const hasYearConstraint = typeof patternDraft.year === "number";
        const patternYear = patternDraft.year ?? 0;
        const patternMonths = getMonthsForYear(calendar.definition, patternYear);
        const selectedPatternMonthIndex =
          hasMonthConstraint
            ? Math.min(
                Math.max(0, patternDraft.monthIndex ?? 0),
                Math.max(0, patternMonths.length - 1)
              )
            : 0;

        const patternGrid = form.createDiv({ cls: "time-event-editor__grid" });

        this.renderField(patternGrid, "Pattern day", (field) => {
          const input = field.createEl("input", { cls: "time-event-editor__input" });
          input.type = "number";
          input.min = "1";
          input.value = String(patternDraft.day);
          input.addEventListener("input", () => {
            if (!this.patternRecurrenceDraft) {
              return;
            }
            this.patternRecurrenceDraft.day = Math.max(1, Math.trunc(Number(input.value) || 1));
          });
        });

        this.renderField(patternGrid, "Month constraint", (field) => {
          const toggleRow = field.createDiv({ cls: "time-event-editor__toggle-row" });
          const toggle = toggleRow.createEl("input");
          toggle.type = "checkbox";
          toggle.checked = hasMonthConstraint;
          toggle.addEventListener("change", () => {
            if (!this.patternRecurrenceDraft) {
              return;
            }

            if (toggle.checked) {
              const monthsForYear = getMonthsForYear(
                calendar.definition,
                this.patternRecurrenceDraft.year ?? 0
              );
              this.patternRecurrenceDraft.monthIndex = Math.min(
                this.patternRecurrenceDraft.monthIndex ?? 0,
                Math.max(0, monthsForYear.length - 1)
              );
            } else {
              this.patternRecurrenceDraft.monthIndex = undefined;
            }

            this.refresh();
          });

          toggleRow.createEl("label", {
            cls: "time-event-editor__toggle-label",
            text: "Restrict to one month"
          });

          const select = field.createEl("select", { cls: "time-event-editor__input" });
          patternMonths.forEach((month, index) => {
            addSelectOption(select, String(index), month.name);
          });
          select.value = String(selectedPatternMonthIndex);
          select.disabled = !hasMonthConstraint;
          select.addEventListener("change", () => {
            if (!this.patternRecurrenceDraft) {
              return;
            }
            this.patternRecurrenceDraft.monthIndex = Math.max(0, Number(select.value) || 0);
          });
        });

        this.renderField(patternGrid, "Year constraint", (field) => {
          const toggleRow = field.createDiv({ cls: "time-event-editor__toggle-row" });
          const toggle = toggleRow.createEl("input");
          toggle.type = "checkbox";
          toggle.checked = hasYearConstraint;
          toggle.addEventListener("change", () => {
            if (!this.patternRecurrenceDraft) {
              return;
            }

            if (toggle.checked) {
              this.patternRecurrenceDraft.year = this.patternRecurrenceDraft.year ?? this.startYear;
            } else {
              this.patternRecurrenceDraft.year = undefined;
            }

            this.refresh();
          });

          toggleRow.createEl("label", {
            cls: "time-event-editor__toggle-label",
            text: "Restrict to one year"
          });

          const input = field.createEl("input", { cls: "time-event-editor__input" });
          input.type = "number";
          input.value = hasYearConstraint ? String(patternDraft.year) : "";
          input.disabled = !hasYearConstraint;
          input.addEventListener("change", () => {
            if (!this.patternRecurrenceDraft) {
              return;
            }

            this.patternRecurrenceDraft.year = Math.trunc(Number(input.value) || 0);
            this.refresh();
          });
        });

        this.renderField(patternGrid, "End mode", (field) => {
          const select = field.createEl("select", { cls: "time-event-editor__input" });
          addSelectOption(select, "never", "Never");
          addSelectOption(select, "until", "Until date");
          select.value = patternDraft.until ? "until" : "never";
          select.addEventListener("change", () => {
            if (!this.patternRecurrenceDraft) {
              return;
            }

            if (select.value === "until") {
              this.patternRecurrenceDraft.until = this.patternRecurrenceDraft.until ?? {
                year: this.recurrenceUntilYear,
                monthIndex: this.recurrenceUntilMonthIndex,
                day: this.recurrenceUntilDay
              };
            } else {
              this.patternRecurrenceDraft.until = undefined;
            }

            this.refresh();
          });
        });

        if (patternDraft.until) {
          const untilGrid = form.createDiv({ cls: "time-event-editor__grid" });
          const untilDate = patternDraft.until;
          const untilMonths = getMonthsForYear(calendar.definition, untilDate.year);

          this.renderField(untilGrid, "Until year", (field) => {
            const input = field.createEl("input", { cls: "time-event-editor__input" });
            input.type = "number";
            input.value = String(untilDate.year);
            input.addEventListener("change", () => {
              if (!this.patternRecurrenceDraft?.until) {
                return;
              }
              this.patternRecurrenceDraft.until.year = Math.trunc(Number(input.value) || 0);
              this.refresh();
            });
          });

          this.renderField(untilGrid, "Until month", (field) => {
            const select = field.createEl("select", { cls: "time-event-editor__input" });
            untilMonths.forEach((month, index) => {
              addSelectOption(select, String(index), month.name);
            });
            select.value = String(
              Math.min(
                Math.max(0, untilDate.monthIndex),
                Math.max(0, untilMonths.length - 1)
              )
            );
            select.addEventListener("change", () => {
              if (!this.patternRecurrenceDraft?.until) {
                return;
              }
              this.patternRecurrenceDraft.until.monthIndex = Math.max(0, Number(select.value) || 0);
            });
          });

          this.renderField(untilGrid, "Until day", (field) => {
            const input = field.createEl("input", { cls: "time-event-editor__input" });
            input.type = "number";
            input.min = "1";
            input.value = String(untilDate.day);
            input.addEventListener("input", () => {
              if (!this.patternRecurrenceDraft?.until) {
                return;
              }
              this.patternRecurrenceDraft.until.day = Math.max(1, Math.trunc(Number(input.value) || 1));
            });
          });
        }

        const note = form.createDiv({ cls: "time-settings-note" });
        note.createEl("h3", { text: "Calendarium pattern recurrence" });
        note.createDiv({
          text: buildPatternRecurrenceSummary(calendar, patternDraft)
        });
        note.createDiv({
          cls: "setting-item-description",
          text: "Start and end date are derived from this pattern. The concrete anchor date is recalculated automatically on save."
        });
      } else {
        const recurrenceGrid = form.createDiv({ cls: "time-event-editor__grid" });

        this.renderField(recurrenceGrid, "Frequency", (field) => {
          const select = field.createEl("select", { cls: "time-event-editor__input" });
          addSelectOption(select, "daily", "Daily");
          addSelectOption(select, "weekly", "Weekly");
          addSelectOption(select, "monthly", "Monthly");
          addSelectOption(select, "yearly", "Yearly");
          select.value = this.recurrenceFrequency;
          select.addEventListener("change", () => {
            this.recurrenceFrequency = select.value as EventRecurrenceFrequency;
          });
        });
        this.renderField(recurrenceGrid, "Interval", (field) => {
          const input = field.createEl("input", { cls: "time-event-editor__input" });
          input.type = "number";
          input.min = "1";
          input.value = String(this.recurrenceInterval);
          input.addEventListener("input", () => {
            this.recurrenceInterval = Math.max(1, Math.trunc(Number(input.value) || 1));
          });
        });
        this.renderField(recurrenceGrid, "End mode", (field) => {
          const select = field.createEl("select", { cls: "time-event-editor__input" });
          addSelectOption(select, "never", "Never");
          addSelectOption(select, "count", "After count");
          addSelectOption(select, "until", "Until date");
          select.value = this.recurrenceEndMode;
          select.addEventListener("change", () => {
            this.recurrenceEndMode = select.value as EventRecurrenceEndMode;
            this.refresh();
          });
        });
        if (this.recurrenceEndMode === "count") {
          this.renderField(form, "Occurrence count", (field) => {
            const input = field.createEl("input", { cls: "time-event-editor__input" });
            input.type = "number";
            input.min = "1";
            input.value = String(this.recurrenceCount);
            input.addEventListener("input", () => {
              this.recurrenceCount = Math.max(1, Math.trunc(Number(input.value) || 1));
            });
          });
        }

        if (this.recurrenceEndMode === "until") {
          const untilGrid = form.createDiv({ cls: "time-event-editor__grid" });

          this.renderField(untilGrid, "Until year", (field) => {
            const input = field.createEl("input", { cls: "time-event-editor__input" });
            input.type = "number";
            input.value = String(this.recurrenceUntilYear);
            input.addEventListener("input", () => {
              this.recurrenceUntilYear = Math.trunc(Number(input.value) || 0);
            });
          });

          this.renderField(untilGrid, "Until month", (field) => {
            const input = field.createEl("input", { cls: "time-event-editor__input" });
            input.type = "number";
            input.min = "1";
            input.value = String(this.recurrenceUntilMonthIndex + 1);
            input.addEventListener("input", () => {
              this.recurrenceUntilMonthIndex = Math.max(0, Math.trunc(Number(input.value) || 1) - 1);
            });
          });
          this.renderField(untilGrid, "Until day", (field) => {
            const input = field.createEl("input", { cls: "time-event-editor__input" });
            input.type = "number";
            input.min = "1";
            input.value = String(this.recurrenceUntilDay);
            input.addEventListener("input", () => {
              this.recurrenceUntilDay = Math.max(1, Math.trunc(Number(input.value) || 1));
            });
          });
        }
      }
    }

    this.renderField(form, "Description", (field) => {
      const textarea = field.createEl("textarea", { cls: "time-event-editor__textarea" });
      textarea.rows = 8;
      textarea.placeholder = "Event description";
      textarea.value = this.description;
      textarea.addEventListener("input", () => {
        this.description = textarea.value;
      });
    });

    const filesGrid = form.createDiv({ cls: "time-event-editor__grid time-event-editor__grid--two" });

    this.renderFilePicker(filesGrid, "Image", this.imageRef, "No image selected", () => {
      this.pickImageFile();
    }, () => {
      this.imageRef = "";
      this.refresh();
    });

    this.renderFilePicker(filesGrid, "Linked note", this.noteRef, "No note selected", () => {
      this.pickNoteFile();
    }, () => {
      this.noteRef = "";
      this.refresh();
    });

    if (linkedTagPacks.length > 0) {
      const tagsSection = form.createDiv({ cls: "time-event-editor__tags" });
      tagsSection.createEl("h3", {
        cls: "time-event-editor__section-title",
        text: "Tags"
      });

      linkedTagPacks.forEach((pack) => {
        const packSection = tagsSection.createDiv({ cls: "time-event-editor__tag-pack" });
        packSection.createDiv({
          cls: "time-event-editor__tag-pack-title",
          text: pack.name
        });

        const list = packSection.createDiv({ cls: "time-event-editor__tag-list" });

        pack.tags.forEach((tag) => {
          const tagRef = buildTagRef(pack.id, tag.id);
          const button = list.createEl("button", {
            cls: "time-event-editor__tag-button",
            text: tag.name
          });
          button.type = "button";

          applyTagButtonState(button, tag.color ?? "#d46b65", this.selectedTagRefs.has(tagRef));

          button.addEventListener("click", () => {
            if (this.selectedTagRefs.has(tagRef)) {
              this.selectedTagRefs.delete(tagRef);
            } else {
              this.selectedTagRefs.add(tagRef);
            }
            applyTagButtonState(button, tag.color ?? "#d46b65", this.selectedTagRefs.has(tagRef));
          });
        });
      });
    }

    this.renderField(form, "Save as preset", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "text";
      input.placeholder = "Optional preset name";
      input.value = this.saveAsPresetName;
      input.addEventListener("input", () => {
        this.saveAsPresetName = input.value;
      });
    });

    const actions = panel.createDiv({ cls: "time-event-editor__actions" });
	
    if (this.editingOriginalEvent) {
      const cancelEditButton = actions.createEl("button", {
        cls: "time-manager__button",
        text: "Cancel edit"
      });
      cancelEditButton.type = "button";
	  cancelEditButton.disabled = this.isSubmitting;
      cancelEditButton.addEventListener("click", () => {
        this.resetForm(calendar);
        this.refresh();
      });
    }

    const selectedDayButton = actions.createEl("button", {
      cls: "time-manager__button",
      text: "Use selected day"
    });
    selectedDayButton.type = "button";
	selectedDayButton.disabled = this.isSubmitting;
    selectedDayButton.addEventListener("click", () => {
      this.applyCurrentCalendarDateRange(calendar.state.cursorDate);
      this.refresh();
    });

    const saveButton = actions.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: this.isSubmitting
        ? (this.editingOriginalEvent ? "Updating..." : "Saving...")
        : (this.editingOriginalEvent ? "Update event" : "Save event")
    });
    saveButton.type = "button";
	saveButton.disabled = this.isSubmitting;
    saveButton.addEventListener("click", () => {
      void this.submit(calendar);
    });
  }
  
  private renderFilePicker(
    parent: HTMLElement,
    label: string,
    value: string,
    placeholder: string,
    onBrowse: () => void,
    onClear: () => void
  ): void {
    this.renderField(parent, label, (field) => {
      const row = field.createDiv({ cls: "time-event-editor__picker-row" });

      const input = row.createEl("input", { cls: "time-event-editor__input" });
      input.type = "text";
      input.readOnly = true;
      input.value = getDisplayFileName(value);
      input.placeholder = placeholder;
      input.title = value || placeholder;
      input.addClass("time-event-editor__picker-display");

      const browseButton = row.createEl("button", {
        cls: "time-event-editor__picker-button"
      });
      browseButton.type = "button";
      browseButton.setAttr("aria-label", `Browse ${label.toLowerCase()}`);
      browseButton.title = "Browse";
      setIcon(browseButton, "folder-open");
      browseButton.addEventListener("click", onBrowse);

      const clearButton = row.createEl("button", {
        cls: "time-event-editor__picker-button"
      });
      clearButton.type = "button";
      clearButton.setAttr("aria-label", `Clear ${label.toLowerCase()}`);
      clearButton.title = "Clear";
      setIcon(clearButton, "x");
      clearButton.addEventListener("click", onClear);
    });
  }

  private renderField(
    parent: HTMLElement,
    label: string,
    render: (field: HTMLElement) => void,
    options?: {
      hideLabel?: boolean;
      className?: string;
    }
  ): void {
    const classNames = ["time-event-editor__field"];

    if (options?.className) {
      classNames.push(options.className);
    }

    const field = parent.createDiv({ cls: classNames.join(" ") });

    if (!options?.hideLabel) {
      field.createEl("label", {
        cls: "time-event-editor__label",
        text: label
      });
    }

    render(field);
  }
  
  private renderTimeSelectField(
    parent: HTMLElement,
    label: string,
    value: number | null,
    optionCount: number,
    onChange: (value: number | null) => void
  ): void {
    this.renderField(parent, label, (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });
      addSelectOption(select, "", "-");

      for (let index = 0; index < optionCount; index += 1) {
        addSelectOption(select, String(index), formatTimeSelectValue(index, optionCount));
      }

      select.value = value === null ? "" : String(value);
      select.addEventListener("change", () => {
        onChange(select.value === "" ? null : Math.max(0, Number(select.value) || 0));
      });
    });
  }

  private seedFromCalendar(calendar: CalendarFile): void {
    if (this.initialized) {
      return;
    }

    this.applyCurrentCalendarDateRange(calendar.state.cursorDate);
    this.initialized = true;
  }

  private applyCurrentCalendarDateRange(date: FantasyDate): void {
    this.applyStartDate(date);
    this.applyEndDate(date);
    if (this.recurrenceMode === "pattern") {
      this.patternRecurrenceDraft = createPatternRecurrenceDraftFromDate(date);
    }
  }

  private applyStartDate(date: FantasyDate): void {
    this.startYear = date.year;
    this.startMonthIndex = date.monthIndex;
    this.startDay = date.day;
  }

  private applyEndDate(date: FantasyDate): void {
    this.endYear = date.year;
    this.endMonthIndex = date.monthIndex;
    this.endDay = date.day;
  }
  
  private resetForm(calendar: CalendarFile, seedDate?: FantasyDate): void {
    const date = clampDate(seedDate ?? calendar.state.cursorDate, calendar.definition);

    this.selectedPresetId = "";
    this.selectedWeatherPackId = "";
    this.editingOriginalEvent = null;
    this.title = "";
    this.startHour = null;
    this.startMinute = null;
    this.description = "";
    this.color = DEFAULT_EVENT_COLOR;
    this.noteRef = "";
    this.imageRef = "";
    this.saveAsPresetName = "";
    this.selectedTagRefs = new Set<string>();
    this.recurrenceEnabled = false;
	this.recurrenceMode = "interval";
    this.recurrenceFrequency = "yearly";
    this.recurrenceInterval = 1;
    this.recurrenceEndMode = "never";
    this.recurrenceCount = 10;
    this.recurrenceUntilYear = date.year;
    this.recurrenceUntilMonthIndex = date.monthIndex;
    this.recurrenceUntilDay = date.day;
	this.recurrenceExcludedDates = [];
	this.patternRecurrenceDraft = null;
    this.applyCurrentCalendarDateRange(date);
    this.endHour = null;
    this.endMinute = null;
    this.initialized = true;
  }

  private async submit(calendar: CalendarFile): Promise<void> {
	  
    if (this.isSubmitting) {
      return;
    }
    const title = this.title.trim();
    const normalizedStartDate = clampDate(
      { year: this.startYear, monthIndex: this.startMonthIndex, day: this.startDay },
      calendar.definition
    );
    const normalizedEndDate = clampDate(
      { year: this.endYear, monthIndex: this.endMonthIndex, day: this.endDay },
      calendar.definition
    );

    if (title.length === 0) {
      new Notice("Please provide an event title.");
      return;
    }

    if (compareFantasyDates(normalizedEndDate, normalizedStartDate) < 0) {
      new Notice("The end date must not be before the start date.");
      return;
    }
	
    const baseDurationDays = Math.max(
      1,
      getAbsoluteDay(calendar.definition, normalizedEndDate) -
        getAbsoluteDay(calendar.definition, normalizedStartDate) +
        1
    );

    const hasAnyTimeValue =
      calendar.definition.time.enabled &&
      [this.startHour, this.startMinute, this.endHour, this.endMinute].some((value) => value !== null);

    if (hasAnyTimeValue && (this.startHour === null || this.startMinute === null)) {
      new Notice("If you use time, please choose both start hour and start minute.");
      return;
    }

    if (
      hasAnyTimeValue &&
      ((this.endHour === null && this.endMinute !== null) ||
        (this.endHour !== null && this.endMinute === null))
    ) {
      new Notice("Please choose both end hour and end minute, or leave both on '-'.");
      return;
    }

    const normalizedStartTime = hasAnyTimeValue
      ? clampTimeOfDay(
          { hour: this.startHour ?? 0, minute: this.startMinute ?? 0 },
          calendar.definition
        )
      : undefined;
    const normalizedEndTime =
      hasAnyTimeValue && this.endHour !== null && this.endMinute !== null
        ? clampTimeOfDay(
            { hour: this.endHour, minute: this.endMinute },
            calendar.definition
          )
        : undefined;

    if (
      normalizedStartTime &&
      normalizedEndTime &&
      sameFantasyDate(normalizedStartDate, normalizedEndDate) &&
      compareTimes(normalizedEndTime, normalizedStartTime) < 0
    ) {
      new Notice("For same-day timed events, the end time must not be before the start time.");
      return;
    }
	
    const recurrence = this.recurrenceEnabled
      ? this.recurrenceMode === "pattern"
        ? clonePatternRecurrence(
            this.patternRecurrenceDraft ??
              createPatternRecurrenceDraftFromDate(normalizedStartDate)
          )
        : {
            kind: "interval" as const,
            frequency: this.recurrenceFrequency,
            interval: Math.max(1, Math.trunc(this.recurrenceInterval || 1)),
            endMode: this.recurrenceEndMode,
            count: this.recurrenceEndMode === "count" ? Math.max(1, Math.trunc(this.recurrenceCount || 1)) : undefined,
            until: this.recurrenceEndMode === "until"
              ? clampDate({ year: this.recurrenceUntilYear, monthIndex: this.recurrenceUntilMonthIndex, day: this.recurrenceUntilDay }, calendar.definition)
              : undefined,
            excludedDates: this.recurrenceExcludedDates.length > 0
              ? this.recurrenceExcludedDates.map((date) => ({ ...date }))
              : undefined
          }
      : undefined;
	  
    let finalStartDate = normalizedStartDate;
    let finalEndDate = normalizedEndDate;

    if (this.recurrenceEnabled && this.recurrenceMode === "pattern") {
      const patternDraft =
        this.patternRecurrenceDraft ??
        createPatternRecurrenceDraftFromDate(normalizedStartDate);
      const anchorDate = resolvePatternRecurrenceAnchorDate(calendar, patternDraft);

      if (!anchorDate) {
        new Notice("The current pattern recurrence does not resolve to a valid anchor date in this calendar.");
        return;
      }

      finalStartDate = anchorDate;
      finalEndDate = shiftDay(anchorDate, baseDurationDays - 1, calendar.definition);
    }
	  
    this.isSubmitting = true;
    this.refresh();

    try {
    const eventId = this.editingOriginalEvent?.id ?? createEventId(title);
    const now = new Date().toISOString();

    await this.plugin.saveEvent({
      id: eventId,
      calendarId: calendar.id,
      title,
      date: finalStartDate,
      endDate: sameFantasyDate(finalStartDate, finalEndDate)
        ? undefined
        : finalEndDate,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      description: this.description.trim().length > 0 ? this.description.trim() : undefined,
      imageRef: this.imageRef.trim().length > 0 ? this.imageRef.trim() : undefined,
      noteRef: this.noteRef.trim().length > 0 ? this.noteRef.trim() : undefined,
      color: normalizeColor(this.color),
	  weatherPackId: this.selectedWeatherPackId || undefined,
      tagRefs: [...this.selectedTagRefs].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" })
      ),
	  recurrence,
      createdAt: this.editingOriginalEvent?.createdAt ?? now,
      updatedAt: now
    }, this.editingOriginalEvent ?? undefined);

    const presetName = this.saveAsPresetName.trim();
    if (presetName.length > 0) {
      const presetId = slugify(presetName);
      await this.plugin.saveEventPreset({
        version: 1,
        kind: "event-preset",
        calendarId: calendar.id,
        id: presetId,
        name: presetName,
        color: normalizeColor(this.color),
		weatherPackId: this.selectedWeatherPackId || undefined,
        tagRefs: [...this.selectedTagRefs].sort((left, right) =>
          left.localeCompare(right, undefined, { sensitivity: "base" })
        )
      });
    }

    const wasEditing = Boolean(this.editingOriginalEvent);
    this.resetForm(calendar);

    new Notice(`${wasEditing ? "Updated" : "Saved"} event "${title}".`);
    } finally {
      this.isSubmitting = false;
      this.refresh();
    }
  }

  private pickImageFile(): void {
    new VaultFilePickerModal(
      this.app,
      "Choose image",
      (file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()),
      (file) => {
        this.imageRef = file.path;
        this.refresh();
      }
    ).open();
  }

  private pickNoteFile(): void {
    new VaultFilePickerModal(
      this.app,
      "Choose note",
      (file) => file.extension.toLowerCase() === "md",
      (file) => {
        this.noteRef = file.path;
        this.refresh();
      }
    ).open();
  }
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

function normalizeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_EVENT_COLOR;
}

function formatTimeSelectValue(value: number, optionCount: number): string {
  const width = Math.max(2, String(Math.max(0, optionCount - 1)).length);
  return String(value).padStart(width, "0");
}

function getDisplayFileName(path: string): string {
  const trimmed = path.trim();

  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.split("/").pop() ?? trimmed;
}

function compareFantasyDates(left: FantasyDate, right: FantasyDate): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.monthIndex !== right.monthIndex) return left.monthIndex - right.monthIndex;
  return left.day - right.day;
}

function sameFantasyDate(left: FantasyDate, right: FantasyDate): boolean {
  return (
    left.year === right.year &&
    left.monthIndex === right.monthIndex &&
    left.day === right.day
  );
}

function compareTimes(left: { hour: number; minute: number }, right: { hour: number; minute: number }): number {
  return left.hour !== right.hour ? left.hour - right.hour : left.minute - right.minute;
}

function cloneCalendarEvent(event: CalendarEventDefinition): CalendarEventDefinition {
  return {
    ...event,
    date: { ...event.date },
    endDate: event.endDate ? { ...event.endDate } : undefined,
    startTime: event.startTime ? { ...event.startTime } : undefined,
    endTime: event.endTime ? { ...event.endTime } : undefined,
    tagRefs: [...event.tagRefs],
    recurrence: event.recurrence
      ? {
          ...event.recurrence,
          until: event.recurrence.until ? { ...event.recurrence.until } : undefined,
          excludedDates: event.recurrence.excludedDates?.map((date) => ({ ...date }))
        }
      : undefined
  };
}

function clonePatternRecurrence(
  recurrence: PatternRecurrenceDraft
): PatternRecurrenceDraft {
  return {
    ...recurrence,
    until: recurrence.until ? { ...recurrence.until } : undefined,
    excludedDates: recurrence.excludedDates?.map((date) => ({ ...date }))
  };
}

function createPatternRecurrenceDraftFromDate(
  date: FantasyDate
): PatternRecurrenceDraft {
  return {
    kind: "pattern",
    day: date.day,
    monthIndex: date.monthIndex,
    year: date.year
  };
}

function buildPatternRecurrenceSummary(
  calendar: CalendarFile,
  recurrence: PatternRecurrenceDraft
): string {
  if (typeof recurrence.year === "number" && typeof recurrence.monthIndex === "number") {
    const monthName =
      getMonthsForYear(calendar.definition, recurrence.year)[recurrence.monthIndex]?.name ??
      String(recurrence.monthIndex + 1);
    return `Concrete Calendarium pattern date: ${recurrence.day}. ${monthName} ${recurrence.year}`;
  }

  if (typeof recurrence.year === "number") {
    return recurrence.until
      ? `Every month on day ${recurrence.day} in ${recurrence.year}, until ${recurrence.until.day}-${recurrence.until.monthIndex + 1}-${recurrence.until.year}`
      : `Every month on day ${recurrence.day} in ${recurrence.year}`;
  }

  if (typeof recurrence.monthIndex === "number") {
    const monthName =
      getMonthsForYear(calendar.definition, calendar.state.cursorDate.year)[recurrence.monthIndex]?.name ??
      String(recurrence.monthIndex + 1);
    return recurrence.until
      ? `Every year on day ${recurrence.day} of ${monthName}, until ${recurrence.until.day}-${recurrence.until.monthIndex + 1}-${recurrence.until.year}`
      : `Every year on day ${recurrence.day} of ${monthName}`;
  }

  return recurrence.until
    ? `Every month on day ${recurrence.day}, until ${recurrence.until.day}-${recurrence.until.monthIndex + 1}-${recurrence.until.year}`
    : `Every month on day ${recurrence.day}`;
}

function resolvePatternRecurrenceAnchorDate(
  calendar: CalendarFile,
  recurrence: PatternRecurrenceDraft
): FantasyDate | null {
  const year = recurrence.year ?? 0;
  const months = getMonthsForYear(calendar.definition, year);

  if (typeof recurrence.monthIndex === "number") {
    const month = months[recurrence.monthIndex];
    if (!month || recurrence.day < 1 || recurrence.day > month.days) {
      return null;
    }

    return {
      year,
      monthIndex: recurrence.monthIndex,
      day: recurrence.day
    };
  }

  const firstMonthIndex = months.findIndex((month) => month.days >= recurrence.day);
  if (firstMonthIndex < 0) {
    return null;
  }

  return {
    year,
    monthIndex: firstMonthIndex,
    day: recurrence.day
  };
}

function buildTagRef(packId: string, tagId: string): string {
  return `${packId}:${tagId}`;
}

function addSelectOption(
  select: HTMLSelectElement,
  value: string,
  label: string
): void {
  const option = select.createEl("option", { text: label });
  option.value = value;
}

function applyTagButtonState(
  button: HTMLButtonElement,
  color: string,
  selected: boolean
): void {
  button.classList.toggle("is-selected", selected);

  if (selected) {
    button.style.backgroundColor = color;
    button.style.borderColor = color;
    button.style.color = getReadableTextColor(color);
    return;
  }

  button.style.removeProperty("background-color");
  button.style.removeProperty("border-color");
  button.style.removeProperty("color");
}

function getReadableTextColor(hexColor: string): string {
  const normalized = hexColor.replace("#", "");
  if (normalized.length !== 6) {
    return "#ffffff";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

  return brightness >= 160 ? "#1f1f1f" : "#ffffff";
}

class VaultFilePickerModal extends FuzzySuggestModal<TFile> {
  private readonly files: TFile[];
  private readonly onChooseFile: (file: TFile) => void;

  constructor(
    app: App,
    placeholder: string,
    filter: (file: TFile) => boolean,
    onChooseFile: (file: TFile) => void
  ) {
    super(app);
    this.files = app.vault.getFiles().filter(filter).sort((left, right) =>
      left.path.localeCompare(right.path, undefined, { sensitivity: "base" })
    );
    this.onChooseFile = onChooseFile;
    this.setPlaceholder(placeholder);
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