import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EMPTY_DESIGN, sanitizeDesign, type BuilderDesign } from '@/features/builder/model';

/**
 * Practice history (blueprint section 10): the last result for every drill question, totals per drill mode,
 * and the architecture builder's sandbox design. Everything here is plain, serializable data.
 */

export const DRILL_MODES = ['estimation', 'bottleneck', 'tools'] as const;
export type DrillMode = (typeof DRILL_MODES)[number];

export function isDrillMode(value: unknown): value is DrillMode {
  return typeof value === 'string' && (DRILL_MODES as readonly string[]).includes(value);
}

export type ItemRecord = {
  /** The latest answer was right. */
  correct: boolean;
  /** When the question was last answered (ISO time). */
  seenAt: string;
  /** Answers given to this question, all time. */
  attempts: number;
};

export type ModeTally = { attempts: number; correct: number };

export type PracticeData = {
  /** By practice item id. */
  items: Record<string, ItemRecord>;
  modes: Record<DrillMode, ModeTally>;
  /** The free canvas at /practice/builder. */
  sandbox: BuilderDesign;
};

function emptyModes(): Record<DrillMode, ModeTally> {
  return { estimation: { attempts: 0, correct: 0 }, bottleneck: { attempts: 0, correct: 0 }, tools: { attempts: 0, correct: 0 } };
}

export const EMPTY_PRACTICE_DATA: PracticeData = { items: {}, modes: emptyModes(), sandbox: EMPTY_DESIGN };

type PracticeState = PracticeData & {
  recordAnswer: (mode: DrillMode, itemId: string, correct: boolean, at?: string) => void;
  setSandbox: (design: BuilderDesign) => void;
  replaceAll: (data: PracticeData) => void;
  reset: () => void;
};

export const usePractice = create<PracticeState>()(
  persist(
    (set) => ({
      ...EMPTY_PRACTICE_DATA,
      recordAnswer: (mode, itemId, correct, at = new Date().toISOString()) =>
        set((s) => {
          const prev = s.items[itemId];
          const tally = s.modes[mode];
          return {
            items: { ...s.items, [itemId]: { correct, seenAt: at, attempts: (prev?.attempts ?? 0) + 1 } },
            modes: { ...s.modes, [mode]: { attempts: tally.attempts + 1, correct: tally.correct + (correct ? 1 : 0) } },
          };
        }),
      setSandbox: (design) => set({ sandbox: design }),
      replaceAll: (data) => set({ ...sanitizePracticeData(data) }),
      reset: () => set({ ...EMPTY_PRACTICE_DATA, modes: emptyModes() }),
    }),
    {
      name: 'blueprint-practice',
      version: 1,
      partialize: (s): PracticeData => ({ items: s.items, modes: s.modes, sandbox: s.sandbox }),
      merge: (persisted, current) => ({ ...current, ...sanitizePracticeData(persisted) }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Validation, export, import and reset                                */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

/** Keep only well-formed data. Used when reading storage and when importing a progress file. */
export function sanitizePracticeData(raw: unknown): PracticeData {
  if (!isRecord(raw)) return { ...EMPTY_PRACTICE_DATA, modes: emptyModes() };
  const items: Record<string, ItemRecord> = {};
  if (isRecord(raw.items)) {
    for (const [id, r] of Object.entries(raw.items)) {
      if (!id || !isRecord(r) || typeof r.seenAt !== 'string') continue;
      items[id] = { correct: r.correct === true, seenAt: r.seenAt, attempts: Math.max(1, count(r.attempts)) };
    }
  }
  const modes = emptyModes();
  if (isRecord(raw.modes)) {
    for (const mode of DRILL_MODES) {
      const t = raw.modes[mode];
      if (!isRecord(t)) continue;
      const attempts = count(t.attempts);
      modes[mode] = { attempts, correct: Math.min(attempts, count(t.correct)) };
    }
  }
  return { items, modes, sandbox: sanitizeDesign(raw.sandbox) };
}

/** The persisted part of the store, for progress export. */
export function practiceSnapshot(): PracticeData {
  const s = usePractice.getState();
  return { items: s.items, modes: s.modes, sandbox: s.sandbox };
}

/** Replace all practice data, for progress import. The data is sanitized first. */
export function replaceAll(data: unknown): void {
  usePractice.getState().replaceAll(sanitizePracticeData(data));
}

/** Clear all practice data, for "Reset progress". */
export function reset(): void {
  usePractice.getState().reset();
}
