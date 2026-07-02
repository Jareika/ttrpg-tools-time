import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import {
  cloneCalendarFile,
  normalizeCalendarFile,
  normalizeTagPackFile,
  slugify
} from "./calendar";
import {
  normalizeCalendarEventDefinition,
  normalizeEventIndexYearFile,
  normalizeEventRecurrenceIndexFile,
  normalizeEventPresetFile,
  normalizeEventYearFile
} from "./events";
import {
  normalizeWeatherPackFile,
  normalizeWeatherReferenceYearFile,
  normalizeWeatherYearFile
} from "./weather";
import type {
  CalendarEventDefinition,
  CalendarFile,
  EventIndexYearFile,
  EventRecurrenceIndexFile,
  EventPresetFile,
  EventYearFile,
  TagPackFile,
  TtrpgToolsTimeSettings,
  WeatherPackFile,
  WeatherReferenceYearFile,
  WeatherYearFile
} from "./types";

export class TimeDataStore {
  constructor(
    private readonly app: App,
    private readonly getSettings: () => TtrpgToolsTimeSettings
  ) {}

  get baseFolder(): string {
    return normalizeStoragePath(this.getSettings().dataFolder);
  }

  get calendarsFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/calendars`);
  }

  get tagPacksFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/tag-packs`);
  }

  get weatherPacksFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/weather-packs`);
  }

  get weatherReferenceFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/weather-reference`);
  }

  get weatherDayViewFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/weather-dayview`);
  }

  get eventIndexFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/event-index`);
  }
  
  get eventSourceFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/event-source`);
  }

  get eventDetailsFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/event-details`);
  }
  
  get eventDetailsLegacyBackupFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/event-details-legacy-backup`);
  }

  get eventPresetsFolder(): string {
    return normalizeStoragePath(`${this.baseFolder}/event-presets`);
  }

  buildEventPresetFolder(calendarId: string): string {
    return normalizeStoragePath(`${this.eventPresetsFolder}/${slugify(calendarId)}`);
  }

  async ensureBaseFolders(): Promise<void> {
    const folders = [
      this.baseFolder,
      this.calendarsFolder,
      this.tagPacksFolder,
      this.weatherPacksFolder,
      this.weatherReferenceFolder,
      this.weatherDayViewFolder,
      this.eventIndexFolder,
	  this.eventSourceFolder,
      this.eventDetailsFolder,
	  this.eventDetailsLegacyBackupFolder,
      this.eventPresetsFolder
    ];

    for (const folder of folders) {
      await ensureFolder(this.app, folder);
    }
  }

  async listCalendars(): Promise<CalendarFile[]> {
    const calendars = await this.readFolderFiles(this.calendarsFolder, normalizeCalendarFile);
    return calendars.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );
  }

  async listTagPacks(): Promise<TagPackFile[]> {
    const packs = await this.readFolderFiles(this.tagPacksFolder, normalizeTagPackFile);
    return packs.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );
  }

  async listWeatherPacks(): Promise<WeatherPackFile[]> {
    const packs = await this.readFolderFiles(this.weatherPacksFolder, normalizeWeatherPackFile);
    return packs.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );
  }
  
  async listWeatherReferenceYears(
    calendarId: string,
    weatherPackId: string
  ): Promise<number[]> {
    const folderPath = normalizeStoragePath(
      `${this.weatherReferenceFolder}/${slugify(calendarId)}/${slugify(weatherPackId)}`
    );
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) {
      return [];
    }

    return folder.children
      .filter((child): child is TFile => child instanceof TFile && child.extension === "json")
      .map((file) => Number.parseInt(file.basename, 10))
      .filter((year) => Number.isFinite(year))
      .sort((left, right) => left - right);
  }
  
  async listEventYears(calendarId: string): Promise<number[]> {
    const folderPath = normalizeStoragePath(
      `${this.eventDetailsFolder}/${slugify(calendarId)}`
    );
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) {
      return [];
    }

    return folder.children
      .filter((child): child is TFile => child instanceof TFile && child.extension === "json")
      .map((file) => Number.parseInt(file.basename, 10))
      .filter((year) => Number.isFinite(year))
      .sort((left, right) => left - right);
  }

  async listEventPresets(calendarId: string): Promise<EventPresetFile[]> {
    const presets = await this.readFolderFiles(
      this.buildEventPresetFolder(calendarId),
      normalizeEventPresetFile
    );
    return presets.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );
  }
  
  async listEventSources(calendarId: string): Promise<CalendarEventDefinition[]> {
    const events = await this.readFolderFiles(
      this.buildEventSourceFolder(calendarId),
      normalizeCalendarEventDefinition
    );

    return events.sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
    );
  }
  
  async hasLegacyEventMigrationMarker(calendarId: string): Promise<boolean> {
    return await this.exists(this.buildLegacyEventMigrationMarkerPath(calendarId));
  }

  async saveLegacyEventMigrationMarker(
    calendarId: string,
    meta?: {
      migratedAt?: string;
      sourceCount?: number;
      legacyYears?: number[];
    }
  ): Promise<void> {
    const path = this.buildLegacyEventMigrationMarkerPath(calendarId);
    await this.writeJson(path, {
      version: 1,
      kind: "legacy-event-migration-marker",
      calendarId,
      migratedAt: meta?.migratedAt ?? new Date().toISOString(),
      sourceCount: Math.max(0, Math.trunc(meta?.sourceCount ?? 0)),
      legacyYears: [...new Set(meta?.legacyYears ?? [])].sort((left, right) => left - right)
    });
  }

  async loadCalendarById(id: string): Promise<CalendarFile | null> {
    const path = this.buildCalendarPath(id);
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (!(existing instanceof TFile)) {
      return null;
    }

    return normalizeCalendarFile(await this.readJson(existing));
  }

  async loadWeatherPackById(id: string): Promise<WeatherPackFile | null> {
    const path = this.buildWeatherPackPath(id);
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (!(existing instanceof TFile)) {
      return null;
    }

    return normalizeWeatherPackFile(await this.readJson(existing));
  }

  async saveCalendar(calendar: CalendarFile): Promise<void> {
    const normalized = normalizeCalendarFile(calendar);
    const path = this.buildCalendarPath(normalized.id);
    await this.writeJson(path, cloneCalendarFile(normalized));
  }

  async saveTagPack(pack: TagPackFile): Promise<void> {
    const normalized = normalizeTagPackFile(pack);
    const path = this.buildTagPackPath(normalized.id);
    await this.writeJson(path, normalized);
  }

  async saveWeatherPack(pack: WeatherPackFile): Promise<void> {
    const normalized = normalizeWeatherPackFile(pack);
    const path = this.buildWeatherPackPath(normalized.id);
    await this.writeJson(path, normalized);
  }

  async saveEventPreset(preset: EventPresetFile): Promise<void> {
    const normalized = normalizeEventPresetFile(preset);
    const folder = this.buildEventPresetFolder(normalized.calendarId);
    await ensureFolder(this.app, folder);
    const path = this.buildEventPresetPath(normalized.calendarId, normalized.id);
    await this.writeJson(path, normalized);
  }
  
  async loadEventSource(calendarId: string, eventId: string): Promise<CalendarEventDefinition | null> {
    const path = this.buildEventSourcePath(calendarId, eventId);
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (!(existing instanceof TFile)) {
      return null;
    }

    return normalizeCalendarEventDefinition(await this.readJson(existing));
  }

  async saveEventSource(event: CalendarEventDefinition): Promise<void> {
    const normalized = normalizeCalendarEventDefinition(event);
    const folder = this.buildEventSourceFolder(normalized.calendarId);
    await ensureFolder(this.app, folder);
    const path = this.buildEventSourcePath(normalized.calendarId, normalized.id);
    await this.writeJson(path, normalized);
  }

  async loadEventYear(calendarId: string, year: number): Promise<EventYearFile | null> {
    const path = this.buildEventYearPath(calendarId, year);
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (!(existing instanceof TFile)) {
      return null;
    }

    return normalizeEventYearFile(await this.readJson(existing));
  }

  async saveEventYear(file: EventYearFile): Promise<void> {
    const normalized = normalizeEventYearFile(file);
    const folder = normalizeStoragePath(`${this.eventDetailsFolder}/${slugify(normalized.calendarId)}`);
    await ensureFolder(this.app, folder);
    const path = this.buildEventYearPath(normalized.calendarId, normalized.year);
    await this.writeJson(path, normalized);
  }

  async loadEventIndexYear(calendarId: string, year: number): Promise<EventIndexYearFile | null> {
    const path = this.buildEventIndexYearPath(calendarId, year);
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (!(existing instanceof TFile)) {
      return null;
    }

    return normalizeEventIndexYearFile(await this.readJson(existing));
  }
  
  async loadEventRecurrenceIndex(calendarId: string): Promise<EventRecurrenceIndexFile | null> {
    const path = this.buildEventRecurrenceIndexPath(calendarId);
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (!(existing instanceof TFile)) {
      return null;
    }

    return normalizeEventRecurrenceIndexFile(await this.readJson(existing));
  }

  async saveEventIndexYear(file: EventIndexYearFile): Promise<void> {
    const normalized = normalizeEventIndexYearFile(file);
    const folder = normalizeStoragePath(`${this.eventIndexFolder}/${slugify(normalized.calendarId)}`);
    await ensureFolder(this.app, folder);
    const path = this.buildEventIndexYearPath(normalized.calendarId, normalized.year);
    await this.writeJson(path, normalized);
  }
  
  async saveEventRecurrenceIndex(file: EventRecurrenceIndexFile): Promise<void> {
    const normalized = normalizeEventRecurrenceIndexFile(file);
    const folder = normalizeStoragePath(`${this.eventIndexFolder}/${slugify(normalized.calendarId)}`);
    await ensureFolder(this.app, folder);
    const path = this.buildEventRecurrenceIndexPath(normalized.calendarId);
    await this.writeJson(path, normalized);
  }

  async loadWeatherReferenceYear(
    calendarId: string,
    weatherPackId: string,
    year: number
  ): Promise<WeatherReferenceYearFile | null> {
    const path = this.buildWeatherReferenceYearPath(calendarId, weatherPackId, year);
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (!(existing instanceof TFile)) {
      return null;
    }

    return normalizeWeatherReferenceYearFile(await this.readJson(existing));
  }

  async saveWeatherReferenceYear(file: WeatherReferenceYearFile): Promise<void> {
    const normalized = normalizeWeatherReferenceYearFile(file);
    const folder = normalizeStoragePath(
      `${this.weatherReferenceFolder}/${slugify(normalized.calendarId)}/${slugify(normalized.weatherPackId)}`
    );
    await ensureFolder(this.app, folder);
    const path = this.buildWeatherReferenceYearPath(
      normalized.calendarId,
      normalized.weatherPackId,
      normalized.year
    );
    await this.writeJson(path, normalized);
  }

  async loadWeatherYear(calendarId: string, year: number): Promise<WeatherYearFile | null> {
    const path = this.buildWeatherYearPath(calendarId, year);
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (!(existing instanceof TFile)) {
      return null;
    }

    return normalizeWeatherYearFile(await this.readJson(existing));
  }

  async saveWeatherYear(file: WeatherYearFile): Promise<void> {
    const normalized = normalizeWeatherYearFile(file);
    const folder = normalizeStoragePath(`${this.weatherDayViewFolder}/${slugify(normalized.calendarId)}`);
    await ensureFolder(this.app, folder);
    const path = this.buildWeatherYearPath(normalized.calendarId, normalized.year);
    await this.writeJson(path, normalized);
  }

  async calendarExists(id: string): Promise<boolean> {
    return await this.exists(this.buildCalendarPath(id));
  }

  async tagPackExists(id: string): Promise<boolean> {
    return await this.exists(this.buildTagPackPath(id));
  }

  async weatherPackExists(id: string): Promise<boolean> {
    return await this.exists(this.buildWeatherPackPath(id));
  }

  buildCalendarPath(id: string): string {
    return normalizeStoragePath(`${this.calendarsFolder}/${slugify(id)}.calendar.json`);
  }

  buildTagPackPath(id: string): string {
    return normalizeStoragePath(`${this.tagPacksFolder}/${slugify(id)}.tags.json`);
  }

  buildWeatherPackPath(id: string): string {
    return normalizeStoragePath(`${this.weatherPacksFolder}/${slugify(id)}.weather-pack.json`);
  }

  buildWeatherReferenceYearPath(calendarId: string, weatherPackId: string, year: number): string {
    return normalizeStoragePath(
      `${this.weatherReferenceFolder}/${slugify(calendarId)}/${slugify(weatherPackId)}/${Math.trunc(year)}.reference.json`
    );
  }

  buildWeatherYearPath(calendarId: string, year: number): string {
    return normalizeStoragePath(
      `${this.weatherDayViewFolder}/${slugify(calendarId)}/${Math.trunc(year)}.weather.json`
    );
  }

  buildEventYearPath(calendarId: string, year: number): string {
    return normalizeStoragePath(
      `${this.eventDetailsFolder}/${slugify(calendarId)}/${Math.trunc(year)}.events.json`
    );
  }
  
  buildEventSourceFolder(calendarId: string): string {
    return normalizeStoragePath(`${this.eventSourceFolder}/${slugify(calendarId)}`);
  }
  
  buildLegacyEventDetailsFolder(calendarId: string): string {
    return normalizeStoragePath(`${this.eventDetailsFolder}/${slugify(calendarId)}`);
  }

  buildLegacyEventDetailsBackupFolder(calendarId: string, suffix?: string): string {
    const baseName = slugify(calendarId);
    const safeSuffix = suffix?.trim().length ? `-${suffix.trim()}` : "";
    return normalizeStoragePath(
      `${this.eventDetailsLegacyBackupFolder}/${baseName}${safeSuffix}`
    );
  }
  
  buildLegacyEventMigrationMarkerPath(calendarId: string): string {
    return normalizeStoragePath(
      `${this.eventSourceFolder}/.${slugify(calendarId)}.legacy-migrated.json`
    );
  }

  buildEventSourcePath(calendarId: string, id: string): string {
    return normalizeStoragePath(
      `${this.buildEventSourceFolder(calendarId)}/${slugify(id)}.event.json`
    );
  }

  buildEventIndexYearPath(calendarId: string, year: number): string {
    return normalizeStoragePath(
      `${this.eventIndexFolder}/${slugify(calendarId)}/${Math.trunc(year)}.index.json`
    );
  }
  
  buildEventRecurrenceIndexPath(calendarId: string): string {
    return normalizeStoragePath(
      `${this.eventIndexFolder}/${slugify(calendarId)}/recurrence.index.json`
    );
  }

  buildEventPresetPath(calendarId: string, id: string): string {
    return normalizeStoragePath(
      `${this.buildEventPresetFolder(calendarId)}/${slugify(id)}.preset.json`
    );
  }

  async deleteCalendar(id: string): Promise<void> {
    await this.deleteFileIfPresent(this.buildCalendarPath(id));
  }

  async deleteTagPack(id: string): Promise<void> {
    await this.deleteFileIfPresent(this.buildTagPackPath(id));
  }

  async deleteWeatherPack(id: string): Promise<void> {
    await this.deleteFileIfPresent(this.buildWeatherPackPath(id));
  }
  
  async deleteEventSource(calendarId: string, eventId: string): Promise<void> {
    await this.deleteFileIfPresent(this.buildEventSourcePath(calendarId, eventId));
  }

  async deleteEventIndexYear(calendarId: string, year: number): Promise<void> {
    await this.deleteFileIfPresent(this.buildEventIndexYearPath(calendarId, year));
  }
  
  async deleteEventRecurrenceIndex(calendarId: string): Promise<void> {
    await this.deleteFileIfPresent(this.buildEventRecurrenceIndexPath(calendarId));
  }
  
  async moveLegacyEventDetailsFolderToBackup(calendarId: string): Promise<string | null> {
    const sourcePath = this.buildLegacyEventDetailsFolder(calendarId);
    const source = this.app.vault.getAbstractFileByPath(sourcePath);

    if (!(source instanceof TFolder)) {
      return null;
    }

    await ensureFolder(this.app, this.eventDetailsLegacyBackupFolder);

    const preferredTargetPath = this.buildLegacyEventDetailsBackupFolder(
      calendarId,
      buildBackupTimestamp()
    );
    const targetPath = await this.buildAvailableFolderPath(preferredTargetPath);

    await this.app.vault.rename(source, targetPath);
    return targetPath;
  }

  private async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(path) !== null;
  }

  private async readFolderFiles<T>(
    folderPath: string,
    normalize: (raw: unknown) => T
  ): Promise<T[]> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) {
      return [];
    }

    const results: T[] = [];

    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "json") {
        continue;
      }

      try {
        results.push(normalize(await this.readJson(child)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        new Notice(`Fehler beim Lesen von ${child.path}: ${message}`);
      }
    }

    return results;
  }

  private async readJson(file: TFile): Promise<unknown> {
    return JSON.parse(await this.app.vault.cachedRead(file)) as unknown;
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, serialized);
      return;
    }

    await this.app.vault.create(path, serialized);
  }

  private async deleteFileIfPresent(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing instanceof TFile) {
      await this.app.fileManager.trashFile(existing);
    }
  }
  
  private async buildAvailableFolderPath(preferredPath: string): Promise<string> {
    if (!(await this.exists(preferredPath))) {
      return preferredPath;
    }

    let attempt = 2;

    while (attempt < 10_000) {
      const candidate = normalizeStoragePath(`${preferredPath}-${attempt}`);
      if (!(await this.exists(candidate))) {
        return candidate;
      }
      attempt += 1;
    }

    return normalizeStoragePath(`${preferredPath}-${Date.now().toString(36)}`);
  }
}

function normalizeStoragePath(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error("Time data folder path cannot be empty.");
  }

  return normalizePath(trimmed);
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizeStoragePath(folderPath);
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  let currentPath = "";

  for (const segment of segments) {
    currentPath = currentPath.length > 0 ? `${currentPath}/${segment}` : segment;
    const existing = app.vault.getAbstractFileByPath(currentPath);

    if (existing === null) {
      try {
        await app.vault.createFolder(currentPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const fileAfterError = app.vault.getAbstractFileByPath(currentPath);

        if (fileAfterError instanceof TFolder || message.toLowerCase().includes("folder already exists")) {
          continue;
        }

        throw error;
      }

      continue;
    }

    if (!(existing instanceof TFolder)) {
      throw new Error(`Path "${currentPath}" already exists and is not a folder.`);
    }
  }
}

function buildBackupTimestamp(): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const seconds = String(now.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}Z`;
}