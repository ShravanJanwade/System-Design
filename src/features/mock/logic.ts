/**
 * Mock interview schedule (blueprint section 10). The phase clock follows lesson 8.1's framework,
 * taken from the interview timeline's own data, so the two can never disagree. Pure and deterministic.
 */
import { buildTimeline, phaseAtMinute, type InterviewLength, type PhaseId, type TimelinePhase } from '@/widgets/interview-timeline/logic';
import { createRng } from '@/lib/random';

export const MINUTE = 60_000;

/** What the interviewer says as each phase opens. */
export const INTERVIEWER_PROMPTS: Record<PhaseId, string> = {
  requirements: 'Let’s start. What would you like to clarify?',
  estimation: 'Before you design anything, how big is this? Give me the few numbers that matter.',
  api: 'What does the API look like, and what will you store?',
  'high-level': 'Walk me through a high-level design, end to end.',
  'deep-dives': 'Which part worries you most? Let’s go deep there.',
  'wrap-up': 'We have a few minutes left. What breaks first, and what would you change at ten times the scale?',
};

export type MockClock = {
  phases: TimelinePhase[];
  /** Index of the phase under way. */
  index: number;
  phase: TimelinePhase;
  elapsedMs: number;
  totalMs: number;
  phaseElapsedMs: number;
  phaseRemainingMs: number;
  remainingMs: number;
  /** The interview's time is used up. */
  overtime: boolean;
};

export function mockClock(length: InterviewLength, elapsedMs: number): MockClock {
  const phases = buildTimeline(length);
  const totalMs = length * MINUTE;
  const elapsed = Math.max(0, elapsedMs);
  const index = phaseAtMinute(phases, elapsed / MINUTE);
  const phase = phases[index]!;
  return {
    phases,
    index,
    phase,
    elapsedMs: elapsed,
    totalMs,
    phaseElapsedMs: Math.min(phase.minutes * MINUTE, Math.max(0, elapsed - phase.start * MINUTE)),
    phaseRemainingMs: Math.max(0, phase.end * MINUTE - elapsed),
    remainingMs: Math.max(0, totalMs - elapsed),
    overtime: elapsed >= totalMs,
  };
}

/** Two follow-ups in a 45-minute interview, three in a 60-minute one (blueprint: two or three during the deep dives). */
export function followUpCount(length: InterviewLength, available: number): number {
  return Math.max(0, Math.min(available, length === 60 ? 3 : 2));
}

/** Which follow-ups this session asks, as indexes into the problem's list, in asking order. Same seed, same pick. */
export function pickFollowUps(available: number, length: InterviewLength, seed: number): number[] {
  const order = Array.from({ length: available }, (_, i) => i);
  const rng = createRng(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order.slice(0, followUpCount(length, available));
}

/** When each follow-up appears: spread evenly through the deep dives, never at the very start or end. */
export function followUpTimes(length: InterviewLength, count: number): number[] {
  const deep = buildTimeline(length).find((p) => p.id === 'deep-dives')!;
  const span = deep.end - deep.start;
  return Array.from({ length: count }, (_, i) => (deep.start + (span * (i + 1)) / (count + 1)) * MINUTE);
}

export type InterviewerMessage =
  | { key: string; atMs: number; kind: 'phase'; phase: PhaseId; phaseName: string; text: string }
  | { key: string; atMs: number; kind: 'followUp'; followUp: number; order: number };

/** Everything the interviewer has said by this point, oldest first. */
export function interviewerLog(length: InterviewLength, elapsedMs: number, followUps: readonly number[]): InterviewerMessage[] {
  const phases = buildTimeline(length);
  const out: InterviewerMessage[] = [];
  for (const p of phases) {
    const at = p.start * MINUTE;
    if (at <= elapsedMs) out.push({ key: `phase-${p.id}`, atMs: at, kind: 'phase', phase: p.id, phaseName: p.name, text: INTERVIEWER_PROMPTS[p.id] });
  }
  const times = followUpTimes(length, followUps.length);
  followUps.forEach((f, i) => {
    const at = times[i]!;
    if (at <= elapsedMs) out.push({ key: `follow-${f}`, atMs: at, kind: 'followUp', followUp: f, order: i });
  });
  return out.sort((a, b) => a.atMs - b.atMs);
}
