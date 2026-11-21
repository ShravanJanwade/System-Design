import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addDays, toDay } from '@/lib/dates';
import { isCardMastered, newCard, review, type CardState } from './leitner';

export type LessonStatus = 'not-started' | 'in-progress' | 'done' | 'mastered';

export type LessonRecord = {
  opened: boolean;
  /** Reached the end of the lesson, or pressed "Mark complete". */
  read: boolean;
  quiz?: { attempts: number; best: number; last: number; total: number };
  completedAt?: string;
  lastOpenedAt?: string;
  /** How many flashcards this lesson added to the deck. */
  cardCount?: number;
};

export type ProgressData = {
  lessons: Record<string, LessonRecord>;
  deck: Record<string, CardState>;
  lastLessonId?: string;
  /** Simulator challenges attempted, by simulator id. */
  challenges: Record<string, string[]>;
  /** Days with study activity (a lesson read, a quiz attempted, cards reviewed), for the optional streak. */
  activeDays: string[];
};

type ProgressState = ProgressData & {
  openLesson: (id: string) => void;
  markRead: (id: string) => void;
  recordQuiz: (id: string, correct: number, total: number) => void;
  addCards: (lessonId: string, count: number) => void;
  reviewCard: (cardId: string, recalled: boolean) => void;
  markChallenge: (simId: string, challengeId: string) => void;
  replaceAll: (data: ProgressData) => void;
  reset: () => void;
};

const empty: ProgressData = { lessons: {}, deck: {}, lastLessonId: undefined, challenges: {}, activeDays: [] };

/** Record today as a study day, keeping about a year of history. */
function withToday(days: string[] | undefined): string[] {
  const today = toDay();
  const list = days ?? [];
  if (list.includes(today)) return list;
  return [...list, today].slice(-400);
}

function now(): string {
  return new Date().toISOString();
}

/** The stored record, or a fresh one. */
function recordOf(lessons: Record<string, LessonRecord>, id: string): LessonRecord {
  const rec: LessonRecord | undefined = lessons[id];
  return rec ?? { opened: false, read: false };
}

function withCompletion(rec: LessonRecord): LessonRecord {
  if (!rec.completedAt && rec.read && rec.quiz && rec.quiz.attempts > 0) return { ...rec, completedAt: now() };
  return rec;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      ...empty,
      openLesson: (id) =>
        set((s) => ({
          lastLessonId: id,
          lessons: { ...s.lessons, [id]: { ...recordOf(s.lessons, id), opened: true, lastOpenedAt: now() } },
        })),
      markRead: (id) =>
        set((s) => {
          const rec: LessonRecord = { ...recordOf(s.lessons, id), opened: true, read: true };
          return { lessons: { ...s.lessons, [id]: withCompletion(rec) }, activeDays: withToday(s.activeDays) };
        }),
      recordQuiz: (id, correct, total) =>
        set((s) => {
          const prev = recordOf(s.lessons, id);
          const score = total ? correct / total : 0;
          const quiz = {
            attempts: (prev.quiz?.attempts ?? 0) + 1,
            best: Math.max(prev.quiz?.best ?? 0, score),
            last: score,
            total,
          };
          return { lessons: { ...s.lessons, [id]: withCompletion({ ...prev, quiz }) }, activeDays: withToday(s.activeDays) };
        }),
      addCards: (lessonId, count) =>
        set((s) => {
          const today = toDay();
          const deck = { ...s.deck };
          for (let i = 0; i < count; i++) {
            const card = newCard(lessonId, i, today);
            if (!deck[card.id]) deck[card.id] = card;
          }
          const rec: LessonRecord = { ...recordOf(s.lessons, lessonId), opened: true, cardCount: count };
          return { deck, lessons: { ...s.lessons, [lessonId]: rec } };
        }),
      reviewCard: (cardId, recalled) =>
        set((s) => {
          const card = s.deck[cardId];
          if (!card) return {};
          return { deck: { ...s.deck, [cardId]: review(card, recalled, toDay()) }, activeDays: withToday(s.activeDays) };
        }),
      markChallenge: (simId, challengeId) =>
        set((s) => {
          const done = s.challenges[simId] ?? [];
          if (done.includes(challengeId)) return {};
          return { challenges: { ...s.challenges, [simId]: [...done, challengeId] } };
        }),
      replaceAll: (data) => set({ ...empty, ...data }),
      reset: () => set({ ...empty }),
    }),
    {
      name: 'blueprint-progress',
      version: 1,
      partialize: (s) => ({
        lessons: s.lessons,
        deck: s.deck,
        lastLessonId: s.lastLessonId,
        challenges: s.challenges,
        activeDays: s.activeDays,
      }),
    },
  ),
);

