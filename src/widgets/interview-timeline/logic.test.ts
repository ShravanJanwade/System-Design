import { describe, expect, it } from 'vitest';
import {
  BUDGET,
  PHASES,
  buildTimeline,
  durationLabel,
  minuteTicks,
  minuteToX,
  normalizeIndex,
  normalizeLength,
  phaseAtMinute,
  segmentLayout,
} from './logic';

describe('bar layout', () => {
  it('sizes segments by minutes and fills the bar exactly, gaps included', () => {
    for (const length of [45, 60] as const) {
      const t = buildTimeline(length);
      const segs = segmentLayout(t, 600, 3);
      const last = segs.at(-1)!;
      expect(last.x + last.w).toBeCloseTo(600);
      const usable = 600 - 3 * 5;
      segs.forEach((s, i) => expect(s.w).toBeCloseTo((usable * t[i]!.minutes) / length));
    }
  });

  it('puts minute marks on the matching segment edges', () => {
    const t = buildTimeline(45);
    const segs = segmentLayout(t, 450, 3);
    expect(minuteToX(t, segs, 0)).toBe(0);
    expect(minuteToX(t, segs, 45)).toBeCloseTo(450);
    expect(minuteToX(t, segs, 25)).toBeCloseTo(segs[3]!.x + segs[3]!.w);
    expect(minuteToX(t, segs, 30)).toBeCloseTo(segs[4]!.x + segs[4]!.w / 3);
    const xs = minuteTicks(45).map((m) => minuteToX(t, segs, m));
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
  });
});

describe('buildTimeline', () => {
  it('fills a 45-minute interview with the six phases in order', () => {
    const t = buildTimeline(45);
    expect(t.map((p) => p.id)).toEqual(['requirements', 'estimation', 'api', 'high-level', 'deep-dives', 'wrap-up']);
    expect(t.map((p) => p.minutes)).toEqual([5, 5, 5, 10, 15, 5]);
    expect(t.reduce((s, p) => s + p.minutes, 0)).toBe(45);
    expect(t.map((p) => p.start)).toEqual([0, 5, 10, 15, 25, 40]);
    expect(t.at(-1)!.end).toBe(45);
  });

  it('gives the extra 15 minutes of a 60-minute interview to the high-level design and the deep dives only', () => {
    const short = buildTimeline(45);
    const long = buildTimeline(60);
    expect(long.reduce((s, p) => s + p.minutes, 0)).toBe(60);
    long.forEach((p, i) => {
      const before = short[i]!.minutes;
      if (p.id === 'high-level' || p.id === 'deep-dives') expect(p.minutes).toBeGreaterThan(before);
      else expect(p.minutes).toBe(before);
    });
  });

  it('starts each phase when the previous one ends', () => {
    for (const length of [45, 60] as const) {
      const t = buildTimeline(length);
      expect(t[0]!.start).toBe(0);
      for (let i = 1; i < t.length; i++) expect(t[i]!.start).toBe(t[i - 1]!.end);
    }
  });

  it('gives deep dives the largest block, as the lessons say', () => {
    for (const length of [45, 60] as const) {
      const t = buildTimeline(length);
      const deep = t.find((p) => p.id === 'deep-dives')!;
      for (const p of t) if (p.id !== 'deep-dives') expect(deep.minutes).toBeGreaterThan(p.minutes);
    }
  });

  it('describes estimation as a range and the rest as single figures', () => {
    expect(durationLabel('estimation', BUDGET[45].estimation)).toBe('about 3 to 5 minutes');
    expect(buildTimeline(45)[3]!.duration).toBe('about 10 minutes');
    expect(buildTimeline(60)[4]!.duration).toBe('about 25 minutes');
  });

  it('has complete content for every phase', () => {
    for (const p of PHASES) {
      for (const text of [p.name, p.goal, p.looksFor, p.opener, p.mistake]) expect(text.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('props', () => {
  it('accepts 45 or 60 minutes and falls back to 45', () => {
    expect(normalizeLength(60)).toBe(60);
    expect(normalizeLength('60')).toBe(60);
    expect(normalizeLength(45)).toBe(45);
    expect(normalizeLength(undefined)).toBe(45);
    expect(normalizeLength(30)).toBe(45);
  });

  it('clamps the first selected phase to a real index', () => {
    expect(normalizeIndex(undefined, 6)).toBe(0);
    expect(normalizeIndex(4, 6)).toBe(4);
    expect(normalizeIndex('2', 6)).toBe(2);
    expect(normalizeIndex(-3, 6)).toBe(0);
    expect(normalizeIndex(99, 6)).toBe(5);
    expect(normalizeIndex('soon', 6)).toBe(0);
    expect(normalizeIndex(2.6, 6)).toBe(3);
  });
});

describe('minute marks', () => {
  it('runs from 0 to the end in five-minute steps', () => {
    expect(minuteTicks(45)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
    expect(minuteTicks(60)).toHaveLength(13);
    expect(minuteTicks(60, 15)).toEqual([0, 15, 30, 45, 60]);
  });

  it('finds the phase under way at any minute', () => {
    const t = buildTimeline(45);
    expect(phaseAtMinute(t, 0)).toBe(0);
    expect(phaseAtMinute(t, 4.9)).toBe(0);
    expect(phaseAtMinute(t, 5)).toBe(1);
    expect(phaseAtMinute(t, 30)).toBe(4);
    expect(phaseAtMinute(t, 45)).toBe(5);
    expect(phaseAtMinute(t, -1)).toBe(0);
  });
});
