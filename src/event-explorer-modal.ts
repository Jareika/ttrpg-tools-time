import { Modal } from "obsidian";
import { formatLongDate } from "./calendar";
import { chooseDeleteEventMode } from "./delete-event-modal";
import type TtrpgToolsTimePlugin from "./main";
import type {
  CalendarEventDefinition,
  CalendarFile
} from "./types";

export class EventExplorerModal extends Modal {
  private filterText = "";
  private selectedYear: number | null = null;
  private globalSearchText = "";
  private globalSearchQuery: string | null = null;
  private globalSearchResults: CalendarEventDefinition[] | null = null;
  private isSearchingAllYears = false;

  constructor(
    private readonly plugin: TtrpgToolsTimePlugin,
    private readonly calendar: CalendarFile
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    prepareFlexibleModal(this);
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    const years = await this.plugin.listEventExplorerYears(this.calendar.id);
	const showingGlobalResults = this.globalSearchQuery !== null;

    if (years.length === 0) {
      this.selectedYear = this.calendar.state.cursorDate.year;
    } else if (this.selectedYear === null || !years.includes(this.selectedYear)) {
      this.selectedYear =
        years.includes(this.calendar.state.cursorDate.year)
          ? this.calendar.state.cursorDate.year
          : years[0] ?? this.calendar.state.cursorDate.year;
    }

    const eventYear =
      !showingGlobalResults && this.selectedYear !== null
        ? await this.plugin.loadEventYear(this.calendar.id, this.selectedYear)
        : null;

    const baseEvents = showingGlobalResults
      ? (this.globalSearchResults ?? [])
      : (eventYear?.events ?? []);

    clearEl(contentEl);
    contentEl.addClass("time-modal", "time-event-explorer");

    contentEl.createEl("h2", {
      text: `Event explorer • ${this.calendar.name}`
    });

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Search events and manage them per year."
    });
	
    const globalSearchRow = contentEl.createDiv({ cls: "time-event-explorer__search-row" });

    const globalSearchField = globalSearchRow.createDiv({ cls: "time-event-explorer__field" });
    globalSearchField.createEl("label", {
      cls: "time-event-explorer__label",
      text: "Search all years"
    });
    const globalSearchInput = globalSearchField.createEl("input", {
      cls: "time-event-editor__input"
    });
    globalSearchInput.type = "text";
    globalSearchInput.placeholder = "Event name across all years";
    globalSearchInput.value = this.globalSearchText;
    globalSearchInput.addEventListener("input", () => {
      this.globalSearchText = globalSearchInput.value;
    });
    globalSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this.runGlobalSearch();
      }
    });

    const globalSearchButton = globalSearchRow.createEl("button", {
      cls: "time-manager__button mod-cta",
      text: this.isSearchingAllYears ? "Searching..." : "Search"
    });
    globalSearchButton.type = "button";
    globalSearchButton.disabled = this.isSearchingAllYears;
    globalSearchButton.addEventListener("click", () => {
      void this.runGlobalSearch();
    });

    if (showingGlobalResults) {
      const clearGlobalSearchButton = globalSearchRow.createEl("button", {
        cls: "time-manager__button",
        text: "Clear"
      });
      clearGlobalSearchButton.type = "button";
      clearGlobalSearchButton.addEventListener("click", () => {
        this.globalSearchText = "";
        this.globalSearchQuery = null;
        this.globalSearchResults = null;
        void this.render();
      });
    }

    const controls = contentEl.createDiv({ cls: "time-event-explorer__controls" });

    const searchField = controls.createDiv({ cls: "time-event-explorer__field" });
    searchField.createEl("label", {
      cls: "time-event-explorer__label",
      text: "Filter current results"
    });
    const searchInput = searchField.createEl("input", {
      cls: "time-event-editor__input"
    });
    searchInput.type = "text";
    searchInput.placeholder = "Event title or description";
    searchInput.value = this.filterText;

    const yearField = controls.createDiv({ cls: "time-event-explorer__field" });
    yearField.createEl("label", {
      cls: "time-event-explorer__label",
      text: "Year"
    });
    const yearSelect = yearField.createEl("select", {
      cls: "time-event-editor__input"
    });

    years.forEach((year) => {
      const option = yearSelect.ownerDocument.createElement("option");
      option.value = String(year);
      option.text = String(year);
      option.selected = year === this.selectedYear;
      yearSelect.add(option);
    });

    yearSelect.value = String(this.selectedYear ?? this.calendar.state.cursorDate.year);
	yearSelect.disabled = showingGlobalResults;
    yearSelect.addEventListener("change", () => {
      this.selectedYear = Math.trunc(Number(yearSelect.value) || this.calendar.state.cursorDate.year);
      void this.render();
    });
	
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: showingGlobalResults
        ? `Global search active: "${this.globalSearchQuery ?? ""}" • ${baseEvents.length} result${baseEvents.length === 1 ? "" : "s"} across all years.`
        : `Showing events for year ${this.selectedYear ?? this.calendar.state.cursorDate.year}.`
    });

    const listHost = contentEl.createDiv({ cls: "time-event-explorer__list" });

    const renderList = (): void => {
      const query = this.filterText.trim().toLowerCase();
      const filteredEvents = baseEvents.filter((event) => matchesSearch(event, query));
      this.renderEventList(listHost, filteredEvents);
    };

    searchInput.addEventListener("input", () => {
      this.filterText = searchInput.value;
      renderList();
    });

    renderList();

    const footer = contentEl.createDiv({ cls: "time-modal__footer" });
    const closeButton = footer.createEl("button", {
      cls: "time-manager__button",
      text: "Close"
    });
    closeButton.type = "button";
    closeButton.addEventListener("click", () => this.close());
  }

  private renderEventList(
    parent: HTMLElement,
    events: CalendarEventDefinition[]
  ): void {
    clearEl(parent);

    if (events.length === 0) {
      parent.createDiv({
        cls: "time-manager__empty",
        text: "No matching events found."
      });
      return;
    }

    events.forEach((event) => {
      const row = parent.createDiv({ cls: "time-event-explorer__item" });

      const body = row.createDiv({ cls: "time-event-explorer__body" });
      body.createDiv({
        cls: "time-event-explorer__title",
        text: event.title
      });
      body.createDiv({
        cls: "time-event-explorer__date",
        text: buildEventDateLabel(this.calendar, event)
      });

      const actions = row.createDiv({ cls: "time-event-explorer__actions" });

      const editButton = actions.createEl("button", {
        cls: "time-manager__button",
        text: "Edit"
      });
      editButton.type = "button";
      editButton.addEventListener("click", () => {

        void this.plugin.activateEventEditorForEvent(
          this.calendar.id,
          event.date.year,
          event.id
        );
        this.close();
      });

      const deleteButton = actions.createEl("button", {
        cls: "time-manager__button",
        text: "Delete"
      });
      deleteButton.type = "button";
      deleteButton.addEventListener("click", () => {
        void this.deleteEvent(event);
      });
    });
  }

  private async deleteEvent(event: CalendarEventDefinition): Promise<void> {

    const deleteMode = await chooseDeleteEventMode(this.app, {
      title: "Delete event",
      eventTitle: event.title,
      occurrenceLabel: buildEventDateLabel(this.calendar, event),
      recurring: Boolean(event.recurrence)
    });

    if (!deleteMode) {
      return;
    }

    const deleted = await this.plugin.deleteEventById(
      this.calendar.id,
      event.date.year,
      event.id,
      deleteMode,
      event.date
    );

    if (deleted) {
      await this.render();
    }
  }

  private async runGlobalSearch(): Promise<void> {
    const query = this.globalSearchText.trim();

    if (query.length === 0) {
      this.globalSearchQuery = null;
      this.globalSearchResults = null;
      await this.render();
      return;
    }

    this.isSearchingAllYears = true;
    await this.render();

    try {
      const allEvents = await this.plugin.loadTimelineEvents(this.calendar.id);
      const normalizedQuery = query.toLowerCase();

      this.globalSearchResults = allEvents.filter((event) =>
        matchesGlobalNameSearch(event, normalizedQuery)
      );
      this.globalSearchQuery = query;
    } finally {
      this.isSearchingAllYears = false;
      await this.render();
    }
  }
}

function buildEventDateLabel(
  calendar: CalendarFile,
  event: CalendarEventDefinition
): string {
  const start = formatLongDate(event.date, calendar.definition);

  if (!event.endDate) {
    return start;
  }

  const end = formatLongDate(event.endDate, calendar.definition);
  return start === end ? start : `${start} → ${end}`;
}

function matchesSearch(
  event: CalendarEventDefinition,
  query: string
): boolean {
  if (query.length === 0) {
    return true;
  }

  const haystack = [
    event.title,
    event.description ?? ""
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesGlobalNameSearch(
  event: CalendarEventDefinition,
  query: string
): boolean {
  return event.title.toLowerCase().includes(query);
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