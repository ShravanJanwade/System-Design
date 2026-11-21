import { describe, expect, it } from 'vitest';
import {
  FAN_OUT,
  MATCH_CELL,
  PAGE_READ_MS,
  ROWS_PER_PAGE,
  SCAN_CELLS,
  TABLE_SIZES,
  TICKS_PER_INDEX_PAGE,
  btreeLevelPages,
  btreeLevels,
  compare,
  formatDuration,
  formatRows,
  formatTimes,
  frameAt,
  indexCost,
  indexDoneTick,
  scanCost,
  totalTicks,
} from './logic';

/** Smallest L with fanOut^L >= n, by plain integer arithmetic. */
function levelsByCounting(n: number, fanOut: number): number {
  let levels = 1;
  let reach = fanOut;
  while (reach < n) {
    reach *= fanOut;
    levels++;
  }
  return levels;
}

describe('full table scan', () => {
  it('touches all N rows in the worst case', () => {
    for (const n of [1, 1_000, 123_457, 50_000_000, 100_000_000]) {
      expect(scanCost(n).rowsChecked).toBe(n);
    }
  });

  it('reads one page per hundred rows', () => {
    expect(scanCost(50_000_000).pagesRead).toBe(50_000_000 / ROWS_PER_PAGE);
    expect(scanCost(150).pagesRead).toBe(2);
  });

  it('stops at the match only when the query wants a single row', () => {
    expect(scanCost(1_000, { stopAtFirstMatch: true, matchAt: 0 }).rowsChecked).toBe(1);
    expect(scanCost(1_000, { stopAtFirstMatch: true, matchAt: 499 }).rowsChecked).toBe(500);
    expect(scanCost(1_000, { stopAtFirstMatch: true, matchAt: 999 }).rowsChecked).toBe(1_000);
    expect(scanCost(1_000, { matchAt: 10 }).rowsChecked).toBe(1_000);
  });

  it('checks about half the rows on average when it can stop early', () => {
    const n = 2_000;
    let total = 0;
    for (let at = 0; at < n; at++) total += scanCost(n, { stopAtFirstMatch: true, matchAt: at }).rowsChecked;
    expect(total / n).toBeCloseTo((n + 1) / 2, 6);
  });

  it('grows in step with the table: 100,000 times the rows, 100,000 times the work', () => {
    expect(scanCost(100_000_000).ms / scanCost(1_000).ms).toBeCloseTo(100_000, 6);
  });

  it('takes seconds on Snapgram’s 50-million-row photos table (ballpark)', () => {
    const ms = scanCost(50_000_000).ms;
    expect(ms).toBeGreaterThanOrEqual(1_000);
    expect(ms).toBeLessThan(60_000);
  });
});

describe('B-tree levels', () => {
  it('has about log_b(N) levels: the smallest L with b^L >= N', () => {
    for (const fanOut of [100, 200, 300, 500]) {
      for (const n of [1, 2, 199, 200, 201, 1_000, 39_999, 40_000, 40_001, 8_000_000, 8_000_001, 50_000_000, 100_000_000]) {
        expect(btreeLevels(n, fanOut)).toBe(levelsByCounting(n, fanOut));
      }
    }
  });

  it('matches ceil(log_b N) away from exact powers', () => {
    for (const n of TABLE_SIZES) {
      expect(btreeLevels(n)).toBe(Math.ceil(Math.log(n) / Math.log(FAN_OUT)));
    }
  });

  it('needs only a few levels with a fan-out of a few hundred, even at 100 million rows', () => {
    expect(btreeLevels(1_000)).toBe(2);
    expect(btreeLevels(1_000_000)).toBe(3);
    expect(btreeLevels(50_000_000)).toBe(4);
    expect(btreeLevels(100_000_000)).toBe(4);
    for (const fanOut of [100, 200, 300, 500]) expect(btreeLevels(100_000_000, fanOut)).toBeLessThanOrEqual(4);
  });

  it('counts the pages on each level, root first', () => {
    expect(btreeLevelPages(100_000_000)).toEqual([1, 13, 2_500, 500_000]);
    expect(btreeLevelPages(1_000)).toEqual([1, 5]);
    expect(btreeLevelPages(150)).toEqual([1]);
  });

  it('rejects a fan-out below 2', () => {
    expect(() => btreeLevels(10, 1)).toThrow();
  });
});

