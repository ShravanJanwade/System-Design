import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BREAKER,
  advance,
  callResult,
  coolDownLeftMs,
  createBreaker,
  failuresIn,
  recentWaitMs,
  repeat,
  runBreaker,
  type BreakerSim,
} from './logic';

/** Request number n (from 1) arrives at (n - 1) × 500 ms. */
const req = (s: BreakerSim, id: number) => s.requests.find((r) => r.id === id)!;

describe('callResult', () => {
  it('times out slow calls at the timeout', () => {
    expect(callResult('healthy')).toEqual({ outcome: 'success', durationMs: 80 });
    expect(callResult('failing')).toEqual({ outcome: 'error', durationMs: 40 });
    expect(callResult('slow')).toEqual({ outcome: 'timeout', durationMs: 1000 });
    expect(callResult('slow', { ...DEFAULT_BREAKER, timeoutMs: 5000 })).toEqual({ outcome: 'success', durationMs: 3000 });
  });
});

describe('closed', () => {
  it('stays closed while the dependency is healthy', () => {
    const s = runBreaker(repeat('healthy', 30));
    expect(s.state).toBe('closed');
    expect(s.transitions).toEqual([]);
    expect(s.totals.calls).toBe(30);
    expect(s.totals.fast).toBe(0);
    expect(s.window).toHaveLength(10);
    expect(failuresIn(s.window)).toBe(0);
    expect(s.requests.every((r) => r.outcome === 'success' && r.answeredAtMs === r.atMs + 80 && !r.fallback)).toBe(true);
  });

  it('does not trip while failures stay below the threshold in the rolling window', () => {
    const pattern = Array.from({ length: 10 }, () => ['healthy', 'healthy', 'healthy', 'failing', 'failing'] as const).flat();
    const s = runBreaker([...pattern]);
    expect(s.state).toBe('closed');
    expect(failuresIn(s.window)).toBe(4);
    expect(s.totals.failures).toBe(20);
  });

  it('trips on the fifth failure among the last ten calls', () => {
    const healthy = runBreaker(repeat('healthy', 10));
    const four = runBreaker(repeat('failing', 4), DEFAULT_BREAKER, healthy);
    expect(four.state).toBe('closed');
    const five = advance(four, 'failing');
    expect(five.state).toBe('open');
    // Request 15 arrives at 7,000 ms and its error comes back 40 ms later.
    expect(five.transitions).toEqual([{ atMs: 7040, from: 'closed', to: 'open', reason: 'tripped' }]);
    expect(five.lastStep).toHaveLength(1);
  });
});

describe('open', () => {
  const tripped = runBreaker([...repeat('healthy', 10), ...repeat('failing', 5)]);

  it('fails fast with the fallback, without calling the dependency', () => {
    expect(coolDownLeftMs(tripped)).toBe(4540);
    const s = runBreaker(repeat('failing', 10), DEFAULT_BREAKER, tripped);
    for (let id = 16; id <= 25; id++) {
      const r = req(s, id);
      expect(r.kind).toBe('fast');
      expect(r.fallback).toBe(true);
      expect(r.answeredAtMs).toBe(r.atMs);
    }
    expect(s.totals.calls).toBe(15);
    expect(s.state).toBe('open');
    // The cool-down ended at 12,040 ms, so the next request, at 12,500 ms, will be the trial.
    expect(coolDownLeftMs(s)).toBe(0);
  });

  it('sends exactly one trial after the cool-down, and opens again when it fails', () => {
    const s = runBreaker(repeat('failing', 11), DEFAULT_BREAKER, tripped);
    const trial = req(s, 26);
    expect(trial.kind).toBe('trial');
    expect(trial.state).toBe('half-open');
    expect(s.lastStep.map((t) => t.reason)).toEqual(['cool-down over', 'trial failed']);
    expect(s.state).toBe('open');
    expect(s.openedAtMs).toBe(12540);
    // The next ten requests fail fast; the one after is the next trial.
    const later = runBreaker(repeat('failing', 11), DEFAULT_BREAKER, s);
    expect(later.requests.filter((r) => r.id > 26 && r.id < 37).every((r) => r.kind === 'fast')).toBe(true);
    expect(req(later, 37).kind).toBe('trial');
  });

  it('closes after a successful trial and starts counting afresh', () => {
    const waiting = runBreaker(repeat('failing', 10), DEFAULT_BREAKER, tripped);
    const s = advance(waiting, 'healthy');
    expect(req(s, 26).kind).toBe('trial');
    expect(s.state).toBe('closed');
    expect(s.window).toEqual([]);
    expect(s.lastStep.map((t) => `${t.from}>${t.to}`)).toEqual(['open>half-open', 'half-open>closed']);
    const after = advance(s, 'healthy');
    expect(req(after, 27).kind).toBe('call');
    expect(after.window).toEqual(['success']);
  });
});

describe('a slow dependency', () => {
  const healthy = runBreaker(repeat('healthy', 10));
  const slow = runBreaker(repeat('slow', 7), DEFAULT_BREAKER, healthy);

  it('times out each call, making users wait the full timeout until the breaker trips', () => {
    expect(slow.state).toBe('open');
    // Requests 11 to 16 were calls; the fifth timeout (request 15) lands at 8,000 ms and trips the breaker.
    expect(slow.transitions[0]).toEqual({ atMs: 8000, from: 'closed', to: 'open', reason: 'tripped' });
    for (let id = 11; id <= 15; id++) expect(req(slow, id).answeredAtMs! - req(slow, id).atMs).toBe(1000);
    expect(req(slow, 16).kind).toBe('call');
    expect(req(slow, 16).answeredAtMs).toBeNull();
    expect(req(slow, 17).kind).toBe('fast');
    expect(slow.totals.calls).toBe(16);
  });

  it('ignores a call that finishes after the breaker opened', () => {
    const s = advance(slow, 'slow');
    expect(req(s, 16).outcome).toBe('timeout');
    expect(req(s, 16).answeredAtMs).toBe(8500);
    expect(failuresIn(s.window)).toBe(5);
    expect(s.state).toBe('open');
    expect(s.transitions).toHaveLength(1);
  });

  it('lets only one trial through while that trial is still waiting', () => {
    // Open at 8,000 ms, so the cool-down ends at 13,000 ms: request 27.
    const s = runBreaker(repeat('slow', 12), DEFAULT_BREAKER, slow);
    expect(req(s, 27).kind).toBe('trial');
    expect(req(s, 28).kind).toBe('fast');
    expect(req(s, 28).state).toBe('half-open');
    expect(req(s, 29).kind).toBe('fast');
    expect(s.transitions.map((t) => t.reason)).toEqual(['tripped', 'cool-down over', 'trial failed']);
    expect(s.transitions[2]!.atMs).toBe(14000);
  });

  it('cuts the average wait once the breaker is open', () => {
    expect(recentWaitMs(slow, 5)).toBe(800);
    const s = runBreaker(repeat('slow', 8), DEFAULT_BREAKER, slow);
    expect(recentWaitMs(s, 5)).toBe(0);
  });
});

describe('advance', () => {
  it('leaves the previous state untouched', () => {
    const a = runBreaker([...repeat('healthy', 3), ...repeat('slow', 6)]);
    const snapshot = JSON.stringify(a);
    advance(a, 'failing');
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it('starts closed at time zero', () => {
    const s = createBreaker();
    expect(s.state).toBe('closed');
    expect(s.nowMs).toBe(0);
    expect(recentWaitMs(s)).toBeNull();
  });
});
