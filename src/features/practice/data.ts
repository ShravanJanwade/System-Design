import { useEffect, useState } from 'react';
import { buildContent, type PracticeContent } from './logic';

let cache: Promise<PracticeContent> | null = null;
let loaded: PracticeContent | null = null;

/** Loads every practice question once per visit to the app. A failed load is retried on the next call. */
export function loadPracticeContent(): Promise<PracticeContent> {
  if (!cache) {
    // Both modules load on demand, so the questions stay out of the main bundle.
    cache = Promise.all([import('@/content/generated/practice-pool'), import('@/content/practice')]).then(([{ practicePool }, authored]) => {
      loaded = buildContent(practicePool, authored.bottleneckItems, authored.toolItems);
      return loaded;
    });
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export type ContentState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; content: PracticeContent };

/** The practice questions, loaded on first use. */
export function usePracticeContent(): { state: ContentState; retry: () => void } {
  const [state, setState] = useState<ContentState>(() => (loaded ? { status: 'ready', content: loaded } : { status: 'loading' }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    loadPracticeContent().then(
      (content) => alive && setState((prev) => (prev.status === 'ready' && prev.content === content ? prev : { status: 'ready', content })),
      () => alive && setState({ status: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };
  return { state, retry };
}
