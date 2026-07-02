import { App, Modal } from "obsidian";
import type { EventDeleteMode } from "./types";

interface DeleteEventDialogOptions {
  title?: string;
  eventTitle: string;
  occurrenceLabel?: string;
  recurring: boolean;
}

class DeleteEventModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly options: DeleteEventDialogOptions,
    private readonly resolveResult: (value: EventDeleteMode | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("time-flex-modal");
    contentEl.addClass("time-flex-modal__content", "time-modal");
    contentEl.empty();

    contentEl.createEl("h2", {
      text: this.options.title ?? "Delete event"
    });

    contentEl.createEl("p", {
      text: `Delete "${this.options.eventTitle}"?`
    });

    if (this.options.occurrenceLabel) {
      contentEl.createEl("p", {
        cls: "setting-item-description",
        text: `Selected entry: ${this.options.occurrenceLabel}`
      });
    }

    if (this.options.recurring) {
      contentEl.createEl("p", {
        cls: "setting-item-description",
        text: "This is a recurring event. Choose whether to delete only this occurrence, this and following occurrences, or the whole series."
      });
    }

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    if (this.options.recurring) {
      this.createButton(footer, "Only this", "mod-cta", () => this.finish("single"));
      this.createButton(footer, "This and following", "", () => this.finish("following"));
      this.createButton(footer, "All", "", () => this.finish("all"));
      this.createButton(footer, "Cancel", "", () => this.finish(null));
      return;
    }

    this.createButton(footer, "Delete", "mod-cta", () => this.finish("all"));
    this.createButton(footer, "Cancel", "", () => this.finish(null));
  }

  onClose(): void {
    this.contentEl.empty();

    if (!this.settled) {
      this.settled = true;
      this.resolveResult(null);
    }
  }

  private createButton(
    parent: HTMLElement,
    label: string,
    extraClass: string,
    onClick: () => void
  ): void {
    const button = parent.createEl("button", {
      cls: `time-manager__button ${extraClass}`.trim(),
      text: label
    });
    button.type = "button";
    button.addEventListener("click", onClick);
  }

  private finish(value: EventDeleteMode | null): void {
    if (this.settled) {
      return;
    }

    this.settled = true;
    this.resolveResult(value);
    this.close();
  }
}

export function chooseDeleteEventMode(
  app: App,
  options: DeleteEventDialogOptions
): Promise<EventDeleteMode | null> {
  return new Promise((resolve) => {
    new DeleteEventModal(app, options, resolve).open();
  });
}