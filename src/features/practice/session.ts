import { create } from 'zustand';
import type { DrillMode } from '@/state/practice';
import { newSession, type DrillSession } from './logic';

/**
 * The current session of each drill mode: filters, score and the question on screen. Kept in memory while the
 * app is open, so following "Review the lesson" and coming back keeps the running score.
 */
type SessionStore = {
  sessions: Partial<Record<DrillMode, DrillSession>>;
  update: (mode: DrillMode, fn: (s: DrillSession) => DrillSession) => void;
};

const FRESH = newSession();

export const useDrillSessions = create<SessionStore>()((set) => ({
  sessions: {},
  update: (mode, fn) =>
    set((st) => {
      const prev = st.sessions[mode] ?? FRESH;
      const next = fn(prev);
      return next === prev ? st : { sessions: { ...st.sessions, [mode]: next } };
    }),
}));

export function useDrillSession(mode: DrillMode): DrillSession {
  return useDrillSessions((st) => st.sessions[mode] ?? FRESH);
}
