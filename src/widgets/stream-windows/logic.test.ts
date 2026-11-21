import { describe, expect, it } from 'vitest';
import {
  AXIS_END,
  DELAY_MAX,
  LATENESS_MAX,
  POSTS,
  WINDOW_SIZES,
  describeAt,
  explainPost,
  formatClock,
  normalizeConfig,
  runStream,
  totalsAt,
  watermarkAt,
  windowAt,
  windowsFor,
  type Fate,
  type StreamRun,
} from './logic';

const fateIn = (run: StreamRun, postId: string, start: number): Fate | undefined =>
  run.windows.find((w) => w.start === start)?.members.find((m) => m.post.id === postId)?.fate;
const worst = (run: StreamRun, postId: string) => run.posts.find((p) => p.post.id === postId)!.worst;

describe('windows', () => {
  it('tumbling windows sit back to back without overlap', () => {
    const ws = windowsFor('tumbling', 5);
    expect(ws.map((w) => [w.start, w.end])).toEqual([
      [0, 5],
      [5, 10],
      [10, 15],
      [15, 20],
      [20, 25],
      [25, 30],
    ]);
    expect(ws.every((w) => w.row === 0)).toBe(true);
  });

  it('sliding windows start every half window, so they overlap and alternate rows', () => {
    const ws = windowsFor('sliding', 5);
    expect(ws).toHaveLength(11);
    expect(ws[1]).toMatchObject({ start: 2.5, end: 7.5, row: 1 });
    expect(ws[10]).toMatchObject({ start: 25, end: 30, row: 0 });
  });

  it('every post falls in exactly one tumbling window, and in one or two sliding windows', () => {
    for (const size of WINDOW_SIZES) {
      const tumbling = runStream({ kind: 'tumbling', size });
      expect(tumbling.posts.every((p) => p.fates.length === 1)).toBe(true);
      expect(tumbling.windows.reduce((n, w) => n + w.exactTotal, 0)).toBe(POSTS.length);
      const sliding = runStream({ kind: 'sliding', size });
      expect(sliding.posts.every((p) => p.fates.length >= 1 && p.fates.length <= 2)).toBe(true);
      expect(sliding.posts.some((p) => p.fates.length === 2)).toBe(true);
    }
  });

  it('snaps settings to the options the controls offer', () => {
    expect(normalizeConfig({ size: 6, watermarkDelay: 0.7, allowedLateness: 40 })).toEqual({
      kind: 'tumbling',
      size: 5,
      watermarkDelay: 0.5,
      allowedLateness: LATENESS_MAX,
    });
  });
});

describe('the starting settings: five-minute tumbling windows, a one-minute watermark, no lateness', () => {
  const run = runStream();

  it('counts 22 posts on time and drops the 4 that arrive after their window published', () => {
    expect(run.totals).toEqual({ 'on-time': 22, updated: 0, dropped: 4 });
    expect(run.posts.filter((p) => p.worst === 'dropped').map((p) => p.post.id)).toEqual(['p8', 'p14', 'p19', 'p23']);
  });

  it('publishes each window one minute after it ends', () => {
    expect(run.windows.map((w) => w.emitAt)).toEqual([6, 11, 16, 21, 26, 31]);
  });

  it('the 18:10–18:15 window publishes 4 at 18:16, then the 18:14:18 subway post arrives at 18:16:54 and is dropped', () => {
    const w = run.windows[2]!;
    expect(formatClock(w.emitAt)).toBe('18:16');
    expect(w.firstTotal).toBe(4);
    expect(w.dropped.map((p) => p.id)).toEqual(['p14']);
    expect(formatClock(POSTS.find((p) => p.id === 'p14')!.arrival)).toBe('18:16:54');
  });

  it('a post that is out of order but arrives before its window ends still counts on time', () => {
    // Posted 18:11:36, arrived 18:14:12: 2.6 minutes late, but before the window ended at 18:15.
    expect(fateIn(run, 'p11', 10)).toBe('on-time');
    expect(fateIn(runStream({ watermarkDelay: 0 }), 'p11', 10)).toBe('on-time');
  });

  it('the stream undercounts four windows, compared with a batch job that sees every post', () => {
    expect(run.windows.map((w) => w.exactTotal - w.finalTotal)).toEqual([0, 1, 1, 1, 1, 0]);
  });
});

