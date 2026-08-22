import type { FantasyDate } from "./types";

export interface TimelineGridSource<T> {
  value: T;
  start: FantasyDate;
  end?: FantasyDate;
}

export interface TimelineGridPlacement<T> {
  value: T;
  start: FantasyDate;
  end: FantasyDate;
  row: number;
  column: number;
  columnSpan: number;
  isRange: boolean;
}

export interface TimelineGridLayout<T> {
  placements: TimelineGridPlacement<T>[];
  columnCount: number;
  rowCount: number;
}

interface DraftPlacement<T> extends TimelineGridPlacement<T> {
  sourceIndex: number;
}

interface RowState {
  tail: number;
}

const MAX_LAYOUT_PASSES = 64;

export function buildTimelineGridLayout<T>(
  source: TimelineGridSource<T>[]
): TimelineGridLayout<T> {
  if (source.length === 0) {
    return {
      placements: [],
      columnCount: 0,
      rowCount: 2
    };
  }

  const sorted = source
    .map((entry, sourceIndex) => ({
      value: entry.value,
      start: { ...entry.start },
      end: normalizeEndDate(entry.start, entry.end),
      sourceIndex
    }))
    .sort((left, right) => {
      const startComparison = compareFantasyDate(left.start, right.start);

      if (startComparison !== 0) {
        return startComparison;
      }

      return left.sourceIndex - right.sourceIndex;
    });

  const drafts: DraftPlacement<T>[] = sorted.map((entry) => ({
    value: entry.value,
    start: { ...entry.start },
    end: { ...entry.end },
    row: 0,
    column: 0,
    columnSpan: isRangeDate(entry.start, entry.end) ? 2 : 1,
    isRange: isRangeDate(entry.start, entry.end),
    sourceIndex: entry.sourceIndex
  }));

  const rows: RowState[] = [
    { tail: 0 },
    { tail: 0 }
  ];

  resolveGridLayout(drafts, rows);

  const columnCount = Math.max(
    1,
    ...drafts.map((placement) => placement.column + placement.columnSpan)
  );

  return {
    placements: drafts
      .sort((left, right) => left.sourceIndex - right.sourceIndex)
      .map(({ sourceIndex: _sourceIndex, ...placement }) => placement),
    columnCount,
    rowCount: Math.max(2, rows.length)
  };
}

function resolveGridLayout<T>(
  drafts: DraftPlacement<T>[],
  rows: RowState[]
): void {
  for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass += 1) {
    assignRows(drafts, rows);

    const didRangeSpanChange = updateRangeSpans(drafts);

    if (!didRangeSpanChange) {
      return;
    }
  }

  assignRows(drafts, rows);
}

function assignRows<T>(
  drafts: DraftPlacement<T>[],
  rows: RowState[]
): void {
  rows.splice(
    0,
    rows.length,
    { tail: 0 },
    { tail: 0 }
  );

  drafts.forEach((placement) => {
    const rowIndex = chooseRowForPlacement(rows);
    const row = rows[rowIndex];

    placement.row = rowIndex;
    placement.column = row.tail;
    row.tail += placement.columnSpan;
  });
}

function updateRangeSpans<T>(
  drafts: DraftPlacement<T>[]
): boolean {
  let changed = false;

  drafts.forEach((target) => {
    if (!target.isRange) {
      return;
    }

    const nextSpan = getRequiredRangeSpan(target, drafts);

    if (target.columnSpan !== nextSpan) {
      target.columnSpan = nextSpan;
      changed = true;
    }
  });

  return changed;
}

function getRequiredRangeSpan<T>(
  target: DraftPlacement<T>,
  drafts: DraftPlacement<T>[]
): number {
  const minimumRightEdge = target.column + 2;

  const rightmostCoveredEdge = drafts.reduce((rightmostEdge, candidate) => {
    const overlapsTarget =
      candidate !== target &&
      candidate.row !== target.row &&
      dateRangesOverlap(
        target.start,
        target.end,
        candidate.start,
        candidate.end
      );

    if (!overlapsTarget) {
      return rightmostEdge;
    }

    return Math.max(
      rightmostEdge,
      candidate.column + candidate.columnSpan
    );
  }, minimumRightEdge);

  return Math.max(2, rightmostCoveredEdge - target.column);
}

function chooseRowForPlacement(
  rows: RowState[]
): number {
  return chooseMostCompactRow(rows, [0, 1]);
}

function chooseMostCompactRow(
  rows: RowState[],
  candidates: number[]
): number {
  return candidates.reduce((best, candidate) => {
    const bestTail = rows[best]?.tail ?? Number.MAX_SAFE_INTEGER;
    const candidateTail =
      rows[candidate]?.tail ?? Number.MAX_SAFE_INTEGER;

    if (candidateTail !== bestTail) {
      return candidateTail < bestTail ? candidate : best;
    }

    return candidate < best ? candidate : best;
  }, candidates[0] ?? 0);
}

function normalizeEndDate(start: FantasyDate, end: FantasyDate | undefined): FantasyDate {
  if (!end || compareFantasyDate(end, start) < 0) {
    return { ...start };
  }

  return { ...end };
}

function isRangeDate(start: FantasyDate, end: FantasyDate): boolean {
  return compareFantasyDate(end, start) > 0;
}

function dateRangesOverlap(
  leftStart: FantasyDate,
  leftEnd: FantasyDate,
  rightStart: FantasyDate,
  rightEnd: FantasyDate
): boolean {
  return (
    compareFantasyDate(leftStart, rightEnd) <= 0 &&
    compareFantasyDate(rightStart, leftEnd) <= 0
  );
}

function compareFantasyDate(left: FantasyDate, right: FantasyDate): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }

  if (left.monthIndex !== right.monthIndex) {
    return left.monthIndex - right.monthIndex;
  }

  return left.day - right.day;
}