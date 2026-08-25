import { requestUrl } from "obsidian";

export type CommunityLibraryEntryKind = "calendar" | "weather-pack";

export interface CommunityLibraryEntry {
  id: string;
  kind: CommunityLibraryEntryKind;
  name: string;
  description: string;
  author: string;
  license: string;
  language: string;
  tags: string[];
  monthCount: number;
  weekdayCount?: number;
  fileUrl: string;
  assets: CommunityLibraryAsset[];
}

export interface CommunityLibraryAsset {
  ref: string;
  fileUrl: string;
}

export interface CommunityLibraryIndex {
  schemaVersion: 1;
  sourceUrl: string;
  entries: CommunityLibraryEntry[];
}

const MAX_INDEX_LENGTH = 2_000_000;
const MAX_ITEM_LENGTH = 5_000_000;
const MAX_ASSET_LENGTH = 10_000_000;
const MAX_ASSETS_PER_ENTRY = 64;

export async function loadCommunityLibraryIndex(
  indexUrl: string
): Promise<CommunityLibraryIndex> {
  const sourceUrl = normalizeHttpsUrl(indexUrl);
  const raw = await requestJson(sourceUrl, MAX_INDEX_LENGTH);
  const record = asRecord(raw);

  if (record.schemaVersion !== 1) {
    throw new Error("Unsupported community-library index schema.");
  }

  if (!Array.isArray(record.entries)) {
    throw new Error('The community-library index has no "entries" array.');
  }

  const entries = record.entries.map((entry, index) =>
    normalizeEntry(entry, index, sourceUrl)
  );

  return {
    schemaVersion: 1,
    sourceUrl,
    entries
  };
}

export async function downloadCommunityLibraryEntry(
  entry: CommunityLibraryEntry
): Promise<unknown> {
  return await requestJson(entry.fileUrl, MAX_ITEM_LENGTH);
}

export async function downloadCommunityLibraryAsset(
  asset: CommunityLibraryAsset
): Promise<ArrayBuffer> {
  const response = await requestUrl({
    url: asset.fileUrl,
    method: "GET"
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Asset download failed with HTTP ${response.status}.`);
  }

  if (response.arrayBuffer.byteLength > MAX_ASSET_LENGTH) {
    throw new Error("Downloaded asset is too large.");
  }

  return response.arrayBuffer;
}

async function requestJson(url: string, maxLength: number): Promise<unknown> {
  const response = await requestUrl({
    url,
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }

  if (response.text.length > maxLength) {
    throw new Error("Downloaded file is too large.");
  }

  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    throw new Error("Downloaded file is not valid JSON.");
  }
}

function normalizeEntry(
  raw: unknown,
  index: number,
  sourceUrl: string
): CommunityLibraryEntry {
  const record = asRecord(raw);
  const kind = readKind(record.kind);

  const entry: CommunityLibraryEntry = {
    id: readRequiredString(record.id, index, "id"),
    kind,
    name: readRequiredString(record.name, index, "name"),
    description: readRequiredString(record.description, index, "description"),
    author: readRequiredString(record.author, index, "author"),
    license: readRequiredString(record.license, index, "license"),
	language: readLanguage(record.language, index),
    tags: readStringArray(record.tags),
    monthCount: readNonNegativeInteger(record.monthCount, index, "monthCount"),
    fileUrl: resolveHttpsUrl(
      readRequiredString(record.file, index, "file"),
      sourceUrl
    ),
    assets: readAssets(record.assets, index, sourceUrl)
  };

  if (kind === "calendar") {
    entry.weekdayCount = readPositiveInteger(
      record.weekdayCount,
      index,
      "weekdayCount"
    );
  }

  return entry;
}

function readLanguage(value: unknown, index: number): string {
  if (
    typeof value !== "string" ||
    !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(value.trim())
  ) {
    throw new Error(
      `Library entry ${index + 1} has no valid "language" code.`
    );
  }

  return value.trim();
}

function readAssets(
  value: unknown,
  index: number,
  sourceUrl: string
): CommunityLibraryAsset[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Library entry ${index + 1} has invalid "assets".`);
  }

  if (value.length > MAX_ASSETS_PER_ENTRY) {
    throw new Error(`Library entry ${index + 1} contains too many assets.`);
  }

  const byRef = new Map<string, CommunityLibraryAsset>();

  value.forEach((rawAsset, assetIndex) => {
    const record = asRecord(rawAsset);
    const ref = readRequiredString(
      record.ref,
      index,
      `assets[${assetIndex}].ref`
    );
    const file = readRequiredString(
      record.file,
      index,
      `assets[${assetIndex}].file`
    );

    if (byRef.has(ref)) {
      throw new Error(
        `Library entry ${index + 1} contains duplicate asset ref "${ref}".`
      );
    }

    byRef.set(ref, {
      ref,
      fileUrl: resolveHttpsUrl(file, sourceUrl)
    });
  });

  return [...byRef.values()];
}

function readKind(value: unknown): CommunityLibraryEntryKind {
  if (value === "calendar" || value === "weather-pack") {
    return value;
  }

  throw new Error('Library entry kind must be "calendar" or "weather-pack".');
}

function readRequiredString(
  value: unknown,
  index: number,
  field: string
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Library entry ${index + 1} has no valid "${field}".`);
  }

  return value.trim();
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  )];
}

function readNonNegativeInteger(
  value: unknown,
  index: number,
  field: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.trunc(value) < 0
  ) {
    throw new Error(`Library entry ${index + 1} has no valid "${field}".`);
  }

  return Math.trunc(value);
}

function readPositiveInteger(
  value: unknown,
  index: number,
  field: string
): number {
  const parsed = readNonNegativeInteger(value, index, field);

  if (parsed < 1) {
    throw new Error(`Library entry ${index + 1} needs "${field}" greater than 0.`);
  }

  return parsed;
}

function resolveHttpsUrl(value: string, baseUrl: string): string {
  try {
    const url = new URL(value, baseUrl);

    if (url.protocol !== "https:") {
      throw new Error("Only HTTPS URLs are allowed.");
    }

    return url.toString();
  } catch {
    throw new Error(`Invalid HTTPS URL: "${value}".`);
  }
}

function normalizeHttpsUrl(value: string): string {
  if (value.trim().length === 0) {
    throw new Error("No community-library index URL is configured.");
  }

  return resolveHttpsUrl(value, value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}