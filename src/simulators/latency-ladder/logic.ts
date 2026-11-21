/**
 * Latency ladder: common operations placed on a time scale, logarithmic by default.
 *
 * Values are the widely shared "latency numbers every programmer should know", attributed to
 * Jeff Dean and Peter Norvig, with figures from about 2012. They are ballparks: real hardware
 * varies, and newer SSDs and memory are faster on some rows. The gaps between rows are the point.
 *
 * Human scale stretches time by a billion, so 1 ns lasts 1 second.
 */

export type OperationId =
  | 'l1'
  | 'branch'
  | 'l2'
  | 'memory'
  | 'compress'
  | 'send-1kb'
  | 'ssd-random'
  | 'mem-1mb'
  | 'dc-rtt'
  | 'ssd-1mb'
  | 'disk-seek'
  | 'disk-1mb'
  | 'continent-rtt';

export type Family = 'processor' | 'memory' | 'storage' | 'network';

export type Operation = {
  id: OperationId;
  label: string;
  /** Lower-case noun phrase for comparison sentences, such as "a disk seek". */
  phrase: string;
  /** Ballpark latency in nanoseconds. */
  ns: number;
  family: Family;
  /** One or two plain-English sentences on what happens. */
  detail: string;
};

/** Sorted from fastest to slowest. */
export const OPERATIONS: readonly Operation[] = [
  {
    id: 'l1',
    label: 'L1 cache reference',
    phrase: 'an L1 cache reference',
    ns: 0.5,
    family: 'processor',
    detail: 'The processor reads from the tiny cache inside its own core, which holds what the program touched a moment ago.',
  },
  {
    id: 'branch',
    label: 'Branch mispredict',
    phrase: 'a branch mispredict',
    ns: 5,
    family: 'processor',
    detail: 'The processor guessed which way an if-statement would go, guessed wrong, and throws away the work it started.',
  },
  {
    id: 'l2',
    label: 'L2 cache reference',
    phrase: 'an L2 cache reference',
    ns: 7,
    family: 'processor',
    detail: 'A bigger, slightly slower cache next to the core, checked when the L1 cache misses.',
  },
  {
    id: 'memory',
    label: 'Main memory reference',
    phrase: 'a main memory reference',
    ns: 100,
    family: 'memory',
    detail: 'A read from main memory (RAM), a few centimeters from the processor. An in-process cache answers at about this speed.',
  },
  {
    id: 'compress',
    label: 'Compress 1 KB',
    phrase: 'compressing 1 KB',
    ns: 3_000,
    family: 'processor',
    detail: 'A fast compressor, such as Google’s Snappy, squeezes a kilobyte. Cheap next to sending those bytes far away.',
  },
  {
    id: 'send-1kb',
    label: 'Send 1 KB over a 1 Gbps network',
    phrase: 'sending 1 KB over a 1 Gbps network',
    ns: 10_000,
    family: 'network',
    detail: 'Pushing about 8,000 bits onto a link that carries a billion bits a second.',
  },
  {
    id: 'ssd-random',
    label: 'Random 4 KB read from an SSD',
    phrase: 'a random 4 KB read from an SSD',
    ns: 150_000,
    family: 'storage',
    detail: 'Reading one small block from anywhere on a solid-state drive. Newer drives are often several times faster.',
  },
  {
    id: 'mem-1mb',
    label: 'Read 1 MB sequentially from memory',
    phrase: 'reading 1 MB sequentially from memory',
    ns: 250_000,
    family: 'memory',
    detail: 'Streaming a megabyte from memory in order. Newer machines do it several times faster.',
  },
  {
    id: 'dc-rtt',
    label: 'Round trip within one data center',
    phrase: 'a round trip within one data center',
    ns: 500_000,
    family: 'network',
    detail: 'A message to another machine in the same building and back, such as a request to a cache server like Redis.',
  },
  {
    id: 'ssd-1mb',
    label: 'Read 1 MB sequentially from an SSD',
    phrase: 'reading 1 MB sequentially from an SSD',
    ns: 1_000_000,
    family: 'storage',
    detail: 'Streaming a megabyte from a solid-state drive, about four times slower than from memory.',
  },
  {
    id: 'disk-seek',
    label: 'Disk seek',
    phrase: 'a disk seek',
    ns: 10_000_000,
    family: 'storage',
    detail: 'A spinning hard disk moves its arm to the right track and waits for the platter to come round. Every random read pays this.',
  },
  {
    id: 'disk-1mb',
    label: 'Read 1 MB sequentially from disk',
    phrase: 'reading 1 MB sequentially from disk',
    ns: 20_000_000,
    family: 'storage',
    detail: 'Streaming a megabyte from a hard disk once the arm is in place: about 80 times slower than from memory.',
  },
  {
    id: 'continent-rtt',
    label: 'Round trip across continents',
    phrase: 'a round trip across continents',
    ns: 150_000_000,
    family: 'network',
    detail: 'A packet from California to the Netherlands and back. Light in fiber needs most of that time, so no faster server removes it.',
  },
];

