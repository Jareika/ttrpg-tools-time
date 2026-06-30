import { ItemView, Modal, Notice, Setting, WorkspaceLeaf, setIcon } from "obsidian";
import { formatDateWithPattern } from "./calendar";
import { formatFantasyTime } from "./moons";
import type TtrpgToolsTimePlugin from "./main";
import type {
  CalendarFile,
  TagPackFile,
  TimeAdvanceButtonConfig
} from "./types";

export const CONTROL_VIEW_TYPE = "time-control-view";

type TimelineInsertLayout = "cal" | "h";

interface TimelineTagInfo {
  packId: string;
  packName: string;
  tagId: string;
  tagName: string;
  tagRef: string;
  color: string;
}

interface ControlButtonOptions {
  icon?: string;
  label: string;
  onClick: () => void;
  onContextMenu?: (event: MouseEvent) => void;
  disabled?: boolean;
  tooltip?: string;
  iconOnly?: boolean;
  classNames?: string[];
}

export class TimeControlView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: TtrpgToolsTimePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return CONTROL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Time controls";
  }

  getIcon(): string {
    return "command";
  }

  onOpen(): void {
    void this.refresh();
  }

  onClose(): void {
    // no-op
  }

  refresh(): void {
    clearEl(this.contentEl);
    this.contentEl.addClass("time-control-view");
    void this.render();
  }

  private async render(): Promise<void> {
    const root = this.contentEl.createDiv({ cls: "time-control" });
    const panel = root.createDiv({ cls: "time-control__panel" });
    const calendar = this.plugin.activeCalendar;

    const header = panel.createDiv({ cls: "time-control__header" });
    header.createEl("h2", {
      cls: "time-control__title",
      text: "Controls"
    });
    header.createDiv({
      cls: "time-control__meta",
      text: calendar ? calendar.name : "No active calendar"
    });

    panel.createDiv({
      cls: "time-control__section-title",
      text: "Actions"
    });

    const quickActions = panel.createDiv({ cls: "time-control__quick-grid" });

    this.createActionButton(quickActions, {
      icon: "calendar",
      label: "Open calendar",
      iconOnly: true,
      onClick: () => {
        void this.plugin.activateView();
      }
    });

    this.createActionButton(quickActions, {
      icon: "sun",
      label: "Open day view",
      iconOnly: true,
      onClick: () => {
        void this.plugin.activateDayView();
      }
    });

    this.createActionButton(quickActions, {
      icon: "crosshair",
      label: "Jump to today",
      iconOnly: true,
      disabled: !calendar,
      onClick: () => {
        void this.plugin.jumpToToday();
      }
    });

    this.createActionButton(quickActions, {
      icon: "milestone",
      label: "Open timeline",
      iconOnly: true,
      onClick: () => {
        void this.plugin.activateTimelineView();
      }
    });

    this.createActionButton(quickActions, {
      icon: "tags",
      label: "Open timeline filters",
      iconOnly: true,
      onClick: () => {
        void this.plugin.activateTimelineFilterView();
      }
    });

    this.createActionButton(quickActions, {
      icon: "list-plus",
      label: "Insert timeline",
      iconOnly: true,
      onClick: () => {
        new TimelineInsertModal(this.plugin).open();
      }
    });

    this.createActionButton(quickActions, {
      icon: "plus-circle",
      label: "Create event",
      iconOnly: true,
      onClick: () => {
        void this.plugin.activateEventEditorView();
      }
    });

    this.createActionButton(quickActions, {
      icon: "cloud",
      label: "Manage weather packs",
      iconOnly: true,
      onClick: () => {
        this.plugin.openManageWeatherPacksModal();
      }
    });

    this.createActionButton(quickActions, {
      icon: "tags",
      label: "Manage tag packs",
      iconOnly: true,
      onClick: () => {
        this.plugin.openManageTagPacksModal();
      }
    });

    this.createActionButton(quickActions, {
      icon: "pencil",
      label: "Edit calendar",
      iconOnly: true,
      disabled: !calendar,
      onClick: () => {
        this.plugin.openEditActiveCalendarModal(() => this.refresh());
      }
    });

    this.createActionButton(quickActions, {
      icon: "settings",
      label: "Plugin settings",
      iconOnly: true,
      onClick: () => {
        this.plugin.openPluginSettings();
      }
    });

    const timeButtons = this.plugin.getConfiguredTimeAdvanceButtons();

    if (timeButtons.length > 0) {
      panel.createDiv({ cls: "time-control__divider" });
      panel.createDiv({
        cls: "time-control__section-title",
        text: "Fantasy time"
      });

      if (calendar && calendar.definition.time.enabled) {
        const clock = this.plugin.getFantasyClock(calendar);

        if (clock) {
          const clockBox = panel.createDiv({ cls: "time-control__clock" });
          clockBox.createDiv({
            cls: "time-control__clock-date",
            text: formatDateWithPattern(
              calendar.state.todayDate,
              calendar.definition,
              this.plugin.settings.dayViewDateFormat,
              "compact"
            )
          });
          clockBox.createDiv({
            cls: "time-control__clock-time",
            text: formatFantasyTime(clock, calendar.definition)
          });
        }
      } else {
        panel.createDiv({
          cls: "time-control__clock-note",
          text: calendar
            ? "The active calendar has no time system enabled."
            : "No active calendar loaded."
        });
      }

      const timeActions = panel.createDiv({ cls: "time-control__time-grid" });
      const timeButtonsDisabled = !calendar || !calendar.definition.time.enabled;

      timeButtons.forEach((button) => {
        const trimmedIcon = button.icon?.trim();

        this.createActionButton(timeActions, {
          icon: trimmedIcon && trimmedIcon.length > 0 ? trimmedIcon : undefined,
          label: button.label,
          disabled: timeButtonsDisabled,
          tooltip: buildTimeAdvanceTooltip(button),
          classNames: [
            "time-control__button--time",
            !trimmedIcon ? "time-control__button--label-only" : ""
          ],
          onClick: () => {
            void this.plugin.advanceFantasyClock(button.hours, button.minutes);
          },
          onContextMenu: () => {
            void this.plugin.advanceFantasyClock(-button.hours, -button.minutes);
          }
        });
      });
    }
  }

  private createActionButton(
    parent: HTMLElement,
    options: ControlButtonOptions
  ): HTMLButtonElement {
    const classNames = ["time-control__button"];

    if (options.iconOnly) {
      classNames.push("time-control__button--icon-only");
    }

    if (options.classNames?.length) {
      classNames.push(...options.classNames.filter((entry) => entry.trim().length > 0));
    }

    const button = parent.createEl("button", {
      cls: classNames.join(" ")
    });
    button.type = "button";
    button.disabled = options.disabled ?? false;
    button.setAttr("aria-label", options.label);
    button.title = options.tooltip ?? options.label;

    if (options.icon?.trim()) {
      const iconWrap = button.createDiv({ cls: "time-control__button-icon" });
      setIcon(iconWrap, options.icon);
    }

    button.createDiv({
      cls: "time-control__button-label",
      text: options.label
    });

    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }

      options.onClick();
    });

    if (options.onContextMenu) {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();

        if (button.disabled) {
          return;
        }

        options.onContextMenu?.(event);
      });
    }

    return button;
  }
}

