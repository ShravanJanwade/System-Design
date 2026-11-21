/**
 * Index-scan widget: what a full table scan and a B-tree index lookup each cost.
 *
 * - A scan checks rows one by one. Without an index, the database cannot know where the
 *   matching rows are, or how many there are, so in the worst case it checks all N rows.
 * - A B-tree index is a tree of pages. Each page points to about `fanOut` pages below it,
 *   so the tree has about log_fanOut(N) levels, and a lookup reads one page per level,
 *   plus one more page for the row itself.
 *
 * The constants are ballpark figures, chosen to show orders of magnitude, not to predict
 * any particular database.
 */

/** Keys per index page: "a few hundred" for small keys on 8 KB pages (ballpark). */
export const FAN_OUT = 200;
/** Rows per 8 KB table page, for rows of about 80 bytes (ballpark). */
export const ROWS_PER_PAGE = 100;
/** Rows a sequential scan checks per second (ballpark: about 1 GB/s of 100-byte rows). */
export const SCAN_ROWS_PER_SEC = 10_000_000;
/** One random page read from a solid-state drive (ballpark). */
export const PAGE_READ_MS = 0.1;

/** Table sizes on the widget's slider: a log scale from a thousand to a hundred million rows. */
export const TABLE_SIZES: readonly number[] = [
  1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000,
  20_000_000, 50_000_000, 100_000_000,
];

/** Pages on each level of a B-tree over `n` keys, root first. A tiny table is a single page. */
export function btreeLevelPages(n: number, fanOut = FAN_OUT): number[] {
  if (!(fanOut >= 2)) throw new Error('fan-out must be at least 2');
  let count = Math.max(1, Math.ceil(Math.max(1, n) / fanOut));
  const pages = [count];
  while (count > 1) {
    count = Math.ceil(count / fanOut);
    pages.unshift(count);
  }
  return pages;
}

/** Levels of a B-tree over `n` keys: the smallest L with fanOut^L >= n, which is about log_fanOut(n). */
export function btreeLevels(n: number, fanOut = FAN_OUT): number {
  return btreeLevelPages(n, fanOut).length;
}

export type ScanCost = { rowsChecked: number; pagesRead: number; ms: number };

/**
 * Cost of a full table scan over `n` rows. By default this is the worst case: every row.
 * With `stopAtFirstMatch` (a query that wants one row, such as one with LIMIT 1), the scan
 * stops at the match, found at 0-based position `matchAt`.
 */
export function scanCost(n: number, opts: { stopAtFirstMatch?: boolean; matchAt?: number } = {}): ScanCost {
  const rows = Math.max(0, Math.round(n));
  const rowsChecked = opts.stopAtFirstMatch && opts.matchAt !== undefined ? Math.min(rows, Math.max(0, Math.floor(opts.matchAt)) + 1) : rows;
  return {
    rowsChecked,
    pagesRead: Math.ceil(rowsChecked / ROWS_PER_PAGE),
    ms: (rowsChecked / SCAN_ROWS_PER_SEC) * 1000,
  };
}

export type IndexCost = {
  levels: number;
  /** Pages per level, root first. */
  levelPages: number[];
  /** One page per level, plus the page that holds the row. */
  pagesRead: number;
  rowsChecked: number;
  ms: number;
};

/** Cost of finding one row through a B-tree index over `n` rows. */
export function indexCost(n: number, fanOut = FAN_OUT): IndexCost {
  const levelPages = btreeLevelPages(n, fanOut);
  const pagesRead = levelPages.length + 1;
  return { levels: levelPages.length, levelPages, pagesRead, rowsChecked: 1, ms: pagesRead * PAGE_READ_MS };
}

export type Comparison = { rows: number; scan: ScanCost; index: IndexCost; /** Scan time divided by index time. */ speedup: number };

export function compare(n: number, fanOut = FAN_OUT): Comparison {
  const scan = scanCost(n);
  const index = indexCost(n, fanOut);
  return { rows: n, scan, index, speedup: scan.ms / index.ms };
}

/* ------------------------------------------------------------------ */
/* Animation timeline                                                  */
/* ------------------------------------------------------------------ */

/** The table is drawn as this many cells; each stands for n / SCAN_CELLS rows. */
export const SCAN_CELLS = 200;
/** Ticks the index side spends on each page read, so the descent is visible. */
export const TICKS_PER_INDEX_PAGE = 4;
/** The cell that holds the matching row. The scan passes it and keeps going. */
export const MATCH_CELL = 137;

export type Frame = {
  tick: number;
  /** Table cells the scan has checked (0 to SCAN_CELLS). */
  scanCells: number;
  /** Rows the scan has checked so far. */
  scanRows: number;
  /** The scan has passed the matching row, but cannot stop: there could be more matches. */
  scanPassedMatch: boolean;
  scanDone: boolean;
  /** Index pages read so far (0 to levels + 1). */
  indexPages: number;
  indexDone: boolean;
};

/** Ticks from the start until both sides are done (the scan is always last). */
export function totalTicks(): number {
  return SCAN_CELLS;
}

/** Ticks until the index lookup finishes. */
export function indexDoneTick(n: number, fanOut = FAN_OUT): number {
  return indexCost(n, fanOut).pagesRead * TICKS_PER_INDEX_PAGE;
}

/** The state of both sides after `tick` ticks. */
export function frameAt(n: number, tick: number, fanOut = FAN_OUT): Frame {
  const t = Math.max(0, Math.min(SCAN_CELLS, Math.floor(tick)));
  const pagesTotal = indexCost(n, fanOut).pagesRead;
  const indexPages = Math.min(pagesTotal, Math.floor(t / TICKS_PER_INDEX_PAGE));
  return {
    tick: t,
    scanCells: t,
    scanRows: Math.min(n, Math.round((n * t) / SCAN_CELLS)),
    scanPassedMatch: t > MATCH_CELL,
    scanDone: t >= SCAN_CELLS,
    indexPages,
    indexDone: indexPages >= pagesTotal,
  };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const grouped = new Intl.NumberFormat('en-US');

/** 50_000_000 -> "50 million", 20_000 -> "20,000". */
export function formatRows(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? grouped.format(m) : m.toFixed(1)} million`;
  }
  return grouped.format(Math.round(n));
}

/** Ballpark durations: "0.3 ms", "40 ms", "5 s". */
export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    const s = ms / 1000;
    return `${s >= 10 ? grouped.format(Math.round(s)) : s.toFixed(1).replace(/\.0$/, '')} s`;
  }
  if (ms >= 10) return `${Math.round(ms)} ms`;
  if (ms >= 1) return `${ms.toFixed(1).replace(/\.0$/, '')} ms`;
  return `${ms.toFixed(1)} ms`;
}

/** "about 20,000 times", rounded to two significant figures. */
export function formatTimes(ratio: number): string {
  if (ratio < 10) return ratio.toFixed(1).replace(/\.0$/, '');
  const digits = Math.floor(Math.log10(ratio)) - 1;
  const rounded = Math.round(ratio / 10 ** digits) * 10 ** digits;
  return grouped.format(rounded);
}