const byId = new Map(OPERATIONS.map((o) => [o.id, o]));

export function getOperation(id: OperationId): Operation {
  const op = byId.get(id);
  if (!op) throw new Error(`Unknown operation "${id}"`);
  return op;
}

export function isOperationId(id: string): id is OperationId {
  return byId.has(id as OperationId);
}

/* ------------------------------------------------------------------ */
/* Scales and zoom                                                     */
/* ------------------------------------------------------------------ */

export type ZoomId = 'all' | 'ns' | 'us' | 'ms';
export type ScaleMode = 'log' | 'linear';

export const ZOOMS: Record<ZoomId, { label: string; humanLabel: string; minNs: number; maxNs: number }> = {
  all: { label: 'Everything', humanLabel: 'A second to decades', minNs: 0.1, maxNs: 1e9 },
  ns: { label: 'Nanoseconds', humanLabel: 'Seconds to minutes', minNs: 0.1, maxNs: 1e3 },
  us: { label: 'Microseconds', humanLabel: 'Minutes to days', minNs: 1e3, maxNs: 1e6 },
  ms: { label: 'Milliseconds', humanLabel: 'Days to decades', minNs: 1e6, maxNs: 1e9 },
};

export const ZOOM_ORDER: readonly ZoomId[] = ['all', 'ns', 'us', 'ms'];

export type Placement = {
  /** Position along the axis, 0 (left) to 1 (right). */
  at: number;
  /** Set when the value lies outside the zoomed range; `at` is then pinned to the edge. */
  clipped: 'below' | 'above' | null;
};

/**
 * Where a latency sits on the axis. The log scale spans the zoom window's decades; the linear
 * scale always starts at zero and ends at the window's maximum.
 */
export function place(ns: number, zoom: ZoomId, scale: ScaleMode): Placement {
  const { minNs, maxNs } = ZOOMS[zoom];
  if (ns > maxNs) return { at: 1, clipped: 'above' };
  if (scale === 'linear') return { at: ns / maxNs, clipped: null };
  if (ns < minNs) return { at: 0, clipped: 'below' };
  const lo = Math.log10(minNs);
  const hi = Math.log10(maxNs);
  return { at: (Math.log10(ns) - lo) / (hi - lo), clipped: null };
}

export type Tick = { at: number; label: string | null };

