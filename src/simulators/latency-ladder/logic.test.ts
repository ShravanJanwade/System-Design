import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  OPERATIONS,
  ZOOM_ORDER,
  ZOOMS,
  challengeStatus,
  compare,
  formatDuration,
  formatHumanShort,
  formatRatio,
  getOperation,
  humanDuration,
  place,
  stateFromPreset,
  ticks,
  toggleSelection,
} from './logic';

describe('operations', () => {
  it('are sorted from fastest to slowest, with unique ids', () => {
    for (let i = 1; i < OPERATIONS.length; i++) expect(OPERATIONS[i]!.ns).toBeGreaterThan(OPERATIONS[i - 1]!.ns);
    expect(new Set(OPERATIONS.map((o) => o.id)).size).toBe(OPERATIONS.length);
  });

  it('use the classic ballpark values the lesson quotes', () => {
    expect(getOperation('memory').ns).toBe(100);
    expect(getOperation('ssd-random').ns).toBe(150_000);
    expect(getOperation('dc-rtt').ns).toBe(500_000);
    expect(getOperation('disk-seek').ns).toBe(10_000_000);
    expect(getOperation('continent-rtt').ns).toBe(150_000_000);
  });

  it('span about nine orders of magnitude', () => {
    const span = Math.log10(OPERATIONS[OPERATIONS.length - 1]!.ns / OPERATIONS[0]!.ns);
    expect(span).toBeGreaterThan(8);
    expect(span).toBeLessThan(9);
  });
});

describe('formatting', () => {
  it('formats real durations with the right unit', () => {
    expect(formatDuration(0.5)).toBe('0.5 ns');
    expect(formatDuration(100)).toBe('100 ns');
    expect(formatDuration(3_000)).toBe('3 µs');
    expect(formatDuration(500_000)).toBe('500 µs');
    expect(formatDuration(10_000_000)).toBe('10 ms');
    expect(formatDuration(150_000_000)).toBe('150 ms');
    expect(formatDuration(1e9)).toBe('1 s');
  });

  it('converts to human scale, where 1 ns lasts 1 second', () => {
    expect(humanDuration(1)).toBe('1 second');
    expect(humanDuration(100)).toBe('1.7 minutes');
    expect(humanDuration(150_000)).toBe('1.7 days');
    expect(humanDuration(10_000_000)).toBe('3.8 months');
    expect(humanDuration(150_000_000)).toBe('4.8 years');
    expect(formatHumanShort(1_000)).toBe('17 min');
    expect(formatHumanShort(1e9)).toBe('32 years');
  });

  it('formats ratios in words a learner can say', () => {
    expect(formatRatio(4)).toBe('4 times');
    expect(formatRatio(20)).toBe('20 times');
    expect(formatRatio(1_500)).toBe('1,500 times');
    expect(formatRatio(1.5e6)).toBe('1.5 million times');
    expect(formatRatio(3e8)).toBe('300 million times');
  });
});

describe('placement on the axis', () => {
  it('fits every operation on the zoomed-out log scale, in order', () => {
    let last = -1;
    for (const op of OPERATIONS) {
      const p = place(op.ns, 'all', 'log');
      expect(p.clipped).toBeNull();
      expect(p.at).toBeGreaterThan(last);
      expect(p.at).toBeLessThanOrEqual(1);
      last = p.at;
    }
  });

  it('gives every factor of ten the same width on the log scale', () => {
    const a = place(1, 'all', 'log').at;
    const b = place(10, 'all', 'log').at;
    const c = place(100, 'all', 'log').at;
    expect(b - a).toBeCloseTo(c - b, 10);
    expect(b - a).toBeCloseTo(0.1, 10);
  });

  it('clips values outside a zoom window to its edges', () => {
    expect(place(100, 'ms', 'log')).toEqual({ at: 0, clipped: 'below' });
    expect(place(150_000_000, 'ns', 'log')).toEqual({ at: 1, clipped: 'above' });
    expect(place(500_000, 'us', 'log').clipped).toBeNull();
  });

  it('every zoom window except the full view holds at least three operations', () => {
    for (const z of ZOOM_ORDER) {
      const inside = OPERATIONS.filter((o) => place(o.ns, z, 'log').clipped === null);
      expect(inside.length).toBeGreaterThanOrEqual(z === 'all' ? OPERATIONS.length : 3);
    }
  });

  it('on a linear scale ending at one second, memory reads collapse onto zero (challenge 3)', () => {
    const memory = place(getOperation('memory').ns, 'all', 'linear');
    expect(memory.at).toBeLessThan(1e-6);
    // Thinner than a pixel even on a 1,920 px screen.
    expect(memory.at * 1920).toBeLessThan(1);
    // The cross-continent round trip is still visible.
    expect(place(getOperation('continent-rtt').ns, 'all', 'linear').at).toBeCloseTo(0.15, 5);
  });

  it('labels the zoomed-out log axis at 1 ns, 1 µs, 1 ms and 1 s, and every decade when zoomed in', () => {
    const all = ticks('all', 'log', false);
    expect(all).toHaveLength(11);
    expect(all.filter((t) => t.label).map((t) => t.label)).toEqual(['1 ns', '1 µs', '1 ms', '1 s']);
    expect(ticks('us', 'log', false).map((t) => t.label)).toEqual(['1 µs', '10 µs', '100 µs', '1 ms']);
    expect(ticks('all', 'log', true).filter((t) => t.label).map((t) => t.label)).toEqual(['1 s', '17 min', '12 days', '32 years']);
    expect(ticks('ns', 'linear', false).map((t) => t.label)).toEqual(['0', '250 ns', '500 ns', '750 ns', '1 µs']);
  });

  it('zoom windows line up decade by decade', () => {
    expect(ZOOMS.ns.maxNs).toBe(ZOOMS.us.minNs);
    expect(ZOOMS.us.maxNs).toBe(ZOOMS.ms.minNs);
    expect(ZOOMS.all.maxNs).toBe(ZOOMS.ms.maxNs);
  });
});

