import { Modal, Notice } from "obsidian";
import { slugify } from "./calendar";
import type TtrpgToolsTimePlugin from "./main";
import type {
  FrontmatterColorMappingRule,
  FrontmatterExportSettings,
  FrontmatterImportSettings
} from "./types";

export class FrontmatterManagerModal extends Modal {
  private importDraft: FrontmatterImportSettings;
  private exportDraft: FrontmatterExportSettings;

  constructor(private readonly plugin: TtrpgToolsTimePlugin) {
    super(plugin.app);
    this.importDraft = cloneImportSettings(plugin.settings.frontmatterImport);
    this.exportDraft = cloneExportSettings(plugin.settings.frontmatterExport);
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
      text: "Manage frontmatter"
    });

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Import scans frontmatter manually into JSON events. Export writes mapped event values back into the attached Markdown note frontmatter."
    });

    this.renderImportSection(contentEl);
    contentEl.createEl("hr");
    this.renderExportSection(contentEl);

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    const saveButton = footer.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: "Save"
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
  }

  private renderImportSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Import mapping" });

    const grid = parent.createDiv({ cls: "time-calendar-editor__setup-grid" });

    const optionsBlock = createSetupBlock(
      grid,
      "Options",
      "Manual import only, no live sync."
    );
    const optionsList = optionsBlock.createDiv({
      cls: "time-calendar-editor__checkbox-list"
    });
    createCompactCheckbox(optionsList, {
      label: "Enable frontmatter import",
      checked: this.importDraft.enabled,
      onChange: (value) => {
        this.importDraft.enabled = value;
      }
    });
    createCompactCheckbox(optionsList, {
      label: "Fallback title = note name",
      checked: this.importDraft.fallbackTitleToFilename,
      onChange: (value) => {
        this.importDraft.fallbackTitleToFilename = value;
      }
    });

    const coreBlock = createSetupBlock(
      grid,
      "Core mapping",
      "Frontmatter properties for the main event fields."
    );
    renderPropertyGrid(coreBlock, [
      {
        label: "Title property",
        placeholder: "fc-title",
        value: this.importDraft.titleProperty,
        onChange: (value) => { this.importDraft.titleProperty = value; }
      },
      {
        label: "Start date property",
        placeholder: "fc-date",
        value: this.importDraft.startDateProperty,
        onChange: (value) => { this.importDraft.startDateProperty = value; }
      },
      {
        label: "End date property",
        placeholder: "fc-end",
        value: this.importDraft.endDateProperty,
        onChange: (value) => { this.importDraft.endDateProperty = value; }
      },
      {
        label: "Description property",
        placeholder: "fc-description",
        value: this.importDraft.descriptionProperty,
        onChange: (value) => { this.importDraft.descriptionProperty = value; }
      },
      {
        label: "Tag property",
        placeholder: "fc-tags",
        value: this.importDraft.tagProperty,
        onChange: (value) => { this.importDraft.tagProperty = value; }
      },
      {
        label: "Weather-pack property",
        placeholder: "fc-weather",
        value: this.importDraft.weatherPackProperty,
        onChange: (value) => { this.importDraft.weatherPackProperty = value; }
      },
      {
        label: "Image property",
        placeholder: "fc-image",
        value: this.importDraft.imageProperty,
        onChange: (value) => { this.importDraft.imageProperty = value; }
      },
      {
        label: "Stable sync-id property",
        placeholder: "time-sync-id",
        value: this.importDraft.syncIdProperty,
        onChange: (value) => { this.importDraft.syncIdProperty = value; }
      }
    ]);

    const timeBlock = createSetupBlock(
      grid,
      "Time mapping",
      "Optional exact-time fields."
    );
    renderPropertyGrid(timeBlock, [
      {
        label: "Start hour property",
        placeholder: "fc-start-hour",
        value: this.importDraft.startHourProperty,
        onChange: (value) => { this.importDraft.startHourProperty = value; }
      },
      {
        label: "Start minute property",
        placeholder: "fc-start-minute",
        value: this.importDraft.startMinuteProperty,
        onChange: (value) => { this.importDraft.startMinuteProperty = value; }
      },
      {
        label: "End hour property",
        placeholder: "fc-end-hour",
        value: this.importDraft.endHourProperty,
        onChange: (value) => { this.importDraft.endHourProperty = value; }
      },
      {
        label: "End minute property",
        placeholder: "fc-end-minute",
        value: this.importDraft.endMinuteProperty,
        onChange: (value) => { this.importDraft.endMinuteProperty = value; }
      }
    ]);

    const recurrenceBlock = createSetupBlock(
      grid,
      "Recurrence mapping",
      "Optional repeat fields."
    );
    renderPropertyGrid(recurrenceBlock, [
      {
        label: "Recurrence frequency property",
        placeholder: "fc-repeat",
        value: this.importDraft.recurrenceFrequencyProperty,
        onChange: (value) => { this.importDraft.recurrenceFrequencyProperty = value; }
      },
      {
        label: "Recurrence interval property",
        placeholder: "fc-repeat-interval",
        value: this.importDraft.recurrenceIntervalProperty,
        onChange: (value) => { this.importDraft.recurrenceIntervalProperty = value; }
      },
      {
        label: "Recurrence end-mode property",
        placeholder: "fc-repeat-end-mode",
        value: this.importDraft.recurrenceEndModeProperty,
        onChange: (value) => { this.importDraft.recurrenceEndModeProperty = value; }
      },
      {
        label: "Recurrence count property",
        placeholder: "fc-repeat-count",
        value: this.importDraft.recurrenceCountProperty,
        onChange: (value) => { this.importDraft.recurrenceCountProperty = value; }
      },
      {
        label: "Recurrence until property",
        placeholder: "fc-repeat-until",
        value: this.importDraft.recurrenceUntilProperty,
        onChange: (value) => { this.importDraft.recurrenceUntilProperty = value; }
      }
    ]);

    const colorBlock = createSetupBlock(
      grid,
      "Color mapping",
      "Direct color property and optional value→color rules."
    );
    renderPropertyGrid(colorBlock, [
      {
        label: "Direct color property",
        placeholder: "fc-color",
        value: this.importDraft.colorProperty,
        onChange: (value) => { this.importDraft.colorProperty = value; }
      }
    ]);

    const colorRuleList = colorBlock.createDiv({ cls: "time-frontmatter-rule-list" });

    if (this.importDraft.colorMappings.length === 0) {
      colorRuleList.createDiv({
        cls: "time-collection-editor__empty",
        text: "No color rules defined yet."
      });
    } else {
      this.importDraft.colorMappings.forEach((rule, index) => {
        const row = colorRuleList.createDiv({ cls: "time-frontmatter-rule-row" });

        createCompactPropertyInput(row, {
          label: "Color rule property",
          placeholder: "fc_category",
          value: rule.property,
          onChange: (value) => {
            this.importDraft.colorMappings[index].property = value;
          }
        });

        createCompactPropertyInput(row, {
          label: "Color rule value",
          placeholder: "Festival",
          value: rule.value,
          onChange: (value) => {
            this.importDraft.colorMappings[index].value = value;
          }
        });

        const colorInput = row.createEl("input", {
          cls: "time-season-editor__color"
        });
        colorInput.type = "color";
        colorInput.value = normalizeColor(rule.color);
        colorInput.addEventListener("input", () => {
          this.importDraft.colorMappings[index].color = colorInput.value;
        });

        const deleteButton = row.createEl("button", {
          cls: "time-collection-editor__delete"
        });
        deleteButton.type = "button";
        deleteButton.setAttr("aria-label", "Delete color rule");
        deleteButton.title = "Delete";
        deleteButton.addEventListener("click", () => {
          this.importDraft.colorMappings.splice(index, 1);
          this.render();
        });
      });
    }

    const toolbar = colorBlock.createDiv({ cls: "time-collection-editor__toolbar" });
    const addRuleButton = toolbar.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: "Add color rule"
    });
    addRuleButton.type = "button";
    addRuleButton.addEventListener("click", () => {
      this.importDraft.colorMappings.push(createEmptyColorRule(this.importDraft.colorMappings.length));
      this.render();
    });
  }

  private renderExportSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Export mapping" });

    const grid = parent.createDiv({ cls: "time-calendar-editor__setup-grid" });

    const optionsBlock = createSetupBlock(
      grid,
      "Options",
      "Only writes into the attached Markdown note."
    );
    const optionsList = optionsBlock.createDiv({
      cls: "time-calendar-editor__checkbox-list"
    });
    createCompactCheckbox(optionsList, {
      label: "Enable frontmatter export",
      checked: this.exportDraft.enabled,
      onChange: (value) => {
        this.exportDraft.enabled = value;
      }
    });
    createCompactCheckbox(optionsList, {
      label: "Clear missing fields",
      checked: this.exportDraft.clearMissingFields,
      onChange: (value) => {
        this.exportDraft.clearMissingFields = value;
      }
    });

    const coreBlock = createSetupBlock(
      grid,
      "Core mapping",
      "Event fields written back to frontmatter."
    );
    renderPropertyGrid(coreBlock, [
      {
        label: "Title property",
        placeholder: "fc-title",
        value: this.exportDraft.titleProperty,
        onChange: (value) => { this.exportDraft.titleProperty = value; }
      },
      {
        label: "Start date property",
        placeholder: "fc-date",
        value: this.exportDraft.startDateProperty,
        onChange: (value) => { this.exportDraft.startDateProperty = value; }
      },
      {
        label: "End date property",
        placeholder: "fc-end",
        value: this.exportDraft.endDateProperty,
        onChange: (value) => { this.exportDraft.endDateProperty = value; }
      },
      {
        label: "Description property",
        placeholder: "fc-description",
        value: this.exportDraft.descriptionProperty,
        onChange: (value) => { this.exportDraft.descriptionProperty = value; }
      },
      {
        label: "Tag property",
        placeholder: "fc-tags",
        value: this.exportDraft.tagProperty,
        onChange: (value) => { this.exportDraft.tagProperty = value; }
      },
      {
        label: "Weather-pack property",
        placeholder: "fc-weather",
        value: this.exportDraft.weatherPackProperty,
        onChange: (value) => { this.exportDraft.weatherPackProperty = value; }
      },
      {
        label: "Image property",
        placeholder: "fc-image",
        value: this.exportDraft.imageProperty,
        onChange: (value) => { this.exportDraft.imageProperty = value; }
      },
      {
        label: "Sync-id property",
        placeholder: "time-sync-id",
        value: this.exportDraft.syncIdProperty,
        onChange: (value) => { this.exportDraft.syncIdProperty = value; }
      },
      {
        label: "Direct color property",
        placeholder: "fc-color",
        value: this.exportDraft.colorProperty,
        onChange: (value) => { this.exportDraft.colorProperty = value; }
      }
    ]);

    const timeBlock = createSetupBlock(
      grid,
      "Time mapping",
      "Optional exact-time fields."
    );
    renderPropertyGrid(timeBlock, [
      {
        label: "Start hour property",
        placeholder: "fc-start-hour",
        value: this.exportDraft.startHourProperty,
        onChange: (value) => { this.exportDraft.startHourProperty = value; }
      },
      {
        label: "Start minute property",
        placeholder: "fc-start-minute",
        value: this.exportDraft.startMinuteProperty,
        onChange: (value) => { this.exportDraft.startMinuteProperty = value; }
      },
      {
        label: "End hour property",
        placeholder: "fc-end-hour",
        value: this.exportDraft.endHourProperty,
        onChange: (value) => { this.exportDraft.endHourProperty = value; }
      },
      {
        label: "End minute property",
        placeholder: "fc-end-minute",
        value: this.exportDraft.endMinuteProperty,
        onChange: (value) => { this.exportDraft.endMinuteProperty = value; }
      }
    ]);

    const recurrenceBlock = createSetupBlock(
      grid,
      "Recurrence mapping",
      "Optional repeat fields."
    );
    renderPropertyGrid(recurrenceBlock, [
      {
        label: "Recurrence frequency property",
        placeholder: "fc-repeat",
        value: this.exportDraft.recurrenceFrequencyProperty,
        onChange: (value) => { this.exportDraft.recurrenceFrequencyProperty = value; }
      },
      {
        label: "Recurrence interval property",
        placeholder: "fc-repeat-interval",
        value: this.exportDraft.recurrenceIntervalProperty,
        onChange: (value) => { this.exportDraft.recurrenceIntervalProperty = value; }
      },
      {
        label: "Recurrence end-mode property",
        placeholder: "fc-repeat-end-mode",
        value: this.exportDraft.recurrenceEndModeProperty,
        onChange: (value) => { this.exportDraft.recurrenceEndModeProperty = value; }
      },
      {
        label: "Recurrence count property",
        placeholder: "fc-repeat-count",
        value: this.exportDraft.recurrenceCountProperty,
        onChange: (value) => { this.exportDraft.recurrenceCountProperty = value; }
      },
      {
        label: "Recurrence until property",
        placeholder: "fc-repeat-until",
        value: this.exportDraft.recurrenceUntilProperty,
        onChange: (value) => { this.exportDraft.recurrenceUntilProperty = value; }
      }
    ]);
  }

  private async submit(): Promise<void> {
    await this.plugin.replaceSettings({
      ...this.plugin.settings,
      frontmatterImport: sanitizeImportSettings(this.importDraft),
      frontmatterExport: sanitizeExportSettings(this.exportDraft)
    });

    this.close();
    new Notice("Saved frontmatter settings.");
  }
}

