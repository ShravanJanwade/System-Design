import { describe, expect, it } from 'vitest';
import { createRng } from '@/lib/random';
import {
  EPOCH_MS,
  IDS_PER_MS,
  LAST_MS,
  LIFETIME_YEARS,
  MACHINES,
  MAX_MACHINE,
  MAX_SEQUENCE,
  SEGMENTS,
  START_MS,
  burst,
  decode,
  encode,
  formatTimestamp,
  nextId,
  parseId,
  segmentBits,
  toBits,
} from './logic';

describe('layout and capacity', () => {
  it('has 1 + 41 + 10 + 12 = 64 bits, in that order', () => {
    expect(SEGMENTS.map((s) => [s.key, s.bits])).toEqual([
      ['sign', 1],
      ['time', 41],
      ['machine', 10],
      ['sequence', 12],
    ]);
    expect(SEGMENTS.reduce((n, s) => n + s.bits, 0)).toBe(64);
    for (let i = 1; i < SEGMENTS.length; i++) expect(SEGMENTS[i]!.start).toBe(SEGMENTS[i - 1]!.start + SEGMENTS[i - 1]!.bits);
  });

  it('allows 4,096 IDs per millisecond per machine and 1,024 machines', () => {
    expect(IDS_PER_MS).toBe(4096);
    expect(MACHINES).toBe(1024);
  });

  it('lasts about 69 years from the 2025 epoch, until 2094', () => {
    expect(new Date(EPOCH_MS).toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(LIFETIME_YEARS).toBeGreaterThan(69.6);
    expect(LIFETIME_YEARS).toBeLessThan(69.8);
    expect(new Date(LAST_MS).getUTCFullYear()).toBe(2094);
  });
});

describe('encode and decode', () => {
  it('packs a known example', () => {
    // 1 ms after the epoch, machine 1, sequence 1: (1 << 22) + (1 << 12) + 1.
    expect(encode({ timestampMs: EPOCH_MS + 1, machine: 1, sequence: 1 })).toBe(4_198_401n);
    expect(encode({ timestampMs: EPOCH_MS, machine: 0, sequence: 0 })).toBe(0n);
  });

  it('round-trips the smallest, largest and many random values', () => {
    const cases = [
      { timestampMs: EPOCH_MS, machine: 0, sequence: 0 },
      { timestampMs: LAST_MS, machine: MAX_MACHINE, sequence: MAX_SEQUENCE },
      { timestampMs: START_MS, machine: 7, sequence: 2 },
    ];
    const rng = createRng(42);
    for (let i = 0; i < 2000; i++) {
      cases.push({ timestampMs: EPOCH_MS + rng.int(2 ** 41), machine: rng.int(1024), sequence: rng.int(4096) });
    }
    for (const parts of cases) {
      const back = decode(encode(parts));
      expect(back.timestampMs).toBe(parts.timestampMs);
      expect(back.machine).toBe(parts.machine);
      expect(back.sequence).toBe(parts.sequence);
    }
  });

  it('the largest ID is 2^63 − 1, so the sign bit always stays 0', () => {
    const max = encode({ timestampMs: LAST_MS, machine: MAX_MACHINE, sequence: MAX_SEQUENCE });
    expect(max).toBe((1n << 63n) - 1n);
    expect(toBits(max)[0]).toBe('0');
    expect(toBits(max)).toHaveLength(64);
  });

  it('puts each field in its own bits', () => {
    const id = encode({ timestampMs: EPOCH_MS + 5, machine: 3, sequence: 9 });
    const bySegment = Object.fromEntries(SEGMENTS.map((s) => [s.key, segmentBits(id, s)]));
    expect(bySegment.sign).toBe('0');
    expect(parseInt(bySegment.time!, 2)).toBe(5);
    expect(parseInt(bySegment.machine!, 2)).toBe(3);
    expect(parseInt(bySegment.sequence!, 2)).toBe(9);
  });

  it('rejects fields out of range', () => {
    expect(() => encode({ timestampMs: EPOCH_MS - 1, machine: 0, sequence: 0 })).toThrow(RangeError);
    expect(() => encode({ timestampMs: LAST_MS + 1, machine: 0, sequence: 0 })).toThrow(RangeError);
    expect(() => encode({ timestampMs: START_MS, machine: 1024, sequence: 0 })).toThrow(RangeError);
    expect(() => encode({ timestampMs: START_MS, machine: 0, sequence: 4096 })).toThrow(RangeError);
    expect(() => decode(-1n)).toThrow(RangeError);
    expect(() => decode(1n << 63n)).toThrow(RangeError);
  });
});

describe('sorting by time', () => {
  it('a later millisecond always gives a bigger ID, whatever the machine and sequence', () => {
    const earlier = encode({ timestampMs: START_MS, machine: MAX_MACHINE, sequence: MAX_SEQUENCE });
    const later = encode({ timestampMs: START_MS + 1, machine: 0, sequence: 0 });
    expect(later > earlier).toBe(true);
  });

  it('two machines in the same millisecond make different IDs', () => {
    const a = nextId(null, START_MS, 7);
    const b = nextId(null, START_MS, 12);
    expect(a.kind === 'ok' && b.kind === 'ok' && a.id !== b.id).toBe(true);
  });
});

describe('nextId', () => {
  it('counts the sequence up within one millisecond, then starts again at 0', () => {
    let state = null as Parameters<typeof nextId>[0];
    const seqs: number[] = [];
    const ids: bigint[] = [];
    for (const now of [START_MS, START_MS, START_MS, START_MS + 1]) {
      const r = nextId(state, now, 7);
      if (r.kind !== 'ok') throw new Error('refused');
      seqs.push(r.parts.sequence);
      ids.push(r.id);
      state = r.state;
    }
    expect(seqs).toEqual([0, 1, 2, 0]);
    for (let i = 1; i < ids.length; i++) expect(ids[i]! > ids[i - 1]!).toBe(true);
  });

  it('waits for the next millisecond when the sequence runs out', () => {
    const r = nextId({ lastMs: START_MS, sequence: MAX_SEQUENCE }, START_MS, 7);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.parts.timestampMs).toBe(START_MS + 1);
      expect(r.parts.sequence).toBe(0);
      expect(r.waitedMs).toBe(1);
    }
  });

  it('refuses to make IDs while the clock is behind the last timestamp it used', () => {
    const r = nextId({ lastMs: START_MS, sequence: 4 }, START_MS - 2, 7);
    expect(r.kind).toBe('refused');
    if (r.kind === 'refused') expect(r.resumeAtMs).toBe(START_MS);
    // Once the clock is back at the same millisecond, it simply continues the sequence.
    const again = nextId({ lastMs: START_MS, sequence: 4 }, START_MS, 7);
    expect(again.kind === 'ok' && again.parts.sequence).toBe(5);
  });
});

