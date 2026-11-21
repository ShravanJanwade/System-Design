import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EMPTY_DESIGN, sanitizeDesign, type BuilderDesign } from '@/features/builder/model';

/**
 * Interview practice (blueprint sections 7 and 10): the per-problem "Try it first" workspace,
 * self-assessment scores and mock interview sessions. Everything here is plain, serializable data.
 */

/* ------------------------------------------------------------------ */
/* Timer                                                               */
/* ------------------------------------------------------------------ */

/** A stopwatch that survives reloads: time banked so far, plus when it last started (epoch ms) while running. */
export type TimerState = { elapsedMs: number; runningSince: number | null };

export const IDLE_TIMER: TimerState = { elapsedMs: 0, runningSince: null };

export function timerElapsed(t: TimerState, now: number): number {
  return t.elapsedMs + (t.runningSince !== null ? Math.max(0, now - t.runningSince) : 0);
}

export function timerStart(t: TimerState, now: number): TimerState {
  return t.runningSince !== null ? t : { elapsedMs: t.elapsedMs, runningSince: now };
}

export function timerPause(t: TimerState, now: number): TimerState {
  return t.runningSince === null ? t : { elapsedMs: timerElapsed(t, now), runningSince: null };
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

export type ProblemView = 'try' | 'walkthrough';

export type Workspace = {
  notes: string;
  design: BuilderDesign;
  /** Hints revealed, 0 to 3. */
  hintsShown: number;
  timer: TimerState;
  /** The learner marked the attempt done. */
  attemptDone: boolean;
  /** The walkthrough was opened, after an attempt or on demand. */
  walkthroughOpen: boolean;
  view: ProblemView;
  updatedAt: string;
};

export type Assessment = {
  at: string;
  /** 0 to 100, from the rubric weights. */
  score: number;
  /** Rubric items met, by their text (robust to reordering). */
  checked: string[];
  source: 'practice' | 'mock';
  sessionId?: string;
};

export type MockLength = 45 | 60;

export type MockSession = {
  id: string;
  problemId: string;
  length: MockLength;
  startedAt: string;
  timer: TimerState;
  notes: string;
  design: BuilderDesign;
  /** Indexes into the problem's follow-ups, in the order the interviewer asks them. */
  followUps: number[];
  stage: 'interview' | 'score';
  finishedAt?: string;
  /** Time on the clock when the interview ended. */
  usedMs?: number;
  score?: number;
  checked?: string[];
};

export type ProblemsData = {
  workspaces: Record<string, Workspace>;
  assessments: Record<string, Assessment[]>;
  /** Finished mock interviews, oldest first. */
  sessions: MockSession[];
  /** Mock interviews in progress, by problem id. */
  activeMocks: Record<string, MockSession>;
};

export const EMPTY_PROBLEMS_DATA: ProblemsData = { workspaces: {}, assessments: {}, sessions: [], activeMocks: {} };

const MAX_SESSIONS = 200;
const MAX_ASSESSMENTS = 50;

function now(): string {
  return new Date().toISOString();
}

export function newWorkspace(): Workspace {
  return {
    notes: '',
    design: EMPTY_DESIGN,
    hintsShown: 0,
    timer: IDLE_TIMER,
    attemptDone: false,
    walkthroughOpen: false,
    view: 'try',
    updatedAt: now(),
  };
}

/** Shown before a problem has a stored workspace. A constant, so selectors stay stable. */
export const BLANK_WORKSPACE: Workspace = { ...newWorkspace(), updatedAt: '' };

function newSessionId(): string {
  return `mock-${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

type ProblemsState = ProblemsData & {
  updateWorkspace: (problemId: string, patch: Partial<Omit<Workspace, 'updatedAt'>>) => void;
  revealHint: (problemId: string) => void;
  startTimer: (problemId: string, at?: number) => void;
  pauseTimer: (problemId: string, at?: number) => void;
  resetTimer: (problemId: string) => void;
  markAttemptDone: (problemId: string, at?: number) => void;
  openWalkthrough: (problemId: string) => void;
  resetWorkspace: (problemId: string) => void;
  saveAssessment: (problemId: string, result: { score: number; checked: string[] }) => void;
  startMock: (problemId: string, length: MockLength, followUps: number[], at?: number) => string;
  updateMock: (problemId: string, patch: Partial<Pick<MockSession, 'notes' | 'design' | 'timer'>>) => void;
  pauseMock: (problemId: string, at?: number) => void;
  resumeMock: (problemId: string, at?: number) => void;
  endMock: (problemId: string, at?: number) => void;
  backToInterview: (problemId: string) => void;
  finishMock: (problemId: string, result: { score: number; checked: string[] }) => string | null;
  discardMock: (problemId: string) => void;
  replaceAll: (data: ProblemsData) => void;
  reset: () => void;
};

export const useProblems = create<ProblemsState>()(
  persist(
    (set, get) => {
      const patchWs = (problemId: string, fn: (ws: Workspace) => Partial<Workspace>) =>
        set((s) => {
          const ws = s.workspaces[problemId] ?? newWorkspace();
          return { workspaces: { ...s.workspaces, [problemId]: { ...ws, ...fn(ws), updatedAt: now() } } };
        });
      const patchMock = (problemId: string, fn: (m: MockSession) => Partial<MockSession>) =>
        set((s) => {
          const m = s.activeMocks[problemId];
          if (!m) return {};
          return { activeMocks: { ...s.activeMocks, [problemId]: { ...m, ...fn(m) } } };
        });

      return {
        ...EMPTY_PROBLEMS_DATA,
        updateWorkspace: (problemId, patch) => patchWs(problemId, () => patch),
        revealHint: (problemId) => patchWs(problemId, (ws) => ({ hintsShown: Math.min(3, ws.hintsShown + 1) })),
        startTimer: (problemId, at = Date.now()) => patchWs(problemId, (ws) => ({ timer: timerStart(ws.timer, at) })),
        pauseTimer: (problemId, at = Date.now()) => {
          const ws = get().workspaces[problemId];
          if (!ws || ws.timer.runningSince === null) return;
          patchWs(problemId, (w) => ({ timer: timerPause(w.timer, at) }));
        },
        resetTimer: (problemId) => patchWs(problemId, () => ({ timer: IDLE_TIMER })),
        markAttemptDone: (problemId, at = Date.now()) =>
          patchWs(problemId, (ws) => ({ attemptDone: true, walkthroughOpen: true, view: 'walkthrough', timer: timerPause(ws.timer, at) })),
        openWalkthrough: (problemId) => patchWs(problemId, () => ({ walkthroughOpen: true, view: 'walkthrough' })),
        resetWorkspace: (problemId) =>
          set((s) => {
            const ws = s.workspaces[problemId];
            if (!ws) return {};
            // Starting over clears the attempt; the walkthrough stays open if it was.
            return { workspaces: { ...s.workspaces, [problemId]: { ...newWorkspace(), walkthroughOpen: ws.walkthroughOpen } } };
          }),
        saveAssessment: (problemId, result) =>
          set((s) => {
            const list = s.assessments[problemId] ?? [];
            const entry: Assessment = { at: now(), score: result.score, checked: result.checked, source: 'practice' };
            return { assessments: { ...s.assessments, [problemId]: [...list, entry].slice(-MAX_ASSESSMENTS) } };
          }),

        startMock: (problemId, length, followUps, at = Date.now()) => {
          const session: MockSession = {
            id: newSessionId(),
            problemId,
            length,
            startedAt: new Date(at).toISOString(),
            timer: { elapsedMs: 0, runningSince: at },
            notes: '',
            design: EMPTY_DESIGN,
            followUps,
            stage: 'interview',
          };
          set((s) => ({ activeMocks: { ...s.activeMocks, [problemId]: session } }));
          return session.id;
        },
        updateMock: (problemId, patch) => patchMock(problemId, () => patch),
        pauseMock: (problemId, at = Date.now()) => {
          const m = get().activeMocks[problemId];
          if (!m || m.timer.runningSince === null) return;
          patchMock(problemId, (s) => ({ timer: timerPause(s.timer, at) }));
        },
        resumeMock: (problemId, at = Date.now()) => patchMock(problemId, (s) => ({ timer: timerStart(s.timer, at) })),
        endMock: (problemId, at = Date.now()) =>
          patchMock(problemId, (s) => {
            const timer = timerPause(s.timer, at);
            return { timer, stage: 'score', usedMs: timer.elapsedMs };
          }),
        backToInterview: (problemId) => patchMock(problemId, () => ({ stage: 'interview' })),
        finishMock: (problemId, result) => {
          const m = get().activeMocks[problemId];
          if (!m) return null;
          const timer = timerPause(m.timer, Date.now());
          const finished: MockSession = {
            ...m,
            timer,
            usedMs: m.usedMs ?? timer.elapsedMs,
            finishedAt: now(),
            score: result.score,
            checked: result.checked,
          };
          set((s) => {
            const activeMocks = { ...s.activeMocks };
            delete activeMocks[problemId];
            const list = s.assessments[problemId] ?? [];
            const entry: Assessment = { at: finished.finishedAt!, score: result.score, checked: result.checked, source: 'mock', sessionId: m.id };
            const ws = s.workspaces[problemId] ?? newWorkspace();
            return {
              activeMocks,
              sessions: [...s.sessions, finished].slice(-MAX_SESSIONS),
              assessments: { ...s.assessments, [problemId]: [...list, entry].slice(-MAX_ASSESSMENTS) },
              // A finished mock unlocks the walkthrough for that problem.
              workspaces: { ...s.workspaces, [problemId]: { ...ws, walkthroughOpen: true, updatedAt: now() } },
            };
          });
          return finished.id;
        },
        discardMock: (problemId) =>
          set((s) => {
            if (!s.activeMocks[problemId]) return {};
            const activeMocks = { ...s.activeMocks };
            delete activeMocks[problemId];
            return { activeMocks };
          }),

        replaceAll: (data) => set({ ...EMPTY_PROBLEMS_DATA, ...sanitizeProblemsData(data) }),
        reset: () => set({ ...EMPTY_PROBLEMS_DATA }),
      };
    },
    {
      name: 'blueprint-problems',
      version: 1,
      partialize: (s): ProblemsData => ({
        workspaces: s.workspaces,
        assessments: s.assessments,
        sessions: s.sessions,
        activeMocks: s.activeMocks,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizeProblemsData(persisted) }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Validation, for storage and for progress import                     */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sanitizeTimer(raw: unknown): TimerState {
  if (!isRecord(raw)) return IDLE_TIMER;
  const since = raw.runningSince;
  return { elapsedMs: Math.max(0, num(raw.elapsedMs)), runningSince: typeof since === 'number' && Number.isFinite(since) ? since : null };
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function clampScore(v: unknown): number {
  return Math.max(0, Math.min(100, Math.round(num(v))));
}

function sanitizeSession(raw: unknown): MockSession | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.problemId !== 'string') return null;
  return {
    id: raw.id,
    problemId: raw.problemId,
    length: raw.length === 60 ? 60 : 45,
    startedAt: str(raw.startedAt),
    timer: sanitizeTimer(raw.timer),
    notes: str(raw.notes),
    design: sanitizeDesign(raw.design),
    followUps: Array.isArray(raw.followUps) ? raw.followUps.filter((n): n is number => Number.isInteger(n) && n >= 0) : [],
    stage: raw.stage === 'score' ? 'score' : 'interview',
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : undefined,
    usedMs: typeof raw.usedMs === 'number' ? Math.max(0, raw.usedMs) : undefined,
    score: typeof raw.score === 'number' ? clampScore(raw.score) : undefined,
    checked: Array.isArray(raw.checked) ? strings(raw.checked) : undefined,
  };
}

/** Keep only well-formed data. Used when reading storage and when importing a progress file. */
export function sanitizeProblemsData(raw: unknown): ProblemsData {
  if (!isRecord(raw)) return { ...EMPTY_PROBLEMS_DATA };
  const workspaces: Record<string, Workspace> = {};
  if (isRecord(raw.workspaces)) {
    for (const [id, w] of Object.entries(raw.workspaces)) {
      if (!isRecord(w)) continue;
      workspaces[id] = {
        notes: str(w.notes),
        design: sanitizeDesign(w.design),
        hintsShown: Math.max(0, Math.min(3, Math.round(num(w.hintsShown)))),
        timer: sanitizeTimer(w.timer),
        attemptDone: w.attemptDone === true,
        walkthroughOpen: w.walkthroughOpen === true,
        view: w.view === 'walkthrough' ? 'walkthrough' : 'try',
        updatedAt: str(w.updatedAt),
      };
    }
  }
  const assessments: Record<string, Assessment[]> = {};
  if (isRecord(raw.assessments)) {
    for (const [id, list] of Object.entries(raw.assessments)) {
      if (!Array.isArray(list)) continue;
      const clean = list.filter(isRecord).map(
        (a): Assessment => ({
          at: str(a.at),
          score: clampScore(a.score),
          checked: strings(a.checked),
          source: a.source === 'mock' ? 'mock' : 'practice',
          sessionId: typeof a.sessionId === 'string' ? a.sessionId : undefined,
        }),
      );
      if (clean.length) assessments[id] = clean;
    }
  }
  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .map(sanitizeSession)
    .filter((s): s is MockSession => s !== null && typeof s.score === 'number');
  const activeMocks: Record<string, MockSession> = {};
  if (isRecord(raw.activeMocks)) {
    for (const [id, m] of Object.entries(raw.activeMocks)) {
      const s = sanitizeSession(m);
      if (s && s.problemId === id) activeMocks[id] = s;
    }
  }
  return { workspaces, assessments, sessions, activeMocks };
}

/** The persisted part of the store, for progress export. */
export function problemsSnapshot(): ProblemsData {
  const s = useProblems.getState();
  return { workspaces: s.workspaces, assessments: s.assessments, sessions: s.sessions, activeMocks: s.activeMocks };
}
