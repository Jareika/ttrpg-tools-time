import { App, Modal } from "obsidian";

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

class ConfirmDialogModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly options: ConfirmDialogOptions,
    private readonly resolveResult: (value: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass("time-flex-modal");
    contentEl.addClass("time-flex-modal__content", "time-modal");
    contentEl.empty();

    contentEl.createEl("h2", { text: this.options.title });
    contentEl.createEl("p", { text: this.options.message });

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });

    const confirmButton = footer.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: this.options.confirmLabel ?? "Confirm"
    });
    confirmButton.type = "button";
    confirmButton.addEventListener("click", () => this.finish(true));

    const cancelButton = footer.createEl("button", {
      cls: "time-manager__button",
      text: this.options.cancelLabel ?? "Cancel"
    });
    cancelButton.type = "button";
    cancelButton.addEventListener("click", () => this.finish(false));
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

export function confirmWithModal(
  app: App,
  options: ConfirmDialogOptions
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmDialogModal(app, options, resolve).open();
  });
}