function createEmptyColorRule(index: number): FrontmatterColorMappingRule {
  return {
    id: `frontmatter-color-rule-${index + 1}`,
    property: "",
    value: "",
    color: "#d46b65"
  };
}

function sanitizeImportSettings(value: FrontmatterImportSettings): FrontmatterImportSettings {
  return {
    enabled: value.enabled,
    titleProperty: trimOptional(value.titleProperty),
    startDateProperty: trimOptional(value.startDateProperty),
    endDateProperty: trimOptional(value.endDateProperty),
    startHourProperty: trimOptional(value.startHourProperty),
    startMinuteProperty: trimOptional(value.startMinuteProperty),
    endHourProperty: trimOptional(value.endHourProperty),
    endMinuteProperty: trimOptional(value.endMinuteProperty),
    descriptionProperty: trimOptional(value.descriptionProperty),
    imageProperty: trimOptional(value.imageProperty),
    weatherPackProperty: trimOptional(value.weatherPackProperty),
    tagProperty: trimOptional(value.tagProperty),
    syncIdProperty: trimOptional(value.syncIdProperty),
    colorProperty: trimOptional(value.colorProperty),
    recurrenceFrequencyProperty: trimOptional(value.recurrenceFrequencyProperty),
    recurrenceIntervalProperty: trimOptional(value.recurrenceIntervalProperty),
    recurrenceEndModeProperty: trimOptional(value.recurrenceEndModeProperty),
    recurrenceCountProperty: trimOptional(value.recurrenceCountProperty),
    recurrenceUntilProperty: trimOptional(value.recurrenceUntilProperty),
    fallbackTitleToFilename: value.fallbackTitleToFilename,
    colorMappings: value.colorMappings
      .map((entry, index) => ({
        id: entry.id.trim().length > 0 ? entry.id.trim() : slugify(`${entry.property}-${entry.value}-${index + 1}`),
        property: entry.property.trim(),
        value: entry.value.trim(),
        color: normalizeColor(entry.color)
      }))
      .filter((entry) => entry.property.length > 0 && entry.value.length > 0)
  };
}

