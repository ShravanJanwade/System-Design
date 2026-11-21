import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import {
  AVAILABILITY_STEPS,
  DEFAULT_STAGES,
  KIND_ORDER,
  MAX_STAGES,
  addStage,
  chainAvailability,
  chainDiagram,
  chainUnavailability,
  challengeProgress,
  downtimeSeconds,
  formatAvailability,
  formatDuration,
  ninesCount,
  parseStages,
  removeStage,
  serializeStages,
  stageAvailability,
  updateStage,
  weakestStageIds,
  type Stage,
} from './logic';

const stage = (availability: number, copies = 1, id = `x${Math.random()}`): Stage => ({ id, kind: 'app', availability, copies });
const year = (a: number) => formatDuration(downtimeSeconds(1 - a, 'year'));
const month = (a: number) => formatDuration(downtimeSeconds(1 - a, 'month'));

describe('the nines as downtime (the lesson’s table)', () => {
  it('turns availability into downtime per year and per 30-day month', () => {
    expect([year(0.99), month(0.99)]).toEqual(['3.7 days', '7.2 hours']);
    expect([year(0.999), month(0.999)]).toEqual(['8.8 hours', '43 minutes']);
    expect([year(0.9999), month(0.9999)]).toEqual(['53 minutes', '4.3 minutes']);
    expect([year(0.99999), month(0.99999)]).toEqual(['5.3 minutes', '26 seconds']);
  });

  it('counts the nines', () => {
    expect(ninesCount(1 - 0.99)).toBe(2);
    expect(ninesCount(1 - 0.999)).toBe(3);
    expect(ninesCount(1 - 0.9995)).toBe(3);
    expect(ninesCount(1 - 0.9999)).toBe(4);
    expect(ninesCount(0)).toBe(Infinity);
  });

  it('Snapgram’s four-hour crash: about 99.95% for the year, but only about 99.4% for that month', () => {
    expect(formatAvailability(4 / (365 * 24))).toBe('99.9543%');
    expect(formatAvailability(4 / (30 * 24))).toBe('99.444%');
    // Four hours is about half of a three-nines year’s allowance of 8.8 hours.
    expect(4 / (0.001 * 365 * 24)).toBeCloseTo(0.457, 2);
  });
});

describe('series and parallel', () => {
  it('a single copy is just its own availability', () => {
    expect(stageAvailability(stage(0.999))).toBeCloseTo(0.999, 12);
    expect(chainAvailability([stage(0.999)])).toBeCloseTo(0.999, 12);
  });

  it('series multiplies: three 99.9% parts make about 99.7%, worse than any one (challenge 1)', () => {
    const chain = [stage(0.999), stage(0.999), stage(0.999)];
    const a = chainAvailability(chain);
    expect(a).toBeCloseTo(0.997003, 8);
    expect(a).toBeLessThan(0.999);
    expect(formatAvailability(1 - a)).toBe('99.7%');
    expect(year(a)).toBe('26 hours');
    expect(year(0.999)).toBe('8.8 hours');
    expect(challengeProgress(chain).series).toBe(true);
  });

  it('a chain is always worse than its weakest stage', () => {
    for (const steps of [[0.9999, 0.999], [0.99, 0.99999, 0.9995], [0.95, 0.95]]) {
      const chain = steps.map((a) => stage(a));
      expect(chainAvailability(chain)).toBeLessThan(Math.min(...steps));
    }
  });

  it('parallel: two 99% copies tie one 99.99% part, three beat it (challenge 2)', () => {
    expect(chainUnavailability([stage(0.99, 2)])).toBeCloseTo(1e-4, 12);
    expect(formatAvailability(chainUnavailability([stage(0.99, 2)]))).toBe('99.99%');
    expect(chainAvailability([stage(0.99, 2)])).not.toBeGreaterThan(0.9999 + 1e-12);
    expect(formatAvailability(chainUnavailability([stage(0.99, 3)]))).toBe('99.9999%');
    expect(chainAvailability([stage(0.99, 3)])).toBeGreaterThan(0.9999);
    expect(challengeProgress([stage(0.99, 2)]).parallel).toBe(false);
    expect(challengeProgress([stage(0.99, 3)]).parallel).toBe(true);
  });

  it('four nines from 99.9% parts needs a second copy in every stage (challenge 3)', () => {
    const oneSingle = [stage(0.999, 2), stage(0.999, 1), stage(0.999, 2)];
    expect(chainAvailability(oneSingle)).toBeLessThan(0.999);
    expect(challengeProgress(oneSingle).fourNines).toBe(false);
    const doubled = [stage(0.999, 2), stage(0.999, 2), stage(0.999, 2)];
    expect(stageAvailability(doubled[0]!)).toBeCloseTo(0.999999, 12);
    expect(chainAvailability(doubled)).toBeGreaterThan(0.99999);
    expect(formatAvailability(chainUnavailability(doubled))).toBe('99.9997%');
    expect(challengeProgress(doubled).fourNines).toBe(true);
  });

  it('a 99.999% part next to a 99% part is closer to 99% (challenge 4)', () => {
    const chain = [stage(0.99999), stage(0.99)];
    const a = chainAvailability(chain);
    expect(Math.abs(a - 0.99)).toBeLessThan(Math.abs(a - 0.99999));
    expect(formatAvailability(1 - a)).toBe('98.99%');
    expect(challengeProgress(chain).weakestLink).toBe(true);
    expect(challengeProgress([stage(0.99999), stage(0.999)]).weakestLink).toBe(false);
  });

  it('keeps tiny unavailabilities precise instead of rounding to 100%', () => {
    const u = chainUnavailability([stage(0.99999, 5)]);
    expect(u).toBeGreaterThan(0);
    expect(ninesCount(u)).toBe(25);
    expect(formatAvailability(u)).toBe('over 99.9999999%');
    expect(formatDuration(downtimeSeconds(u, 'year'))).toBe('under a second');
  });

  it('the starting chain: DNS, one app server and one database give about 99.79%', () => {
    const u = chainUnavailability(DEFAULT_STAGES);
    expect(formatAvailability(u)).toBe('99.79%');
    expect(formatDuration(downtimeSeconds(u, 'year'))).toBe('18 hours');
    expect(weakestStageIds(DEFAULT_STAGES)).toEqual(['s2', 's3']);
  });
});

