/**
 * Two people edit the same text at the same moment, merged three ways:
 * - last write wins: the whole text with the later timestamp replaces the other;
 * - operational transformation (OT): single-character operations whose positions are
 *   adjusted against the concurrent operations they missed;
 * - a sequence CRDT (the replicated growable array, RGA): every character has a unique id
 *   and is placed after the character it was typed after, so copies merge in any order.
 */

export type User = 'maya' | 'sam';
export type Author = User | 'base';

export const PEOPLE: Record<User, { name: string; initial: string; device: string }> = {
  maya: { name: 'Maya', initial: 'M', device: 'phone' },
  sam: { name: 'Sam', initial: 'S', device: 'laptop' },
};

/** One character on screen, with who typed it. `key` is stable across copies. */
export type Tile = { key: string; ch: string; author: Author };

const LETTER: Record<Author, string> = { base: 'o', maya: 'm', sam: 's' };

/** The starting text, with ids o1, o2, … for its characters. */
export function tilesFrom(text: string): Tile[] {
  return [...text].map((ch, i) => ({ key: `o${i + 1}`, ch, author: 'base' }));
}

export function textOf(tiles: readonly { ch: string }[]): string {
  return tiles.map((t) => t.ch).join('');
}

/* ------------------------------------------------------------------ */
/* Operational transformation                                          */
/* ------------------------------------------------------------------ */

export type TextOp = { kind: 'insert'; pos: number; ch: string; site: User; key: string } | { kind: 'delete'; pos: number; site: User };

/** When two inserts land at the same position, Maya's goes first. Any fixed rule works if every copy uses it. */
const SITE_RANK: Record<User, number> = { maya: 0, sam: 1 };

export function applyOp(tiles: Tile[], op: TextOp | null): Tile[] {
  if (!op) return tiles;
  const next = tiles.slice();
  if (op.kind === 'insert') {
    if (op.pos < 0 || op.pos > tiles.length) throw new Error(`insert at ${op.pos} is outside a text of ${tiles.length}`);
    next.splice(op.pos, 0, { key: op.key, ch: op.ch, author: op.site });
  } else {
    if (op.pos < 0 || op.pos >= tiles.length) throw new Error(`delete at ${op.pos} is outside a text of ${tiles.length}`);
    next.splice(op.pos, 1);
  }
  return next;
}

export function applyOps(tiles: Tile[], ops: readonly (TextOp | null)[]): Tile[] {
  return ops.reduce<Tile[]>((acc, op) => applyOp(acc, op), tiles);
}

/**
 * Rewrite operation `a` so it can be applied after `b`, where both were made on the same text
 * at the same time. Returns null when `a` no longer has anything to do.
 */
export function transformOp(a: TextOp | null, b: TextOp | null): TextOp | null {
  if (!a || !b) return a;
  if (a.kind === 'insert') {
    if (b.kind === 'insert') {
      const first = a.pos < b.pos || (a.pos === b.pos && SITE_RANK[a.site] < SITE_RANK[b.site]);
      return first ? a : { ...a, pos: a.pos + 1 };
    }
    return a.pos <= b.pos ? a : { ...a, pos: a.pos - 1 };
  }
  if (b.kind === 'insert') return a.pos < b.pos ? a : { ...a, pos: a.pos + 1 };
  if (a.pos < b.pos) return a;
  if (a.pos > b.pos) return { ...a, pos: a.pos - 1 };
  return null;
}

/**
 * Transform two concurrent lists of operations against each other.
 * Returns [a', b'] such that applying a then b' gives the same text as applying b then a'.
 */
export function transform(a: readonly (TextOp | null)[], b: readonly (TextOp | null)[]): [(TextOp | null)[], (TextOp | null)[]] {
  let others = b.slice();
  const out: (TextOp | null)[] = [];
  for (const op of a) {
    let current = op;
    const next: (TextOp | null)[] = [];
    for (const other of others) {
      next.push(transformOp(other, current));
      current = transformOp(current, other);
    }
    out.push(current);
    others = next;
  }
  return [out, others];
}

