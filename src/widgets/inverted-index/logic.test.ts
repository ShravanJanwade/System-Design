import { describe, expect, it } from 'vitest';
import { CAPTIONS, DEFAULT_QUERY, addDocument, buildIndex, buildSteps, entries, intersect, likeScan, search, tokenize } from './logic';

describe('tokenize', () => {
  it('lowercases, splits on spaces and punctuation, and drops stop words', () => {
    const t = tokenize('Sunset over the bay! #sunset');
    expect(t.pieces).toEqual(['sunset', 'over', 'the', 'bay', 'sunset']);
    expect(t.tokens).toEqual(['sunset', 'over', 'bay', 'sunset']);
    expect(t.dropped).toEqual(['the']);
  });

  it('treats a hashtag and a comma as separators', () => {
    expect(tokenize('Coffee, then a sunset run. #goldenhour').tokens).toEqual(['coffee', 'sunset', 'run', 'goldenhour']);
  });

  it('leaves nothing for a query made only of stop words', () => {
    const t = tokenize('The and a');
    expect(t.tokens).toEqual([]);
    expect(t.dropped).toEqual(['the', 'and', 'a']);
  });
});

describe('buildIndex', () => {
  const index = buildIndex(CAPTIONS);

  it('keeps one sorted posting list per word', () => {
    expect(index.get('sunset')).toEqual([1, 3, 4]);
    expect(index.get('beach')).toEqual([2, 3]);
    expect(index.get('coffee')).toEqual([2, 4]);
    expect(index.get('maya')).toEqual([3]);
  });

  it('lists a photo once even when the word appears twice in its caption', () => {
    expect(tokenize(CAPTIONS[0]!.text).tokens.filter((t) => t === 'sunset')).toHaveLength(2);
    expect(index.get('sunset')!.filter((id) => id === 1)).toHaveLength(1);
  });

  it('never indexes stop words', () => {
    for (const stop of ['the', 'on', 'with', 'then', 'a']) expect(index.has(stop)).toBe(false);
  });

  it('has nine words, in alphabetical order for display', () => {
    expect(entries(index).map((e) => e.term)).toEqual(['bay', 'beach', 'coffee', 'goldenhour', 'maya', 'morning', 'over', 'run', 'sunset']);
  });

  it('adding a document does not change the index passed in', () => {
    const before = buildIndex(CAPTIONS.slice(0, 2));
    const after = addDocument(before, CAPTIONS[2]!);
    expect(before.get('beach')).toEqual([2]);
    expect(after.index.get('beach')).toEqual([2, 3]);
    expect(after.newTerms).toEqual(['maya']);
    expect(after.extendedTerms).toEqual(['beach', 'sunset']);
  });

  it('keeps lists sorted when documents arrive out of order', () => {
    const index2 = buildIndex([CAPTIONS[3]!, CAPTIONS[0]!, CAPTIONS[2]!]);
    expect(index2.get('sunset')).toEqual([1, 3, 4]);
  });
});

describe('intersect', () => {
  it('keeps the numbers on both lists', () => {
    expect(intersect([1, 3, 4], [2, 3]).result).toEqual([3]);
    expect(intersect([1, 2, 5, 9], [2, 3, 5, 8, 9]).result).toEqual([2, 5, 9]);
    expect(intersect([1, 2], []).result).toEqual([]);
  });

  it('walks the two sorted lists once, side by side', () => {
    const a = [1, 4, 7, 10, 13];
    const b = [2, 4, 8, 13, 20];
    expect(intersect(a, b).comparisons).toBeLessThanOrEqual(a.length + b.length);
  });
});

describe('search', () => {
  const index = buildIndex(CAPTIONS);

  it('finds the one photo with both words for the default query', () => {
    expect(DEFAULT_QUERY).toBe('sunset beach');
    const r = search(index, DEFAULT_QUERY);
    expect(r.lists).toEqual([
      { term: 'sunset', docs: [1, 3, 4] },
      { term: 'beach', docs: [2, 3] },
    ]);
    expect(r.result).toEqual([3]);
  });

  it('tokenizes the query the same way as the captions', () => {
    expect(search(index, 'Sunset at the BEACH!').result).toEqual([3]);
    expect(search(index, '#coffee #sunset').result).toEqual([4]);
  });

  it('returns nothing when a word is missing, or when only stop words are left', () => {
    expect(search(index, 'maya pizza').result).toEqual([]);
    const r = search(index, 'the and');
    expect(r.lists).toEqual([]);
    expect(r.result).toEqual([]);
  });

  it('does no stemming: “sunsets” does not find “sunset”', () => {
    expect(search(index, 'sunsets').result).toEqual([]);
  });

  it('a single word returns its whole posting list', () => {
    expect(search(index, 'coffee').result).toEqual([2, 4]);
  });
});

describe('buildSteps', () => {
  const steps = buildSteps(CAPTIONS, DEFAULT_QUERY);

  it('starts empty, tokenizes and adds each caption, then looks up and intersects', () => {
    expect(steps.map((s) => s.kind)).toEqual(['start', 'tokenize', 'add', 'tokenize', 'add', 'tokenize', 'add', 'tokenize', 'add', 'lookup', 'intersect']);
    expect(steps[0]!.index.size).toBe(0);
  });

  it('each add step shows the index with only the captions added so far', () => {
    const adds = steps.filter((s) => s.kind === 'add');
    expect(adds.map((s) => s.indexed)).toEqual([[1], [1, 2], [1, 2, 3], [1, 2, 3, 4]]);
    expect(adds[1]!.index.get('beach')).toEqual([2]);
    expect(adds[2]!.index.get('beach')).toEqual([2, 3]);
    expect(adds[3]!.index).toEqual(buildIndex(CAPTIONS));
  });

  it('a tokenize step still shows the index before that caption is added', () => {
    const third = steps[5]!;
    expect(third.kind).toBe('tokenize');
    expect(third.index.has('maya')).toBe(false);
  });

  it('ends with the intersection of the query’s lists', () => {
    const last = steps[steps.length - 1]!;
    expect(last.kind === 'intersect' && last.search.result).toEqual([3]);
  });
});

describe('likeScan', () => {
  it('checks every caption and matches characters anywhere, even inside other words', () => {
    const r = likeScan(CAPTIONS, 'sun');
    expect(r.checked).toBe(CAPTIONS.length);
    expect(r.matches).toEqual([1, 3, 4]);
    expect(likeScan(CAPTIONS, 'ay').matches).toEqual([1, 3]);
  });
});
