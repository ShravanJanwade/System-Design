import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Store = typeof import('./practice');
let S: Store;
const mem = new Map<string, string>();

beforeAll(async () => {
  // The store persists to window.localStorage; give it an in-memory one before it is created.
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
  S = await import('./practice');
});

beforeEach(() => {
  S.reset();
});

const design = {
  nodes: [
    { id: 'n1', type: 'service', label: 'API', x: 0, y: 0 },
    { id: 'n2', type: 'sqlDb', label: 'Database', x: 1, y: 0 },
  ],
  edges: [{ id: 'e1', from: 'n1', to: 'n2', kind: 'sync' }],
} as const;

describe('practice store', () => {
  it('records the last result per question and totals per mode', () => {
    const { recordAnswer } = S.usePractice.getState();
    recordAnswer('estimation', 'q1', false, '2026-11-01T10:00:00.000Z');
    recordAnswer('estimation', 'q1', true, '2026-11-02T10:00:00.000Z');
    recordAnswer('tools', 't1', true, '2026-11-03T10:00:00.000Z');
    const s = S.practiceSnapshot();
    expect(s.items.q1).toEqual({ correct: true, seenAt: '2026-11-02T10:00:00.000Z', attempts: 2 });
    expect(s.items.t1).toEqual({ correct: true, seenAt: '2026-11-03T10:00:00.000Z', attempts: 1 });
    expect(s.modes).toEqual({ estimation: { attempts: 2, correct: 1 }, bottleneck: { attempts: 0, correct: 0 }, tools: { attempts: 1, correct: 1 } });
  });

  it('keeps the sandbox design', () => {
    S.usePractice.getState().setSandbox(S.sanitizePracticeData({ sandbox: design }).sandbox);
    expect(S.practiceSnapshot().sandbox.nodes).toHaveLength(2);
    expect(S.practiceSnapshot().sandbox.edges).toHaveLength(1);
  });

  it('persists only the data, and sanitizes what it reads back', async () => {
    S.usePractice.getState().recordAnswer('bottleneck', 'b1', true, '2026-11-05T00:00:00.000Z');
    const stored = JSON.parse(mem.get('blueprint-practice') ?? '{}') as { state: Record<string, unknown> };
    expect(Object.keys(stored.state).sort()).toEqual(['items', 'modes', 'sandbox']);

    mem.set('blueprint-practice', JSON.stringify({ state: { items: { b2: { correct: true, seenAt: 'x' }, bad: 1 }, modes: 'junk' }, version: 1 }));
    await S.usePractice.persist.rehydrate();
    expect(S.practiceSnapshot().items).toEqual({ b2: { correct: true, seenAt: 'x', attempts: 1 } });
    expect(S.practiceSnapshot().modes.bottleneck).toEqual({ attempts: 0, correct: 0 });
  });

  it('round-trips through export and import', () => {
    S.usePractice.getState().recordAnswer('tools', 't9', false, '2026-11-04T00:00:00.000Z');
    const exported = JSON.parse(JSON.stringify(S.practiceSnapshot())) as unknown;
    S.reset();
    expect(S.practiceSnapshot().items).toEqual({});
    S.replaceAll(exported);
    expect(S.practiceSnapshot().items.t9).toEqual({ correct: false, seenAt: '2026-11-04T00:00:00.000Z', attempts: 1 });
    expect(S.practiceSnapshot().modes.tools).toEqual({ attempts: 1, correct: 0 });
  });

  it('reset clears everything', () => {
    S.usePractice.getState().recordAnswer('estimation', 'q1', true);
    S.reset();
    expect(S.practiceSnapshot()).toEqual({
      items: {},
      modes: { estimation: { attempts: 0, correct: 0 }, bottleneck: { attempts: 0, correct: 0 }, tools: { attempts: 0, correct: 0 } },
      sandbox: { nodes: [], edges: [] },
    });
  });
});

describe('sanitizePracticeData', () => {
  it('returns empty data for anything that is not an object', () => {
    for (const raw of [null, undefined, 3, 'x', []]) {
      expect(S.sanitizePracticeData(raw)).toEqual(S.EMPTY_PRACTICE_DATA);
    }
  });

  it('keeps well-formed records and drops or repairs the rest', () => {
    const clean = S.sanitizePracticeData({
      items: {
        good: { correct: true, seenAt: '2026-11-01', attempts: 3 },
        noDate: { correct: true },
        notRecord: 5,
        oddValues: { correct: 'yes', seenAt: '2026-11-02', attempts: -4 },
      },
      modes: {
        estimation: { attempts: 5.4, correct: 9 },
        bottleneck: 'many',
        tools: { attempts: -1, correct: 2 },
        unknown: { attempts: 3, correct: 3 },
      },
      sandbox: { nodes: [{ id: 'x', type: 'not-a-type', x: 0, y: 0 }], edges: [] },
      extra: true,
    });
    expect(clean.items).toEqual({
      good: { correct: true, seenAt: '2026-11-01', attempts: 3 },
      oddValues: { correct: false, seenAt: '2026-11-02', attempts: 1 },
    });
    expect(clean.modes).toEqual({ estimation: { attempts: 5, correct: 5 }, bottleneck: { attempts: 0, correct: 0 }, tools: { attempts: 0, correct: 0 } });
    expect(clean.sandbox).toEqual({ nodes: [], edges: [] });
    expect('extra' in clean).toBe(false);
  });

  it('identifies the drill modes', () => {
    expect(S.isDrillMode('tools')).toBe(true);
    expect(S.isDrillMode('flashcards')).toBe(false);
    expect(S.isDrillMode(undefined)).toBe(false);
  });
});
