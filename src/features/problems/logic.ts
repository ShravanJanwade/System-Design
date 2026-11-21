/**
 * Pure logic for the problem bank: a problem's status for the learner, rubric scoring,
 * "Review next" links and the random pick for mock interviews.
 */
import type { DiagramSpec, Problem } from '@/content/types';
import type { Assessment, MockSession, Workspace } from '@/state/problems';

/* ------------------------------------------------------------------ */
/* Walkthrough helpers                                                 */
/* ------------------------------------------------------------------ */

/** "Stage 2: It scales", unless the title already names its stage ("v2: It scales"). */
export function stageTitle(title: string, index: number): string {
  return /^(v\d+|stage\s*\d+)\b/i.test(title.trim()) ? title : `Stage ${index + 1}: ${title}`;
}

/** The final stage's design with every component shown (no steps), for side-by-side comparison. */
export function finalDesignSpec(problem: Problem): DiagramSpec | null {
  const last = problem.stages[problem.stages.length - 1];
  return last ? { ...last.diagram, steps: undefined } : null;
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export type ProblemStatus =
  | { kind: 'not-started' }
  | { kind: 'attempted' }
  | { kind: 'scored'; best: number; last: number; count: number };

/** The learner has done something in the workspace: notes, a design, a hint, the timer, or a finished attempt. */
export function workspaceTouched(ws: Workspace | undefined): boolean {
  if (!ws) return false;
  return (
    ws.notes.trim().length > 0 ||
    ws.design.nodes.length > 0 ||
    ws.hintsShown > 0 ||
    ws.timer.elapsedMs > 0 ||
    ws.timer.runningSince !== null ||
    ws.attemptDone
  );
}

export function problemStatus(ws: Workspace | undefined, assessments: readonly Assessment[] | undefined, activeMock?: MockSession): ProblemStatus {
  if (assessments?.length) {
    return {
      kind: 'scored',
      best: Math.max(...assessments.map((a) => a.score)),
      last: assessments[assessments.length - 1]!.score,
      count: assessments.length,
    };
  }
  if (workspaceTouched(ws) || activeMock) return { kind: 'attempted' };
  return { kind: 'not-started' };
}

export function statusText(status: ProblemStatus): string {
  switch (status.kind) {
    case 'not-started':
      return 'Not started';
    case 'attempted':
      return 'Attempted';
    case 'scored':
      return `Best score ${status.best}%`;
  }
}

/* ------------------------------------------------------------------ */
/* Rubric                                                              */
/* ------------------------------------------------------------------ */

type Rubric = Problem['rubric'];

/** Score out of 100 from the weights of the items met. Weights normally add up to 100; other totals are scaled. */
export function rubricScore(rubric: Rubric, checked: readonly string[]): number {
  const total = rubric.reduce((s, r) => s + Math.max(0, r.weight), 0);
  if (total <= 0) return 0;
  const met = new Set(checked);
  const got = rubric.reduce((s, r) => s + (met.has(r.item) ? Math.max(0, r.weight) : 0), 0);
  return Math.round((got / total) * 100);
}

export type ReviewLink = { lessonId: string; items: string[]; weight: number };

/** Lessons behind the rubric items that were missed, heaviest first, one entry per lesson. */
export function reviewNext(rubric: Rubric, checked: readonly string[]): ReviewLink[] {
  const met = new Set(checked);
  const byLesson = new Map<string, ReviewLink>();
  for (const r of rubric) {
    if (met.has(r.item) || !r.lessonId) continue;
    const link = byLesson.get(r.lessonId) ?? { lessonId: r.lessonId, items: [], weight: 0 };
    link.items.push(r.item);
    link.weight += r.weight;
    byLesson.set(r.lessonId, link);
  }
  return [...byLesson.values()].sort((a, b) => b.weight - a.weight);
}

/** Rubric items that were missed and have no lesson to point at. */
export function missedWithoutLesson(rubric: Rubric, checked: readonly string[]): string[] {
  const met = new Set(checked);
  return rubric.filter((r) => !met.has(r.item) && !r.lessonId).map((r) => r.item);
}

/** Only the checked items that still exist in the rubric, in rubric order. */
export function keepKnown(rubric: Rubric, checked: readonly string[]): string[] {
  const met = new Set(checked);
  return rubric.filter((r) => met.has(r.item)).map((r) => r.item);
}

/* ------------------------------------------------------------------ */
/* Mock interview setup                                                */
/* ------------------------------------------------------------------ */

export type TierChoice = 1 | 2 | 3 | 'any';

/** A random candidate within a tier (or any tier). `rand` returns a float in [0, 1). */
export function pickRandomProblem<T extends { id: string; tier: 1 | 2 | 3 }>(
  candidates: readonly T[],
  tier: TierChoice,
  rand: () => number,
  excludeId?: string,
): T | undefined {
  let pool = candidates.filter((c) => tier === 'any' || c.tier === tier);
  if (pool.length > 1 && excludeId) pool = pool.filter((c) => c.id !== excludeId);
  if (!pool.length) return undefined;
  const i = Math.min(pool.length - 1, Math.floor(Math.max(0, rand()) * pool.length));
  return pool[i];
}

/* ------------------------------------------------------------------ */
/* Filtering the problem list                                          */
/* ------------------------------------------------------------------ */

/** Lowercase word stems, so "caching", "cache" and "caches" all become "cach". */
export function stems(text: string): string[] {
  const strip = (w: string) => (w.length > 4 ? w.replace(/(ing|ers|er|es|ed|s|e)$/, '') : w);
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => strip(strip(w)));
}

/** True when every word of the query starts some word of the text, after stemming. An empty query matches everything. */
export function matchesConcept(query: string, text: string): boolean {
  const wanted = stems(query);
  if (!wanted.length) return true;
  const have = stems(text);
  return wanted.every((q) => have.some((h) => h.startsWith(q)));
}

/* ------------------------------------------------------------------ */
/* Formatting and history                                              */
/* ------------------------------------------------------------------ */

/** 754000 -> "12:34"; an hour or more -> "1:02:03". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Whole minutes, for spoken summaries: 754000 -> "12 minutes". */
export function formatMinutes(ms: number): string {
  const m = Math.round(ms / 60000);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

/** Finished sessions in the order they finished, as chart points: x is the session number, y the score. */
export function scoreSeries(sessions: readonly MockSession[]): { x: number; y: number }[] {
  return [...sessions]
    .filter((s) => typeof s.score === 'number')
    .sort((a, b) => (a.finishedAt ?? '').localeCompare(b.finishedAt ?? ''))
    .map((s, i) => ({ x: i + 1, y: s.score! }));
}

/** "19 Nov 2026" in the learner's locale. */
export function formatDay(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
