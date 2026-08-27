import { Modal, Notice } from "obsidian";
import type TtrpgToolsTimePlugin from "./main";
import {
  loadCommunityLibraryIndex,
  type CommunityLibraryEntry,
  type CommunityLibraryEntryKind,
  type CommunityLibraryIndex
} from "./community-library";

export class CommunityLibraryModal extends Modal {
  private activeTab: CommunityLibraryEntryKind = "calendar";
  private index: CommunityLibraryIndex | null = null;
  private query = "";
  private selectedLanguage = "";
  private selectedMonthCount = "";
  private loading = true;
  private installingId: string | null = null;
  private errorMessage: string | null = null;

  constructor(private readonly plugin: TtrpgToolsTimePlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    this.modalEl.addClass("time-flex-modal");
    this.contentEl.addClass("time-flex-modal__content");
    void this.load();
  }

  private async load(): Promise<void> {
    const indexUrl = this.plugin.settings.communityLibraryIndexUrl.trim();

    if (indexUrl.length === 0) {
      this.loading = false;
      this.errorMessage =
        "No community-library index URL is configured. Configure it in the plugin settings first.";
      this.render();
      return;
    }

    this.loading = true;
    this.errorMessage = null;
    this.render();

    try {
      this.index = await loadCommunityLibraryIndex(indexUrl);
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("time-modal", "time-community-library");

    contentEl.createEl("h2", {
      text: "Community downloads"
    });

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Browse community calendars and weather packs. Existing local ids are never overwritten."
    });

    if (this.loading) {
      contentEl.createDiv({
        cls: "time-manager__empty",
        text: "Loading community library…"
      });
      return;
    }

    if (this.errorMessage) {
      contentEl.createDiv({
        cls: "time-manager__empty",
        text: this.errorMessage
      });

      const retry = contentEl.createEl("button", {
        cls: "time-manager__button mod-cta",
        text: "Retry"
      });
      retry.type = "button";
      retry.addEventListener("click", () => {
        void this.load();
      });
      return;
    }

    if (!this.index) {
      return;
    }

    const tabs = contentEl.createDiv({
      cls: "time-community-library__tabs"
    });

    this.createTabButton(tabs, "calendar", "Calendars");
    this.createTabButton(tabs, "weather-pack", "Weather packs");

    const controls = contentEl.createDiv({
      cls: "time-community-library__filters"
    });

    const search = controls.createEl("input", {
      cls: "time-event-editor__input"
    });
    search.type = "search";
    search.placeholder = "Search by name, author or tag";
    search.value = this.query;
	
    const languageSelect = controls.createEl("select", {
      cls: "time-event-editor__input time-community-library__language-select"
    });

    languageSelect.createEl("option", {
      text: "All languages",
      value: ""
    });

    this.getAvailableLanguages().forEach((language) => {
      languageSelect.createEl("option", {
        text: getLanguageLabel(language),
        value: language
      });
    });

    languageSelect.value = this.selectedLanguage;
    languageSelect.addEventListener("change", () => {
      this.selectedLanguage = languageSelect.value;
      this.render();
    });

    const monthSelect = controls.createEl("select", {
      cls: "time-event-editor__input time-community-library__month-select"
    });

    monthSelect.createEl("option", {
      text: "All month counts",
      value: ""
    });

    this.getAvailableMonthCounts().forEach((count) => {
      monthSelect.createEl("option", {
        text: String(count),
        value: String(count)
      });
    });

    monthSelect.value = this.selectedMonthCount;
    monthSelect.addEventListener("change", () => {
      this.selectedMonthCount = monthSelect.value;
      this.render();
    });