class TimelineInsertModal extends Modal {
  private layout: TimelineInsertLayout = "cal";
  private titleText = "";
  private jumpToToday = true;
  private readonly selectedCalendarIds = new Set<string>();
  private readonly includedTagRefs = new Set<string>();
  private readonly excludedTagRefs = new Set<string>();

  constructor(private readonly plugin: TtrpgToolsTimePlugin) {
    super(plugin.app);

    const activeCalendarId = plugin.activeCalendar?.id;
    if (activeCalendarId) {
      this.selectedCalendarIds.add(activeCalendarId);
    }
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const calendars = await this.plugin.listCalendars();
    const allTagPacks = await this.plugin.listTagPacks();

    if (this.selectedCalendarIds.size === 0 && calendars.length > 0) {
      this.selectedCalendarIds.add(this.plugin.activeCalendar?.id ?? calendars[0]?.id ?? "");
    }

    const visibleTagPacks = buildVisibleTagPacks(
      calendars,
      allTagPacks,
      this.selectedCalendarIds
    );
    const tagInfos = buildTimelineTagInfos(visibleTagPacks);

    clearEl(contentEl);
    contentEl.addClass("time-modal");

    contentEl.createEl("h2", {
      text: "Insert timeline"
    });

    new Setting(contentEl)
      .setName("Layout")
      .setDesc("Choose the timeline code block type.")
      .addDropdown((dropdown) => {
        dropdown.addOption("cal", "Vertical");
        dropdown.addOption("h", "Horizontal");
        dropdown.setValue(this.layout);
        dropdown.onChange((value) => {
          this.layout = value === "h" ? "h" : "cal";
        });
      });

    new Setting(contentEl)
      .setName("Heading")
      .setDesc("Optional title above the embedded timeline.")
      .addText((text) => {
        text.setPlaceholder("Campaign timeline");
        text.setValue(this.titleText);
        text.onChange((value) => {
          this.titleText = value;
        });
      });

    new Setting(contentEl)
      .setName("Show today button")
      .setDesc("Adds jumpTo: today to the YAML block.")
      .addToggle((toggle) => {
        toggle.setValue(this.jumpToToday);
        toggle.onChange((value) => {
          this.jumpToToday = value;
        });
      });

    contentEl.createEl("h3", {
      text: "Calendars"
    });

    const calendarList = contentEl.createDiv({ cls: "time-control-insert__calendar-list" });

    calendars.forEach((calendar) => {
      const button = calendarList.createEl("button", {
        cls: "time-control-insert__calendar-button",
        text: calendar.name
      });
      button.type = "button";
      button.title = calendar.id;

      applyCalendarButtonState(button, this.selectedCalendarIds.has(calendar.id));

      button.addEventListener("click", () => {
        if (this.selectedCalendarIds.has(calendar.id)) {
          this.selectedCalendarIds.delete(calendar.id);
        } else {
          this.selectedCalendarIds.add(calendar.id);
        }

        void this.render();
      });
    });

    contentEl.createEl("h3", {
      text: "Tags"
    });

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Click = include, double-click = exclude. Exclude wins."
    });

    if (tagInfos.length === 0) {
      contentEl.createDiv({
        cls: "time-manager__empty",
        text: "No tag packs available for the selected calendars."
      });
    } else {
      const groups = groupTagsByPack(tagInfos);

      groups.forEach((group) => {
        const groupEl = contentEl.createDiv({ cls: "time-tag-filter__group" });
        groupEl.createEl("h3", {
          cls: "time-tag-filter__group-title",
          text: group.packName
        });

        const chips = groupEl.createDiv({ cls: "time-tag-filter__chips" });

        group.tags.forEach((tag) => {
          const button = chips.createEl("button", {
            cls: "time-tag-filter__button",
            text: tag.tagName
          });
          button.type = "button";
          button.style.setProperty("--time-tag-color", tag.color);

          applyTimelineTagButtonState(
            button,
            tag.color,
            this.includedTagRefs.has(tag.tagRef),
            this.excludedTagRefs.has(tag.tagRef)
          );

          let clickTimer: number | null = null;

          button.addEventListener("click", () => {
            if (clickTimer !== null) {
              window.clearTimeout(clickTimer);
            }

            clickTimer = window.setTimeout(() => {
              clickTimer = null;

              if (this.includedTagRefs.has(tag.tagRef)) {
                this.includedTagRefs.delete(tag.tagRef);
              } else {
                this.includedTagRefs.add(tag.tagRef);
                this.excludedTagRefs.delete(tag.tagRef);
              }

              applyTimelineTagButtonState(
                button,
                tag.color,
                this.includedTagRefs.has(tag.tagRef),
                this.excludedTagRefs.has(tag.tagRef)
              );
            }, 220);
          });

          button.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (clickTimer !== null) {
              window.clearTimeout(clickTimer);
              clickTimer = null;
            }

            if (this.excludedTagRefs.has(tag.tagRef)) {
              this.excludedTagRefs.delete(tag.tagRef);
            } else {
              this.excludedTagRefs.add(tag.tagRef);
              this.includedTagRefs.delete(tag.tagRef);
            }

            applyTimelineTagButtonState(
              button,
              tag.color,
              this.includedTagRefs.has(tag.tagRef),
              this.excludedTagRefs.has(tag.tagRef)
            );
          });
        });
      });
    }

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    new Setting(footer).addButton((button) => {
      button.setButtonText("Insert");
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
    const selectedCalendarIds = [...this.selectedCalendarIds]
      .filter((entry) => entry.trim().length > 0)
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

    if (selectedCalendarIds.length === 0) {
      new Notice("Please select at least one calendar.");
      return;
    }

    const block = buildTimelineYamlBlock({
      layout: this.layout,
      title: this.titleText.trim(),
      calendars: selectedCalendarIds,
      includeTags: [...this.includedTagRefs].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" })
      ),
      excludeTags: [...this.excludedTagRefs].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" })
      ),
      jumpToToday: this.jumpToToday
    });

    this.close();

    const inserted = await this.plugin.insertTextAtLastMarkdownCursor(block);

    if (inserted) {
      new Notice("Timeline block inserted.");
    }
  }
}

