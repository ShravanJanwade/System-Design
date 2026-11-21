import { useEffect, useState } from 'react';
import type { SearchIndex } from '@/content/generated/search-index';

let loaded: SearchIndex | null = null;
let pending: Promise<SearchIndex> | null = null;

/** Loads the full-text index once, as its own chunk, so the main bundle never carries it. */
export function loadSearchIndex(): Promise<SearchIndex> {
  pending ??= import('@/content/generated/search-index').then(
    (m) => (loaded = m.searchIndex),
    (err: unknown) => {
      pending = null; // try again next time, for example after a dropped connection
      throw err;
    },
  );
  return pending;
}

/** The full-text index, or null until it arrives. Loading starts the first time `wanted` is true. */
export function useSearchIndex(wanted: boolean): SearchIndex | null {
  const [index, setIndex] = useState<SearchIndex | null>(loaded);
  useEffect(() => {
    if (!wanted || index) return;
    let live = true;
    loadSearchIndex().then(
      (i) => live && setIndex(i),
      () => {
        // Titles still match without the index; the next open retries.
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, index]);
  return index;
}
