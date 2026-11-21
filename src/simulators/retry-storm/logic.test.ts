import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import { createRng } from '@/lib/random';
import { DEFAULT_CONFIG, backoffCeilingMs, peakToMean, retryDelayMs, runRetrySim, stormDiagram, type RetryPolicy, type RetrySimConfig, type RetrySimResult } from './logic';

const POLICIES: RetryPolicy[] = ['immediate', 'backoff', 'jitter'];
const STALLS = [5, 10, 15, 20, 25, 30, 35, 40];
const between = (r: RetrySimResult, from: number, to: number) => r.samples.filter((s) => s.t > from && s.t <= to);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('retry delays', () => {
  it('double from the base delay up to the cap', () => {
    expect([1, 2, 3, 4, 5, 6].map((k) => backoffCeilingMs(DEFAULT_CONFIG, k))).toEqual([1000, 2000, 4000, 8000, 16000, 16000]);
  });

  it('are zero for immediate retries and the full ceiling for plain backoff', () => {
    const rng = createRng(1);
    expect(retryDelayMs({ ...DEFAULT_CONFIG, policy: 'immediate' }, 4, rng)).toBe(0);
    expect(retryDelayMs({ ...DEFAULT_CONFIG, policy: 'backoff' }, 3, rng)).toBe(4000);
  });

  it('are uniform between zero and the ceiling with full jitter', () => {
    const rng = createRng(2);
    const xs = Array.from({ length: 20000 }, () => retryDelayMs({ ...DEFAULT_CONFIG, policy: 'jitter' }, 3, rng));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(4000);
    expect(sum(xs) / xs.length).toBeGreaterThan(1900);
    expect(sum(xs) / xs.length).toBeLessThan(2100);
  });
});

describe('runRetrySim basics', () => {
  const base = runRetrySim();

  it('is deterministic for a seed', () => {
    expect(runRetrySim().totals).toEqual(base.totals);
    expect(runRetrySim({ seed: 7 }).totals).not.toEqual(base.totals);
  });

  it('takes one sample per second', () => {
    expect(base.samples).toHaveLength(DEFAULT_CONFIG.durationSec);
    expect(base.samples[0]!.t).toBe(1);
    expect(base.samples[base.samples.length - 1]!.t).toBe(DEFAULT_CONFIG.durationSec);
  });

  it('accounts for every request: answered, wasted, dropped, lost when the stall began, or still queued', () => {
    const configs: Partial<RetrySimConfig>[] = [];
    for (const policy of POLICIES) for (const clients of [200, 900, 1600]) for (const outageSec of [5, 40]) configs.push({ policy, clients, outageSec });
    for (const cfg of configs) {
      const r = runRetrySim(cfg);
      const { sent, answered, wasted, dropped, lost } = r.totals;
      expect(sent).toBe(answered + wasted + dropped + lost + r.queueAtEnd);
      expect(sum(r.samples.map((s) => s.sent))).toBe(sent);
    }
  });

  it('runs at about one request per app every 3.6 seconds before the stall, with no failures', () => {
    for (const clients of [200, 900, 1600]) {
      const r = runRetrySim({ clients });
      const expected = clients / (DEFAULT_CONFIG.thinkSec + 0.1);
      expect(r.normalLoad).toBeGreaterThan(expected * 0.9);
      expect(r.normalLoad).toBeLessThan(expected * 1.1);
      expect(sum(between(r, 0, DEFAULT_CONFIG.outageStartSec).map((s) => s.failed))).toBe(0);
    }
  });

  it('answers nothing during the stall', () => {
    for (const policy of POLICIES) {
      const r = runRetrySim({ policy });
      expect(sum(between(r, DEFAULT_CONFIG.outageStartSec, r.outageEndSec).map((s) => s.answered))).toBe(0);
    }
  });

  it('marks every app as failing when the stall begins', () => {
    const r = runRetrySim({ policy: 'backoff' });
    expect(r.samples[DEFAULT_CONFIG.outageStartSec]!.stillFailing).toBe(DEFAULT_CONFIG.clients);
  });
});

describe('challenge 1: immediate retries start a storm that outlives the stall', () => {
  it('roughly triples the load during the stall', () => {
    const r = runRetrySim({ policy: 'immediate' });
    expect(r.outageLoad / r.normalLoad).toBeGreaterThan(2.8);
    expect(r.outageLoad / r.normalLoad).toBeLessThan(3.6);
    expect(r.outageLoad).toBeGreaterThan(r.capacity);
  });

  it('never recovers with 900 apps, however short the stall', () => {
    for (const outageSec of STALLS) {
      const r = runRetrySim({ policy: 'immediate', outageSec });
      expect(r.recoveredAtSec).toBeNull();
      // Busy all the time, answering almost nothing: the work goes to requests nobody waits for.
      const late = between(r, 60, 120);
      for (const s of late) expect(s.sent).toBeGreaterThan(r.capacity);
      expect(sum(late.map((s) => s.answered))).toBeLessThan(late.length * 10);
      expect(sum(late.map((s) => s.wasted))).toBeGreaterThan(late.length * r.capacity * 0.95);
    }
  });
});

