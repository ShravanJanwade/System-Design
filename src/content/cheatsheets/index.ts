import type { CheatSheet } from '../types';

/**
 * Cheat sheet content is code-split: each sheet file loads only when it is opened.
 * Sheet files are found automatically. Name them "<sheet id>.ts", for example
 * "latency-numbers.ts", export the sheet as the default export, and add it to list.ts.
 */
const files = import.meta.glob<{ default: CheatSheet }>(['./*.ts', '!./index.ts', '!./list.ts']);

export const cheatSheetLoaders: Record<string, () => Promise<CheatSheet>> = {};
for (const [path, load] of Object.entries(files)) {
  const id = (path.split('/').pop() ?? path).replace(/\.ts$/, '');
  cheatSheetLoaders[id] = () => load().then((mod) => mod.default);
}

/** Ids of the sheet files that exist, from their file names. */
export const cheatSheetIds: ReadonlySet<string> = new Set(Object.keys(cheatSheetLoaders));

const cache = new Map<string, CheatSheet>();
const pending = new Map<string, Promise<CheatSheet>>();

export function getLoadedCheatSheet(id: string): CheatSheet | undefined {
  return cache.get(id);
}

export function loadCheatSheet(id: string): Promise<CheatSheet> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const loader = cheatSheetLoaders[id];
  if (!loader) return Promise.reject(new Error(`Cheat sheet "${id}" does not exist.`));
  const p = loader().then(
    (sheet) => {
      cache.set(id, sheet);
      pending.delete(id);
      return sheet;
    },
    (err: unknown) => {
      // Forget the failed attempt so a retry can load it again.
      pending.delete(id);
      throw err;
    },
  );
  pending.set(id, p);
  return p;
}

/** Every sheet, keyed by its file name (used by the content check test). */
export async function loadAllCheatSheets(): Promise<{ file: string; sheet: CheatSheet }[]> {
  const ids = [...cheatSheetIds];
  const sheets = await Promise.all(ids.map(loadCheatSheet));
  return ids.map((file, i) => ({ file, sheet: sheets[i]! }));
}
