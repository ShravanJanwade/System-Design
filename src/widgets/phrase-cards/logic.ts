/**
 * Phrase cards: the trade-off template from lesson 8.7 as a small deck.
 *
 * Each card is one part of the sentence "We could do A or B. A gives us X but costs Y. Because of
 * requirement Z, I'd pick A, and here's what would change my mind." Flipping a card shows how that
 * part was said for one of Snapgram's own decisions, and the whole sentence below fills in as cards
 * flip. Everything here is pure and deterministic; the view only renders this state.
 */
import type { SimulatorPreset } from '@/content/types';

export type PartId = 'options' | 'tradeoff' | 'because' | 'change';

export type TemplatePart = {
  id: PartId;
  /** Short name of the part, for the card header. */
  name: string;
  /** The part as written in the template. Joined with spaces, the parts form the whole template. */
  template: string;
  /** What this part tells the interviewer, and how to say it well. */
  hint: string;
};

export const PARTS: readonly TemplatePart[] = [
  {
    id: 'options',
    name: 'The options',
    template: 'We could do A or B.',
    hint: 'Show that you see more than one way. Two options are usually enough, and the one you reject deserves a fair hearing.',
  },
  {
    id: 'tradeoff',
    name: 'What it gives and costs',
    template: 'A gives us X but costs Y.',
    hint: 'Say what your pick buys and what it gives up, in terms the requirements care about. Name the cost before anyone has to ask.',
  },
  {
    id: 'because',
    name: 'The deciding requirement',
    template: 'Because of requirement Z, I’d pick A,',
    hint: 'Tie the choice to something you agreed in the first minutes, with a number if you have one. Taste is not a requirement.',
  },
  {
    id: 'change',
    name: 'What would change my mind',
    template: 'and here’s what would change my mind.',
    hint: 'Name the tipping point: the number or requirement that would flip your choice. A follow-up question then confirms your judgment.',
  },
];

export type DecisionId = 'like-counts' | 'home-feed' | 'usernames';

export type Decision = {
  id: DecisionId;
  /** Label for the decision picker. */
  short: string;
  /** Where the decision comes from in the course, shown on the back of each card. */
  source: string;
  /** The situation the decision answers, in one sentence. */
  situation: string;
  /** How each part was said for this decision. Each ends with the same punctuation as its template part. */
  said: Record<PartId, string>;
};

export const DECISIONS: readonly Decision[] = [
  {
    id: 'like-counts',
    short: 'Like counts',
    source: 'Lesson 2.7: how fresh like counts must be',
    situation: 'A celebrity post sends thousands of likes a second to one row in the database, and photo pages slow down for everyone.',
    said: {
      options:
        'We could cache each photo’s like count and refresh it every few seconds, or count likes in memory and write them in batches.',
      tradeoff: 'Caching gives us fast, cheap reads with little new code, but costs counts that can be a few seconds stale.',
      because: 'Because like counts may lag a few seconds and the team is small, I’d cache,',
      change: 'and if likes ever had to feel instant at celebrity scale, I’d switch to batching.',
    },
  },
  {
    id: 'home-feed',
    short: 'Home feed',
    source: 'Lesson 6.6: fan-out on write vs. on read',
    situation: 'Feeds are read far more often than people post, and one celebrity has 30 million followers.',
    said: {
      options: 'We could copy each new post into every follower’s feed when it’s posted, or build each feed when someone opens the app.',
      tradeoff: 'Copying gives us feeds that open with one quick read, but costs millions of writes when a big account posts.',
      because: 'Because feeds are read far more often than people post, I’d copy on post,',
      change: 'and for accounts with millions of followers, I’d pull their posts at read time instead.',
    },
  },
  {
    id: 'usernames',
    short: 'Usernames',
    source: 'Lesson 4.5: two regions, one link between them',
    situation: 'Oregon and Singapore both accept writes, and the link across the Pacific can fail for minutes at a time.',
    said: {
      options: 'We could let each region accept new usernames on its own, or confirm every new name with one home region.',
      tradeoff:
        'Confirming with one region gives us names that are always unique, but costs slower signups, and none while the link between regions is down.',
      because: 'Because two people must never share a username, I’d confirm with one region,',
      change: 'and if signups during an outage mattered more than the odd duplicate, I’d accept locally and rename duplicates later.',
    },
  },
];

