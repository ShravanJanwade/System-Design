import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  MINUTE_MS,
  OREGON_COUNTER_BEFORE,
  SINGAPORE_COUNTER_BEFORE,
  START_MS,
  WINDOW_MIN,
  WINDOW_MS,
  apartPerMinute,
  formatClock,
  formatDrift,
  formatOffset,
  formatSpan,
  maxSkew,
  offsetAt,
  offsetPerDay,
  offsetSeries,
  receive,
  skewAt,
  syncTimes,
  thread,
  tick,
} from './logic';

describe('one drifting clock', () => {
  it('gains 6 ms a minute and 360 ms an hour at 100 ppm fast', () => {
    expect(offsetAt(MINUTE_MS, 100, null)).toBeCloseTo(6, 9);
    expect(offsetAt(60 * MINUTE_MS, 100, null)).toBeCloseTo(360, 9);
  });

  it('loses time when it runs slow', () => {
    expect(offsetAt(10 * MINUTE_MS, -20, null)).toBeCloseTo(-12, 9);
  });

  it('is off by about 4 seconds a day at 50 ppm, as the lesson says', () => {
    expect(offsetPerDay(50)).toBeCloseTo(4320, 6);
  });

  it('grows until a sync and snaps back to true time at each one', () => {
    expect(offsetAt(15 * MINUTE_MS - 1, 80, 15)).toBeCloseTo(72, 2);
    expect(offsetAt(15 * MINUTE_MS, 80, 15)).toBe(0);
    expect(offsetAt(30 * MINUTE_MS, 80, 15)).toBe(0);
    expect(offsetAt(20 * MINUTE_MS, 80, 15)).toBeCloseTo(24, 9);
  });

  it('lists the syncs inside the window', () => {
    expect(syncTimes(15)).toEqual([15, 30, 45, 60, 75, 90, 105]);
    expect(syncTimes(60)).toEqual([60]);
    expect(syncTimes(null)).toEqual([]);
    expect(syncTimes(1)).toHaveLength(WINDOW_MIN - 1);
  });

  it('draws a sawtooth that drops to zero at every sync and ends just before the window closes', () => {
    const pts = offsetSeries(80, 60);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1]!.x).toBe(60);
    expect(pts[1]!.y).toBeCloseTo(288, 9);
    expect(pts[2]).toEqual({ x: 60, y: 0 });
    expect(pts[pts.length - 1]!.x).toBe(WINDOW_MIN);
    expect(pts[pts.length - 1]!.y).toBeCloseTo(288, 9);
    const never = offsetSeries(80, null);
    expect(never).toHaveLength(2);
    expect(never[1]!.y).toBeCloseTo(offsetAt(WINDOW_MS, 80, null), 9);
  });
});

describe('skew between Oregon and Singapore', () => {
  it('is the difference of the two offsets, positive when Singapore is ahead', () => {
    expect(skewAt(10 * MINUTE_MS, -20, 80, null)).toBeCloseTo(60, 9);
    expect(skewAt(10 * MINUTE_MS, 80, -20, null)).toBeCloseTo(-60, 9);
  });

  it('peaks just before each sync: 90 ms with the defaults', () => {
    expect(maxSkew(DEFAULTS.oregonPpm, DEFAULTS.singaporePpm, 15)).toBeCloseTo(90, 9);
    expect(skewAt(30 * MINUTE_MS - 1, -20, 80, 15)).toBeCloseTo(90, 2);
    expect(skewAt(30 * MINUTE_MS, -20, 80, 15)).toBe(0);
  });

  it('reaches 360 ms with hourly syncs and 720 ms with none', () => {
    expect(maxSkew(-20, 80, 60)).toBeCloseTo(360, 9);
    expect(maxSkew(-20, 80, null)).toBeCloseTo(720, 9);
  });

  it('is zero when both clocks drift the same way at the same rate', () => {
    expect(maxSkew(50, 50, null)).toBe(0);
    expect(skewAt(77 * MINUTE_MS, 50, 50, null)).toBe(0);
  });

  it('grows by 6 ms a minute when the drifts differ by 100 ppm', () => {
    expect(apartPerMinute(-20, 80)).toBeCloseTo(6, 9);
  });
});

describe('Lamport clock', () => {
  it('adds one per event and jumps forward on receiving a bigger counter', () => {
    expect(tick(41)).toBe(42);
    expect(receive(17, 42)).toBe(42);
    expect(receive(50, 42)).toBe(50);
  });
});

