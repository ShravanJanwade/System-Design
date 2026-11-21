import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '@/lib/random';
import {
  BASE_TEXT,
  EDITS,
  MODE_ORDER,
  applyOps,
  buildStory,
  cursorIndex,
  insertOps,
  lastWriteWins,
  rgaApplyAll,
  rgaDelete,
  rgaFromText,
  rgaInsert,
  rgaText,
  rgaVisible,
  scenario,
  textOf,
  tilesFrom,
  transform,
  type RgaDoc,
  type RgaOp,
  type TextOp,
  type Tile,
  type User,
} from './logic';

const LETTERS = 'abcdefghij';

/** A run of random single-character edits made by one person on their own copy. */
function randomOtEdits(rng: Rng, start: Tile[], site: User, count: number): TextOp[] {
  const ops: TextOp[] = [];
  let tiles = start;
  for (let i = 0; i < count; i++) {
    const op: TextOp =
      tiles.length > 0 && rng.chance(0.35)
        ? { kind: 'delete', pos: rng.int(tiles.length), site }
        : { kind: 'insert', pos: rng.int(tiles.length + 1), ch: rng.pick([...LETTERS]), site, key: `${site}-${i}` };
    tiles = applyOps(tiles, [op]);
    ops.push(op);
  }
  return ops;
}

function randomRgaEdits(rng: Rng, start: RgaDoc, user: User, count: number): { doc: RgaDoc; ops: RgaOp[] } {
  let doc = start;
  const ops: RgaOp[] = [];
  for (let i = 0; i < count; i++) {
    const length = rgaVisible(doc).length;
    const step =
      length > 0 && rng.chance(0.35)
        ? rgaDelete(doc, rng.int(length), 1)
        : rgaInsert(doc, rng.int(length + 1), rng.pick(['a', 'bc', 'def']), user);
    doc = step.doc;
    ops.push(...step.ops);
  }
  return { doc, ops };
}

describe('operational transformation', () => {
  it('keeps both edits in the story, and both copies match', () => {
    const sc = scenario();
    const maya = textOf(applyOps(sc.mayaLocal, sc.samForMaya));
    const sam = textOf(applyOps(sc.samLocal, sc.mayaForSam));
    expect(maya).toBe('Photos from our beach trip to Bali');
    expect(sam).toBe(maya);
    expect(sc.shift).toBe(EDITS.maya.text.length);
  });

  it('without transformation, Sam’s edit lands inside Maya’s word', () => {
    expect(scenario().naive).toBe('Photos from our beac to Balih trip');
  });

  it('breaks a tie at the same position the same way on both copies', () => {
    const base = tilesFrom('ab');
    const a = insertOps(1, 'X', 'maya', 3);
    const b = insertOps(1, 'Y', 'sam', 3);
    const [a2, b2] = transform(a, b);
    expect(textOf(applyOps(applyOps(base, a), b2))).toBe('aXYb');
    expect(textOf(applyOps(applyOps(base, b), a2))).toBe('aXYb');
  });

  it('two copies always converge, for random concurrent inserts and deletes', () => {
    const rng = createRng(42);
    for (let trial = 0; trial < 400; trial++) {
      const base = tilesFrom([...Array(rng.int(8))].map(() => rng.pick([...LETTERS])).join(''));
      const a = randomOtEdits(rng, base, 'maya', 1 + rng.int(5));
      const b = randomOtEdits(rng, base, 'sam', 1 + rng.int(5));
      const [a2, b2] = transform(a, b);
      const left = textOf(applyOps(applyOps(base, a), b2));
      const right = textOf(applyOps(applyOps(base, b), a2));
      expect(left).toBe(right);
    }
  });
});