/** Typing a run of text: one insert per character, each just after the last. */
export function insertOps(pos: number, text: string, site: User, firstCounter: number): TextOp[] {
  return [...text].map((ch, i) => ({ kind: 'insert' as const, pos: pos + i, ch, site, key: `${LETTER[site]}${firstCounter + i}` }));
}

/* ------------------------------------------------------------------ */
/* A sequence CRDT: the replicated growable array                      */
/* ------------------------------------------------------------------ */

export type RgaChar = { id: string; counter: number; site: string; ch: string; author: Author; deleted: boolean };
export type RgaDoc = { chars: RgaChar[]; clock: number };
export type RgaOp =
  | { kind: 'insert'; id: string; counter: number; site: string; ch: string; author: Author; after: string | null }
  | { kind: 'delete'; id: string };

/** Which of two characters typed after the same one comes first: the higher counter, then the higher site letter. */
function newer(a: { counter: number; site: string }, b: { counter: number; site: string }): boolean {
  return a.counter > b.counter || (a.counter === b.counter && a.site > b.site);
}

export function rgaFromText(text: string): RgaDoc {
  const chars = [...text].map((ch, i) => ({ id: `o${i + 1}`, counter: i + 1, site: 'o', ch, author: 'base' as const, deleted: false }));
  return { chars, clock: chars.length };
}

export function rgaVisible(doc: RgaDoc): RgaChar[] {
  return doc.chars.filter((c) => !c.deleted);
}

export function rgaText(doc: RgaDoc): string {
  return textOf(rgaVisible(doc));
}

/** Apply an operation from any copy. Applying one twice changes nothing. */
export function rgaApply(doc: RgaDoc, op: RgaOp): RgaDoc {
  if (op.kind === 'delete') {
    const at = doc.chars.findIndex((c) => c.id === op.id);
    if (at < 0) throw new Error(`delete of unknown character ${op.id}`);
    if (doc.chars[at]!.deleted) return doc;
    const chars = doc.chars.slice();
    chars[at] = { ...chars[at]!, deleted: true };
    return { chars, clock: doc.clock };
  }
  if (doc.chars.some((c) => c.id === op.id)) return doc;
  let i = 0;
  if (op.after !== null) {
    const anchor = doc.chars.findIndex((c) => c.id === op.after);
    if (anchor < 0) throw new Error(`insert after unknown character ${op.after}`);
    i = anchor + 1;
  }
  // Skip characters that were typed after the same anchor more recently: they stay closer to it.
  while (i < doc.chars.length && newer(doc.chars[i]!, op)) i++;
  const chars = doc.chars.slice();
  chars.splice(i, 0, { id: op.id, counter: op.counter, site: op.site, ch: op.ch, author: op.author, deleted: false });
  return { chars, clock: Math.max(doc.clock, op.counter) };
}

export function rgaApplyAll(doc: RgaDoc, ops: readonly RgaOp[]): RgaDoc {
  return ops.reduce(rgaApply, doc);
}

/** Type text at a visible position. Each new character gets a fresh id and points at the one before it. */
export function rgaInsert(doc: RgaDoc, index: number, text: string, author: User): { doc: RgaDoc; ops: RgaOp[] } {
  const visible = rgaVisible(doc);
  if (index < 0 || index > visible.length) throw new Error(`insert at ${index} is outside a text of ${visible.length}`);
  let after = index === 0 ? null : visible[index - 1]!.id;
  let current = doc;
  const ops: RgaOp[] = [];
  for (const ch of text) {
    const counter = current.clock + 1;
    const id = `${LETTER[author]}${counter}`;
    const op: RgaOp = { kind: 'insert', id, counter, site: LETTER[author], ch, author, after };
    current = rgaApply(current, op);
    ops.push(op);
    after = id;
  }
  return { doc: current, ops };
}

/** Delete visible characters. They stay behind as tombstones, so later edits can still point at them. */
export function rgaDelete(doc: RgaDoc, index: number, count: number): { doc: RgaDoc; ops: RgaOp[] } {
  let current = doc;
  const ops: RgaOp[] = [];
  for (let k = 0; k < count; k++) {
    const target = rgaVisible(current)[index];
    if (!target) throw new Error(`delete at ${index} is outside the text`);
    const op: RgaOp = { kind: 'delete', id: target.id };
    current = rgaApply(current, op);
    ops.push(op);
  }
  return { doc: current, ops };
}

