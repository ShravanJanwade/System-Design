/**
 * Inverted index, built step by step from four Snapgram captions.
 *
 * Tokenizing: lowercase, split on anything that is not a letter or digit (spaces and punctuation,
 * including the # of a hashtag), then drop a few stop words. Each remaining token gets a posting list:
 * the sorted, de-duplicated numbers of the photos that contain it. A query is tokenized the same way,
 * and its posting lists are intersected (every word must match), shortest list first.
 */

export type Doc = { id: number; text: string };

export const CAPTIONS: Doc[] = [
  { id: 1, text: 'Sunset over the bay! #sunset' },
  { id: 2, text: 'Morning coffee on the beach' },
  { id: 3, text: 'Beach sunset with Maya' },
  { id: 4, text: 'Coffee, then a sunset run. #goldenhour' },
];

export const DEFAULT_QUERY = 'sunset beach';

/** A short list for teaching; real engines use longer, language-specific lists. */
export const STOP_WORDS: ReadonlySet<string> = new Set(['a', 'an', 'and', 'at', 'in', 'is', 'of', 'on', 'the', 'then', 'to', 'with']);

export type TokenTrace = {
  /** The text as written. */
  raw: string;
  lower: string;
  /** Lowercased pieces, split on spaces and punctuation, in order. */
  pieces: string[];
  /** Pieces kept for the index, in order (repeats included). */
  tokens: string[];
  /** Pieces dropped as stop words, in order. */
  dropped: string[];
};

export function tokenize(text: string): TokenTrace {
  const lower = text.toLowerCase();
  const pieces = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return {
    raw: text,
    lower,
    pieces,
    tokens: pieces.filter((p) => !STOP_WORDS.has(p)),
    dropped: pieces.filter((p) => STOP_WORDS.has(p)),
  };
}

/** Word to the sorted photo numbers that contain it. */
export type InvertedIndex = ReadonlyMap<string, readonly number[]>;

export type AddResult = {
  index: InvertedIndex;
  /** Words seen for the first time. */
  newTerms: string[];
  /** Words that already had a list, which now include this photo. */
  extendedTerms: string[];
};

/** Adds one document without changing the index passed in. */
export function addDocument(index: InvertedIndex, doc: Doc): AddResult {
  const next = new Map(index);
  const newTerms: string[] = [];
  const extendedTerms: string[] = [];
  for (const term of new Set(tokenize(doc.text).tokens)) {
    const list = next.get(term);
    if (!list) {
      next.set(term, [doc.id]);
      newTerms.push(term);
    } else if (!list.includes(doc.id)) {
      next.set(term, insertSorted(list, doc.id));
      extendedTerms.push(term);
    }
  }
  return { index: next, newTerms, extendedTerms };
}

function insertSorted(list: readonly number[], id: number): number[] {
  const out = [...list];
  let i = out.length;
  while (i > 0 && out[i - 1]! > id) i--;
  out.splice(i, 0, id);
  return out;
}

export function buildIndex(docs: readonly Doc[]): InvertedIndex {
  let index: InvertedIndex = new Map();
  for (const doc of docs) index = addDocument(index, doc).index;
  return index;
}

/** Index entries in alphabetical order, for display. */
export function entries(index: InvertedIndex): { term: string; docs: readonly number[] }[] {
  return [...index.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([term, docs]) => ({ term, docs }));
}

/** Two-pointer merge of two sorted lists: keeps numbers on both, comparing each pair at most once. */
export function intersect(a: readonly number[], b: readonly number[]): { result: number[]; comparisons: number } {
  const result: number[] = [];
  let i = 0;
  let j = 0;
  let comparisons = 0;
  while (i < a.length && j < b.length) {
    comparisons++;
    if (a[i] === b[j]) {
      result.push(a[i]!);
      i++;
      j++;
    } else if (a[i]! < b[j]!) i++;
    else j++;
  }
  return { result, comparisons };
}

export type SearchResult = {
  query: string;
  trace: TokenTrace;
  /** Distinct query words, each with its posting list (empty when the word is not indexed). */
  lists: { term: string; docs: readonly number[] }[];
  /** Photos on every list. Empty when a word is missing or no words are left. */
  result: number[];
};

/** Every word must match: intersect the posting lists, shortest first. */
export function search(index: InvertedIndex, query: string): SearchResult {
  const trace = tokenize(query);
  const terms = [...new Set(trace.tokens)];
  const lists = terms.map((term) => ({ term, docs: index.get(term) ?? [] }));
  if (lists.length === 0) return { query, trace, lists, result: [] };
  const ordered = [...lists].sort((x, y) => x.docs.length - y.docs.length);
  let result = [...ordered[0]!.docs];
  for (const l of ordered.slice(1)) result = intersect(result, l.docs).result;
  return { query, trace, lists, result };
}

/* ------------------------------------------------------------------ */
/* Steps the widget walks through                                      */
/* ------------------------------------------------------------------ */

export type BuildStep =
  | { kind: 'start'; index: InvertedIndex; indexed: number[] }
  | { kind: 'tokenize'; doc: Doc; trace: TokenTrace; index: InvertedIndex; indexed: number[] }
  | { kind: 'add'; doc: Doc; trace: TokenTrace; index: InvertedIndex; indexed: number[]; newTerms: string[]; extendedTerms: string[] }
  | { kind: 'lookup'; search: SearchResult; index: InvertedIndex; indexed: number[] }
  | { kind: 'intersect'; search: SearchResult; index: InvertedIndex; indexed: number[] };

/** Start, then tokenize and add each caption, then look up the query's words and intersect their lists. */
export function buildSteps(docs: readonly Doc[], query: string): BuildStep[] {
  const steps: BuildStep[] = [{ kind: 'start', index: new Map(), indexed: [] }];
  let index: InvertedIndex = new Map();
  const indexed: number[] = [];
  for (const doc of docs) {
    const trace = tokenize(doc.text);
    steps.push({ kind: 'tokenize', doc, trace, index, indexed: [...indexed] });
    const added = addDocument(index, doc);
    index = added.index;
    indexed.push(doc.id);
    steps.push({ kind: 'add', doc, trace, index, indexed: [...indexed], newTerms: added.newTerms, extendedTerms: added.extendedTerms });
  }
  const found = search(index, query);
  steps.push({ kind: 'lookup', search: found, index, indexed: [...indexed] });
  steps.push({ kind: 'intersect', search: found, index, indexed: [...indexed] });
  return steps;
}

/** What `LIKE '%text%'` does instead: check every caption for the characters, in order. */
export function likeScan(docs: readonly Doc[], text: string): { matches: number[]; checked: number } {
  const needle = text.toLowerCase();
  return { matches: docs.filter((d) => d.text.toLowerCase().includes(needle)).map((d) => d.id), checked: docs.length };
}
