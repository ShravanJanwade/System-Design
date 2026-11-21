/**
 * Timed estimation drills (lesson 8.3). Each drill states its assumptions, runs a countdown the
 * learner can pause or switch off, accepts an answer within 2× of the reference (the same rule as
 * numeric quiz questions), then shows the worked solution line by line. A running tally counts
 * answers in range and answers in time. Pure data and functions; the view only draws.
 */

export type Drill = {
  id: string;
  /** Short name, such as "Views per second". */
  title: string;
  prompt: string;
  /** The assumptions, stated the way you would say them out loud. */
  givens: readonly string[];
  answer: number;
  unit: string;
  /** Countdown length in seconds. */
  seconds: number;
  /** The worked solution, one line per step. */
  solution: readonly string[];
  /** The design decision the number informs. */
  decision: string;
};

/** Answers within this factor of the reference count, as in numeric quiz questions. */
export const TOLERANCE = 2;

export const DRILLS: readonly Drill[] = [
  {
    id: 'views-per-second',
    title: 'Views per second',
    prompt: 'About how many photo views per second does Snapgram serve on average?',
    givens: ['10 million daily users', 'Each views about 50 photos a day'],
    answer: 5000,
    unit: 'views per second',
    seconds: 60,
    solution: [
      'Views a day: 10⁷ users × 50 = 5 × 10⁸.',
      'A day is about 10⁵ seconds (86,400, rounded up).',
      '5 × 10⁸ ÷ 10⁵ = 5 × 10³, about 5,000 views a second. The exact figure, about 5,800, is well inside 2×.',
    ],
    decision: 'At three times that in the evening peak, about 15,000 reads a second, one database cannot keep up alone: the read path needs a cache.',
  },
  {
    id: 'storage-per-year',
    title: 'Storage per year',
    prompt: 'About how many terabytes of new photos does Snapgram store per year?',
    givens: ['1 million photos uploaded a day', 'About 2 MB per photo'],
    answer: 730,
    unit: 'TB per year',
    seconds: 60,
    solution: [
      'Per day: 10⁶ photos × 2 MB = 2 × 10⁶ MB, which is 2 TB.',
      'Per year: 2 TB × 365 = 730 TB.',
      'Round it: about 700 TB, close to a petabyte, every year.',
    ],
    decision: 'Hundreds of terabytes a year belong in object storage; only the photo details go in a database.',
  },
  {
    id: 'bandwidth',
    title: 'Outgoing bandwidth',
    prompt: 'About how many gigabytes per second leave Snapgram’s servers for feed images?',
    givens: ['5,000 photo views a second', 'The feed shows a 200 KB version of each photo'],
    answer: 1,
    unit: 'GB per second',
    seconds: 60,
    solution: [
      '5,000 × 200 KB = 1,000,000 KB per second.',
      '1,000,000 KB = 1,000 MB = 1 GB.',
      'About 1 GB a second on average, or 8 gigabits a second, and about 3 GB at the evening peak.',
    ],
    decision: 'That much traffic from one data center is slow for far-away users and costly: serve images from a content delivery network.',
  },
  {
    id: 'cache-size',
    title: 'Cache size',
    prompt: 'About how many gigabytes of memory would a cache need to hold the most popular 20% of photo records?',
    givens: ['500 million photo records', 'About 1 KB each: owner, caption, counts'],
    answer: 100,
    unit: 'GB',
    seconds: 60,
    solution: [
      '20% of 5 × 10⁸ records = 10⁸ records.',
      '10⁸ × 1 KB = 10⁸ KB.',
      '10⁸ KB = 10⁵ MB = 100 GB.',
    ],
    decision: 'About 100 GB fits in the memory of a few cache servers, so the hot records can live in a cache.',
  },
  {
    id: 'links-five-years',
    title: 'Short links over five years',
    prompt: 'A link shortener keeps every link it creates. About how many terabytes does it store after five years?',
    givens: ['100 million new links a month', 'About 500 bytes per link record'],
    answer: 3,
    unit: 'TB',
    seconds: 90,
    solution: [
      'Links in five years: 10⁸ a month × 12 × 5 = 6 × 10⁹.',
      '6 × 10⁹ × 500 bytes = 3 × 10¹² bytes.',
      '3 × 10¹² bytes = 3 TB.',
    ],
    decision: 'A few terabytes fit on one database server’s disks, so storage is not the hard part here: the read rate is.',
  },
];

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

/** Accepts "1200", "1,200", "1.2k", "3m", "2b", "2e6", with or without spaces. The same rule as the quiz. */
export function parseNumber(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '');
  const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)(k|m|b)?$/.exec(s);
  if (!m) return null;
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : m[2] === 'b' ? 1e9 : 1;
  const v = Number(m[1]) * mult;
  return Number.isFinite(v) ? v : null;
}

/** True when value lies between answer ÷ tolerance and answer × tolerance, inclusive. */
export function withinTolerance(value: number, answer: number, tolerance = TOLERANCE): boolean {
  if (answer === 0) return Math.abs(value) < 1e-9;
  const lo = Math.min(answer / tolerance, answer * tolerance);
  const hi = Math.max(answer / tolerance, answer * tolerance);
  return value >= lo && value <= hi;
}