/* ------------------------------------------------------------------ */
/* Last write wins                                                     */
/* ------------------------------------------------------------------ */

export type Save = { by: User; tiles: Tile[]; atMs: number };

/** Keep the save with the later timestamp; the other is discarded whole. */
export function lastWriteWins(a: Save, b: Save): Save {
  if (b.atMs !== a.atMs) return b.atMs > a.atMs ? b : a;
  return SITE_RANK[b.by] > SITE_RANK[a.by] ? b : a;
}

/* ------------------------------------------------------------------ */
/* The story the widget steps through                                  */
/* ------------------------------------------------------------------ */

export type Mode = 'lww' | 'ot' | 'crdt';
export const MODE_ORDER: Mode[] = ['lww', 'ot', 'crdt'];
export const MODE_INFO: Record<Mode, { title: string; tab: string; labels: string }> = {
  lww: { title: 'Last write wins', tab: 'Last write wins', labels: '' },
  ot: { title: 'Operational transformation', tab: 'Operational transform', labels: 'Numbers under the letters are positions.' },
  crdt: { title: 'CRDT', tab: 'CRDT', labels: 'Labels under the letters are character ids: o for the original text, m for Maya, s for Sam.' },
};

export const BASE_TEXT = 'Photos from our trip';
export const EDITS: Record<User, { pos: number; text: string; savedAt: string; atMs: number }> = {
  maya: { pos: 16, text: 'beach ', savedAt: '12:00:00.400', atMs: 400 },
  sam: { pos: 20, text: ' to Bali', savedAt: '12:00:00.450', atMs: 450 },
};

export type ViewTile = Tile & { label: string };
export type Cursor = { user: User; index: number };
export type CopyView = { owner: User; tiles: ViewTile[]; text: string; cursors: Cursor[] };
export type Message = { from: User; to: User | 'server'; what: string; note: string };
export type Outcome = { mayaKept: boolean; samKept: boolean; same: boolean };
export type StoryStep = { title: string; caption: string; maya: CopyView; sam: CopyView; messages: Message[]; outcome: Outcome | null };
export type Story = { mode: Mode; steps: StoryStep[]; outcome: Outcome; finalText: { maya: string; sam: string } };

/** Where a cursor sits: just after the first of its anchors that is still in the text. */
export function cursorIndex(tiles: readonly { key: string }[], anchors: readonly string[]): number {
  for (const a of anchors) {
    const i = tiles.findIndex((t) => t.key === a);
    if (i >= 0) return i + 1;
  }
  return 0;
}

function quote(s: string): string {
  return `“${s}”`;
}

/** The pieces of the story that do not depend on the merge rule. */
export function scenario() {
  const base = tilesFrom(BASE_TEXT);
  const counter = base.length + 1;
  const mayaOps = insertOps(EDITS.maya.pos, EDITS.maya.text, 'maya', counter);
  const samOps = insertOps(EDITS.sam.pos, EDITS.sam.text, 'sam', counter);
  const mayaLocal = applyOps(base, mayaOps);
  const samLocal = applyOps(base, samOps);
  const [mayaForSam, samForMaya] = transform(mayaOps, samOps);
  const mayaLast = mayaOps[mayaOps.length - 1]!;
  const samLast = samOps[samOps.length - 1]!;
  return {
    base,
    mayaOps,
    samOps,
    mayaLocal,
    samLocal,
    mayaForSam,
    samForMaya,
    /** Cursor anchors: after the last character each person typed, else where they started. */
    anchors: {
      maya: [mayaLast.kind === 'insert' ? mayaLast.key : '', `o${EDITS.maya.pos}`],
      sam: [samLast.kind === 'insert' ? samLast.key : '', `o${EDITS.sam.pos}`],
    } as Record<User, string[]>,
    /** What Maya's copy would show if Sam's edit were applied at its old position. */
    naive: textOf(applyOps(mayaLocal, samOps)),
    /** How far OT moved Sam's edit on Maya's copy. */
    shift: (samForMaya[0]?.pos ?? EDITS.sam.pos) - EDITS.sam.pos,
  };
}