function buildTimelineYamlBlock(input: {
  layout: TimelineInsertLayout;
  title: string;
  calendars: string[];
  includeTags: string[];
  excludeTags: string[];
  jumpToToday: boolean;
}): string {
  const fence = input.layout === "h" ? "time-timeline-h" : "time-timeline-cal";
  const lines: string[] = [`\`\`\`${fence}`];

  if (input.title.length > 0) {
    lines.push(`title: ${formatYamlScalar(input.title)}`);
  }

  if (input.calendars.length === 1) {
    lines.push(`calendar: ${formatYamlScalar(input.calendars[0] ?? "")}`);
  } else {
    lines.push("calendars:");
    input.calendars.forEach((calendarId) => {
      lines.push(`  - ${formatYamlScalar(calendarId)}`);
    });
  }

  if (input.includeTags.length > 0) {
    lines.push("includeTags:");
    input.includeTags.forEach((tagRef) => {
      lines.push(`  - ${formatYamlScalar(tagRef)}`);
    });
  }

  if (input.excludeTags.length > 0) {
    lines.push("excludeTags:");
    input.excludeTags.forEach((tagRef) => {
      lines.push(`  - ${formatYamlScalar(tagRef)}`);
    });
  }

  if (input.jumpToToday) {
    lines.push("jumpTo: today");
  }

  lines.push("```", "");

  return `${lines.join("\n")}\n`;
}

