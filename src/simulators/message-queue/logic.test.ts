import { describe, expect, it } from 'vitest';
import { lintDiagram } from '@/diagram/chips';
import { PHONE_MIN_SCALE, phoneScale } from '@/diagram/phone';
import { createRng } from '@/lib/random';
import { DEFAULT_CONFIG, poisson, poisonTimes, queueDiagram, runQueueSim, type QueueSimConfig, type QueueSimResult } from './logic';

const at = (r: QueueSimResult, t: number) => r.samples.find((s) => s.t === t)!;

/** Every job ends up somewhere: finished, rejected, dead-lettered, waiting, held back or in a worker's hands. */
function accounted(r: QueueSimResult) {
  const { created, processed, rejected, deadLettered } = r.totals;
  return created === processed + rejected + deadLettered + r.end.depth + r.end.held + r.end.inFlight;
}

describe('poisson', () => {
  it('averages to its mean', () => {
    const rng = createRng(7);
    for (const mean of [0.5, 2, 6, 18]) {
      let sum = 0;
      for (let i = 0; i < 20000; i++) sum += poisson(rng, mean);
      expect(sum / 20000).toBeGreaterThan(mean * 0.95);
      expect(sum / 20000).toBeLessThan(mean * 1.05);
    }
  });

  it('is zero for a zero rate', () => {
    expect(poisson(createRng(1), 0)).toBe(0);
  });
});

describe('runQueueSim basics', () => {
  const base = runQueueSim();

  it('is deterministic for a seed', () => {
    expect(runQueueSim().totals).toEqual(base.totals);
    expect(runQueueSim({ seed: 99 }).totals).not.toEqual(base.totals);
  });

  it('takes one sample per second', () => {
    expect(base.samples).toHaveLength(DEFAULT_CONFIG.durationSec);
    expect(base.samples[0]!.t).toBe(1);
    expect(base.samples[base.samples.length - 1]!.t).toBe(DEFAULT_CONFIG.durationSec);
  });

  it('produces uploads at about the configured rate', () => {
    const expected = DEFAULT_CONFIG.rate * DEFAULT_CONFIG.durationSec;
    expect(base.totals.created).toBeGreaterThan(expected * 0.93);
    expect(base.totals.created).toBeLessThan(expected * 1.07);
  });

  it('accounts for every job in every mode', () => {
    const configs: Partial<QueueSimConfig>[] = [
      {},
      { consumers: 6, spike: true },
      { consumers: 5, poison: true, dlq: false },
      { consumers: 5, poison: true, dlq: true },
      { consumers: 5, spike: true, maxDepth: 200, whenFull: 'reject' },
      { consumers: 5, spike: true, maxDepth: 200, whenFull: 'wait', poison: true },
      { consumers: 1, speed: 1, rate: 60, spike: true },
    ];
    for (const cfg of configs) expect(accounted(runQueueSim(cfg))).toBe(true);
  });

  it('a worker finishes `speed` jobs per second when it always has work', () => {
    const r = runQueueSim({ consumers: 2, speed: 4, rate: 40 });
    const busySeconds = r.samples.slice(10);
    const avg = busySeconds.reduce((s, x) => s + x.processed, 0) / busySeconds.length;
    expect(avg).toBeCloseTo(8, 0);
  });
});

describe('challenge 1: add consumers until the queue drains', () => {
  it('three workers (15 jobs/s) fall behind 20 uploads/s, so depth and lag keep growing', () => {
    const r = runQueueSim({ consumers: 3 });
    expect(r.capacityPerSec).toBe(15);
    expect(at(r, 60).depth).toBeGreaterThan(200);
    expect(at(r, 120).depth).toBeGreaterThan(at(r, 60).depth + 200);
    expect(r.end.depth).toBeGreaterThan(450);
    expect(r.end.lagSec).toBeGreaterThan(20);
  });

  it('the backlog grows by roughly the difference between arrivals and capacity', () => {
    const r = runQueueSim({ consumers: 3 });
    const growth = (at(r, 120).depth - at(r, 20).depth) / 100;
    expect(growth).toBeGreaterThan(3.5);
    expect(growth).toBeLessThan(6.5);
  });

  it('five workers (25 jobs/s) keep the queue near empty', () => {
    const r = runQueueSim({ consumers: 5 });
    expect(r.end.depth).toBeLessThan(20);
    expect(r.peak.depth).toBeLessThan(60);
    expect(r.peak.lagSec).toBeLessThan(5);
  });
});

