import { useEffect, useState } from 'react';
import type { Problem } from '@/content/types';
import { getLoadedProblem, isProblemWritten, loadProblem } from '@/content/problems';

/**
 * Where the problem pages get their content: the real problem files in src/content/problems.
 * In development only, and only when the "blueprint-dev-fixtures" flag is set in localStorage,
 * the fixtures in ./__fixtures__ stand in for problems that are not written yet. Production builds never use them.
 */
const fixtureFiles: Record<string, () => Promise<{ default: Problem }>> = import.meta.env.DEV
  ? import.meta.glob<{ default: Problem }>('./__fixtures__/*.ts')
  : {};

const fixtureLoaders = new Map<string, () => Promise<Problem>>();
for (const [path, load] of Object.entries(fixtureFiles)) {
  const id = (path.split('/').pop() ?? path).replace(/\.ts$/, '');
  fixtureLoaders.set(id, () => load().then((m) => m.default));
}

function fixturesOn(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('blueprint-dev-fixtures') === '1';
  } catch {
    return false;
  }
}

/** True when the problem can be opened. */
export function isWritten(id: string): boolean {
  return isProblemWritten(id) || (fixturesOn() && fixtureLoaders.has(id));
}

export function fetchProblem(id: string): Promise<Problem> {
  if (isProblemWritten(id)) return loadProblem(id);
  const fixture = fixturesOn() ? fixtureLoaders.get(id) : undefined;
  if (fixture) return fixture();
  return Promise.reject(new Error(`Problem "${id}" is not written yet.`));
}

export type ProblemLoad =
  | { status: 'loading' }
  | { status: 'ready'; problem: Problem }
  | { status: 'unwritten' }
  | { status: 'error'; message: string };

/** Load one problem's content, code-split per problem. */
export function useProblem(id: string | undefined): ProblemLoad {
  const [state, setState] = useState<ProblemLoad>(() => {
    if (!id || !isWritten(id)) return { status: 'unwritten' };
    const hit = getLoadedProblem(id);
    return hit ? { status: 'ready', problem: hit } : { status: 'loading' };
  });

  useEffect(() => {
    if (!id || !isWritten(id)) {
      setState({ status: 'unwritten' });
      return;
    }
    const hit = getLoadedProblem(id);
    if (hit) {
      setState({ status: 'ready', problem: hit });
      return;
    }
    let live = true;
    setState({ status: 'loading' });
    fetchProblem(id).then(
      (problem) => live && setState({ status: 'ready', problem }),
      (err: unknown) => live && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      live = false;
    };
  }, [id]);

  return state;
}