export function acceptedRange(answer: number, tolerance = TOLERANCE): { low: number; high: number } {
  return { low: answer / tolerance, high: answer * tolerance };
}

export type Grade = {
  value: number;
  correct: boolean;
  /** How many times off the answer is, always at least 1. */
  factor: number;
  direction: 'close' | 'high' | 'low';
};

export function grade(drill: Drill, value: number): Grade {
  const correct = withinTolerance(value, drill.answer);
  const factor = value > 0 ? Math.max(value / drill.answer, drill.answer / value) : Infinity;
  const direction = correct ? 'close' : value > drill.answer ? 'high' : 'low';
  return { value, correct, factor, direction };
}

/** "about 3 times too high", for answers outside the range. */
export function offBy(g: Grade): string {
  if (g.direction === 'close') return 'within 2× of the reference';
  if (!Number.isFinite(g.factor)) return 'not a positive number';
  const times = g.factor >= 10 ? `${formatNumber(Math.round(g.factor))}` : g.factor.toFixed(1).replace(/\.0$/, '');
  return `about ${times} times too ${g.direction}`;
}

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** 5000 -> "5,000"; 0.5 -> "0.5". */
export function formatNumber(n: number): string {
  return grouped.format(n);
}

/* ------------------------------------------------------------------ */
/* Timer                                                               */
/* ------------------------------------------------------------------ */

export type Timer = {
  limit: number;
  remaining: number;
  running: boolean;
  /** False when the learner has switched the timer off. */
  enabled: boolean;
};

export function createTimer(limit: number, enabled = true): Timer {
  return { limit, remaining: limit, running: enabled && limit > 0, enabled };
}

/** Counts down while running; stops at zero. Paused or switched-off timers do not move. */
export function tick(t: Timer, seconds: number): Timer {
  if (!t.enabled || !t.running || seconds <= 0) return t;
  const remaining = Math.max(0, t.remaining - seconds);
  return { ...t, remaining, running: remaining > 0 };
}

export function pause(t: Timer): Timer {
  return t.running ? { ...t, running: false } : t;
}

export function resume(t: Timer): Timer {
  return t.enabled && t.remaining > 0 && !t.running ? { ...t, running: true } : t;
}

/** Switching the timer off stops it; switching it back on carries on from where it was. */
export function setEnabled(t: Timer, enabled: boolean): Timer {
  return enabled ? { ...t, enabled: true, running: t.remaining > 0 } : { ...t, enabled: false, running: false };
}

export function isExpired(t: Timer): boolean {
  return t.enabled && t.remaining <= 0;
}

/** 65 -> "1:05". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What a screen reader should hear about the timer right now: only at ten seconds left and at zero. */
export function timerAnnouncement(t: Timer): string {
  if (!t.enabled) return '';
  if (t.remaining <= 0) return 'Time is up. Round harder and answer anyway.';
  if (t.remaining === 10) return '10 seconds left.';
  return '';
}

/* ------------------------------------------------------------------ */
/* Results and tally                                                   */
/* ------------------------------------------------------------------ */

export type DrillResult = {
  drillId: string;
  /** 'revealed' when the learner asked for the solution without answering. */
  status: 'correct' | 'wrong' | 'revealed';
  /** null when the timer was off, so time did not count. */
  inTime: boolean | null;
  value: number | null;
};

export function recordResult(drill: Drill, value: number | null, timer: Timer): DrillResult {
  const status = value === null ? 'revealed' : withinTolerance(value, drill.answer) ? 'correct' : 'wrong';
  const inTime = timer.enabled ? timer.remaining > 0 : null;
  return { drillId: drill.id, status, inTime, value };
}

export type Tally = {
  done: number;
  correct: number;
  /** Correct answers given before the countdown ran out. */
  correctInTime: number;
  /** Drills answered with the timer on. */
  timed: number;
  revealed: number;
};

export function tally(results: readonly DrillResult[]): Tally {
  return {
    done: results.length,
    correct: results.filter((r) => r.status === 'correct').length,
    correctInTime: results.filter((r) => r.status === 'correct' && r.inTime === true).length,
    timed: results.filter((r) => r.inTime !== null).length,
    revealed: results.filter((r) => r.status === 'revealed').length,
  };
}

/** One line for the end of the series. */
export function finalMessage(t: Tally, total: number): string {
  if (t.correct === total) return 'Every estimate within 2×. In the room, the next step is saying what each number means for the design.';
  if (t.correct >= Math.ceil(total / 2)) return 'Most estimates landed within 2×. Check the misses for a lost factor of 1,000 or a skipped unit.';
  return 'Several estimates missed. Write the units on every line and round to powers of ten before multiplying.';
}

/** The lesson may start with the timer off: `props.timer === false`. */
export function timerOnFromProps(value: unknown): boolean {
  return !(value === false || value === 'false');
}