/** Axis ticks: every decade on the log scale (labeled at each unit when zoomed out), quarters on the linear one. */
export function ticks(zoom: ZoomId, scale: ScaleMode, human: boolean): Tick[] {
  const { minNs, maxNs } = ZOOMS[zoom];
  const fmt = (ns: number) => (human ? formatHumanShort(ns) : formatDuration(ns));
  if (scale === 'linear') return [0, 0.25, 0.5, 0.75, 1].map((f) => ({ at: f, label: f === 0 ? '0' : fmt(maxNs * f) }));
  const lo = Math.round(Math.log10(minNs));
  const hi = Math.round(Math.log10(maxNs));
  const span = hi - lo;
  const out: Tick[] = [];
  for (let k = lo; k <= hi; k++) {
    const labeled = span <= 4 || k % 3 === 0;
    out.push({ at: (k - lo) / span, label: labeled ? fmt(10 ** k) : null });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function short(v: number): string {
  if (v >= 100) return Math.round(v).toLocaleString('en-US');
  if (v >= 10) return String(Math.round(v));
  return String(Number(v.toFixed(1)));
}

/** 0.5 -> "0.5 ns", 150000 -> "150 µs", 1.5e8 -> "150 ms". */
export function formatDuration(ns: number): string {
  if (ns >= 1e9) return `${short(ns / 1e9)} s`;
  if (ns >= 1e6) return `${short(ns / 1e6)} ms`;
  if (ns >= 1e3) return `${short(ns / 1e3)} µs`;
  return `${short(ns)} ns`;
}

const MINUTE = 60;
const HOUR = 3_600;
const DAY = 86_400;
const MONTH = 30.44 * DAY;
const YEAR = 365.25 * DAY;

type HumanUnit = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year';

function humanUnit(seconds: number): [number, HumanUnit] {
  if (seconds < MINUTE) return [seconds, 'second'];
  if (seconds < HOUR) return [seconds / MINUTE, 'minute'];
  if (seconds < DAY) return [seconds / HOUR, 'hour'];
  if (seconds < 30 * DAY) return [seconds / DAY, 'day'];
  if (seconds < YEAR) return [seconds / MONTH, 'month'];
  return [seconds / YEAR, 'year'];
}

function humanValue(v: number): number {
  return v < 10 ? Number(v.toFixed(1)) : Math.round(v);
}

/** Human scale: 1 ns becomes 1 second. 100 ns -> "1.7 minutes", 150 ms -> "4.8 years". */
export function humanDuration(ns: number): string {
  const [v, unit] = humanUnit(ns);
  const shown = humanValue(v);
  return `${shown} ${unit}${shown === 1 ? '' : 's'}`;
}

const SHORT_UNIT: Record<HumanUnit, [string, string]> = {
  second: ['s', 's'],
  minute: ['min', 'min'],
  hour: ['h', 'h'],
  day: ['day', 'days'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};

/** Compact human-scale label for axis ticks: "17 min", "12 days". */
export function formatHumanShort(ns: number): string {
  const [v, unit] = humanUnit(ns);
  const shown = humanValue(v);
  const [one, many] = SHORT_UNIT[unit];
  return `${shown} ${shown === 1 ? one : many}`;
}

/** 20 -> "20 times", 1500 -> "1,500 times", 1.5e6 -> "1.5 million times". */
export function formatRatio(r: number): string {
  if (r < 10) return `${Number(r.toFixed(1))} times`;
  if (r < 1_000) return `${Math.round(r)} times`;
  if (r < 1e6) return `${Number(r.toPrecision(2)).toLocaleString('en-US')} times`;
  if (r < 1e9) return `${Number((r / 1e6).toPrecision(2))} million times`;
  return `${Number((r / 1e9).toPrecision(2))} billion times`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type Comparison = { slow: Operation; fast: Operation; ratio: number; sentence: string; humanSentence: string };

/** Compare two operations, slower first: "A disk seek takes about 20 times as long as …". */
export function compare(a: OperationId, b: OperationId): Comparison {
  const x = getOperation(a);
  const y = getOperation(b);
  const [slow, fast] = x.ns >= y.ns ? [x, y] : [y, x];
  const ratio = slow.ns / fast.ns;
  return {
    slow,
    fast,
    ratio,
    sentence: `${capitalize(slow.phrase)} takes about ${formatRatio(ratio)} as long as ${fast.phrase}.`,
    humanSentence: `On the human scale, that is ${humanDuration(slow.ns)} against ${humanDuration(fast.ns)}.`,
  };
}

/* ------------------------------------------------------------------ */
/* State and challenges                                                */
/* ------------------------------------------------------------------ */

export type LadderState = {
  zoom: ZoomId;
  scale: ScaleMode;
  human: boolean;
  /** Up to two selected operations, oldest first. */
  selected: OperationId[];
};

export const DEFAULT_STATE: LadderState = { zoom: 'all', scale: 'log', human: false, selected: ['memory', 'continent-rtt'] };

export const MAX_SELECTED = 2;

/** Select or unselect a row. Selecting a third replaces the oldest selection. */
export function toggleSelection(selected: OperationId[], id: OperationId): OperationId[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  const next = [...selected, id];
  return next.length > MAX_SELECTED ? next.slice(next.length - MAX_SELECTED) : next;
}

/** Starting state from a lesson preset: human (boolean), zoom, scale, compare ("memory,disk-seek"). */
export function stateFromPreset(preset?: Record<string, string | number | boolean>): LadderState {
  if (!preset) return { ...DEFAULT_STATE, selected: [...DEFAULT_STATE.selected] };
  const zoom = typeof preset.zoom === 'string' && preset.zoom in ZOOMS ? (preset.zoom as ZoomId) : DEFAULT_STATE.zoom;
  const scale = preset.scale === 'linear' ? 'linear' : 'log';
  const selected =
    typeof preset.compare === 'string'
      ? preset.compare
          .split(',')
          .map((s) => s.trim())
          .filter(isOperationId)
          .slice(0, MAX_SELECTED)
      : [...DEFAULT_STATE.selected];
  return { zoom, scale, human: preset.human === true, selected };
}

export type ChallengeId = 'human' | 'network-vs-disk' | 'linear' | 'cache-levels';

/** Whether the learner's settings show each challenge was attempted. */
export function challengeStatus(s: LadderState): Record<ChallengeId, boolean> {
  const has = (id: OperationId) => s.selected.includes(id);
  return {
    human: s.human,
    'network-vs-disk': has('dc-rtt') && has('disk-seek'),
    linear: s.scale === 'linear' && s.zoom === 'all',
    'cache-levels': s.zoom === 'ns' && has('l1') && has('memory'),
  };
}
