import { useEffect, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type TextSize = 'smaller' | 'default' | 'larger';
export type MotionPref = 'system' | 'reduce' | 'full';

type SettingsState = {
  theme: ThemePref;
  textSize: TextSize;
  reducedMotion: MotionPref;
  focusMode: boolean;
  curriculumOpen: boolean;
  /** Show the study streak on Home. Streaks are optional. */
  showStreak: boolean;
  setTheme: (theme: ThemePref) => void;
  setTextSize: (size: TextSize) => void;
  setReducedMotion: (pref: MotionPref) => void;
  setFocusMode: (on: boolean) => void;
  toggleFocusMode: () => void;
  setCurriculumOpen: (open: boolean) => void;
  setShowStreak: (on: boolean) => void;
  resetSettings: () => void;
};

const defaults = {
  theme: 'system' as ThemePref,
  textSize: 'default' as TextSize,
  reducedMotion: 'system' as MotionPref,
  focusMode: false,
  curriculumOpen: true,
  showStreak: true,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setTheme: (theme) => set({ theme }),
      setTextSize: (textSize) => set({ textSize }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setFocusMode: (focusMode) => set({ focusMode }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      setCurriculumOpen: (curriculumOpen) => set({ curriculumOpen }),
      setShowStreak: (showStreak) => set({ showStreak }),
      resetSettings: () => set({ ...defaults }),
    }),
    { name: 'blueprint-settings', version: 1 },
  ),
);

function mediaQuery(query: string): () => boolean {
  return () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
}

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
    const mql = window.matchMedia(query);
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  };
}

const DARK = '(prefers-color-scheme: dark)';
const REDUCE = '(prefers-reduced-motion: reduce)';

export function useSystemDark(): boolean {
  return useSyncExternalStore(subscribeMedia(DARK), mediaQuery(DARK), () => false);
}

export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMedia(REDUCE), mediaQuery(REDUCE), () => false);
}

/** True when animations should become discrete states (setting or OS preference). */
export function useReducedMotion(): boolean {
  const pref = useSettings((s) => s.reducedMotion);
  const system = useSystemReducedMotion();
  return pref === 'reduce' || (pref === 'system' && system);
}

export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettings((s) => s.theme);
  const systemDark = useSystemDark();
  return theme === 'dark' || (theme === 'system' && systemDark) ? 'dark' : 'light';
}

/** Mirrors settings onto <html> so CSS tokens and the motion rules follow them. */
export function useApplySettings(): void {
  const resolved = useResolvedTheme();
  const textSize = useSettings((s) => s.textSize);
  const reduce = useReducedMotion();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.text = textSize;
    root.dataset.motion = reduce ? 'reduce' : 'full';
  }, [resolved, textSize, reduce]);
}