describe('challenge 2: a spike is absorbed, then drained', () => {
  it('with six workers the queue climbs to a few hundred, loses nothing, and empties within a minute of the spike', () => {
    const r = runQueueSim({ consumers: 6, spike: true });
    // (60 arriving - 30 finished) per second for 15 seconds is about 450.
    expect(r.peak.depth).toBeGreaterThan(330);
    expect(r.peak.depth).toBeLessThan(570);
    expect(r.totals.rejected).toBe(0);
    const spikeEnd = DEFAULT_CONFIG.spikeStartSec + DEFAULT_CONFIG.spikeSec;
    expect(r.drainedAtSec).not.toBeNull();
    expect(r.drainedAtSec!).toBeGreaterThan(spikeEnd + 25);
    expect(r.drainedAtSec!).toBeLessThan(spikeEnd + 65);
    expect(r.end.depth).toBeLessThan(20);
  });

  it('jobs that arrive during the spike wait longer: lag rises, then falls back', () => {
    const r = runQueueSim({ consumers: 6, spike: true });
    expect(r.peak.lagSec).toBeGreaterThan(10);
    expect(r.end.lagSec).toBeLessThan(2);
  });

  it('with less spare capacity the same spike takes much longer to drain', () => {
    const six = runQueueSim({ consumers: 6, spike: true });
    const five = runQueueSim({ consumers: 5, spike: true });
    expect(five.peak.depth).toBeGreaterThan(six.peak.depth);
    if (five.drainedAtSec !== null) expect(five.drainedAtSec).toBeGreaterThan(six.drainedAtSec! + 30);
    else expect(five.end.depth).toBeGreaterThan(0);
  });
});

describe('challenge 3: a poison message with and without a dead-letter queue', () => {
  it('sends a broken photo every 15 seconds from the 10-second mark', () => {
    expect(poisonTimes({ ...DEFAULT_CONFIG, poison: true }).map((ms) => ms / 1000)).toEqual([10, 25, 40, 55, 70, 85, 100, 115]);
    expect(poisonTimes(DEFAULT_CONFIG)).toEqual([]);
  });

  it('without a dead-letter queue, each broken photo that reaches a worker traps it for good', () => {
    const r = runQueueSim({ consumers: 5, poison: true, dlq: false });
    expect(at(r, 9).stuck).toBe(0);
    expect(at(r, 15).stuck).toBe(1);
    for (let i = 1; i < r.samples.length; i++) expect(r.samples[i]!.stuck).toBeGreaterThanOrEqual(r.samples[i - 1]!.stuck);
    expect(r.end.stuck).toBeGreaterThanOrEqual(3);
    expect(r.totals.deadLettered).toBe(0);
    expect(r.totals.failedAttempts).toBeGreaterThan(1000);
  });

  it('every trapped worker takes its share of capacity with it, so the queue grows faster and faster', () => {
    const r = runQueueSim({ consumers: 5, poison: true, dlq: false });
    const last = r.samples.slice(-10);
    const rate = last.reduce((s, x) => s + x.processed, 0) / last.length;
    expect(rate).toBeCloseTo((5 - r.end.stuck) * DEFAULT_CONFIG.speed, -1);
    expect(r.end.depth).toBeGreaterThan(700);
    // Later broken photos sit behind the growing backlog, so they reach a worker later and later.
    expect(at(r, 60).depth - at(r, 40).depth).toBeLessThan(at(r, 120).depth - at(r, 100).depth);
  });

  it('with a single worker, the first broken photo stops all processing', () => {
    const r = runQueueSim({ consumers: 1, rate: 3, poison: true, dlq: false });
    expect(r.allStuckAtSec).toBeGreaterThanOrEqual(10);
    expect(r.allStuckAtSec!).toBeLessThan(10.5);
    expect(r.samples.filter((s) => s.t > 11).every((s) => s.processed === 0)).toBe(true);
  });

  it('with a dead-letter queue, each broken photo is tried three times, moved aside, and the workers keep up', () => {
    const r = runQueueSim({ consumers: 5, poison: true, dlq: true });
    const clean = runQueueSim({ consumers: 5 });
    expect(r.totals.poisonSent).toBe(8);
    expect(r.totals.deadLettered).toBe(8);
    expect(r.deadLetters.every((d) => d.attempts === DEFAULT_CONFIG.maxAttempts)).toBe(true);
    expect(r.totals.failedAttempts).toBe(8 * DEFAULT_CONFIG.maxAttempts);
    expect(r.peak.stuck).toBe(0);
    expect(r.end.depth).toBeLessThan(20);
    expect(Math.abs(r.totals.processed - clean.totals.processed)).toBeLessThan(15);
  });
});