describe('formatting', () => {
  it('truncates instead of rounding up, and keeps two significant digits of downtime', () => {
    expect(formatAvailability(0.01)).toBe('99%');
    expect(formatAvailability(0.1)).toBe('90%');
    expect(formatAvailability(1 - 0.9995)).toBe('99.95%');
    expect(formatAvailability(1 - 0.997903)).toBe('99.79%');
    expect(formatAvailability(3e-6)).toBe('99.9997%');
  });

  it('formats durations', () => {
    expect(formatDuration(0.4)).toBe('under a second');
    expect(formatDuration(1)).toBe('1 second');
    expect(formatDuration(90)).toBe('90 seconds');
    expect(formatDuration(600)).toBe('10 minutes');
    expect(formatDuration(4 * 3600)).toBe('4 hours');
    expect(formatDuration(3 * 86400)).toBe('3 days');
  });
});

describe('editing the chain', () => {
  it('adds, updates and removes stages within the limits', () => {
    let s = DEFAULT_STAGES;
    s = addStage(s, 'cache');
    expect(s).toHaveLength(4);
    expect(s[3]!.id).toBe('s4');
    s = updateStage(s, 's4', { copies: 9, availability: 0.9991 });
    expect(s[3]!.copies).toBe(5);
    expect(s[3]!.availability).toBe(0.999);
    s = removeStage(s, 's1');
    expect(s.map((x) => x.id)).toEqual(['s2', 's3', 's4']);
    let full = DEFAULT_STAGES;
    for (let i = 0; i < 10; i++) full = addStage(full);
    expect(full).toHaveLength(MAX_STAGES);
    expect(removeStage([DEFAULT_STAGES[0]!], 's1')).toHaveLength(1);
  });

  it('parses and writes presets', () => {
    const parsed = parseStages('dns:99.99,app:99.9x2,database:99.9');
    expect(parsed?.map((s) => [s.kind, s.availability, s.copies])).toEqual([
      ['dns', 0.9999, 1],
      ['app', 0.999, 2],
      ['database', 0.999, 1],
    ]);
    expect(serializeStages(parsed!)).toBe('dns:99.99,app:99.9x2,database:99.9');
    expect(parseStages('rocket:99')).toBeNull();
    expect(parseStages('')).toBeNull();
  });
});

describe('chainDiagram', () => {
  it('lays out cleanly in every mode, for every chain length', () => {
    for (let n = 1; n <= MAX_STAGES; n++) {
      const stages: Stage[] = Array.from({ length: n }, (_, i) => ({
        id: `s${i + 1}`,
        kind: KIND_ORDER[i % KIND_ORDER.length]!,
        availability: AVAILABILITY_STEPS[(i * 3) % AVAILABILITY_STEPS.length]!,
        copies: (i % 5) + 1,
      }));
      const spec = chainDiagram(stages);
      expect(spec.nodes).toHaveLength(n + 1);
      for (const mode of ['wide', 'compact', 'narrow'] as const) {
        expect(lintDiagram(spec, [mode])).toEqual([]);
        expect(phoneScale(spec)).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
      }
    }
  });

  it('marks the weakest stage, and nothing when all stages tie', () => {
    expect(chainDiagram(DEFAULT_STAGES).steps?.[0]?.notes?.map((n) => n.target)).toEqual(['s2', 's3']);
    const tied = [stage(0.999, 1, 'a'), stage(0.999, 1, 'b')];
    expect(chainDiagram(tied).steps).toBeUndefined();
  });

  it('describes the chain for screen readers', () => {
    expect(chainDiagram(DEFAULT_STAGES).description).toContain('3 stages in series');
    expect(chainDiagram(DEFAULT_STAGES).description).toContain('99.79%');
  });
});
