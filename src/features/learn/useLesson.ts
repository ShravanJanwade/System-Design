import { useEffect, useState } from 'react';
import type { Lesson } from '@/content/types';
import { getLoadedLesson, isLessonWritten, loadLesson } from '@/content/lessons';

export type LessonState = { status: 'loading' } | { status: 'ready'; lesson: Lesson } | { status: 'missing' } | { status: 'error'; message: string };

/** Loads a lesson's content module on demand. */
export function useLesson(id: string | undefined): LessonState {
  const [state, setState] = useState<LessonState>(() => {
    if (!id || !isLessonWritten(id)) return { status: 'missing' };
    const cached = getLoadedLesson(id);
    return cached ? { status: 'ready', lesson: cached } : { status: 'loading' };
  });

  useEffect(() => {
    if (!id || !isLessonWritten(id)) {
      setState({ status: 'missing' });
      return;
    }
    const cached = getLoadedLesson(id);
    if (cached) {
      setState({ status: 'ready', lesson: cached });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    loadLesson(id)
      .then((lesson) => alive && setState({ status: 'ready', lesson }))
      .catch((e: unknown) => alive && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [id]);

  return state;
}
