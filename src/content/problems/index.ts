import type { Problem } from '../types';

/**
 * Problem content is code-split: each problem file loads only when it is opened.
 * Problem files are found automatically. Name them "<problem id>.ts", for example
 * "url-shortener.ts", and export the problem as the default export.
 */
const files = import.meta.glob<{ default: Problem }>(['./*.ts', '!./index.ts']);

export const problemLoaders: Record<string, () => Promise<Problem>> = {};
for (const [path, load] of Object.entries(files)) {
  const id = (path.split('/').pop() ?? path).replace(/\.ts$/, '');
  problemLoaders[id] = () => load().then((mod) => mod.default);
}

export const writtenProblemIds: ReadonlySet<string> = new Set(Object.keys(problemLoaders));

export function isProblemWritten(id: string): boolean {
  return writtenProblemIds.has(id);
}

const cache = new Map<string, Problem>();
const pending = new Map<string, Promise<Problem>>();

export function getLoadedProblem(id: string): Problem | undefined {
  return cache.get(id);
}

export function loadProblem(id: string): Promise<Problem> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const loader = problemLoaders[id];
  if (!loader) return Promise.reject(new Error(`Problem "${id}" is not written yet.`));
  const p = loader().then((problem) => {
    cache.set(id, problem);
    pending.delete(id);
    return problem;
  });
  pending.set(id, p);
  return p;
}

/** Every written problem (used by the content check test). */
export function loadAllProblems(): Promise<Problem[]> {
  return Promise.all([...writtenProblemIds].map(loadProblem));
}
