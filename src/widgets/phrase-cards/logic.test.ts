import { describe, expect, it } from 'vitest';
import {
  CARD_COUNT,
  DECISIONS,
  PARTS,
  cardStatus,
  deckReducer,
  fullSentence,
  getDecision,
  initialDeck,
  keyAction,
  sentencePieces,
  type DeckAction,
  type DeckState,
} from './logic';

/** The template as lessons 2.7 and 8.7 teach it. */
const TEMPLATE = 'We could do A or B. A gives us X but costs Y. Because of requirement Z, I’d pick A, and here’s what would change my mind.';

const sentenceEnds = (s: string) => (s.match(/[.!?](?=\s|$)/g) ?? []).length;
const lastChar = (s: string) => {
  const c = s.trim().slice(-1);
  return /[.,!?]/.test(c) ? c : '';
};
const run = (state: DeckState, ...actions: DeckAction[]) => actions.reduce(deckReducer, state);

describe('template', () => {
  it('joins into the sentence the lessons teach', () => {
    expect(fullSentence()).toBe(TEMPLATE);
  });

  it('has four parts, in the order they are said', () => {
    expect(PARTS.map((p) => p.id)).toEqual(['options', 'tradeoff', 'because', 'change']);
    expect(CARD_COUNT).toBe(4);
  });
});

describe('Snapgram decisions', () => {
  it('have unique ids', () => {
    expect(new Set(DECISIONS.map((d) => d.id)).size).toBe(DECISIONS.length);
  });

  for (const d of DECISIONS) {
    describe(d.short, () => {
      it('fills every part, ending each with the same punctuation as the template', () => {
        for (const p of PARTS) {
          const said = d.said[p.id];
          expect(said.trim().length).toBeGreaterThan(0);
          expect(lastChar(said)).toBe(lastChar(p.template));
        }
      });

      it('keeps the shape of each part', () => {
        expect(d.said.options.startsWith('We could ')).toBe(true);
        expect(d.said.options).toContain(', or ');
        expect(d.said.tradeoff).toContain(' gives us ');
        expect(d.said.tradeoff).toContain('but costs ');
        expect(d.said.because.startsWith('Because ')).toBe(true);
        expect(d.said.because).toContain('I’d ');
        expect(d.said.change.startsWith('and ')).toBe(true);
      });

      it('reads as three sentences, like the template', () => {
        expect(sentenceEnds(TEMPLATE)).toBe(3);
        expect(sentenceEnds(fullSentence(d))).toBe(3);
      });
    });
  }
});

describe('deck', () => {
  const start = initialDeck();

  it('starts on the first card of the first decision, showing the template', () => {
    expect(start).toEqual({ decision: DECISIONS[0]!.id, index: 0, flipped: [false, false, false, false] });
  });

  it('reads the decision and the first card from props, ignoring bad values', () => {
    expect(initialDeck({ decision: 'home-feed', card: 2 })).toMatchObject({ decision: 'home-feed', index: 2 });
    expect(initialDeck({ decision: 'nope', card: 99 })).toMatchObject({ decision: DECISIONS[0]!.id, index: CARD_COUNT - 1 });
    expect(initialDeck({ card: -3 }).index).toBe(0);
    expect(initialDeck({ card: 'two' }).index).toBe(0);
  });

  it('flips only the card in view, and flips it back', () => {
    const s = run(start, { type: 'next' }, { type: 'flip' });
    expect(s.flipped).toEqual([false, true, false, false]);
    expect(run(s, { type: 'flip' }).flipped).toEqual([false, false, false, false]);
  });

  it('stops at both ends instead of wrapping', () => {
    expect(run(start, { type: 'prev' }).index).toBe(0);
    expect(run(start, { type: 'last' }, { type: 'next' }).index).toBe(CARD_COUNT - 1);
    expect(run(start, { type: 'last' }, { type: 'first' }).index).toBe(0);
    expect(run(start, { type: 'go', index: 7 }).index).toBe(CARD_COUNT - 1);
    expect(run(start, { type: 'go', index: -1 }).index).toBe(0);
  });

  it('keeps flipped cards flipped while moving between cards', () => {
    const s = run(start, { type: 'flip' }, { type: 'next' }, { type: 'next' }, { type: 'flip' }, { type: 'prev' });
    expect(s.index).toBe(1);
    expect(s.flipped).toEqual([true, false, true, false]);
  });

  it('starts over when another decision is chosen, and ignores choosing the same one', () => {
    const s = run(start, { type: 'next' }, { type: 'flip' });
    expect(run(s, { type: 'choose', decision: 'usernames' })).toEqual({ decision: 'usernames', index: 0, flipped: [false, false, false, false] });
    expect(run(s, { type: 'choose', decision: s.decision })).toBe(s);
  });

  it('flips every card at once, and resets to the first card showing the template', () => {
    const all = run(start, { type: 'next' }, { type: 'flipAll' });
    expect(all.flipped.every(Boolean)).toBe(true);
    expect(all.index).toBe(1);
    expect(run(all, { type: 'reset' })).toEqual({ ...start, decision: all.decision });
  });
});

describe('sentence', () => {
  const feed = getDecision('home-feed');

  it('shows the template for unflipped cards and Snapgram’s words for flipped ones', () => {
    const pieces = sentencePieces(feed, [true, false, false, true]);
    expect(pieces.map((p) => p.filled)).toEqual([true, false, false, true]);
    expect(pieces[0]!.text).toBe(feed.said.options);
    expect(pieces[1]!.text).toBe(PARTS[1]!.template);
    expect(pieces[3]!.text).toBe(feed.said.change);
  });

  it('is the template with nothing flipped, and the full example with everything flipped', () => {
    const join = (flipped: boolean[]) =>
      sentencePieces(feed, flipped)
        .map((p) => p.text)
        .join(' ');
    expect(join([false, false, false, false])).toBe(TEMPLATE);
    expect(join([true, true, true, true])).toBe(fullSentence(feed));
  });

  it('says the like-count decision the way lesson 2.7 frames it', () => {
    const likes = fullSentence(getDecision('like-counts'));
    expect(likes).toContain('Caching gives us fast, cheap reads');
    expect(likes).toContain('I’d switch to batching.');
  });
});

describe('keys and status', () => {
  it('moves with the arrow, Home and End keys and ignores the rest', () => {
    expect(keyAction('ArrowRight')).toEqual({ type: 'next' });
    expect(keyAction('ArrowLeft')).toEqual({ type: 'prev' });
    expect(keyAction('Home')).toEqual({ type: 'first' });
    expect(keyAction('End')).toEqual({ type: 'last' });
    expect(keyAction('Enter')).toBeNull();
    expect(keyAction('a')).toBeNull();
  });

  it('describes the card in view for screen readers', () => {
    expect(cardStatus(initialDeck())).toBe('Card 1 of 4, the options, showing the template.');
    const s = run(initialDeck(), { type: 'last' }, { type: 'flip' });
    expect(cardStatus(s)).toBe('Card 4 of 4, what would change my mind, showing Snapgram’s version.');
  });
});
