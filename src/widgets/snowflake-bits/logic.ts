/**
 * Snowflake-style IDs: 64 bits = 1 unused sign bit, 41 bits of milliseconds since a custom epoch,
 * 10 bits of machine number and 12 bits of sequence. All arithmetic on IDs uses BigInt, because
 * 64-bit values do not fit in a JavaScript number.
 *
 * The generator follows the original design: the same millisecond increments the sequence; when the
 * sequence runs out (4,096 IDs), it waits for the next millisecond; if the clock has moved backwards,
 * it refuses to make IDs until the clock passes the last timestamp it used.
 */

/** Snapgram's custom epoch: 1 January 2025, 00:00:00.000 UTC. */
export const EPOCH_MS = Date.UTC(2025, 0, 1);
/** Where the widget's simulated clock starts. */
export const START_MS = Date.UTC(2026, 2, 14, 9, 26, 53, 589);

export const SIGN_BITS = 1;
export const TIME_BITS = 41;
export const MACHINE_BITS = 10;
export const SEQUENCE_BITS = 12;

export const MAX_ELAPSED_MS = 2 ** TIME_BITS - 1;
export const MAX_MACHINE = 2 ** MACHINE_BITS - 1;
export const MAX_SEQUENCE = 2 ** SEQUENCE_BITS - 1;
/** IDs one machine can make in one millisecond. */
export const IDS_PER_MS = 2 ** SEQUENCE_BITS;
export const MACHINES = 2 ** MACHINE_BITS;
/** The last millisecond the timestamp field can hold. */
export const LAST_MS = EPOCH_MS + MAX_ELAPSED_MS;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
/** How long the timestamp lasts: 2^41 ms, about 69.7 years. */
export const LIFETIME_YEARS = 2 ** TIME_BITS / MS_PER_YEAR;

const SEQUENCE_SHIFT = 0n;
const MACHINE_SHIFT = BigInt(SEQUENCE_BITS);
const TIME_SHIFT = BigInt(SEQUENCE_BITS + MACHINE_BITS);
const ID_LIMIT = 1n << 63n;

export type Parts = { timestampMs: number; machine: number; sequence: number };

export type SegmentKey = 'sign' | 'time' | 'machine' | 'sequence';
export type Segment = { key: SegmentKey; label: string; bits: number; /** Index of the first bit, counting from the left. */ start: number };

export const SEGMENTS: readonly Segment[] = [
  { key: 'sign', label: 'Sign', bits: SIGN_BITS, start: 0 },
  { key: 'time', label: 'Timestamp', bits: TIME_BITS, start: SIGN_BITS },
  { key: 'machine', label: 'Machine', bits: MACHINE_BITS, start: SIGN_BITS + TIME_BITS },
  { key: 'sequence', label: 'Sequence', bits: SEQUENCE_BITS, start: SIGN_BITS + TIME_BITS + MACHINE_BITS },
];

function checkInt(name: string, v: number, max: number) {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new RangeError(`${name} must be a whole number from 0 to ${max}, not ${v}`);
}

/** Packs the three fields into one ID. Throws if a field is out of range. */
export function encode({ timestampMs, machine, sequence }: Parts): bigint {
  checkInt('The time since the epoch', timestampMs - EPOCH_MS, MAX_ELAPSED_MS);
  checkInt('The machine number', machine, MAX_MACHINE);
  checkInt('The sequence', sequence, MAX_SEQUENCE);
  return (BigInt(timestampMs - EPOCH_MS) << TIME_SHIFT) | (BigInt(machine) << MACHINE_SHIFT) | (BigInt(sequence) << SEQUENCE_SHIFT);
}

/** Splits an ID back into its fields. Throws for negative IDs and IDs of 2^63 or more. */
export function decode(id: bigint): Parts & { elapsedMs: number } {
  if (id < 0n || id >= ID_LIMIT) throw new RangeError('A Snowflake ID is a whole number from 0 to 2^63 − 1');
  const elapsedMs = Number(id >> TIME_SHIFT);
  return {
    elapsedMs,
    timestampMs: EPOCH_MS + elapsedMs,
    machine: Number((id >> MACHINE_SHIFT) & BigInt(MAX_MACHINE)),
    sequence: Number(id & BigInt(MAX_SEQUENCE)),
  };
}

/** The ID as 64 binary digits, most significant first. */
export function toBits(id: bigint): string {
  return id.toString(2).padStart(64, '0');
}

/** The bits of one segment, as written in the ID. */
export function segmentBits(id: bigint, segment: Segment): string {
  return toBits(id).slice(segment.start, segment.start + segment.bits);
}

export type Parsed = { ok: true; id: bigint } | { ok: false; error: string };

/** Reads an ID typed by a person: digits only (spaces and commas ignored), below 2^63. */
export function parseId(text: string): Parsed {
  const clean = text.replace(/[\s,]/g, '');
  if (!clean) return { ok: false, error: 'Type or paste an ID to decode.' };
  if (!/^\d+$/.test(clean)) return { ok: false, error: 'An ID is a whole number: digits only.' };
  if (clean.length > 19) return { ok: false, error: 'That number is too big for 64 bits.' };
  const id = BigInt(clean);
  if (id >= ID_LIMIT) return { ok: false, error: 'That number is too big for 64 bits.' };
  return { ok: true, id };
}

/* ------------------------------------------------------------------ */
/* The generator                                                       */
/* ------------------------------------------------------------------ */

/** What one machine's generator remembers: the last timestamp it used and the sequence it reached. */
export type GeneratorState = { lastMs: number; sequence: number } | null;

export type Generated =
  | { kind: 'ok'; id: bigint; parts: Parts; state: { lastMs: number; sequence: number }; /** Milliseconds it waited because the sequence ran out. */ waitedMs: number }
  | { kind: 'refused'; state: GeneratorState; resumeAtMs: number };

/** Makes the next ID for `machine` when its clock reads `nowMs`. */
export function nextId(state: GeneratorState, nowMs: number, machine: number): Generated {
  if (state && nowMs < state.lastMs) return { kind: 'refused', state, resumeAtMs: state.lastMs };
  let timestampMs = nowMs;
  let sequence = 0;
  let waitedMs = 0;
  if (state && nowMs === state.lastMs) {
    sequence = state.sequence + 1;
    if (sequence > MAX_SEQUENCE) {
      // Out of sequence numbers: wait for the next millisecond.
      timestampMs = state.lastMs + 1;
      sequence = 0;
      waitedMs = timestampMs - nowMs;
    }
  }
  const parts = { timestampMs, machine, sequence };
  return { kind: 'ok', id: encode(parts), parts, state: { lastMs: timestampMs, sequence }, waitedMs };
}

/** Makes `count` IDs as fast as possible, starting at `nowMs`; the clock moves on only when the sequence runs out. */
export function burst(state: GeneratorState, nowMs: number, machine: number, count: number) {
  const ids: bigint[] = [];
  let s = state;
  let clock = nowMs;
  let waits = 0;
  for (let i = 0; i < count; i++) {
    const r = nextId(s, clock, machine);
    if (r.kind === 'refused') return { ids, state: s, clockMs: clock, waits, refused: true as const };
    ids.push(r.id);
    s = r.state;
    if (r.waitedMs > 0) waits++;
    clock = r.parts.timestampMs;
  }
  return { ids, state: s, clockMs: clock, waits, refused: false as const };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** "2026-03-14 09:26:53.589 UTC" */
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)} UTC`;
}
