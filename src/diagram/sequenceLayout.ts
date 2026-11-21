import type { NodeType, SequenceSpec } from '@/content/types';
import { measureText, roundUp, wrapText } from './text';
import type { Rect } from './layout';
import { PHONE_MIN_SCALE } from './phone';

export type SeqActor = { id: string; type: NodeType; label: string; cx: number; box: Rect; lines: string[] };
export type SeqMessage = {
  index: number;
  from: string;
  to: string;
  kind: 'sync' | 'reply' | 'async';
  lost: boolean;
  y: number;
  x1: number;
  x2: number;
  lines: string[];
  labelX: number;
  labelTop: number;
};
export type SeqGroup = { label: string; x: number; y1: number; y2: number; from: number; to: number };
export type SequenceLayout = {
  width: number;
  height: number;
  actors: SeqActor[];
  messages: SeqMessage[];
  groups: SeqGroup[];
  lifelineTop: number;
  lifelineBottom: number;
  compact: boolean;
};

/** wide: roomy columns. compact: narrower columns. phone: the tightest columns, for 375 px screens. */
export type SequenceMode = 'wide' | 'compact' | 'phone';

const METRICS: Record<SequenceMode, { pad: number; col: number; card: number; gutter: number; minLabel: number }> = {
  wide: { pad: 24, col: 176, card: 144, gutter: 40, minLabel: 110 },
  compact: { pad: 24, col: 120, card: 104, gutter: 34, minLabel: 84 },
  phone: { pad: 12, col: 104, card: 96, gutter: 28, minLabel: 80 },
};
const LABEL_SIZE = 13;
const LABEL_LINE = 17;
const ACTOR_LABEL = 14;

export function layoutSequence(spec: SequenceSpec, mode: SequenceMode): SequenceLayout {
  const m = METRICS[mode];
  const PAD = m.pad;
  const groupGutter = spec.groups?.length ? m.gutter : 0;
  // A card is never narrower than its longest word, and its column makes room for it.
  const longestWord = Math.max(0, ...spec.actors.flatMap((a) => a.label.split(/\s+/).map((w) => measureText(w, ACTOR_LABEL, 'semibold'))));
  const cardW = Math.max(m.card, Math.ceil(longestWord + 16));
  const col = Math.max(m.col, cardW + 8);
  const compact = mode !== 'wide';

  const actors: SeqActor[] = spec.actors.map((a, i) => {
    const cx = PAD + groupGutter + i * col + col / 2;
    const lines = wrapText(a.label, cardW - 16, ACTOR_LABEL, 'semibold');
    const h = roundUp(12 + 20 + 8 + lines.length * 17 + 10);
    return { id: a.id, type: a.type, label: a.label, cx, lines, box: { x: cx - cardW / 2, y: PAD, w: cardW, h } };
  });
  const headerBottom = Math.max(...actors.map((a) => a.box.y + a.box.h));
  const byId = new Map(actors.map((a) => [a.id, a]));

  let y = headerBottom + 28;
  const messages: SeqMessage[] = spec.messages.map((sm, index) => {
    const a = byId.get(sm.from)!;
    const b = byId.get(sm.to)!;
    const span = Math.abs(b.cx - a.cx);
    const maxW = Math.max(m.minLabel, span - 40);
    const lines = wrapText(`${sm.label}`, maxW, LABEL_SIZE, 'semibold');
    const labelH = lines.length * LABEL_LINE;
    y += labelH + 6;
    const msg: SeqMessage = {
      index,
      from: sm.from,
      to: sm.to,
      kind: sm.kind ?? 'sync',
      lost: Boolean(sm.lost),
      y,
      x1: a.cx,
      x2: b.cx,
      lines,
      labelX: (a.cx + b.cx) / 2,
      labelTop: y - labelH - 4,
    };
    y += 22;
    return msg;
  });
  const lifelineBottom = y + 8;

  const groups: SeqGroup[] = (spec.groups ?? []).map((g) => {
    const first = messages[g.from - 1];
    const last = messages[g.to - 1];
    const y1 = (first ? first.labelTop : headerBottom) - 4;
    const y2 = (last ? last.y : lifelineBottom) + 8;
    return { label: g.label, x: PAD + 8, y1, y2, from: g.from, to: g.to };
  });

  const width = PAD * 2 + groupGutter + actors.length * col;
  const height = lifelineBottom + PAD;
  return { width, height, actors, messages, groups, lifelineTop: headerBottom, lifelineBottom, compact };
}

export function labelWidth(lines: string[]): number {
  return Math.max(...lines.map((l) => measureText(l, LABEL_SIZE, 'semibold')));
}

export type SequenceFit = { kind: 'columns'; layout: SequenceLayout; scale: number } | { kind: 'list' };

/** Columns at the roomiest width that reads at 85% or more; where none does (a phone), a step list instead. */
export function sequenceFit(spec: SequenceSpec, available: number): SequenceFit {
  const wide = layoutSequence(spec, 'wide');
  if (available <= 0) return { kind: 'columns', layout: wide, scale: 1 };
  for (const mode of ['wide', 'compact', 'phone'] as const) {
    const layout = mode === 'wide' ? wide : layoutSequence(spec, mode);
    const scale = Math.min(1.1, available / layout.width);
    if (scale >= PHONE_MIN_SCALE) return { kind: 'columns', layout, scale };
  }
  return { kind: 'list' };
}