describe('index lookup', () => {
  it('reads one page per level plus the row’s own page, and checks one row', () => {
    const cost = indexCost(50_000_000);
    expect(cost.levels).toBe(4);
    expect(cost.pagesRead).toBe(5);
    expect(cost.rowsChecked).toBe(1);
    expect(cost.ms).toBeCloseTo(5 * PAGE_READ_MS, 10);
  });

  it('gains only a couple of page reads while the table grows 100,000 times', () => {
    const small = indexCost(1_000).pagesRead;
    const big = indexCost(100_000_000).pagesRead;
    expect(big - small).toBeLessThanOrEqual(2);
  });

  it('beats the scan by thousands of times on big tables', () => {
    expect(compare(50_000_000).speedup).toBeGreaterThan(1_000);
    expect(compare(100_000_000).speedup).toBeGreaterThan(10_000);
  });

  it('is no faster than a scan on a tiny table; the crossover is a few thousand rows (ballpark)', () => {
    expect(compare(1_000).speedup).toBeLessThanOrEqual(1);
    expect(compare(2_000).speedup).toBeLessThan(1);
    expect(compare(5_000).speedup).toBeGreaterThan(1);
  });
});

describe('animation frames', () => {
  const n = 50_000_000;

  it('starts with nothing read and ends with both sides done', () => {
    const start = frameAt(n, 0);
    expect(start.scanRows).toBe(0);
    expect(start.indexPages).toBe(0);
    const end = frameAt(n, totalTicks());
    expect(end.scanDone && end.indexDone).toBe(true);
    expect(end.scanRows).toBe(n);
    expect(end.indexPages).toBe(indexCost(n).pagesRead);
  });

  it('counts rows up steadily and never past N', () => {
    let last = -1;
    for (let t = 0; t <= SCAN_CELLS + 5; t++) {
      const f = frameAt(n, t);
      expect(f.scanRows).toBeGreaterThanOrEqual(last);
      expect(f.scanRows).toBeLessThanOrEqual(n);
      last = f.scanRows;
    }
  });

  it('finishes the index long before the scan', () => {
    expect(indexDoneTick(n)).toBe(indexCost(n).pagesRead * TICKS_PER_INDEX_PAGE);
    expect(indexDoneTick(100_000_000)).toBeLessThan(totalTicks() / 5);
    expect(frameAt(n, indexDoneTick(n)).indexDone).toBe(true);
    expect(frameAt(n, indexDoneTick(n) - 1).indexDone).toBe(false);
    expect(frameAt(n, indexDoneTick(n)).scanDone).toBe(false);
  });

  it('keeps scanning after it passes the match', () => {
    const f = frameAt(n, MATCH_CELL + 1);
    expect(f.scanPassedMatch).toBe(true);
    expect(f.scanDone).toBe(false);
  });
});

describe('formatting', () => {
  it('formats table sizes', () => {
    expect(formatRows(1_000)).toBe('1,000');
    expect(formatRows(500_000)).toBe('500,000');
    expect(formatRows(50_000_000)).toBe('50 million');
    expect(formatRows(2_500_000)).toBe('2.5 million');
  });

  it('formats ballpark durations', () => {
    expect(formatDuration(0.3)).toBe('0.3 ms');
    expect(formatDuration(2.5)).toBe('2.5 ms');
    expect(formatDuration(40)).toBe('40 ms');
    expect(formatDuration(5_000)).toBe('5 s');
    expect(formatDuration(2_500)).toBe('2.5 s');
    expect(formatDuration(10_000)).toBe('10 s');
  });

  it('rounds speedups to two significant figures', () => {
    expect(formatTimes(20_000)).toBe('20,000');
    expect(formatTimes(12_345)).toBe('12,000');
    expect(formatTimes(3.33)).toBe('3.3');
  });

  it('offers a log-scale slider from 1,000 to 100 million rows, including 50 million', () => {
    expect(TABLE_SIZES[0]).toBe(1_000);
    expect(TABLE_SIZES[TABLE_SIZES.length - 1]).toBe(100_000_000);
    expect(TABLE_SIZES).toContain(50_000_000);
    for (let i = 1; i < TABLE_SIZES.length; i++) expect(TABLE_SIZES[i]!).toBeGreaterThan(TABLE_SIZES[i - 1]!);
  });
});