describe('comparisons', () => {
  it('a round trip inside the data center is about 20 times faster than a disk seek (challenge 2)', () => {
    const c = compare('dc-rtt', 'disk-seek');
    expect(c.ratio).toBe(20);
    expect(c.slow.id).toBe('disk-seek');
    expect(c.sentence).toBe('A disk seek takes about 20 times as long as a round trip within one data center.');
  });

  it('main memory is about 200 times slower than the L1 cache (challenge 4)', () => {
    expect(compare('l1', 'memory').ratio).toBe(200);
  });

  it('crossing continents is about 1.5 million memory references (the default comparison)', () => {
    const c = compare('memory', 'continent-rtt');
    expect(c.sentence).toBe('A round trip across continents takes about 1.5 million times as long as a main memory reference.');
    expect(c.humanSentence).toBe('On the human scale, that is 4.8 years against 1.7 minutes.');
  });

  it('reading 1 MB from disk takes about 80 times as long as from memory', () => {
    expect(compare('mem-1mb', 'disk-1mb').ratio).toBe(80);
  });

  it('about 5,000 memory references fit in one round trip inside a data center', () => {
    expect(compare('memory', 'dc-rtt').ratio).toBe(5_000);
  });
});

describe('state', () => {
  it('keeps at most two selections, replacing the oldest', () => {
    expect(toggleSelection(['memory', 'continent-rtt'], 'l1')).toEqual(['continent-rtt', 'l1']);
    expect(toggleSelection(['memory'], 'memory')).toEqual([]);
    expect(toggleSelection([], 'disk-seek')).toEqual(['disk-seek']);
  });

  it('reads a lesson preset and ignores unknown values', () => {
    expect(stateFromPreset({ human: true, zoom: 'us', compare: 'dc-rtt, disk-seek' })).toEqual({
      zoom: 'us',
      scale: 'log',
      human: true,
      selected: ['dc-rtt', 'disk-seek'],
    });
    expect(stateFromPreset({ zoom: 'weeks', compare: 'nope' })).toEqual({ ...DEFAULT_STATE, selected: [] });
    expect(stateFromPreset(undefined)).toEqual(DEFAULT_STATE);
  });

  it('marks each challenge only when its settings are reached', () => {
    expect(Object.values(challengeStatus(DEFAULT_STATE)).some(Boolean)).toBe(false);
    expect(challengeStatus({ ...DEFAULT_STATE, human: true }).human).toBe(true);
    expect(challengeStatus({ ...DEFAULT_STATE, selected: ['disk-seek', 'dc-rtt'] })['network-vs-disk']).toBe(true);
    expect(challengeStatus({ ...DEFAULT_STATE, scale: 'linear' }).linear).toBe(true);
    expect(challengeStatus({ ...DEFAULT_STATE, scale: 'linear', zoom: 'ms' }).linear).toBe(false);
    expect(challengeStatus({ ...DEFAULT_STATE, selected: ['l1', 'memory'] })['cache-levels']).toBe(false);
    expect(challengeStatus({ ...DEFAULT_STATE, zoom: 'ns', selected: ['l1', 'memory'] })['cache-levels']).toBe(true);
  });
});