export const CARD_COUNT = PARTS.length;

/* ------------------------------------------------------------------ */
/* Deck state                                                          */
/* ------------------------------------------------------------------ */

export type DeckState = {
  decision: DecisionId;
  /** Index of the card in view, 0 to CARD_COUNT - 1. */
  index: number;
  /** Which cards show Snapgram's version, by card index. */
  flipped: readonly boolean[];
};

export type DeckAction =
  | { type: 'flip' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'go'; index: number }
  | { type: 'choose'; decision: DecisionId }
  | { type: 'flipAll' }
  | { type: 'reset' };

const NONE_FLIPPED: readonly boolean[] = PARTS.map(() => false);
const ALL_FLIPPED: readonly boolean[] = PARTS.map(() => true);

function clampIndex(i: number): number {
  if (!Number.isFinite(i)) return 0;
  return Math.max(0, Math.min(CARD_COUNT - 1, Math.round(i)));
}

export function isDecisionId(value: unknown): value is DecisionId {
  return typeof value === 'string' && DECISIONS.some((d) => d.id === value);
}

export function getDecision(id: DecisionId): Decision {
  return DECISIONS.find((d) => d.id === id) ?? DECISIONS[0]!;
}

/** Starting state from the lesson's props: `decision` (a decision id) and `card` (index of the first card shown). */
export function initialDeck(props?: SimulatorPreset): DeckState {
  const asked = props?.decision;
  const card = props?.card;
  const decision = isDecisionId(asked) ? asked : DECISIONS[0]!.id;
  const index = typeof card === 'number' ? clampIndex(card) : 0;
  return { decision, index, flipped: NONE_FLIPPED };
}

export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case 'flip':
      return { ...state, flipped: state.flipped.map((f, i) => (i === state.index ? !f : f)) };
    case 'next':
      return { ...state, index: clampIndex(state.index + 1) };
    case 'prev':
      return { ...state, index: clampIndex(state.index - 1) };
    case 'first':
      return { ...state, index: 0 };
    case 'last':
      return { ...state, index: CARD_COUNT - 1 };
    case 'go':
      return { ...state, index: clampIndex(action.index) };
    case 'choose':
      // A new decision starts the deck over, with every card showing the template.
      return action.decision === state.decision ? state : { decision: action.decision, index: 0, flipped: NONE_FLIPPED };
    case 'flipAll':
      return { ...state, flipped: ALL_FLIPPED };
    case 'reset':
      return { ...state, index: 0, flipped: NONE_FLIPPED };
  }
}

/** Keys the deck handles itself. Enter and Space flip the card through its native button. */
export function keyAction(key: string): DeckAction | null {
  switch (key) {
    case 'ArrowRight':
      return { type: 'next' };
    case 'ArrowLeft':
      return { type: 'prev' };
    case 'Home':
      return { type: 'first' };
    case 'End':
      return { type: 'last' };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* The sentence                                                        */
/* ------------------------------------------------------------------ */

export type SentencePiece = { part: PartId; text: string; filled: boolean };

/** The whole sentence, one piece per part: Snapgram's words for flipped cards, the template for the rest. */
export function sentencePieces(decision: Decision, flipped: readonly boolean[]): SentencePiece[] {
  return PARTS.map((p, i) => {
    const filled = flipped[i] === true;
    return { part: p.id, text: filled ? decision.said[p.id] : p.template, filled };
  });
}

/** The template with every part filled in for a decision, or the bare template without one. */
export function fullSentence(decision?: Decision): string {
  return PARTS.map((p) => (decision ? decision.said[p.id] : p.template)).join(' ');
}

/** One line for screen readers after every move or flip. */
export function cardStatus(state: DeckState): string {
  const part = PARTS[clampIndex(state.index)]!;
  const side = state.flipped[state.index] ? 'showing Snapgram’s version' : 'showing the template';
  return `Card ${clampIndex(state.index) + 1} of ${CARD_COUNT}, ${part.name.toLowerCase()}, ${side}.`;
}
