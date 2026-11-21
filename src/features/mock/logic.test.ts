import { describe, expect, it } from 'vitest';
import { BUDGET, buildTimeline, PHASES } from '@/widgets/interview-timeline/logic';
import { INTERVIEWER_PROMPTS, MINUTE, followUpCount, followUpTimes, interviewerLog, mockClock, pickFollowUps } from './logic';

describe('mockClock', () => {
  it('follows the framework’s six phases for 45 minutes', () => {
    const at = (min: number) => mockClock(45, min * MINUTE);
    expect(at(0).phase.id).toBe('requirements');
    expect(at(0).phaseRemainingMs).toBe(5 * MINUTE);
    expect(at(7).phase.id).toBe('estimation');
    expect(at(12).phase.id).toBe('api');
    expect(at(20).phase.id).toBe('high-level');
    expect(at(30).phase.id).toBe('deep-dives');
    expect(at(44).phase.id).toBe('wrap-up');
    expect(at(44).remainingMs).toBe(MINUTE);
    expect(at(44).overtime).toBe(false);
  });

  it('gives the extra quarter hour of a 60-minute interview to design and deep dives', () => {
    const c = mockClock(60, 31 * MINUTE);
    expect(c.phase.id).toBe('deep-dives');
    expect(c.phase.minutes).toBe(25);
    expect(c.phaseElapsedMs).toBe(MINUTE);
    expect(c.phaseRemainingMs).toBe(24 * MINUTE);
  });

  it('uses the interview timeline’s budget exactly', () => {
    for (const length of [45, 60] as const) {
      const c = mockClock(length, 0);
      expect(c.phases).toEqual(buildTimeline(length));
      expect(c.phases.map((p) => p.minutes)).toEqual(PHASES.map((p) => BUDGET[length][p.id]));
      expect(c.totalMs).toBe(length * MINUTE);
    }
  });

  it('reports overtime once the length is used up, in the last phase', () => {
    const c = mockClock(45, 50 * MINUTE);
    expect(c.overtime).toBe(true);
    expect(c.index).toBe(5);
    expect(c.remainingMs).toBe(0);
    expect(c.phaseRemainingMs).toBe(0);
  });

  it('treats a negative time as the start', () => {
    expect(mockClock(45, -1000).elapsedMs).toBe(0);
  });
});

describe('follow-ups', () => {
  it('asks two in 45 minutes and three in 60, never more than exist', () => {
    expect(followUpCount(45, 6)).toBe(2);
    expect(followUpCount(60, 6)).toBe(3);
    expect(followUpCount(60, 1)).toBe(1);
    expect(followUpCount(45, 0)).toBe(0);
  });

  it('picks distinct follow-ups, the same ones for the same seed', () => {
    const a = pickFollowUps(6, 60, 42);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(a.every((i) => i >= 0 && i < 6)).toBe(true);
    expect(pickFollowUps(6, 60, 42)).toEqual(a);
    const seeds = new Set(Array.from({ length: 20 }, (_, s) => pickFollowUps(6, 45, s).join(',')));
    expect(seeds.size).toBeGreaterThan(5);
  });

  it('spreads them through the deep dives', () => {
    const deep = buildTimeline(45).find((p) => p.id === 'deep-dives')!;
    const times = followUpTimes(45, 2);
    expect(times).toEqual([30 * MINUTE, 35 * MINUTE]);
    for (const t of times) {
      expect(t).toBeGreaterThan(deep.start * MINUTE);
      expect(t).toBeLessThan(deep.end * MINUTE);
    }
    const sixty = followUpTimes(60, 3);
    expect(sixty[1]! - sixty[0]!).toBeCloseTo(sixty[2]! - sixty[1]!);
  });
});

describe('interviewerLog', () => {
  it('opens with the interviewer’s first question', () => {
    const log = interviewerLog(45, 0, [3, 1]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'phase', phase: 'requirements', text: 'Let’s start. What would you like to clarify?' });
    expect(INTERVIEWER_PROMPTS.requirements).toBe(log[0]!.kind === 'phase' ? log[0]!.text : '');
  });

  it('adds each phase’s prompt as the phase opens, and follow-ups only during the deep dives', () => {
    const at = (min: number) => interviewerLog(45, min * MINUTE, [3, 1]);
    expect(at(26).map((m) => m.key)).toEqual(['phase-requirements', 'phase-estimation', 'phase-api', 'phase-high-level', 'phase-deep-dives']);
    expect(at(31).map((m) => m.key)).toContain('follow-3');
    expect(at(31).map((m) => m.key)).not.toContain('follow-1');
    const end = at(45);
    expect(end.filter((m) => m.kind === 'phase')).toHaveLength(6);
    expect(end.filter((m) => m.kind === 'followUp').map((m) => (m.kind === 'followUp' ? m.followUp : -1))).toEqual([3, 1]);
  });

  it('keeps messages in the order they were said', () => {
    const log = interviewerLog(60, 60 * MINUTE, [0, 2, 4]);
    const times = log.map((m) => m.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(log.at(-1)?.key).toBe('phase-wrap-up');
  });
});
