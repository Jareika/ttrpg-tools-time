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
  rowSpan: number;
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

interface ColumnState {
  tail: number;
}

interface RowState {
  tail: number;
}

const MAX_LAYOUT_PASSES = 64;

export function buildTimelineGridLayout<T>(
  source: TimelineGridSource<T>[],
  preferredRows = 2
): TimelineGridLayout<T> {
  if (source.length === 0) {
    return {
      placements: [],
      columnCount: 0,
      rowCount: 2
    };
  }

  const rowCount = normalizeRowCount(preferredRows);
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
	rowSpan: 1,
    isRange: isRangeDate(entry.start, entry.end),
    sourceIndex: entry.sourceIndex
  }));

  const rows: RowState[] = Array.from(
    { length: rowCount },
    () => ({ tail: 0 })
  );

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
    rowCount
  };
}

export function buildVerticalTimelineGridLayout<T>(
  source: TimelineGridSource<T>[],
  preferredColumns = 2
): TimelineGridLayout<T> {
  if (source.length === 0) {
    return {
      placements: [],
      columnCount: 2,
      rowCount: 0
    };
  }

  const columnCount = normalizeRowCount(preferredColumns);
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
    columnSpan: 1,
    rowSpan: isRangeDate(entry.start, entry.end) ? 2 : 1,
    isRange: isRangeDate(entry.start, entry.end),
    sourceIndex: entry.sourceIndex
  }));

  const columns: ColumnState[] = Array.from(
    { length: columnCount },
    () => ({ tail: 0 })
  );

  resolveVerticalGridLayout(drafts, columns);

  const rowCount = Math.max(
    1,
    ...drafts.map((placement) => placement.row + placement.rowSpan)
  );

  return {
    placements: drafts
      .sort((left, right) => left.sourceIndex - right.sourceIndex)
      .map(({ sourceIndex: _sourceIndex, ...placement }) => placement),
    columnCount,
    rowCount
  };
}

function resolveVerticalGridLayout<T>(
  drafts: DraftPlacement<T>[],
  columns: ColumnState[]
): void {
  for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass += 1) {
    assignColumns(drafts, columns);

    const didRangeSpanChange = updateVerticalRangeSpans(drafts);

    if (!didRangeSpanChange) {
      return;
    }
  }

  assignColumns(drafts, columns);
}

function assignColumns<T>(
  drafts: DraftPlacement<T>[],
  columns: ColumnState[]
): void {
  columns.splice(
    0,
    columns.length,
    ...Array.from({ length: columns.length }, () => ({ tail: 0 }))
  );

  drafts.forEach((placement) => {
    const columnIndex = chooseMostCompactColumn(columns);
    const column = columns[columnIndex];

    placement.column = columnIndex;
    placement.row = column.tail;
    column.tail += placement.rowSpan;
  });
}

function updateVerticalRangeSpans<T>(
  drafts: DraftPlacement<T>[]
): boolean {
  let changed = false;

  drafts.forEach((target) => {
    if (!target.isRange) {
      return;
    }

    const nextSpan = getRequiredVerticalRangeSpan(target, drafts);

    if (target.rowSpan !== nextSpan) {
      target.rowSpan = nextSpan;
      changed = true;
    }
  });

  return changed;
}

function getRequiredVerticalRangeSpan<T>(
  target: DraftPlacement<T>,
  drafts: DraftPlacement<T>[]
): number {
  const minimumBottomEdge = target.row + 2;

  const lowestCoveredEdge = drafts.reduce((lowestEdge, candidate) => {
    const overlapsTarget =
      candidate !== target &&
      candidate.column !== target.column &&
      dateRangesOverlap(
        target.start,
        target.end,
        candidate.start,
        candidate.end
      );

    if (!overlapsTarget) {
      return lowestEdge;
    }

    return Math.max(
      lowestEdge,
      candidate.row + candidate.rowSpan
    );
  }, minimumBottomEdge);

  return Math.max(2, lowestCoveredEdge - target.row);
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
  const rowCount = normalizeRowCount(rows.length);

  rows.splice(
    0,
    rows.length,
    ...Array.from({ length: rowCount }, () => ({ tail: 0 }))
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
  return chooseMostCompactRow(
    rows,
    Array.from({ length: rows.length }, (_entry, index) => index)
  );
}

function chooseMostCompactColumn(
  columns: ColumnState[]
): number {
  return columns.reduce((best, candidate, index) => {
    const bestTail = columns[best]?.tail ?? Number.MAX_SAFE_INTEGER;

    if (candidate.tail !== bestTail) {
      return candidate.tail < bestTail ? index : best;
    }

    return index < best ? index : best;
  }, 0);
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

function normalizeRowCount(value: number): 2 | 3 | 4 {
  if (value === 3 || value === 4) {
    return value;
  }

  return 2;
}