function sanitizeExportSettings(value: FrontmatterExportSettings): FrontmatterExportSettings {
  return {
    enabled: value.enabled,
    titleProperty: trimOptional(value.titleProperty),
    startDateProperty: trimOptional(value.startDateProperty),
    endDateProperty: trimOptional(value.endDateProperty),
    startHourProperty: trimOptional(value.startHourProperty),
    startMinuteProperty: trimOptional(value.startMinuteProperty),
    endHourProperty: trimOptional(value.endHourProperty),
    endMinuteProperty: trimOptional(value.endMinuteProperty),
    descriptionProperty: trimOptional(value.descriptionProperty),
    imageProperty: trimOptional(value.imageProperty),
    weatherPackProperty: trimOptional(value.weatherPackProperty),
    tagProperty: trimOptional(value.tagProperty),
    syncIdProperty: trimOptional(value.syncIdProperty),
    colorProperty: trimOptional(value.colorProperty),
    recurrenceFrequencyProperty: trimOptional(value.recurrenceFrequencyProperty),
    recurrenceIntervalProperty: trimOptional(value.recurrenceIntervalProperty),
    recurrenceEndModeProperty: trimOptional(value.recurrenceEndModeProperty),
    recurrenceCountProperty: trimOptional(value.recurrenceCountProperty),
    recurrenceUntilProperty: trimOptional(value.recurrenceUntilProperty),
    clearMissingFields: value.clearMissingFields
  };
}