function buildVisibleTagPacks(
  calendars: CalendarFile[],
  allTagPacks: TagPackFile[],
  selectedCalendarIds: Set<string>
): TagPackFile[] {
  const selectedCalendars = calendars.filter((calendar) =>
    selectedCalendarIds.has(calendar.id)
  );
  const linkedPackIds = new Set(
    selectedCalendars.flatMap((calendar) => calendar.linkedTagPackIds)
  );

  if (linkedPackIds.size === 0) {
    return allTagPacks;
  }

  return allTagPacks.filter((pack) => linkedPackIds.has(pack.id));
}

function buildTimelineTagInfos(packs: TagPackFile[]): TimelineTagInfo[] {
  return packs.flatMap((pack) =>
    pack.tags.map((tag) => ({
      packId: pack.id,
      packName: pack.name,
      tagId: tag.id,
      tagName: tag.name,
      tagRef: `${pack.id}:${tag.id}`,
      color: normalizeColor(tag.color)
    }))
  );
}

function groupTagsByPack(
  tags: TimelineTagInfo[]
): Array<{ packId: string; packName: string; tags: TimelineTagInfo[] }> {
  const groups = new Map<string, { packId: string; packName: string; tags: TimelineTagInfo[] }>();

  tags.forEach((tag) => {
    const existing = groups.get(tag.packId);
    if (existing) {
      existing.tags.push(tag);
      return;
    }

    groups.set(tag.packId, {
      packId: tag.packId,
      packName: tag.packName,
      tags: [tag]
    });
  });

  return [...groups.values()];
}

function applyCalendarButtonState(button: HTMLButtonElement, selected: boolean): void {
  button.classList.toggle("is-selected", selected);
}

function applyTimelineTagButtonState(
  button: HTMLButtonElement,
  color: string,
  included: boolean,
  excluded: boolean
): void {
  button.removeClass("is-include", "is-exclude");
  button.style.removeProperty("background-color");
  button.style.removeProperty("border-color");
  button.style.removeProperty("color");
  button.style.removeProperty("box-shadow");

  button.style.setProperty("--time-tag-color", color);

  if (excluded) {
    button.addClass("is-exclude");
    button.style.borderColor = color;
    button.style.color = color;
    button.style.boxShadow = `inset 0 0 0 2px ${color}`;
    return;
  }

  if (included) {
    button.addClass("is-include");
    button.style.backgroundColor = color;
    button.style.borderColor = color;
    button.style.color = getReadableTextColor(color);
    return;
  }

  button.style.borderColor = color;
}

function buildTimeAdvanceTooltip(button: TimeAdvanceButtonConfig): string {
  const parts: string[] = [];

  if (button.hours !== 0) {
    parts.push(`${button.hours >= 0 ? "+" : ""}${button.hours}h`);
  }

  if (button.minutes !== 0) {
    parts.push(`${button.minutes >= 0 ? "+" : ""}${button.minutes}m`);
  }

  return [
    button.label,
    parts.length > 0 ? parts.join(" ") : null,
    "Left click: add",
    "Right click: subtract"
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(" • ");
}

function formatYamlScalar(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeColor(value: string | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : "#d46b65";
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

function prepareFlexibleModal(modal: Modal): void {
  modal.modalEl.addClass("time-flex-modal");
  modal.contentEl.addClass("time-flex-modal__content");
}

function clearEl(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}