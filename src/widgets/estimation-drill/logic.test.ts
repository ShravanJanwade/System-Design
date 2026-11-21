import { describe, expect, it } from 'vitest';
import {
  DRILLS,
  TOLERANCE,
  acceptedRange,
  clock,
  createTimer,
  finalMessage,
  grade,
  isExpired,
  offBy,
  parseNumber,
  pause,
  recordResult,
  resume,
  setEnabled,
  tally,
  tick,
  timerAnnouncement,
  timerOnFromProps,
  withinTolerance,
  type DrillResult,
} from './logic';

const drill = (id: string) => DRILLS.find((d) => d.id === id)!;

describe('drills', () => {
  it('have unique ids, a countdown, stated givens and a solution of at least three lines', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    for (const d of DRILLS) {
      expect(d.seconds).toBeGreaterThan(0);
      expect(d.givens.length).toBeGreaterThanOrEqual(2);
      expect(d.solution.length).toBeGreaterThanOrEqual(3);
      expect(d.answer).toBeGreaterThan(0);
      expect(d.decision.trim().length).toBeGreaterThan(0);
    }
  });

  it('match the arithmetic their solutions show', () => {
    expect((1e7 * 50) / 1e5).toBe(drill('views-per-second').answer);
    // The exact answer with 86,400 seconds still counts.
    expect(withinTolerance((1e7 * 50) / 86_400, drill('views-per-second').answer)).toBe(true);
    // 1 million photos × 2 MB = 2 TB a day; × 365.
    expect(((1e6 * 2) / 1e6) * 365).toBe(drill('storage-per-year').answer);
    // 5,000 views × 200 KB, in GB (10⁶ KB per GB).
    expect((5000 * 200) / 1e6).toBe(drill('bandwidth').answer);
    // 20% of 500 million records × 1 KB, in GB.
    expect((0.2 * 5e8 * 1) / 1e6).toBeCloseTo(drill('cache-size').answer);
    // 100 million links a month for five years × 500 bytes, in TB.
    expect((1e8 * 12 * 5 * 500) / 1e12).toBe(drill('links-five-years').answer);
  });
});

describe('answers', () => {
  it('parses numbers the way the quiz does', () => {
    expect(parseNumber('5000')).toBe(5000);
    expect(parseNumber(' 5,000 ')).toBe(5000);
    expect(parseNumber('5k')).toBe(5000);
    expect(parseNumber('1.2M')).toBe(1_200_000);
    expect(parseNumber('2b')).toBe(2e9);
    expect(parseNumber('5e3')).toBe(5000);
    expect(parseNumber('0.5')).toBe(0.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('about 5000')).toBeNull();
    expect(parseNumber('5,000 views')).toBeNull();
  });

  it('accepts anything within 2× of the reference, boundaries included', () => {
    expect(TOLERANCE).toBe(2);
    expect(withinTolerance(2500, 5000)).toBe(true);
    expect(withinTolerance(10_000, 5000)).toBe(true);
    expect(withinTolerance(2499, 5000)).toBe(false);
    expect(withinTolerance(10_001, 5000)).toBe(false);
    expect(withinTolerance(0.5, 1)).toBe(true);
    expect(withinTolerance(0.49, 1)).toBe(false);
    expect(acceptedRange(730)).toEqual({ low: 365, high: 1460 });
  });

  it('says how far off a miss is, and in which direction', () => {
    const d = drill('views-per-second');
    const close = grade(d, 6000);
    expect(close.correct).toBe(true);
    expect(offBy(close)).toBe('within 2× of the reference');
    const high = grade(d, 50_000);
    expect(high).toMatchObject({ correct: false, direction: 'high', factor: 10 });
    expect(offBy(high)).toBe('about 10 times too high');
    const low = grade(d, 1000);
    expect(low).toMatchObject({ correct: false, direction: 'low', factor: 5 });
    expect(offBy(low)).toBe('about 5 times too low');
    expect(offBy(grade(d, 0))).toBe('not a positive number');
  });

  it('catches the classic lost factor of 1,000', () => {
    // 1,000,000 KB written down as 1,000 GB instead of 1 GB.
    const g = grade(drill('bandwidth'), 1000);
    expect(g.correct).toBe(false);
    expect(offBy(g)).toBe('about 1,000 times too high');
  });
});