describe('the CRDT', () => {
  it('keeps both edits in the story, and both copies match', () => {
    const maya = rgaInsert(rgaFromText(BASE_TEXT), EDITS.maya.pos, EDITS.maya.text, 'maya');
    const sam = rgaInsert(rgaFromText(BASE_TEXT), EDITS.sam.pos, EDITS.sam.text, 'sam');
    const mayaDone = rgaApplyAll(maya.doc, sam.ops);
    const samDone = rgaApplyAll(sam.doc, maya.ops);
    expect(rgaText(mayaDone)).toBe('Photos from our beach trip to Bali');
    expect(rgaText(samDone)).toBe(rgaText(mayaDone));
    expect(maya.ops[0]).toMatchObject({ id: 'm21', after: 'o16' });
    expect(sam.ops[0]).toMatchObject({ id: 's21', after: 'o20' });
  });

  it('gives every character a unique id', () => {
    const maya = rgaInsert(rgaFromText(BASE_TEXT), EDITS.maya.pos, EDITS.maya.text, 'maya');
    const sam = rgaInsert(rgaFromText(BASE_TEXT), EDITS.sam.pos, EDITS.sam.text, 'sam');
    const merged = rgaApplyAll(maya.doc, sam.ops);
    const ids = merged.chars.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not interleave two runs typed at the same spot', () => {
    const base = rgaFromText('ab');
    const x = rgaInsert(base, 1, 'xyz', 'maya');
    const y = rgaInsert(base, 1, 'PQR', 'sam');
    const one = rgaText(rgaApplyAll(x.doc, y.ops));
    expect(one).toBe(rgaText(rgaApplyAll(y.doc, x.ops)));
    expect(['axyzPQRb', 'aPQRxyzb']).toContain(one);
  });

  it('copies converge whatever order edits arrive in, with deletes, and repeats change nothing', () => {
    const rng = createRng(7);
    for (let trial = 0; trial < 300; trial++) {
      const base = rgaFromText([...Array(rng.int(8))].map(() => rng.pick([...LETTERS])).join(''));
      const a = randomRgaEdits(rng, base, 'maya', 1 + rng.int(5));
      const b = randomRgaEdits(rng, base, 'sam', 1 + rng.int(5));
      const left = rgaApplyAll(a.doc, b.ops);
      const right = rgaApplyAll(b.doc, a.ops);
      expect(rgaText(left)).toBe(rgaText(right));
      expect(rgaText(rgaApplyAll(left, [...a.ops, ...b.ops]))).toBe(rgaText(left));
    }
  });
});

describe('last write wins', () => {
  it('keeps only the later save, so one edit is lost', () => {
    const sc = scenario();
    const winner = lastWriteWins({ by: 'maya', tiles: sc.mayaLocal, atMs: EDITS.maya.atMs }, { by: 'sam', tiles: sc.samLocal, atMs: EDITS.sam.atMs });
    expect(winner.by).toBe('sam');
    expect(textOf(winner.tiles)).toBe('Photos from our trip to Bali');
    expect(textOf(winner.tiles)).not.toContain('beach');
  });
});

describe('the story', () => {
  it('has four steps for every merge rule, starting from the same text', () => {
    for (const mode of MODE_ORDER) {
      const story = buildStory(mode);
      expect(story.steps).toHaveLength(4);
      expect(story.steps[0]!.maya.text).toBe(BASE_TEXT);
      expect(story.steps[1]!.maya.text).toBe('Photos from our beach trip');
      expect(story.steps[1]!.sam.text).toBe('Photos from our trip to Bali');
      expect(story.steps[2]!.messages).toHaveLength(2);
    }
  });

  it('loses Maya’s edit under last write wins, and keeps both under OT and the CRDT', () => {
    expect(buildStory('lww').outcome).toEqual({ mayaKept: false, samKept: true, same: true });
    expect(buildStory('ot').outcome).toEqual({ mayaKept: true, samKept: true, same: true });
    expect(buildStory('crdt').outcome).toEqual({ mayaKept: true, samKept: true, same: true });
    expect(buildStory('crdt').finalText.maya).toBe(buildStory('ot').finalText.maya);
  });

  it('shows both cursors, which move with the text', () => {
    const start = buildStory('ot').steps[0]!;
    expect(start.maya.cursors).toEqual([
      { user: 'maya', index: 16 },
      { user: 'sam', index: 20 },
    ]);
    const typed = buildStory('crdt').steps[1]!;
    expect(typed.maya.cursors).toEqual([
      { user: 'maya', index: 22 },
      { user: 'sam', index: 26 },
    ]);
    for (const mode of ['ot', 'crdt'] as const) {
      const end = buildStory(mode).steps[3]!;
      for (const copy of [end.maya, end.sam]) {
        expect(copy.cursors).toEqual([
          { user: 'maya', index: 22 },
          { user: 'sam', index: 34 },
        ]);
      }
    }
    const lost = buildStory('lww').steps[3]!;
    expect(lost.maya.cursors[0]).toEqual({ user: 'maya', index: 16 });
  });

  it('labels letters with positions under OT and with ids under the CRDT', () => {
    expect(buildStory('ot').steps[3]!.maya.tiles[26]!.label).toBe('26');
    expect(buildStory('crdt').steps[3]!.maya.tiles[16]!.label).toBe('m21');
    expect(buildStory('lww').steps[3]!.maya.tiles.every((t) => t.label === '')).toBe(true);
  });

  it('finds a cursor by its anchors', () => {
    const tiles = tilesFrom('abc');
    expect(cursorIndex(tiles, ['zz', 'o2'])).toBe(2);
    expect(cursorIndex(tiles, ['zz'])).toBe(0);
  });
});