function cloneImportSettings(value: FrontmatterImportSettings): FrontmatterImportSettings {
  return {
    ...value,
    colorMappings: value.colorMappings.map((entry) => ({ ...entry }))
  };
}

function cloneExportSettings(value: FrontmatterExportSettings): FrontmatterExportSettings {
  return {
    ...value
  };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeColor(value: string | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : "#d46b65";
}

function prepareFlexibleModal(modal: Modal): void {
  modal.modalEl.addClass("time-flex-modal");
  modal.contentEl.addClass("time-flex-modal__content");
}

interface CompactPropertyInputOptions {
  label: string;
  placeholder: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

function createSetupBlock(
  parent: HTMLElement,
  title: string,
  description?: string
): HTMLElement {
  const block = parent.createDiv({
    cls: "time-calendar-editor__setup-block"
  });

  block.createDiv({
    cls: "time-event-editor__block-title",
    text: title
  });

  if (description) {
    block.createDiv({
      cls: "time-frontmatter-block-note",
      text: description
    });
  }

  return block;
}

function renderPropertyGrid(
  parent: HTMLElement,
  entries: CompactPropertyInputOptions[]
): void {
  const grid = parent.createDiv({
    cls: "time-calendar-editor__compact-grid"
  });

  entries.forEach((entry) => {
    createCompactPropertyInput(grid, entry);
  });
}

function createCompactPropertyInput(
  parent: HTMLElement,
  options: CompactPropertyInputOptions
): HTMLInputElement {
  const input = parent.createEl("input", {
    cls: "time-calendar-editor__compact-input"
  });

  input.type = "text";
  input.placeholder = options.placeholder;
  input.value = options.value ?? "";
  input.setAttr("aria-label", options.label);
  input.title = options.label;
  input.addEventListener("input", () => {
    const trimmed = input.value.trim();
    options.onChange(trimmed.length > 0 ? trimmed : undefined);
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