describe('timer', () => {
  it('counts down, stops at zero and then reports time up', () => {
    let t = createTimer(60);
    expect(t).toEqual({ limit: 60, remaining: 60, running: true, enabled: true });
    t = tick(t, 1);
    expect(t.remaining).toBe(59);
    t = tick(t, 100);
    expect(t.remaining).toBe(0);
    expect(t.running).toBe(false);
    expect(isExpired(t)).toBe(true);
    expect(tick(t, 1)).toBe(t);
  });

  it('does not move while paused, and resumes from where it stopped', () => {
    let t = tick(createTimer(60), 15);
    t = pause(t);
    expect(tick(t, 10).remaining).toBe(45);
    t = resume(t);
    expect(t.running).toBe(true);
    expect(tick(t, 5).remaining).toBe(40);
  });

  it('never expires when switched off, and carries on when switched back on', () => {
    let t = setEnabled(tick(createTimer(60), 20), false);
    expect(t.running).toBe(false);
    expect(tick(t, 100).remaining).toBe(40);
    expect(isExpired(t)).toBe(false);
    expect(resume(t).running).toBe(false);
    t = setEnabled(t, true);
    expect(t.running).toBe(true);
    expect(t.remaining).toBe(40);
    expect(createTimer(60, false).running).toBe(false);
  });

  it('cannot resume once time is up', () => {
    const t = tick(createTimer(30), 30);
    expect(resume(t).running).toBe(false);
    expect(setEnabled(t, true).running).toBe(false);
  });

  it('formats the clock and announces only at ten seconds and at zero', () => {
    expect(clock(90)).toBe('1:30');
    expect(clock(65)).toBe('1:05');
    expect(clock(9)).toBe('0:09');
    expect(clock(-3)).toBe('0:00');
    expect(timerAnnouncement({ limit: 60, remaining: 11, running: true, enabled: true })).toBe('');
    expect(timerAnnouncement({ limit: 60, remaining: 10, running: true, enabled: true })).toBe('10 seconds left.');
    expect(timerAnnouncement({ limit: 60, remaining: 0, running: false, enabled: true })).toMatch(/Time is up/);
    expect(timerAnnouncement({ limit: 60, remaining: 0, running: false, enabled: false })).toBe('');
  });

  it('reads the starting state from props', () => {
    expect(timerOnFromProps(undefined)).toBe(true);
    expect(timerOnFromProps(true)).toBe(true);
    expect(timerOnFromProps(false)).toBe(false);
    expect(timerOnFromProps('false')).toBe(false);
  });
});

describe('scoring', () => {
  it('records whether an answer was in range and in time', () => {
    const d = drill('cache-size');
    expect(recordResult(d, 120, tick(createTimer(60), 30))).toEqual({ drillId: 'cache-size', status: 'correct', inTime: true, value: 120 });
    expect(recordResult(d, 120, tick(createTimer(60), 60)).inTime).toBe(false);
    expect(recordResult(d, 120, createTimer(60, false)).inTime).toBeNull();
    expect(recordResult(d, 1000, createTimer(60)).status).toBe('wrong');
    expect(recordResult(d, null, createTimer(60)).status).toBe('revealed');
  });

  it('keeps a running tally', () => {
    const results: DrillResult[] = [
      { drillId: 'a', status: 'correct', inTime: true, value: 1 },
      { drillId: 'b', status: 'correct', inTime: false, value: 1 },
      { drillId: 'c', status: 'wrong', inTime: true, value: 1 },
      { drillId: 'd', status: 'correct', inTime: null, value: 1 },
      { drillId: 'e', status: 'revealed', inTime: true, value: null },
    ];
    expect(tally(results)).toEqual({ done: 5, correct: 3, correctInTime: 1, timed: 4, revealed: 1 });
    expect(tally([])).toEqual({ done: 0, correct: 0, correctInTime: 0, timed: 0, revealed: 0 });
  });

  it('ends the series with a message that matches the score', () => {
    const t = (correct: number) => ({ done: 5, correct, correctInTime: 0, timed: 0, revealed: 0 });
    expect(finalMessage(t(5), 5)).toMatch(/Every estimate/);
    expect(finalMessage(t(3), 5)).toMatch(/Most estimates/);
    expect(finalMessage(t(1), 5)).toMatch(/Several estimates missed/);
  });
});
