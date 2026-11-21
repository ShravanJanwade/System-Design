/**
 * Loads lesson files straight from disk, for scripts that run outside Vite.
 * (The app finds lessons with import.meta.glob; Node has no equivalent.)
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Lesson } from '../src/content/types';
import { allLessonOutlines } from '../src/content/modules';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src/content/lessons');
const FILE = /^(\d+)-(\d+)-(.+)\.ts$/;

export function lessonFiles(): { id: string; file: string }[] {
  return readdirSync(dir)
    .map((f) => ({ f, m: FILE.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => Boolean(x.m))
    .map(({ f, m }) => ({ id: m[3]!, file: path.join(dir, f) }));
}

/** Loads every lesson file (or only the given ids), in curriculum order. */
export async function loadLessons(only?: string[]): Promise<Lesson[]> {
  const order = new Map(allLessonOutlines.map((l, i) => [l.id, i]));
  const files = lessonFiles().filter((x) => !only || only.includes(x.id));
  const lessons: Lesson[] = [];
  for (const { id, file } of files) {
    const mod = (await import(pathToFileURL(file).href)) as { default?: Lesson };
    if (!mod.default) throw new Error(`${path.basename(file)} has no default export`);
    if (mod.default.id !== id) throw new Error(`${path.basename(file)} exports lesson id "${mod.default.id}", but its file name says "${id}"`);
    lessons.push(mod.default);
  }
  return lessons.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}
