/**
 * Matching and ranking for the command palette, and the snippets that explain a match.
 * Pure functions, so the ranking rules are easy to test.
 */

/** The lowercase words typed into the palette. */
export function searchWords(search: string): string[] {
  return search.toLowerCase().split(/\s+/).filter(Boolean);
}

const WORD_CHAR = /[a-z0-9]/;

/** Where `word` starts a word in `text` (both lowercase), searching from `from`; -1 when it never does. */
export function wordStartIndex(text: string, word: string, from = 0): number {
  for (let i = text.indexOf(word, from); i !== -1; i = text.indexOf(word, i + 1)) {
    if (i === 0 || !WORD_CHAR.test(text[i - 1]!)) return i;
  }
  return -1;
}

/**
 * Scores for a word found in an item's text rather than its title, by which keyword string held it.
 * The first string scores highest; all of them stay below any title match (0.6 and up).
 */
export const TEXT_SCORES = [0.3, 0.25, 0.2, 0.15] as const;

/**
 * Word-based matching: every word typed must start a word in the item's title (best), appear inside
 * its title, or start a word in one of its keyword strings (its text, such as a lesson's headings,
 * key terms and takeaways). Keyword strings come in priority order. No loose letter-by-letter matches.
 */
export function paletteFilter(value: string, search: string, keywords?: string[]): number {
  const words = searchWords(search);
  if (words.length === 0) return 1;
  const title = value.toLowerCase();
  const titleWords = title.split(/[^a-z0-9.]+/).filter(Boolean);
  let text: string[] | undefined;
  let score = 1;
  for (const w of words) {
    if (titleWords.some((t) => t.startsWith(w))) continue;
    if (title.includes(w)) {
      score = Math.min(score, 0.6);
      continue;
    }
    text ??= (keywords ?? []).map((k) => k.toLowerCase());
    const field = text.findIndex((k) => wordStartIndex(k, w) !== -1);
    if (field === -1) return 0;
    score = Math.min(score, TEXT_SCORES[Math.min(field, TEXT_SCORES.length - 1)]!);
  }
  return score;
}

/** One piece of an item's text that can explain a match, such as a section heading or a takeaway. */
export type SnippetField = { label: string; text: string };

export type Snippet = { label: string; parts: { text: string; hit: boolean }[] };

/**
 * Explains a text match: picks the field holding the most of `words` (the earliest on a tie), then
 * cuts an excerpt of about `max` characters that starts a little before the first hit.
 */
export function findSnippet(fields: SnippetField[], words: string[], max = 110): Snippet | null {
  if (words.length === 0) return null;
  let best: SnippetField | null = null;
  let bestHits = 0;
  for (const field of fields) {
    const lower = field.text.toLowerCase();
    const hits = words.filter((w) => wordStartIndex(lower, w) !== -1).length;
    if (hits > bestHits) {
      best = field;
      bestHits = hits;
      if (hits === words.length) break;
    }
  }
  if (!best) return null;

  const { text } = best;
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const w of words) {
    for (let i = wordStartIndex(lower, w); i !== -1; i = wordStartIndex(lower, w, i + w.length)) ranges.push([i, i + w.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const hits: [number, number][] = [];
  for (const [a, b] of ranges) {
    const last = hits[hits.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else hits.push([a, b]);
  }

  let start = 0;
  let end = text.length;
  if (text.length > max) {
    const first = hits[0]![0];
    start = Math.max(0, Math.min(first - 16, text.length - max));
    if (start > 0) {
      const space = text.indexOf(' ', start);
      if (space !== -1 && space < first) start = space + 1;
    }
    end = Math.min(text.length, start + max);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > hits[0]![1]) end = space;
    }
  }

  const parts: Snippet['parts'] = [];
  const push = (s: string, hit: boolean) => {
    const last = parts[parts.length - 1];
    if (last && !last.hit && !hit) last.text += s;
    else if (s) parts.push({ text: s, hit });
  };
  if (start > 0) push('…', false);
  let pos = start;
  for (const [a, b] of hits) {
    if (b <= start || a >= end) continue;
    const s = Math.max(a, start);
    const e = Math.min(b, end);
    if (s > pos) push(text.slice(pos, s), false);
    push(text.slice(s, e), true);
    pos = e;
  }
  if (pos < end) push(text.slice(pos, end), false);
  if (end < text.length) push('…', false);
  return { label: best.label, parts };
}

/** Words of the search that the title does not explain, so a snippet should. */
export function wordsMissingFrom(value: string, search: string): string[] {
  const title = value.toLowerCase();
  return searchWords(search).filter((w) => !title.includes(w));
}