describe('challenge 4: backpressure on a bounded queue', () => {
  const cfg: Partial<QueueSimConfig> = { consumers: 5, spike: true, maxDepth: 300 };

  it('never lets the queue grow past its limit', () => {
    for (const whenFull of ['reject', 'wait'] as const) {
      const r = runQueueSim({ ...cfg, whenFull });
      expect(r.peak.depth).toBeLessThanOrEqual(300);
      expect(r.firstFullAtSec).not.toBeNull();
    }
  });

  it('reject mode turns uploads away once the queue is full', () => {
    const r = runQueueSim({ ...cfg, whenFull: 'reject' });
    expect(r.totals.rejected).toBeGreaterThan(100);
    expect(r.peak.held).toBe(0);
  });

  it('wait mode loses nothing: producers hold uploads back and slow to the workers’ pace', () => {
    const r = runQueueSim({ ...cfg, whenFull: 'wait' });
    expect(r.totals.rejected).toBe(0);
    expect(r.peak.held).toBeGreaterThan(100);
    // While the queue is full, jobs enter only as fast as workers finish them.
    const fullSeconds = r.samples.filter((s) => s.held > 0 && s.t > 20);
    const entered = fullSeconds.reduce((sum, s) => sum + s.processed, 0) / fullSeconds.length;
    expect(entered).toBeGreaterThan(20);
    expect(entered).toBeLessThan(30);
  });

  it('without a limit the same spike is simply absorbed', () => {
    const r = runQueueSim({ consumers: 5, spike: true });
    expect(r.peak.depth).toBeGreaterThan(300);
    expect(r.totals.rejected).toBe(0);
    expect(r.firstFullAtSec).toBeNull();
  });
});

describe('queueDiagram', () => {
  it('lays out cleanly in every mode, with long readouts', () => {
    const combos: Partial<QueueSimConfig>[] = [
      {},
      { dlq: false },
      { spike: true, rate: 60, consumers: 12, speed: 10 },
      { spike: true, maxDepth: 1000, whenFull: 'reject', consumers: 1, speed: 1, rate: 60 },
      { poison: true, dlq: false, consumers: 12 },
      { poison: true, dlq: true, maxDepth: 300, whenFull: 'wait', spike: true, rate: 60 },
    ];
    for (const partial of combos) {
      const c = { ...DEFAULT_CONFIG, ...partial };
      const spec = queueDiagram(c, runQueueSim(c));
      for (const mode of ['wide', 'compact', 'narrow'] as const) expect(lintDiagram(spec, [mode])).toEqual([]);
      expect(phoneScale(spec)).toBeGreaterThanOrEqual(PHONE_MIN_SCALE);
    }
  });

  it('shows the dead-letter queue only when it is on, and marks the workers down when all are stuck', () => {
    const on = queueDiagram(DEFAULT_CONFIG, runQueueSim());
    expect(on.nodes.some((n) => n.id === 'dlq')).toBe(true);
    const c = { ...DEFAULT_CONFIG, consumers: 1, rate: 3, poison: true, dlq: false };
    const off = queueDiagram(c, runQueueSim(c));
    expect(off.nodes.some((n) => n.id === 'dlq')).toBe(false);
    expect(off.steps?.[0]?.fail).toEqual(['workers']);
    expect(off.edges.every((e) => e.kind === 'async')).toBe(true);
  });
});