    const list = contentEl.createDiv({
      cls: "time-community-library__list"
    });
	
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderEntryList(list);
    });

    this.renderEntryList(list);
  }

  private renderEntryList(parent: HTMLElement): void {
    const entries = this.getVisibleEntries();
    parent.empty();

    if (entries.length === 0) {
      parent.createDiv({
        cls: "time-manager__empty",
        text: "No matching entries found."
      });
      return;
    }

    entries.forEach((entry) => {
      this.renderEntry(parent, entry);
    });
  }

  private createTabButton(
    parent: HTMLElement,
    kind: CommunityLibraryEntryKind,
    label: string
  ): void {
    const button = parent.createEl("button", {
      cls: "time-manager__button",
      text: label
    });
    button.type = "button";
    button.toggleClass("is-active", this.activeTab === kind);
    button.addEventListener("click", () => {
      this.activeTab = kind;
      this.selectedMonthCount = "";
      this.render();
    });
  }

  private renderEntry(
    parent: HTMLElement,
    entry: CommunityLibraryEntry
  ): void {
    const card = parent.createDiv({
      cls: "time-community-library__entry"
    });

    const body = card.createDiv({
      cls: "time-community-library__entry-body"
    });

    body.createDiv({
      cls: "time-community-library__entry-title",
      text: entry.name
    });

    body.createDiv({
      cls: "time-community-library__entry-description",
      text: entry.description
    });

    const meta = [
      entry.kind === "calendar"
        ? `${entry.monthCount} months • ${entry.weekdayCount ?? 0} weekdays`
        : `${entry.monthCount} month profiles`,
      getLanguageLabel(entry.language),
	  `By ${entry.author}`,
      entry.license,
      entry.tags.length > 0 ? entry.tags.join(", ") : null
    ]
      .filter((value): value is string => Boolean(value))
      .join(" • ");

    body.createDiv({
      cls: "time-community-library__entry-meta",
      text: meta
    });

    const button = card.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: this.installingId === entry.id ? "Installing…" : "Install"
    });
    button.type = "button";
    button.disabled = this.installingId !== null;

    button.addEventListener("click", () => {
      void this.install(entry);
    });
  }

  private async install(entry: CommunityLibraryEntry): Promise<void> {
    this.installingId = entry.id;
    this.render();

    try {
      await this.plugin.installCommunityLibraryEntry(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not install "${entry.name}": ${message}`);
    } finally {
      this.installingId = null;
      this.render();
    }
  }

  private getAvailableMonthCounts(): number[] {
    if (!this.index) {
      return [];
    }

    return [...new Set(
      this.index.entries
        .filter((entry) => entry.kind === this.activeTab)
        .map((entry) => entry.monthCount)
    )].sort((left, right) => left - right);
  }
  
  private getAvailableLanguages(): string[] {
    if (!this.index) {
      return [];
    }

    return [...new Set(
      this.index.entries
        .filter((entry) => entry.kind === this.activeTab)
        .map((entry) => entry.language)
    )].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" })
    );
  }

  private getVisibleEntries(): CommunityLibraryEntry[] {
    if (!this.index) {
      return [];
    }

    const normalizedQuery = this.query.trim().toLowerCase();
    const monthCount =
      this.selectedMonthCount.length > 0
        ? Number(this.selectedMonthCount)
        : null;

    return this.index.entries
      .filter((entry) => entry.kind === this.activeTab)
      .filter((entry) =>
        this.selectedLanguage.length === 0 ||
        entry.language === this.selectedLanguage
      )
      .filter((entry) =>
        monthCount === null || entry.monthCount === monthCount
      )
      .filter((entry) => {
        if (normalizedQuery.length === 0) {
          return true;
        }

        return [
          entry.name,
          entry.description,
          entry.author,
          entry.license,
          ...entry.tags
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {
          sensitivity: "base"
        })
      );
  }
}

const LANGUAGE_LABELS: Record<string, string> = {
    de: "Deutsch",
    en: "English",
    fr: "Français",
    es: "Español",
    it: "Italiano",
    pt: "Português",
    "pt-BR": "Português (Brasil)",
    nl: "Nederlands",
    pl: "Polski",
    sv: "Svenska",
    no: "Norsk",
    da: "Dansk",
    fi: "Suomi",
    ja: "日本語",
    ko: "한국어",
    zh: "中文"
};

type DisplayNamesLike = {
  of(code: string): string | undefined;
};

type IntlWithDisplayNames = typeof Intl & {
  DisplayNames?: new (
    locales: string | string[],
    options: { type: "language" }
  ) => DisplayNamesLike;
};

function getLanguageLabel(language: string): string {
  const normalized = language.trim();

  if (normalized.length === 0) {
    return language;
  }

  const knownLabel = LANGUAGE_LABELS[normalized];
  if (knownLabel) {
    return knownLabel;
  }

  const DisplayNames = (Intl as IntlWithDisplayNames).DisplayNames;

  if (!DisplayNames) {
    return normalized;
  }

  try {
    const nativeNames = new DisplayNames([normalized], {
      type: "language"
    });

    return nativeNames.of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}