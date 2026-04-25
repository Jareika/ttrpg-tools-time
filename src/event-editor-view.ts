import { App, FuzzySuggestModal, ItemView, Notice, TFile, WorkspaceLeaf, type FuzzyMatch } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import { clampDate, slugify } from "./calendar";
import { createEventId } from "./events";
import type { CalendarFile, FantasyDate } from "./types";

export const EVENT_EDITOR_VIEW_TYPE = "time-event-editor-view";
const DEFAULT_EVENT_COLOR = "#4e3e3e";

export class TimeEventEditorView extends ItemView {
  private readonly plugin: TtrpgToolsTimePlugin;

  private initialized = false;
  private selectedPresetId = "";
  private selectedWeatherPackId = "";
  private title = "";
  private description = "";
  private color = DEFAULT_EVENT_COLOR;
  private startYear = 1;
  private startMonthIndex = 0;
  private startDay = 1;
  private noteRef = "";
  private imageRef = "";
  private saveAsPresetName = "";
  private endYear = 1;
  private endMonthIndex = 0;
  private endDay = 1;
  private selectedTagRefs = new Set<string>();

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

  onOpen(): void {
    void this.refresh();
  }

  onClose(): void {
    // no-op
  }

  refresh(): void {
    this.contentEl.empty();
    this.contentEl.addClass("time-event-editor-view");
    void this.render();
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

    const panel = root.createDiv({ cls: "time-event-editor__panel" });

    const header = panel.createDiv({ cls: "time-event-editor__header" });
    header.createEl("h1", {
      cls: "time-event-editor__title",
      text: "Create event"
    });
    header.createEl("p", {
      cls: "time-event-editor__meta",
      text: `Calendar: ${calendar.name}`
    });

    const form = panel.createDiv({ cls: "time-event-editor__form" });

    this.renderField(form, "Preset", (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.text = presets.length > 0 ? "Choose saved preset" : "No saved presets";
      select.add(emptyOption);

      presets.forEach((preset) => {
        const option = document.createElement("option");
        option.value = preset.id;
        option.text = preset.name;
        option.selected = preset.id === this.selectedPresetId;
        select.add(option);
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
    });

    this.renderField(form, "Title", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "text";
      input.placeholder = "Event title";
      input.value = this.title;
      input.addEventListener("input", () => {
        this.title = input.value;
      });
    });
	
    this.renderField(form, "Weather source", (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });

      const noneOption = document.createElement("option");
      noneOption.value = "";
      noneOption.text = "Do not write weather";
      select.add(noneOption);

      weatherPacks.forEach((pack) => {
        const option = document.createElement("option");
        option.value = pack.id;
        option.text = pack.name;
        option.selected = pack.id === this.selectedWeatherPackId;
        select.add(option);
      });

      select.value = this.selectedWeatherPackId;
      select.addEventListener("change", () => {
        this.selectedWeatherPackId = select.value;
      });
    });

    form.createEl("h3", {
      cls: "time-event-editor__section-title",
      text: "Start"
    });

    const startDateGrid = form.createDiv({ cls: "time-event-editor__grid" });