describe('challenge 2: with enough headroom, the service survives immediate retries', () => {
  it('recovers with 500 apps but not with 600', () => {
    const fewer = runRetrySim({ policy: 'immediate', clients: 500 });
    expect(fewer.outageLoad).toBeLessThan(fewer.capacity);
    expect(fewer.recoveredAfterSec).not.toBeNull();
    expect(fewer.recoveredAfterSec!).toBeLessThan(10);
    expect(runRetrySim({ policy: 'immediate', clients: 600 }).recoveredAtSec).toBeNull();
  });

  it('recovers at 500 apps or fewer for every stall length', () => {
    for (const clients of [200, 300, 400, 500]) for (const outageSec of STALLS) expect(runRetrySim({ policy: 'immediate', clients, outageSec }).recoveredAtSec).not.toBeNull();
  });

  it('needs normal load to be about a quarter of capacity', () => {
    const r = runRetrySim({ policy: 'immediate', clients: 500 });
    expect(r.normalLoad / r.capacity).toBeGreaterThan(0.24);
    expect(r.normalLoad / r.capacity).toBeLessThan(0.3);
    expect(r.outageLoad / r.normalLoad).toBeGreaterThan(2.8);
  });
});

describe('challenge 3: plain backoff retries in synchronized waves', () => {
  const r = runRetrySim({ policy: 'backoff' });

  it('sends the whole crowd in single seconds, with silence in between, during the stall', () => {
    const during = between(r, DEFAULT_CONFIG.outageStartSec + 1, r.outageEndSec);
    expect(during.filter((s) => s.sent === 0).length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...during.map((s) => s.sent))).toBeGreaterThanOrEqual(DEFAULT_CONFIG.clients * 0.95);
  });

  it('leaves the fixed service idle until the next wave', () => {
    expect(sum(between(r, r.outageEndSec + 1, r.outageEndSec + 14).map((s) => s.sent))).toBe(0);
  });

  it('then hits it with a wave bigger than its capacity, so hundreds of apps fail again', () => {
    expect(r.peakAfterFix).toBeGreaterThan(r.capacity);
    expect(r.afterFix.failed).toBeGreaterThan(200);
    expect(r.recoveredAfterSec!).toBeGreaterThan(25);
  });

  it('is far spikier than jitter during the stall', () => {
    const j = runRetrySim({ policy: 'jitter' });
    expect(peakToMean(r, 12, r.outageEndSec)).toBeGreaterThan(2 * peakToMean(j, 12, j.outageEndSec));
  });
});

describe('challenge 4: jitter spreads the retries out', () => {
  it('has no empty seconds and no crowd-sized spikes once the first retries are spread', () => {
    const r = runRetrySim({ policy: 'jitter' });
    const during = between(r, DEFAULT_CONFIG.outageStartSec + 4, r.outageEndSec);
    for (const s of during) expect(s.sent).toBeGreaterThan(0);
    expect(Math.max(...during.map((s) => s.sent))).toBeLessThan(DEFAULT_CONFIG.clients * 0.5);
  });

  it('keeps the load after the fix under capacity with 900 apps, for every stall length', () => {
    for (const outageSec of STALLS) {
      const r = runRetrySim({ policy: 'jitter', outageSec });
      expect(r.peakAfterFix).toBeLessThan(r.capacity);
      expect(r.recoveredAtSec).not.toBeNull();
    }
  });

  it('peaks far lower than plain backoff after the fix, for any number of apps', () => {
    for (const clients of [200, 600, 900, 1200, 1600]) {
      for (const outageSec of [5, 20, 40]) {
        const j = runRetrySim({ policy: 'jitter', clients, outageSec });
        const b = runRetrySim({ policy: 'backoff', clients, outageSec });
        expect(j.peakAfterFix).toBeLessThan(0.6 * b.peakAfterFix);
      }
    }
  });

  it('recovers sooner than plain backoff at the starting settings', () => {
    const j = runRetrySim({ policy: 'jitter' });
    const b = runRetrySim({ policy: 'backoff' });
    expect(j.recoveredAfterSec!).toBeLessThan(b.recoveredAfterSec!);
  });
});

describe('stormDiagram', () => {
  it('lays out cleanly in every mode', () => {
    for (const policy of POLICIES) {
      const c = { ...DEFAULT_CONFIG, policy };
      const spec = stormDiagram(c, runRetrySim(c));
      for (const mode of ['wide', 'compact', 'narrow'] as const) expect(lintDiagram(spec, [mode])).toEqual([]);
      expect(phoneScale(spec)).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
    }
  });

  it('marks the service down only when it never recovers', () => {
    const stuck = stormDiagram(DEFAULT_CONFIG, runRetrySim());
    expect(stuck.steps![0]!.fail).toEqual(['service']);
    const c = { ...DEFAULT_CONFIG, policy: 'jitter' as const };
    expect(stormDiagram(c, runRetrySim(c)).steps![0]!.fail).toBeUndefined();
  });
});