export function lessonCards(deck: Record<string, CardState>, lessonId: string): CardState[] {
  return Object.values(deck).filter((c) => c.lessonId === lessonId);
}

/** Status per blueprint section 10: done = read and quiz attempted; mastered = 80%+ and cards at a week or more. */
export function lessonStatus(rec: LessonRecord | undefined, cards: CardState[], cardCount: number): LessonStatus {
  if (!rec?.opened) return 'not-started';
  const done = rec.read && Boolean(rec.quiz && rec.quiz.attempts > 0);
  if (!done) return 'in-progress';
  const mastered =
    (rec.quiz?.best ?? 0) >= 0.8 && cardCount > 0 && cards.length >= cardCount && cards.every(isCardMastered);
  return mastered ? 'mastered' : 'done';
}

export function useLessonStatus(lessonId: string): LessonStatus {
  const rec = useProgress((s) => s.lessons[lessonId]);
  const deck = useProgress((s) => s.deck);
  return lessonStatus(rec, lessonCards(deck, lessonId), rec?.cardCount ?? 0);
}

/** Status for every lesson at once, for curriculum lists and progress rings. */
export function useAllStatuses(): (lessonId: string) => LessonStatus {
  const lessons = useProgress((s) => s.lessons);
  const deck = useProgress((s) => s.deck);
  return (id: string) => {
    const rec = lessons[id];
    return lessonStatus(rec, lessonCards(deck, id), rec?.cardCount ?? 0);
  };
}

/** Consecutive study days ending today, or ending yesterday if today has no activity yet. */
export function studyStreak(activeDays: string[], today: string = toDay()): number {
  const set = new Set(activeDays);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export const statusLabel: Record<LessonStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
  mastered: 'Mastered',
};

/* ------------------------------------------------------------------ */
/* Export and import                                                   */
/* ------------------------------------------------------------------ */

export const EXPORT_FORMAT = 'blueprint-progress';

export type ExportFile = {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  progress: ProgressData;
  settings?: Record<string, unknown>;
  plan?: { answers: unknown; startDay: string | null };
  /** Problem workspaces, self-assessments and mock interviews (validated by the problems store on import). */
  problems?: unknown;
  /** Practice drill results and the architecture sandbox (validated by the practice store on import). */
  practice?: unknown;
};

export function buildExport(
  progress: ProgressData,
  settings: Record<string, unknown>,
  plan?: { answers: unknown; startDay: string | null },
  problems?: unknown,
  practice?: unknown,
): ExportFile {
  return { format: EXPORT_FORMAT, version: 1, exportedAt: now(), progress, settings, plan, problems, practice };
}

/** Validate an imported file. Returns the data, or a message saying what is wrong. */
export function parseImport(text: string): { ok: true; file: ExportFile } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON. Choose a file exported from Blueprint.' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'That file is empty. Choose a file exported from Blueprint.' };
  const f = raw as Partial<ExportFile>;
  if (f.format !== EXPORT_FORMAT) {
    return { ok: false, error: 'That file was not exported from Blueprint. Choose a file named like blueprint-progress-….json.' };
  }
  if (f.version !== 1) return { ok: false, error: `This file uses format version ${String(f.version)}, which this app cannot read.` };
  const p = f.progress;
  if (!p || typeof p !== 'object' || typeof p.lessons !== 'object' || typeof p.deck !== 'object') {
    return { ok: false, error: 'The file is missing its progress data. Export it again from Blueprint.' };
  }
  const progress: ProgressData = {
    lessons: p.lessons ?? {},
    deck: p.deck ?? {},
    lastLessonId: typeof p.lastLessonId === 'string' ? p.lastLessonId : undefined,
    challenges: p.challenges && typeof p.challenges === 'object' ? p.challenges : {},
    activeDays: Array.isArray(p.activeDays) ? p.activeDays.filter((d): d is string => typeof d === 'string') : [],
  };
  return {
    ok: true,
    file: {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: String(f.exportedAt ?? ''),
      progress,
      settings: f.settings,
      plan: f.plan,
      problems: f.problems,
      practice: f.practice,
    },
  };
}
