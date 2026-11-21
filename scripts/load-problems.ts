/**
 * Loads problem files straight from disk, for scripts that run outside Vite.
 * (The app finds problems with import.meta.glob; Node has no equivalent.)
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Problem } from '../src/content/types';
import { problemList } from '../src/content/problem-list';
import { root } from './load-lessons';

const dir = path.join(root, 'src/content/problems');

export function problemFiles(): { id: string; file: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => ({ id: f.replace(/\.ts$/, ''), file: path.join(dir, f) }));
}

/** Loads every problem file (or only the given ids), in problem-bank order. */
export async function loadProblems(only?: string[]): Promise<Problem[]> {
  const order = new Map(problemList.map((p, i) => [p.id, i]));
  const files = problemFiles().filter((x) => !only || only.includes(x.id));
  const problems: Problem[] = [];
  for (const { id, file } of files) {
    const mod = (await import(pathToFileURL(file).href)) as { default?: Problem };
    if (!mod.default) throw new Error(`${path.basename(file)} has no default export`);
    if (mod.default.id !== id) throw new Error(`${path.basename(file)} exports problem id "${mod.default.id}", but its file name says "${id}"`);
    problems.push(mod.default);
  }
  return problems.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}
