import type { Lesson } from '../types';

/**
 * Lesson content is code-split: each lesson file loads only when it is opened.
 * Lesson files are found automatically. Name them "<module>-<order>-<lesson id>.ts",
 * for example "3-4-caching.ts", and export the lesson as the default export.
 */
const files = import.meta.glob<{ default: Lesson }>('./[0-9]*-[0-9]*-*.ts');

export const LESSON_FILE = /^\.?\/?(\d+)-(\d+)-(.+)\.ts$/;

export const lessonLoaders: Record<string, () => Promise<Lesson>> = {};
for (const [path, load] of Object.entries(files)) {
  const name = path.split('/').pop() ?? path;
  const m = LESSON_FILE.exec(name);
  if (m) lessonLoaders[m[3]!] = () => load().then((mod) => mod.default);
}

export const writtenLessonIds: ReadonlySet<string> = new Set(Object.keys(lessonLoaders));

export function isLessonWritten(id: string): boolean {
  return writtenLessonIds.has(id);
}

const cache = new Map<string, Lesson>();
const pending = new Map<string, Promise<Lesson>>();

export function getLoadedLesson(id: string): Lesson | undefined {
  return cache.get(id);
}

export function loadLesson(id: string): Promise<Lesson> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const loader = lessonLoaders[id];
  if (!loader) return Promise.reject(new Error(`Lesson "${id}" is not written yet.`));
  const p = loader().then((lesson) => {
    cache.set(id, lesson);
    pending.delete(id);
    return lesson;
  });
  pending.set(id, p);
  return p;
}

export async function loadAllLessons(): Promise<Lesson[]> {
  return Promise.all(Object.keys(lessonLoaders).map(loadLesson));
}
