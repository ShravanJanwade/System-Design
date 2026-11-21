/**
 * Study plans (blueprint section 4). Three skippable onboarding answers produce a weekly plan.
 * Only the answers and the start day are stored; the plan itself is rebuilt from them,
 * so it stays in step with the curriculum.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { allLessonOutlines, getOutline } from '@/content/modules';
import { problemList } from '@/content/problem-list';
import type { ModuleId } from '@/content/types';
import { daysBetween, toDay, type DayString } from '@/lib/dates';

export type Experience = 'new' | 'some' | 'experienced';
export type Weeks = 2 | 4 | 8 | 12;
export type Level = 'entry' | 'mid' | 'senior';
export type PlanAnswers = { experience: Experience; weeks: Weeks; level: Level };

/** Used for any question the learner skips. */
export const DEFAULT_ANSWERS: PlanAnswers = { experience: 'new', weeks: 8, level: 'entry' };

export const experienceLabel: Record<Experience, string> = {
  new: 'New to backend',
  some: 'Some backend experience',
  experienced: 'Experienced',
};
export const levelLabel: Record<Level, string> = { entry: 'Entry level', mid: 'Mid level', senior: 'Senior' };
/** For use before a noun: "mid-level interviews". */
export const levelAdjective: Record<Level, string> = { entry: 'entry-level', mid: 'mid-level', senior: 'senior' };

export type PlanItem =
  | { kind: 'lesson'; id: string; minutes: number; skim: boolean }
  | { kind: 'problem'; id: string; minutes: number }
  | { kind: 'mock'; minutes: number; number: number };

export type PlanWeek = { items: PlanItem[]; minutes: number };
export type StudyPlan = { answers: PlanAnswers; weeks: PlanWeek[]; totalMinutes: number };

/** Lessons a mid-level plan adds from Modules 4 to 7: the ideas that come up in most mid-level loops. */
const MID_LESSONS = [
  'replication',
  'replication-lag',
  'sharding',
  'consistent-hashing',
  'cap-pacelc',
  'consistency-models',
  'quorums',
  'why-distributed-is-hard',
  'timeouts-retries-backoff',
  'idempotency',
  'circuit-breakers',
  'rate-limiting',
  'monolith-vs-microservices',
  'service-communication',
  'event-driven',
  'feed-fanout',
  'observability',
  'zero-downtime-deploys',
];

const FOUNDATION: ModuleId[] = ['m0', 'm1', 'm2', 'm3'];
const ADVANCED: ModuleId[] = ['m4', 'm5', 'm6', 'm7'];

export const PROBLEM_MINUTES = 90;
export const MOCK_MINUTES = 75;

function lessonIds(level: Level): string[] {
  return allLessonOutlines
    .filter((l) => {
      if (FOUNDATION.includes(l.module) || l.module === 'm8') return true;
      if (!ADVANCED.includes(l.module)) return false;
      return level === 'senior' || (level === 'mid' && MID_LESSONS.includes(l.id));
    })
    .map((l) => l.id);
}

const PROBLEM_CAP: Record<Weeks, number> = { 2: 6, 4: 10, 8: 16, 12: 26 };
const MOCKS: Record<Weeks, number> = { 2: 1, 4: 2, 8: 3, 12: 4 };

function problemIds(level: Level, weeks: Weeks): string[] {
  const tiers = level === 'senior' ? [1, 2, 3] : [1, 2];
  const pool = problemList.filter((p) => tiers.includes(p.tier));
  const flagships = pool.filter((p) => p.flagship);
  const rest = pool.filter((p) => !p.flagship);
  // Seniors meet two Tier 3 problems early, whatever the timeline.
  const seniorFirst = level === 'senior' ? rest.filter((p) => p.id === 'distributed-kv-store' || p.id === 'payment-system') : [];
  const ordered = [...flagships, ...seniorFirst, ...rest.filter((p) => !seniorFirst.includes(p))];
  const cap = PROBLEM_CAP[weeks] + (level === 'senior' && weeks === 2 ? 2 : 0);
  return ordered.slice(0, cap).map((p) => p.id);
}