function view(owner: User, tiles: Tile[], labels: 'none' | 'index' | 'id', anchors: Record<User, string[]>): CopyView {
  const viewTiles = tiles.map((t, i) => ({ ...t, label: labels === 'index' ? String(i) : labels === 'id' ? t.key : '' }));
  return {
    owner,
    tiles: viewTiles,
    text: textOf(tiles),
    cursors: (['maya', 'sam'] as const).map((user) => ({ user, index: cursorIndex(tiles, anchors[user]) })),
  };
}

function startAnchors(): Record<User, string[]> {
  return { maya: [`o${EDITS.maya.pos}`], sam: [`o${EDITS.sam.pos}`] };
}

function outcomeOf(maya: Tile[], sam: Tile[]): Outcome {
  const mayaText = textOf(maya);
  const samText = textOf(sam);
  const kept = (t: string, u: User) => t.includes(EDITS[u].text.trim());
  return { mayaKept: kept(mayaText, 'maya') && kept(samText, 'maya'), samKept: kept(mayaText, 'sam') && kept(samText, 'sam'), same: mayaText === samText };
}

export function buildStory(mode: Mode): Story {
  const sc = scenario();
  const labels = mode === 'ot' ? 'index' : mode === 'crdt' ? 'id' : 'none';
  const maya = EDITS.maya;
  const sam = EDITS.sam;

  let mayaFinal: Tile[];
  let samFinal: Tile[];
  let crossing: { caption: string; messages: Message[] };
  let result: string;

  if (mode === 'lww') {
    const winner = lastWriteWins({ by: 'maya', tiles: sc.mayaLocal, atMs: maya.atMs }, { by: 'sam', tiles: sc.samLocal, atMs: sam.atMs });
    mayaFinal = winner.tiles;
    samFinal = winner.tiles;
    crossing = {
      caption: `Each app saves the whole description with a timestamp. Sam’s save is stamped ${sam.atMs - maya.atMs} ms after Maya’s, so the server keeps his and sends it to Maya’s phone.`,
      messages: [
        { from: 'maya', to: 'server', what: `Save ${quote(textOf(sc.mayaLocal))}`, note: `stamped ${maya.savedAt}` },
        { from: 'sam', to: 'server', what: `Save ${quote(textOf(sc.samLocal))}`, note: `stamped ${sam.savedAt}, the later one` },
      ],
    };
    result = `Both screens now show Sam’s version. Maya’s ${quote(maya.text.trim())} is gone, and nobody was told.`;
  } else if (mode === 'ot') {
    mayaFinal = applyOps(sc.mayaLocal, sc.samForMaya);
    samFinal = applyOps(sc.samLocal, sc.mayaForSam);
    const mayaArrives = sc.mayaForSam[0]?.pos ?? maya.pos;
    const samArrives = sc.samForMaya[0]?.pos ?? sam.pos;
    crossing = {
      caption: `Each app sends its edit as an operation: what to insert, and where. Before applying an edit it missed, each copy transforms it against its own. On Maya’s phone, Sam’s insert moves from position ${sam.pos} to ${samArrives}, past her ${maya.text.length} new characters. Unchanged, it would have landed inside her word: ${quote(sc.naive)}.`,
      messages: [
        { from: 'maya', to: 'sam', what: `Insert ${quote(maya.text)} at ${maya.pos}`, note: mayaArrives === maya.pos ? `stays at ${maya.pos}: it comes before Sam’s edit` : `moves to ${mayaArrives}` },
        { from: 'sam', to: 'maya', what: `Insert ${quote(sam.text)} at ${sam.pos}`, note: `moves to ${samArrives}: Maya added ${maya.text.length} characters before it` },
      ],
    };
    result = `Both copies read ${quote(textOf(mayaFinal))}. Both edits survive, and each cursor moved with the text around it.`;
  } else {
    let mayaDoc = rgaFromText(BASE_TEXT);
    let samDoc = rgaFromText(BASE_TEXT);
    const mayaTyped = rgaInsert(mayaDoc, maya.pos, maya.text, 'maya');
    const samTyped = rgaInsert(samDoc, sam.pos, sam.text, 'sam');
    mayaDoc = rgaApplyAll(mayaTyped.doc, samTyped.ops);
    samDoc = rgaApplyAll(samTyped.doc, mayaTyped.ops);
    const toTiles = (d: RgaDoc): Tile[] => rgaVisible(d).map((c) => ({ key: c.id, ch: c.ch, author: c.author }));
    mayaFinal = toTiles(mayaDoc);
    samFinal = toTiles(samDoc);
    const firstMaya = mayaTyped.ops[0]!;
    const firstSam = samTyped.ops[0]!;
    const anchorOf = (op: RgaOp) => (op.kind === 'insert' ? op.after ?? 'the start' : '');
    crossing = {
      caption: `Every character has its own id, made from who typed it and a counter. Each app sends its new characters along with the id of the character they follow, so nobody has to fix up a position: Maya’s text follows ${anchorOf(
        firstMaya,
      )} and Sam’s follows ${anchorOf(firstSam)}, wherever those characters are now.`,
      messages: [
        { from: 'maya', to: 'sam', what: `Insert ${quote(maya.text)} after ${anchorOf(firstMaya)}`, note: `new ids ${firstMaya.id} to ${mayaTyped.ops[mayaTyped.ops.length - 1]!.id}` },
        { from: 'sam', to: 'maya', what: `Insert ${quote(sam.text)} after ${anchorOf(firstSam)}`, note: `new ids ${firstSam.id} to ${samTyped.ops[samTyped.ops.length - 1]!.id}` },
      ],
    };
    result = `Both copies hold the same characters in the same order, so they match exactly: ${quote(textOf(mayaFinal))}. They would match whatever order the edits arrived in.`;
  }

  const anchors = sc.anchors;
  const outcome = outcomeOf(mayaFinal, samFinal);
  const local = { maya: mode === 'crdt' ? rgaLocal('maya') : sc.mayaLocal, sam: mode === 'crdt' ? rgaLocal('sam') : sc.samLocal };

  const steps: StoryStep[] = [
    {
      title: 'Same text, two screens',
      caption: `Maya and Sam both have the shared album open, and each app shows where the other person’s cursor is. That live “who is here, and where” is presence.`,
      maya: view('maya', sc.base, labels, startAnchors()),
      sam: view('sam', sc.base, labels, startAnchors()),
      messages: [],
      outcome: null,
    },
    {
      title: 'Both type at once',
      caption: `In the same half-second, Maya types ${quote(maya.text)} before ${quote('trip')} and Sam types ${quote(sam.text)} at the end. Each app shows its own edit at once, before the other has heard of it.`,
      maya: view('maya', local.maya, labels, anchors),
      sam: view('sam', local.sam, labels, anchors),
      messages: [],
      outcome: null,
    },
    {
      title: 'The edits cross',
      caption: crossing.caption,
      maya: view('maya', local.maya, labels, anchors),
      sam: view('sam', local.sam, labels, anchors),
      messages: crossing.messages,
      outcome: null,
    },
    {
      title: 'The result',
      caption: result,
      maya: view('maya', mayaFinal, labels, anchors),
      sam: view('sam', samFinal, labels, anchors),
      messages: [],
      outcome,
    },
  ];
  return { mode, steps, outcome, finalText: { maya: textOf(mayaFinal), sam: textOf(samFinal) } };
}

/** One person's copy after typing, built with the CRDT so its ids are the real ones. */
function rgaLocal(user: User): Tile[] {
  const typed = rgaInsert(rgaFromText(BASE_TEXT), EDITS[user].pos, EDITS[user].text, user);
  return rgaVisible(typed.doc).map((c) => ({ key: c.id, ch: c.ch, author: c.author }));
}

/** Plain-text summary of a step, for screen readers. */
export function describeStep(step: StoryStep): string {
  const copy = (c: CopyView) => {
    const cursors = c.cursors.map((k) => `${PEOPLE[k.user].name}’s cursor at position ${k.index}`).join(', ');
    return `${PEOPLE[c.owner].name}’s copy reads ${quote(c.text)}, with ${cursors}.`;
  };
  return `${step.title}. ${copy(step.maya)} ${copy(step.sam)}`;
}