describe('the comment thread', () => {
  it('stamps each post with its own region’s clock', () => {
    const t = thread(44, 100, -20, 80, 60);
    expect(t.comment.trueMs).toBe(START_MS + 44 * MINUTE_MS);
    expect(t.reply.trueMs).toBe(t.comment.trueMs + 100);
    expect(t.comment.stampMs - t.comment.trueMs).toBeCloseTo(offsetAt(44 * MINUTE_MS, 80, 60), 6);
    expect(t.reply.stampMs - t.reply.trueMs).toBeCloseTo(offsetAt(44 * MINUTE_MS + 100, -20, 60), 6);
  });

  it('keeps the right order while the skew is smaller than the gap', () => {
    // 14 minutes after the 30-minute sync: skew = 100 ppm × 14 min = 84 ms, less than 100 ms.
    const t = thread(DEFAULTS.atMin, DEFAULTS.gapMs, DEFAULTS.oregonPpm, DEFAULTS.singaporePpm, 15);
    expect(t.skewMs).toBeCloseTo(84, 6);
    expect(t.replyFirst).toBe(false);
    expect(t.byTime.map((p) => p.id)).toEqual(['comment', 'reply']);
  });

  it('puts the reply above the comment once the skew is larger than the gap', () => {
    // Hourly syncs: 44 minutes of drift is 264 ms, far more than the 100 ms gap.
    const t = thread(44, 100, -20, 80, 60);
    expect(t.skewMs).toBeCloseTo(264, 6);
    expect(t.replyFirst).toBe(true);
    expect(t.byTime.map((p) => p.id)).toEqual(['reply', 'comment']);
    expect(t.stampGapMs).toBeCloseTo(100 - 264, 1);
  });

  it('flips exactly when the skew passes the gap', () => {
    // With hourly syncs and 100 ppm apart, the skew passes 100 ms after 1,000 seconds.
    expect(thread(16, 100, -20, 80, 60).replyFirst).toBe(false);
    expect(thread(17, 100, -20, 80, 60).replyFirst).toBe(true);
  });

  it('a 300 ms fast clock flips any reply written less than 300 ms later', () => {
    // Singapore 300 ms ahead of an exact Oregon clock at 50 minutes without a sync (100 ppm).
    expect(thread(50, 250, 0, 100, null).replyFirst).toBe(true);
    expect(thread(50, 350, 0, 100, null).replyFirst).toBe(false);
  });

  it('a logical clock always puts the comment first, whatever the clocks do', () => {
    for (const oregon of [-200, -50, 0, 120]) {
      for (const singapore of [-150, 0, 80, 200]) {
        for (const sync of [1, 15, 60, null]) {
          for (const at of [0, 14.5, 44, 59.9, 119]) {
            const t = thread(at, 100, oregon, singapore, sync);
            expect(t.byCounter.map((p) => p.id)).toEqual(['comment', 'reply']);
            expect(t.reply.counter).toBeGreaterThan(t.comment.counter);
          }
        }
      }
    }
  });

  it('gives the comment 42 and the reply 43', () => {
    const t = thread(44, 100, -20, 80, 15);
    expect(t.comment.counter).toBe(SINGAPORE_COUNTER_BEFORE + 1);
    expect(OREGON_COUNTER_BEFORE).toBeLessThan(t.comment.counter);
    expect(t.reply.counter).toBe(43);
  });
});

describe('formatting', () => {
  it('formats clock times to the millisecond and wraps around midnight', () => {
    expect(formatClock(START_MS + 44 * MINUTE_MS + 211)).toBe('09:44:00.211');
    expect(formatClock(START_MS - 120)).toBe('08:59:59.880');
    expect(formatClock(-1)).toBe('23:59:59.999');
  });

  it('formats offsets with a sign', () => {
    expect(formatOffset(211.4)).toBe('+211 ms');
    expect(formatOffset(-48)).toBe('−48 ms');
    expect(formatOffset(0.3)).toBe('0 ms');
    expect(formatOffset(1250)).toBe('+1.25 s');
    expect(formatSpan(-90)).toBe('90 ms');
    expect(formatSpan(4320)).toBe('4.32 s');
    expect(formatDrift(-20)).toBe('−20 ppm, slow');
    expect(formatDrift(80)).toBe('+80 ppm, fast');
  });
});
