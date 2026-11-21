import { describe, expect, it } from 'vitest';
import { findSnippet, paletteFilter, TEXT_SCORES, wordStartIndex, wordsMissingFrom, type Snippet } from './match';

/** A lesson's keyword strings, in the palette's priority order: headings, key terms, then summary and takeaways. */
const retries = {
  value: 'lesson 5.2 Timeouts, retries, backoff and jitter',
  keywords: ['Timeouts\nExponential backoff\nRetry budgets', 'Retry storm\nTail latency', 'Add jitter so clients that failed together do not retry together.'],
};
const locks = {
  value: 'lesson 5.9 Distributed locks',
  keywords: ['Why locks are hard\nFencing tokens', 'Lease\nFencing token', 'A lock is a lease, so pair it with a fencing token.'],
};
const databases = {
  value: 'lesson 3.6 Databases 101',
  keywords: ['Indexes\nTransactions', 'Write-ahead log\nWAL\nACID', 'A database writes to a log before it changes its tables, then catalogs pages.'],
};

const joined = (s: Snippet | null) => s && `${s.label}: ${s.parts.map((p) => (p.hit ? `[${p.text}]` : p.text)).join('')}`;

describe('paletteFilter', () => {
  it('ranks a word-start match above a match inside a word', () => {
    expect(paletteFilter('term TTL time to live', 'ttl')).toBe(1);
    expect(paletteFilter('lesson 3.4 caching', 'aching')).toBe(0.6);
  });

  it('does not match scattered letters', () => {
    expect(paletteFilter('lesson 1.1 the life of a request', 'ttl')).toBe(0);
  });

  it('requires every typed word', () => {
    expect(paletteFilter('lesson 3.4 caching', 'cach less')).toBe(1);
    expect(paletteFilter('lesson 3.4 caching', 'cach queue')).toBe(0);
  });

  it('falls back to keywords with a lower score', () => {
    expect(paletteFilter('term cache', 'copies', ['A small, fast store that keeps copies of data'])).toBe(0.3);
  });

  it('shows everything for an empty search', () => {
    expect(paletteFilter('anything', '  ')).toBe(1);
  });

  it('finds a lesson by words that appear only inside it', () => {
    expect(paletteFilter(locks.value, 'fencing token', locks.keywords)).toBe(0.3);
    expect(paletteFilter(databases.value, 'write-ahead log', databases.keywords)).toBe(0.25);
    expect(paletteFilter(databases.value, 'wal', databases.keywords)).toBe(0.25);
  });

  it('ranks text matches below every title match', () => {
    const inText = paletteFilter(locks.value, 'fencing', locks.keywords);
    expect(inText).toBeGreaterThan(0);
    expect(inText).toBeLessThan(paletteFilter('term Fencing token', 'fencing'));
    expect(inText).toBeLessThan(paletteFilter('lesson 3.4 caching', 'aching'));
    expect(Math.max(...TEXT_SCORES)).toBeLessThan(0.6);
  });

  it('ranks a heading above a key term above a takeaway', () => {
    const heading = paletteFilter(locks.value, 'fencing', locks.keywords);
    const term = paletteFilter(databases.value, 'acid', databases.keywords);
    const takeaway = paletteFilter(retries.value.replace(' and jitter', ''), 'jitter', retries.keywords);
    expect([heading, term, takeaway]).toEqual([0.3, 0.25, 0.2]);
  });

  it('keeps a title match at full score even when the text matches too', () => {
    expect(paletteFilter(retries.value, 'jitter', retries.keywords)).toBe(1);
  });

  it('mixes title and text words, scoring by the weakest', () => {
    expect(paletteFilter(retries.value, 'timeouts storm', retries.keywords)).toBe(0.25);
    expect(paletteFilter(retries.value, 'timeouts bloom', retries.keywords)).toBe(0);
  });

  it('matches text only at the start of a word', () => {
    expect(paletteFilter(databases.value, 'log', databases.keywords)).toBe(0.25);
    expect(paletteFilter(databases.value, 'atalog', databases.keywords)).toBe(0);
    expect(paletteFilter(databases.value, 'ahead', databases.keywords)).toBe(0.25);
  });

  it('ignores case in the search, the title and the text', () => {
    expect(paletteFilter(locks.value, 'FENCING Token', locks.keywords)).toBe(0.3);
  });
});

describe('wordStartIndex', () => {
  it('finds a word start after spaces, hyphens and line breaks', () => {
    expect(wordStartIndex('write-ahead log', 'ahead')).toBe(6);
    expect(wordStartIndex('catalog\nlog', 'log')).toBe(8);
    expect(wordStartIndex('catalog', 'log')).toBe(-1);
  });
});

describe('findSnippet', () => {
  const fields = [
    { label: 'Section', text: 'Retry budgets' },
    { label: 'Key term', text: 'Fencing token' },
    { label: 'Takeaway', text: 'A lock is a lease, so pair it with a fencing token that storage checks.' },
  ];

  it('quotes the earliest field that holds the most typed words', () => {
    expect(joined(findSnippet(fields, ['fencing', 'token']))).toBe('Key term: [Fencing] [token]');
    expect(joined(findSnippet(fields, ['lease', 'fencing']))).toBe('Takeaway: A lock is a [lease], so pair it with a [fencing] token that storage checks.');
  });

  it('highlights only word starts', () => {
    expect(joined(findSnippet([{ label: 'Takeaway', text: 'Logs, not catalogs.' }], ['log']))).toBe('Takeaway: [Log]s, not catalogs.');
  });

  it('cuts long text around the first hit', () => {
    const long = `${'Every remote call needs a timeout set from tail latency. '.repeat(3)}Add jitter so clients do not retry together. ${'More words follow here. '.repeat(6)}`;
    const s = joined(findSnippet([{ label: 'Takeaway', text: long }], ['jitter'], 60))!;
    expect(s.startsWith('Takeaway: …')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('[jitter]');
    expect(s.length).toBeLessThan(90);
  });

  it('returns nothing when no field matches or no words are left', () => {
    expect(findSnippet(fields, ['bloom'])).toBeNull();
    expect(findSnippet(fields, [])).toBeNull();
  });
});

describe('wordsMissingFrom', () => {
  it('keeps only the words the title does not explain', () => {
    expect(wordsMissingFrom(retries.value, 'Lesson retries storm')).toEqual(['storm']);
  });
});
