import type { ModuleId, PracticeItem } from '@/content/types';
import { getOutline, modules } from '@/content/modules';
import { plural } from '@/lib/format';
import type { DrillMode, ItemRecord } from '@/state/practice';

/**
 * Pure logic for the drill modes: which questions belong to each mode, filters, picking the next question,
 * the session's state and score, and the summary lines the pages show.
 */

export type PracticeContent = Record<DrillMode, PracticeItem[]>;
export type Records = Readonly<Record<string, ItemRecord>>;

/** Estimation and bottleneck questions come from the lessons' quizzes; the authored scenarios are added. Repeated ids are dropped. */
export function buildContent(
  pool: readonly PracticeItem[],
  bottleneckItems: readonly PracticeItem[],
  toolItems: readonly PracticeItem[],
): PracticeContent {
  const seen = new Set<string>();
  const keep = (items: readonly PracticeItem[]) =>
    items.filter((it) => {
      if (!it || typeof it.id !== 'string' || !it.question || seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
  return {
    estimation: keep(pool.filter((it) => it.question.kind === 'numeric')),
    bottleneck: keep([...pool.filter((it) => it.question.kind === 'bottleneck'), ...bottleneckItems]),
    tools: keep(toolItems),
  };
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export type ModuleFilter = ModuleId | 'all';
export type PracticeFilters = { module: ModuleFilter; readOnly: boolean };
export const DEFAULT_FILTERS: PracticeFilters = { module: 'all', readOnly: false };

export function moduleOfLesson(lessonId: string): ModuleId | undefined {
  return getOutline(lessonId)?.module;
}

export function filterItems(items: readonly PracticeItem[], filters: PracticeFilters, isRead: (lessonId: string) => boolean): PracticeItem[] {
  return items.filter(
    (it) => (filters.module === 'all' || moduleOfLesson(it.lessonId) === filters.module) && (!filters.readOnly || isRead(it.lessonId)),
  );
}

/** Modules that have questions in the list, in curriculum order. */
export function modulesWithItems(items: readonly PracticeItem[]): { id: ModuleId; label: string; count: number }[] {
  const counts = new Map<ModuleId, number>();
  for (const it of items) {
    const m = moduleOfLesson(it.lessonId);
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return modules.filter((m) => counts.has(m.id)).map((m) => ({ id: m.id, label: `Module ${m.number}: ${m.title}`, count: counts.get(m.id)! }));
}

/** How many of the lessons behind these questions the learner has read. */
export function readLessonCount(items: readonly PracticeItem[], isRead: (lessonId: string) => boolean): { read: number; total: number } {
  const lessons = new Set(items.map((it) => it.lessonId));
  return { read: [...lessons].filter(isRead).length, total: lessons.size };
}

/* ------------------------------------------------------------------ */
/* Picking the next question                                           */
/* ------------------------------------------------------------------ */

export type ItemStatus = 'new' | 'missed' | 'right';

export function itemStatus(rec: ItemRecord | undefined): ItemStatus {
  if (!rec) return 'new';
  return rec.correct ? 'right' : 'missed';
}

/**
 * The next question: one the learner has not tried or missed last time, chosen at random; when none is left,
 * the one they answered right longest ago. Questions in `exclude` (already done this round) are left out.
 */
export function pickNext(
  candidates: readonly PracticeItem[],
  records: Records,
  exclude: Iterable<string> = [],
  random: () => number = Math.random,
): PracticeItem | null {
  const skip = new Set(exclude);
  const open = candidates.filter((it) => !skip.has(it.id));
  if (!open.length) return null;
  const preferred = open.filter((it) => itemStatus(records[it.id]) !== 'right');
  if (preferred.length) {
    const i = Math.min(preferred.length - 1, Math.max(0, Math.floor(random() * preferred.length)));
    return preferred[i]!;
  }
  return open.reduce((oldest, it) => ((records[it.id]?.seenAt ?? '') < (records[oldest.id]?.seenAt ?? '') ? it : oldest));
}

/* ------------------------------------------------------------------ */
/* The session: one visit to a drill mode, kept while the app is open   */
/* ------------------------------------------------------------------ */

export type SessionResult = { id: string; correct: boolean };

export type DrillSession = {
  filters: PracticeFilters;
  /** Answers this session, in order. */
  results: SessionResult[];
  skipped: number;
  /** Questions answered or skipped this round. Picks leave them out until the next round. */
  done: string[];
  /** The question on screen. */
  currentId: string | null;
  /** The question on screen has been answered and shows its explanation. */
  checked: boolean;
  /** Questions shown this session, for the "Question 4" heading. */
  shown: number;
};

export function newSession(filters: PracticeFilters = DEFAULT_FILTERS): DrillSession {
  return { filters, results: [], skipped: 0, done: [], currentId: null, checked: false, shown: 0 };
}

/** Put a question on screen when there is none, or when the one shown no longer matches the filters. */
export function sessionPick(s: DrillSession, candidates: readonly PracticeItem[], records: Records, random?: () => number): DrillSession {
  if (s.checked) return s;
  if (s.currentId && candidates.some((c) => c.id === s.currentId)) return s;
  const next = pickNext(candidates, records, s.done, random);
  if (!next) return s.currentId === null ? s : { ...s, currentId: null };
  return { ...s, currentId: next.id, shown: s.shown + 1 };
}

export function sessionAnswer(s: DrillSession, correct: boolean): DrillSession {
  if (!s.currentId || s.checked) return s;
  return { ...s, checked: true, results: [...s.results, { id: s.currentId, correct }], done: [...s.done, s.currentId] };
}

export function sessionSkip(s: DrillSession): DrillSession {
  if (!s.currentId || s.checked) return s;
  return { ...s, skipped: s.skipped + 1, done: [...s.done, s.currentId], currentId: null };
}

/** Clear the answered question, ready for the next pick. */
export function sessionNext(s: DrillSession): DrillSession {
  return s.checked ? { ...s, checked: false, currentId: null } : s;
}

/** Every matching question was done: bring them all back, keeping the score. */
export function sessionNewRound(s: DrillSession): DrillSession {
  return { ...s, done: [], currentId: null, checked: false };
}

/** Clear the score and bring every question back. An unanswered question stays on screen as question 1. */
export function sessionRestart(s: DrillSession): DrillSession {
  const fresh = newSession(s.filters);
  return s.currentId && !s.checked ? { ...fresh, currentId: s.currentId, shown: 1 } : fresh;
}

export function sessionSetFilters(s: DrillSession, filters: PracticeFilters): DrillSession {
  return { ...s, filters };
}

export type RoundState = 'question' | 'pending' | 'complete' | 'empty';

/** What the question area shows: a question, a pick about to happen, the end of a round, or nothing to match. */
export function roundState(s: DrillSession, candidates: readonly PracticeItem[]): RoundState {
  if (s.currentId && (s.checked || candidates.some((c) => c.id === s.currentId))) return 'question';
  if (!candidates.length) return 'empty';
  return remainingCount(s, candidates) > 0 ? 'pending' : 'complete';
}

/** Matching questions not yet done this round. */
export function remainingCount(s: DrillSession, candidates: readonly PracticeItem[]): number {
  const done = new Set(s.done);
  return candidates.filter((c) => !done.has(c.id)).length;
}

/* ------------------------------------------------------------------ */
/* Scores and summary lines                                            */
/* ------------------------------------------------------------------ */

export function sessionScore(s: DrillSession): { answered: number; correct: number; skipped: number } {
  return { answered: s.results.length, correct: s.results.filter((r) => r.correct).length, skipped: s.skipped };
}

export function scoreLine(score: { answered: number; correct: number; skipped: number }): string {
  const skipped = score.skipped ? ` ${score.skipped} skipped.` : '';
  if (!score.answered) return score.skipped ? `No answers yet.${skipped}` : 'No answers yet.';
  return `${score.correct} of ${score.answered} correct.${skipped}`;
}

export type ModeSummary = { total: number; tried: number; right: number; missed: number };

export function modeSummary(items: readonly PracticeItem[], records: Records): ModeSummary {
  let tried = 0;
  let right = 0;
  for (const it of items) {
    const rec = records[it.id];
    if (!rec) continue;
    tried++;
    if (rec.correct) right++;
  }
  return { total: items.length, tried, right, missed: tried - right };
}

/** One line for the practice home and the drill page's record. */
export function summaryLine(sum: ModeSummary): string {
  if (!sum.total) return 'No questions are available in this mode.';
  if (!sum.tried) return `${plural(sum.total, 'question')}. You have not tried any yet.`;
  return `You have tried ${sum.tried} of ${sum.total}, and ${sum.right} ${sum.right === 1 ? 'was' : 'were'} right the last time.`;
}

/** How many questions the filters leave. */
export function matchCount(matching: number, total: number): string {
  if (!matching) return `None of the ${plural(total, 'question')} match these filters.`;
  return matching === total ? `All ${plural(total, 'question')} match.` : `${matching} of ${plural(total, 'question')} match.`;
}

/** How many of the matching questions are new to the learner or were missed last time. */
export function matchDetail(matching: readonly PracticeItem[], records: Records): string {
  if (!matching.length) return '';
  let fresh = 0;
  let missed = 0;
  for (const it of matching) {
    const status = itemStatus(records[it.id]);
    if (status === 'new') fresh++;
    else if (status === 'missed') missed++;
  }
  const isAre = fresh === 1 ? 'is' : 'are';
  if (fresh && missed) return `${fresh} ${isAre} new to you, and you missed ${missed} last time.`;
  if (fresh) return `${fresh} ${isAre} new to you.`;
  if (missed) return `You missed ${missed} of them last time.`;
  return 'You got all of them right the last time.';
}

/** Lessons behind the questions whose last answer was wrong, most misses first, then the most recent. */
export function missedByLesson(items: readonly PracticeItem[], records: Records): { lessonId: string; missed: number; lastAt: string }[] {
  const byLesson = new Map<string, { lessonId: string; missed: number; lastAt: string }>();
  for (const it of items) {
    const rec = records[it.id];
    if (!rec || rec.correct) continue;
    const entry = byLesson.get(it.lessonId) ?? { lessonId: it.lessonId, missed: 0, lastAt: '' };
    entry.missed++;
    if (rec.seenAt > entry.lastAt) entry.lastAt = rec.seenAt;
    byLesson.set(it.lessonId, entry);
  }
  return [...byLesson.values()].sort((a, b) => b.missed - a.missed || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
}
