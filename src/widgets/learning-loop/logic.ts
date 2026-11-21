/**
 * The learning loop (lesson 0.2): four stations on a closed loop, learn, try, recall and apply,
 * then back to learn. Content and geometry live here so the view only draws.
 */

export type StationId = 'learn' | 'try' | 'recall' | 'apply';

export type Station = {
  id: StationId;
  name: string;
  /** Shown on the card under the name. */
  short: string;
  /** Heading of the detail panel. */
  headline: string;
  /** The parts of Blueprint that serve this step. */
  serves: string[];
  /** Why this step matters for learning. */
  why: string;
  /** One concrete way to use it well. */
  tip: string;
};

/** In loop order. The loop closes from the last station back to the first. */
export const STATIONS: readonly Station[] = [
  {
    id: 'learn',
    name: 'Learn',
    short: 'Lessons',
    headline: 'Learn: build the mental model',
    serves: [
      'Lessons in the Learn section, one idea each',
      'Step-by-step diagrams, an analogy and a Snapgram story in every lesson',
    ],
    why: 'Practice only means something once you have a clear picture of the idea. Lessons build that picture in small pieces, starting from an everyday analogy and a real problem, and name the concept once it makes sense.',
    tip: 'Step through each diagram yourself, and guess the next step before you press Next.',
  },
  {
    id: 'try',
    name: 'Try',
    short: 'Simulators',
    headline: 'Try: watch it behave',
    serves: ['Simulators and widgets in each lesson’s Try it section', 'All seventeen simulators on the Playground'],
    why: 'Changing a setting and watching the system react turns a definition into intuition. Breaking a cache on purpose teaches more than reading that caches can break.',
    tip: 'Do the Try this challenges. Each one is built around a mistake people make in interviews.',
  },
  {
    id: 'recall',
    name: 'Recall',
    short: 'Quizzes and flashcards',
    headline: 'Recall: make it stick',
    serves: ['The quiz at the end of every lesson', 'Flashcards in Practice, which come back at growing intervals'],
    why: 'Pulling an idea out of memory strengthens it far more than rereading it, and spacing the reviews out makes it last for weeks instead of days.',
    tip: 'Answer before you look at the options, and clear the cards that are due each day. A few minutes is enough.',
  },
  {
    id: 'apply',
    name: 'Apply',
    short: 'Problems and mocks',
    headline: 'Apply: use it under pressure',
    serves: ['26 interview problems, each with hints and a full walkthrough', 'Drills, the architecture builder and timed mock interviews in Practice'],
    why: 'Interviews test whether you can use an idea on a problem you have not seen, against a clock. Applying it shows what you have not understood yet, which sends you back to learn.',
    tip: 'Try each problem before opening the walkthrough, then follow the links to the lessons behind anything you missed.',
  },
];

export function nextIndex(i: number, count: number = STATIONS.length): number {
  return (((i + 1) % count) + count) % count;
}

export function prevIndex(i: number, count: number = STATIONS.length): number {
  return (((i - 1) % count) + count) % count;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export type Pt = { x: number; y: number };
export type CardBox = { x: number; y: number; w: number; h: number; cx: number; cy: number };
export type Arrow = Pt & { /** Degrees: 0 points right, 90 down, 180 left, 270 up. */ angle: number };

export type LoopGeometry = {
  width: number;
  height: number;
  /** In loop order: top left, top right, bottom right, bottom left. */
  cards: CardBox[];
  /** Closed path through the card centers; the cards hide the parts inside them. */
  path: string;
  length: number;
  /** One arrowhead in the middle of each gap between neighboring cards, pointing along the loop. */
  arrows: Arrow[];
};

const MAX_CARD_W = 260;

/** Lay the four cards out on a rectangle that fits the panel width, with room for arrows between them. */
export function loopGeometry(width: number): LoopGeometry {
  const narrow = width < 480;
  const pad = narrow ? 16 : 24;
  const gapY = narrow ? 48 : 56;
  const cardH = narrow ? 96 : 100;
  const available = Math.max(0, width - pad * 2);
  const gapX = Math.min(180, Math.max(48, available * 0.18));
  const cardW = Math.max(96, Math.min(MAX_CARD_W, (available - gapX) / 2));
  const left = Math.max(pad, (width - (cardW * 2 + gapX)) / 2);
  const top = pad;
  const box = (x: number, y: number): CardBox => ({ x, y, w: cardW, h: cardH, cx: x + cardW / 2, cy: y + cardH / 2 });
  const xR = left + cardW + gapX;
  const yB = top + cardH + gapY;
  const cards = [box(left, top), box(xR, top), box(xR, yB), box(left, yB)];
  const [a, b, c, d] = cards as [CardBox, CardBox, CardBox, CardBox];
  const path = `M${a.cx} ${a.cy} L${b.cx} ${b.cy} L${c.cx} ${c.cy} L${d.cx} ${d.cy} Z`;
  const dx = b.cx - a.cx;
  const dy = c.cy - b.cy;
  const arrows: Arrow[] = [
    { x: (a.x + a.w + b.x) / 2, y: a.cy, angle: 0 },
    { x: b.cx, y: (b.y + b.h + c.y) / 2, angle: 90 },
    { x: (d.x + d.w + c.x) / 2, y: c.cy, angle: 180 },
    { x: a.cx, y: (a.y + a.h + d.y) / 2, angle: 270 },
  ];
  return { width, height: yB + cardH + pad, cards, path, length: 2 * (dx + dy), arrows };
}

/** A point on the loop. t runs from 0 (the first card's center) to 1 (back again), clockwise. */
export function pointOnLoop(g: LoopGeometry, t: number): Pt {
  const [a, b, c, d] = g.cards as [CardBox, CardBox, CardBox, CardBox];
  const corners: Pt[] = [
    { x: a.cx, y: a.cy },
    { x: b.cx, y: b.cy },
    { x: c.cx, y: c.cy },
    { x: d.cx, y: d.cy },
  ];
  let dist = (((t % 1) + 1) % 1) * g.length;
  for (let i = 0; i < 4; i++) {
    const p = corners[i]!;
    const q = corners[(i + 1) % 4]!;
    const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    if (dist <= len || i === 3) {
      const f = len === 0 ? 0 : Math.min(1, dist / len);
      return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
    }
    dist -= len;
  }
  return corners[0]!;
}

/** The fraction of the loop at which the dot sits on the arrow leaving station i. */
export function arrowFraction(g: LoopGeometry, i: number): number {
  const dx = g.cards[1]!.cx - g.cards[0]!.cx;
  const dy = g.cards[2]!.cy - g.cards[1]!.cy;
  const starts = [0, dx, dx + dy, 2 * dx + dy];
  const halves = [dx / 2, dy / 2, dx / 2, dy / 2];
  const k = ((i % 4) + 4) % 4;
  return (starts[k]! + halves[k]!) / g.length;
}