describe('burst', () => {
  it('fits 4,096 IDs in one millisecond and moves on for the rest, with no repeats and in order', () => {
    const b = burst(null, START_MS, 7, 5000);
    expect(b.ids).toHaveLength(5000);
    expect(new Set(b.ids).size).toBe(5000);
    const firstMs = b.ids.filter((id) => decode(id).timestampMs === START_MS);
    expect(firstMs).toHaveLength(IDS_PER_MS);
    expect(decode(b.ids[4999]!).timestampMs).toBe(START_MS + 1);
    expect(decode(b.ids[4999]!).sequence).toBe(5000 - IDS_PER_MS - 1);
    expect(b.waits).toBe(1);
    expect(b.clockMs).toBe(START_MS + 1);
    for (let i = 1; i < b.ids.length; i++) expect(b.ids[i]! > b.ids[i - 1]!).toBe(true);
  });
});

describe('parseId and formatTimestamp', () => {
  it('accepts digits, ignoring spaces and commas', () => {
    expect(parseId('4,198,401')).toEqual({ ok: true, id: 4_198_401n });
    expect(parseId(' 123 456 ')).toEqual({ ok: true, id: 123456n });
  });

  it('rejects empty, non-numeric, negative and too-large input', () => {
    for (const bad of ['', 'abc', '-5', '12.5', '9223372036854775808', '99999999999999999999']) expect(parseId(bad).ok).toBe(false);
    expect(parseId('9223372036854775807').ok).toBe(true);
  });

  it('formats times in UTC with milliseconds', () => {
    expect(formatTimestamp(START_MS)).toBe('2026-03-14 09:26:53.589 UTC');
  });
});