function skimmed(experience: Experience, module: ModuleId): boolean {
  if (experience === 'experienced') return module === 'm0' || module === 'm1';
  if (experience === 'some') return module === 'm0';
  return false;
}

/** Split items, in order, into `count` consecutive groups of roughly equal minutes. */
function spread(items: PlanItem[], count: number): PlanItem[][] {
  const groups: PlanItem[][] = Array.from({ length: count }, () => []);
  const total = items.reduce((s, it) => s + it.minutes, 0);
  let g = 0;
  let used = 0;
  let inGroup = 0;
  for (const item of items) {
    const fairShare = (total - used) / (count - g);
    if (groups[g]!.length > 0 && inGroup + item.minutes / 2 > fairShare && g < count - 1) {
      used += inGroup;
      inGroup = 0;
      g++;
    }
    groups[g]!.push(item);
    inGroup += item.minutes;
  }
  return groups;
}

/** Merge two ordered lists evenly, keeping each list's own order. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const fa = a.length ? i / a.length : 1;
    const fb = b.length ? j / b.length : 1;
    if (i < a.length && (fa <= fb || j >= b.length)) out.push(a[i++]!);
    else out.push(b[j++]!);
  }
  return out;
}

/**
 * Build the plan. The building blocks (Modules 0 to 3) come first, in order. After them, the remaining
 * lessons and the problems are merged evenly, so learners apply ideas soon after meeting them, and mock
 * interviews are spaced through the second half, the last one at the very end. The sequence is then
 * cut into weeks of roughly equal effort.
 */
export function buildPlan(answers: PlanAnswers): StudyPlan {
  const n = answers.weeks;
  const lessons: PlanItem[] = lessonIds(answers.level).map((id) => {
    const o = getOutline(id)!;
    const skim = skimmed(answers.experience, o.module);
    return { kind: 'lesson', id, minutes: skim ? Math.ceil(o.minutes / 2) : o.minutes, skim };
  });
  const isFoundation = (it: PlanItem) => it.kind === 'lesson' && FOUNDATION.includes(getOutline(it.id)!.module);
  const problems = problemIds(answers.level, n).map((id): PlanItem => ({ kind: 'problem', id, minutes: PROBLEM_MINUTES }));
  const mockCount = MOCKS[n] + (answers.level === 'senior' && n >= 8 ? 1 : 0);

  const after = interleave(
    lessons.filter((l) => !isFoundation(l)),
    problems,
  );
  for (let k = mockCount - 1; k >= 0; k--) {
    const at = Math.round(after.length * (0.5 + (0.5 * (k + 1)) / mockCount));
    after.splice(at, 0, { kind: 'mock', minutes: MOCK_MINUTES, number: k + 1 });
  }
  // Mocks were inserted from the last one back, so their positions stay correct; renumber in order.
  let num = 0;
  for (const it of after) if (it.kind === 'mock') it.number = ++num;

  const groups = spread([...lessons.filter(isFoundation), ...after], n);
  const weeks: PlanWeek[] = groups.map((items) => ({ items, minutes: items.reduce((s, it) => s + it.minutes, 0) }));
  const totalMinutes = weeks.reduce((s, w) => s + w.minutes, 0);
  return { answers, weeks, totalMinutes };
}

/** Which week of the plan today falls in (0-based), clamped to the plan's length. */
export function currentWeekIndex(startDay: DayString, today: DayString, weeks: number): number {
  const days = Math.max(0, daysBetween(startDay, today));
  return Math.min(weeks - 1, Math.floor(days / 7));
}

/* ------------------------------------------------------------------ */

type PlanState = {
  /** Null until onboarding is answered or skipped. */
  answers: PlanAnswers | null;
  startDay: DayString | null;
  setAnswers: (answers: PlanAnswers, restart?: boolean) => void;
  clearPlan: () => void;
};

export const usePlan = create<PlanState>()(
  persist(
    (set) => ({
      answers: null,
      startDay: null,
      setAnswers: (answers, restart = true) =>
        set((s) => ({ answers, startDay: restart || !s.startDay ? toDay() : s.startDay })),
      clearPlan: () => set({ answers: null, startDay: null }),
    }),
    { name: 'blueprint-plan', version: 1 },
  ),
);