describe('allowed lateness and the watermark delay', () => {
  it('ten minutes of allowed lateness turns three drops into updates of results already published', () => {
    const run = runStream({ allowedLateness: 10 });
    expect(run.totals).toEqual({ 'on-time': 22, updated: 3, dropped: 1 });
    const w = run.windows[2]!;
    expect(w.updates.map((u) => [u.post.id, u.before, u.after])).toEqual([['p14', 4, 5]]);
    expect(w.finalTotal).toBe(w.exactTotal);
  });

  it('five minutes of lateness is enough for the subway post (the lesson’s sequence diagram)', () => {
    const run = runStream({ allowedLateness: 5 });
    expect(fateIn(run, 'p14', 10)).toBe('updated');
    expect(fateIn(run, 'p8', 5)).toBe('dropped');
  });

  it('the post from a phone offline for half an hour is dropped under every setting', () => {
    for (const kind of ['tumbling', 'sliding'] as const) {
      for (const size of WINDOW_SIZES) {
        for (let d = 0; d <= DELAY_MAX; d += 0.5) {
          expect(worst(runStream({ kind, size, watermarkDelay: d, allowedLateness: LATENESS_MAX }), 'p8')).toBe('dropped');
        }
      }
    }
  });

  it('a three-minute watermark rescues the subway post but publishes every result three minutes after its window', () => {
    const run = runStream({ watermarkDelay: 3 });
    expect(fateIn(run, 'p14', 10)).toBe('on-time');
    expect(run.windows.every((w) => w.emitAt === w.end + 3)).toBe(true);
    expect(run.totals).toEqual({ 'on-time': 23, updated: 0, dropped: 3 });
  });

  it('with no watermark delay, even the post that is one minute late is dropped', () => {
    const run = runStream({ watermarkDelay: 0 });
    expect(worst(run, 'p5')).toBe('dropped');
    expect(run.totals.dropped).toBe(5);
  });

  it('more lateness or more delay never drops more posts', () => {
    for (const kind of ['tumbling', 'sliding'] as const) {
      for (const size of WINDOW_SIZES) {
        let prev = Infinity;
        for (let l = 0; l <= LATENESS_MAX; l++) {
          const dropped = runStream({ kind, size, allowedLateness: l }).totals.dropped;
          expect(dropped).toBeLessThanOrEqual(prev);
          prev = dropped;
        }
      }
    }
  });

  it('every window accounts for each post: first result plus updates plus drops is the exact count', () => {
    for (const cfg of [{}, { allowedLateness: 7 }, { kind: 'sliding' as const, size: 10, watermarkDelay: 2, allowedLateness: 3 }]) {
      for (const w of runStream(cfg).windows) {
        expect(w.firstTotal + w.updates.length + w.dropped.length).toBe(w.exactTotal);
        expect(w.finalTotal).toBe(w.firstTotal + w.updates.length);
      }
    }
  });
});

describe('sliding windows', () => {
  it('one post can be late for one window and on time for the next', () => {
    const run = runStream({ kind: 'sliding', size: 5 });
    expect(fateIn(run, 'p14', 10)).toBe('dropped');
    expect(fateIn(run, 'p14', 12.5)).toBe('on-time');
    expect(worst(run, 'p14')).toBe('dropped');
  });
});

describe('the stream at a moment', () => {
  const run = runStream({ allowedLateness: 10 });
  const w = run.windows[2]!; // 18:10–18:15, publishes at 18:16, kept until 18:26

  it('collects only the posts that have arrived, then publishes, updates and closes', () => {
    expect(windowAt(w, 13.5)).toMatchObject({ phase: 'collecting', count: 3 });
    expect(windowAt(w, 16)).toMatchObject({ phase: 'open', count: 4, updates: 0 });
    expect(windowAt(w, 17)).toMatchObject({ phase: 'open', count: 5, updates: 1 });
    expect(windowAt(w, 26)).toMatchObject({ phase: 'closed', count: 5 });
  });

  it('the watermark trails the clock by the delay', () => {
    expect(watermarkAt(run.config, 20)).toBe(19);
  });

  it('totals at a moment cover only the posts that have arrived', () => {
    expect(totalsAt(run, 0).arrived).toBe(0);
    expect(totalsAt(run, AXIS_END)).toMatchObject({ arrived: POSTS.length, ...run.totals });
  });
});

describe('words', () => {
  it('formats clock times with seconds only when needed', () => {
    expect(formatClock(15)).toBe('18:15');
    expect(formatClock(4.7)).toBe('18:04:42');
    expect(formatClock(41.6)).toBe('18:41:36');
  });

  it('explains each fate', () => {
    const run = runStream({ allowedLateness: 5 });
    const p14 = run.posts.find((p) => p.post.id === 'p14')!;
    expect(explainPost(run, p14)[0]).toContain('from 4 to 5');
    const p8 = run.posts.find((p) => p.post.id === 'p8')!;
    expect(explainPost(run, p8)[0]).toContain('dropped');
  });

  it('describes the run for screen readers', () => {
    expect(describeAt(runStream(), AXIS_END)).toContain('22 counted on time');
  });
});