    this.renderField(startDateGrid, "Year", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "number";
      input.value = String(this.startYear);
      input.addEventListener("input", () => {
        this.startYear = Math.trunc(Number(input.value) || 0);
      });
    });

    this.renderField(startDateGrid, "Month", (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });
      calendar.definition.months.forEach((month, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.text = month.name;
        option.selected = index === this.startMonthIndex;
        select.add(option);
      });
      select.addEventListener("change", () => {
        this.startMonthIndex = Math.max(0, Number(select.value) || 0);
      });
    });

    this.renderField(startDateGrid, "Day", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "number";
      input.min = "1";
      input.value = String(this.startDay);
      input.addEventListener("input", () => {
        this.startDay = Math.max(1, Math.trunc(Number(input.value) || 1));
      });
    });

    form.createEl("h3", {
      cls: "time-event-editor__section-title",
      text: "End"
    });

    const endDateGrid = form.createDiv({ cls: "time-event-editor__grid" });

    this.renderField(endDateGrid, "Year", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "number";
      input.value = String(this.endYear);
      input.addEventListener("input", () => {
        this.endYear = Math.trunc(Number(input.value) || 0);
      });
    });

    this.renderField(endDateGrid, "Month", (field) => {
      const select = field.createEl("select", { cls: "time-event-editor__input" });
      calendar.definition.months.forEach((month, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.text = month.name;
        option.selected = index === this.endMonthIndex;
        select.add(option);
      });
      select.addEventListener("change", () => {
        this.endMonthIndex = Math.max(0, Number(select.value) || 0);
      });
    });

    this.renderField(endDateGrid, "Day", (field) => {
      const input = field.createEl("input", { cls: "time-event-editor__input" });
      input.type = "number";
      input.min = "1";
      input.value = String(this.endDay);
      input.addEventListener("input", () => {
        this.endDay = Math.max(1, Math.trunc(Number(input.value) || 1));
      });
    });

    this.renderField(form, "Dot color", (field) => {
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
    });

    this.renderField(form, "Description", (field) => {
      const textarea = field.createEl("textarea", { cls: "time-event-editor__textarea" });
      textarea.rows = 8;
      textarea.placeholder = "Event description";
      textarea.value = this.description;
      textarea.addEventListener("input", () => {
        this.description = textarea.value;
      });
    });
	
    this.renderFilePicker(form, "Image", this.imageRef, "No image selected", () => {
      this.pickImageFile();
    }, () => {
      this.imageRef = "";
      this.refresh();
    });

    this.renderFilePicker(form, "Linked note", this.noteRef, "No note selected", () => {
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

    const selectedDayButton = actions.createEl("button", {
      cls: "time-manager__button",
      text: "Use selected day"
    });
    selectedDayButton.type = "button";
    selectedDayButton.addEventListener("click", () => {
      this.applyCurrentCalendarDateRange(calendar.state.cursorDate);
      this.refresh();
    });

    const saveButton = actions.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: "Save event"
    });
    saveButton.type = "button";
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
      input.value = value;
      input.placeholder = placeholder;

      const browseButton = row.createEl("button", {
        cls: "time-manager__button",
        text: "Browse"
      });
      browseButton.type = "button";
      browseButton.addEventListener("click", onBrowse);

      const clearButton = row.createEl("button", {
        cls: "time-manager__button",
        text: "Clear"
      });
      clearButton.type = "button";
      clearButton.addEventListener("click", onClear);
    });
  }

  private renderField(
    parent: HTMLElement,
    label: string,
    render: (field: HTMLElement) => void
  ): void {
    const field = parent.createDiv({ cls: "time-event-editor__field" });
    field.createEl("label", {
      cls: "time-event-editor__label",
      text: label
    });
    render(field);
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
    this.title = "";
    this.description = "";
    this.color = DEFAULT_EVENT_COLOR;
    this.noteRef = "";
    this.imageRef = "";
    this.saveAsPresetName = "";
    this.selectedTagRefs = new Set<string>();
    this.applyCurrentCalendarDateRange(date);
    this.initialized = true;
  }

  private async submit(calendar: CalendarFile): Promise<void> {
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

    const eventId = createEventId(title);

    await this.plugin.saveEvent({
      id: eventId,
      calendarId: calendar.id,
      title,
      date: normalizedStartDate,
      endDate: sameFantasyDate(normalizedStartDate, normalizedEndDate)
        ? undefined
        : normalizedEndDate,
      description: this.description.trim().length > 0 ? this.description.trim() : undefined,
      imageRef: this.imageRef.trim().length > 0 ? this.imageRef.trim() : undefined,
      noteRef: this.noteRef.trim().length > 0 ? this.noteRef.trim() : undefined,
      color: normalizeColor(this.color),
	  weatherPackId: this.selectedWeatherPackId || undefined,
      tagRefs: [...this.selectedTagRefs].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" })
      ),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

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

	this.resetForm(calendar, normalizedStartDate);

    await this.plugin.updateActiveCalendarState({
      cursorDate: { ...normalizedStartDate }
    });

    new Notice(`Saved event "${title}".`);
    this.refresh();
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

function buildTagRef(packId: string, tagId: string): string {
  return `${packId}:${tagId}`;
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