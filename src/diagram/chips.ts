import type { DiagramSpec } from '@/content/types';
import { CHIP_H, chipWidth, layoutDiagram, lintLayout, pointAt, type DiagramLayout, type LayoutMode, type Pt, type Rect } from './layout';
import { finalTags, stepView, type StepView, type Tag } from './steps';

/** Radius of a reduced-motion step badge, its outline included. */
export const BADGE_R = 11;

/** A reduced-motion step badge: the hop's number in travel order, at a point on its edge. */
export type PlacedBadge = { edge: string; n: number; x: number; y: number };
import type { ChipTone } from './svg-parts';

/** A chip on the diagram: a step note, an arrival tag or a "Down" tag, with its box in layout units. */
export type PlacedChip = Rect & { text: string; tone: ChipTone; owner: string; kind: 'node' | 'edge' | 'down' };

/** Does `a` overlap `b` grown by `margin` on every side? A negative margin lets them touch. */
function hits(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.w + margin && b.x - margin < a.x + a.w && a.y < b.y + b.h + margin && b.y - margin < a.y + a.h;
}

/**
 * Where a step's chips go. Each chip tries a few spots in order and takes the first that is clear of the
 * other cards, edge labels, arrowheads and chips placed before it, inside the diagram.
 * - A failed node gets a "Down" tag on its top-left corner, else another corner clear of arrowheads.
 * - Notes and arrival tags on a node form one row: on the card's top-right corner (moved right of any arrow
 *   that meets the top border), else its bottom-right corner, else just above or below the card, else beside it.
 * - A note on an edge goes above its label, else below it, beside it, or above or below the two cards.
 */
export function placeChips(layout: DiagramLayout, view: Pick<StepView, 'notes' | 'failed' | 'visible'>, tags: Tag[]): PlacedChip[] {
  const nodes = Object.values(layout.nodes).filter((n) => view.visible.has(n.id));
  const edges = Object.values(layout.edges).filter((e) => view.visible.has(e.id));
  const labels = edges.flatMap((e) => (e.labelBox ? [e.labelBox] : []));
  const arrows = edges.map((e) => boundsOf(e.arrow));
  const placed: PlacedChip[] = [];
  const clear = (r: Rect, owner?: string) =>
    r.x >= 0 &&
    r.y >= 0 &&
    r.x + r.w <= layout.width &&
    r.y + r.h <= layout.height &&
    nodes.every((n) => n.id === owner || !hits(r, n, 2)) &&
    labels.every((l) => !hits(r, l, 1)) &&
    arrows.every((a) => !hits(r, a, 1)) &&
    placed.every((c) => !hits(r, c, 2));

  for (const n of nodes) {
    if (!view.failed.has(n.id)) continue;
    const w = chipWidth('Down');
    // Arrowheads on the top and bottom borders, so the tag can sit just beside them on a narrow card.
    const heads = (side: 'top' | 'bottom') =>
      edges.filter((e) => e.to === n.id && e.toSide === side).map((e) => boundsOf(e.arrow));
    const beside = (side: 'top' | 'bottom', y: number) => {
      const hs = heads(side);
      if (!hs.length) return [];
      const left = Math.min(...hs.map((h) => h.x));
      const right = Math.max(...hs.map((h) => h.x + h.w));
      return [
        { x: left - 2 - w, y },
        { x: right + 2, y },
      ];
    };
    const corners = [
      { x: n.x - 6, y: n.y - 12 }, // top-left
      { x: n.x + n.w - w + 6, y: n.y - 12 }, // top-right
      ...beside('top', n.y - 12),
      { x: n.x - 6, y: n.y + n.h - 8 }, // bottom-left
      { x: n.x + n.w - w + 6, y: n.y + n.h - 8 }, // bottom-right
      ...beside('bottom', n.y + n.h - 8),
    ].map((p) => ({ kind: 'down' as const, owner: n.id, text: 'Down', tone: 'alert' as const, x: Math.round(p.x), y: Math.round(p.y), w, h: CHIP_H }));
    placed.push(corners.find((c) => clear(c, n.id)) ?? corners[0]!);
  }

  const rows = new Map<string, { text: string; tone: ChipTone }[]>();
  const addToRow = (node: string, text: string, tone: ChipTone) => rows.set(node, [...(rows.get(node) ?? []), { text, tone }]);
  for (const note of view.notes) if (layout.nodes[note.target]) addToRow(note.target, note.text, note.tone ?? 'plain');
  for (const t of tags) addToRow(t.node, t.text, t.tone);

  for (const n of nodes) {
    const row = rows.get(n.id);
    if (!row?.length) continue;
    const rowWidth = row.reduce((sum, c, i) => sum + chipWidth(c.text) + (i === 0 ? 0 : 4), 0);
    const portsOn = (side: 'top' | 'bottom') =>
      edges.flatMap((e) => [
        ...(e.to === n.id && e.toSide === side ? [e.points[e.points.length - 1]!.x] : []),
        ...(e.from === n.id && e.fromSide === side ? [e.points[0]!.x] : []),
      ]);
    const rightOf = (ports: number[]) => Math.max(n.x + n.w + 10, (ports.length ? Math.max(...ports) + 10 : -Infinity) + rowWidth);
    // A row ending at `right` (kept inside the diagram), at height y.
    const build = (right: number, y: number): PlacedChip[] => {
      let cursor = Math.max(rowWidth + 2, Math.min(right, layout.width - 2));
      return [...row]
        .reverse()
        .map((c, i) => {
          const w = chipWidth(c.text);
          cursor -= w + (i === 0 ? 0 : 4);
          return { kind: 'node' as const, owner: n.id, text: c.text, tone: c.tone, x: Math.round(cursor), y: Math.round(y), w, h: CHIP_H };
        })
        .reverse();
    };
    const downWidth = view.failed.has(n.id) ? chipWidth('Down') + 4 : 0;
    const candidates = [
      build(rightOf(portsOn('top')), n.y - 12), // top-right corner
      build(rightOf(portsOn('bottom')), n.y + n.h - 8), // bottom-right corner
      build(n.x - 6 + downWidth + rowWidth, n.y - 12), // top-left corner, after any "Down" tag
      build(n.x - 6 + rowWidth, n.y + n.h - 8), // bottom-left corner
      build(n.x + n.w + 10, n.y - CHIP_H - 16), // just above the card
      build(n.x + n.w + 10, n.y + n.h + 6), // just below the card
      build(n.x + n.w / 2 + rowWidth / 2, n.y - CHIP_H - 6), // centered above the card
      build(n.x + n.w / 2 + rowWidth / 2, n.y + n.h + 6), // centered below the card
      build(n.x + n.w + 8 + rowWidth, n.y + n.h / 2 - CHIP_H / 2), // beside the card, on the right
      build(n.x - 8, n.y + n.h / 2 - CHIP_H / 2), // beside the card, on the left
    ];
    placed.push(...(candidates.find((chips) => chips.every((c) => clear(c, n.id))) ?? candidates[0]!));
  }

  for (const note of view.notes) {
    const e = layout.edges[note.target];
    if (!e || !view.visible.has(e.id)) continue;
    const w = chipWidth(note.text);
    const h = CHIP_H;
    const mid = pointAt(e.samples, e.length / 2);
    const l = e.labelBox ?? { x: mid.x, y: mid.y, w: 0, h: 0 };
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    const a = layout.nodes[e.from]!;
    const b = layout.nodes[e.to]!;
    const spots: Pt[] = [
      { x: cx - w / 2, y: l.y - h - 4 },
      { x: cx - w / 2, y: l.y + l.h + 4 },
      { x: l.x + l.w + 6, y: cy - h / 2 },
      { x: l.x - 6 - w, y: cy - h / 2 },
      { x: cx - w / 2, y: Math.min(a.y, b.y) - h - 8 },
      { x: cx - w / 2, y: Math.max(a.y + a.h, b.y + b.h) + 8 },
    ];
    const boxes = spots.map((p) => ({ x: Math.round(Math.max(2, Math.min(p.x, layout.width - w - 2))), y: Math.round(p.y), w, h }));
    const box = boxes.find((r) => clear(r)) ?? boxes[0]!;
    placed.push({ kind: 'edge', owner: e.id, text: note.text, tone: note.tone ?? 'plain', ...box });
  }
  return placed;
}

/**
 * Where reduced motion's numbered badges go: each hop tries a few points along its edge (near the start for a
 * request, near the end for a reply) and takes the least crowded one. Covering text (an edge label or a chip) or a
 * badge with another number is the worst; brushing a card, an arrowhead or a badge with the same number is minor.
 */
export function placeBadges(layout: DiagramLayout, view: Pick<StepView, 'flow' | 'visible'>, chips: PlacedChip[]): PlacedBadge[] {
  const nodes = Object.values(layout.nodes).filter((n) => view.visible.has(n.id));
  const edges = Object.values(layout.edges).filter((e) => view.visible.has(e.id));
  const labels = edges.flatMap((e) => (e.labelBox ? [e.labelBox] : []));
  const arrows = edges.map((e) => boundsOf(e.arrow));
  const placed: PlacedBadge[] = [];
  const box = (p: Pt): Rect => ({ x: p.x - BADGE_R, y: p.y - BADGE_R, w: BADGE_R * 2, h: BADGE_R * 2 });
  // Sitting on text (the badge's center within half a badge of a label or chip) is the worst; brushing it is minor.
  const half = BADGE_R / 2;
  const on = (p: Pt, b: Rect) => p.x > b.x - half && p.x < b.x + b.w + half && p.y > b.y - half && p.y < b.y + b.h + half;
  const cost = (p: Pt, n: number) => {
    const r = box(p);
    let c = 0;
    for (const t of [...labels, ...chips]) c += on(p, t) ? 100 : overlaps(r, t, 1) ? 15 : 0;
    for (const b of placed) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < BADGE_R) c += b.n === n ? 1 : 150;
      else if (d < BADGE_R * 2 - 2) c += b.n === n ? 0 : 5;
    }
    for (const nd of nodes) if (overlaps(r, nd, 1)) c += 10;
    for (const a of arrows) if (overlaps(r, a, 1)) c += 5;
    if (r.x < 0 || r.y < 0 || r.x + r.w > layout.width || r.y + r.h > layout.height) c += 20;
    return c;
  };
  view.flow.forEach((group, gi) =>
    group.forEach((hop) => {
      const e = layout.edges[hop.edge];
      if (!e) return;
      const n = gi + 1;
      const preferred = hop.reverse ? [0.68, 0.8, 0.56, 0.44, 0.9, 0.32, 0.2] : [0.32, 0.2, 0.44, 0.56, 0.1, 0.68, 0.8];
      const fractions = [...preferred, ...Array.from({ length: 15 }, (_, k) => 0.06 + k * 0.0628).filter((f) => preferred.every((q) => Math.abs(q - f) > 0.03))];
      // On the line first, then just beside it (a request on one side, its reply on the other).
      const side = hop.reverse ? -1 : 1;
      const candidates: Pt[] = [];
      for (const offset of [0, side * (BADGE_R + 4), -side * (BADGE_R + 4), side * (BADGE_R + 12), -side * (BADGE_R + 12), side * (BADGE_R + 20), -side * (BADGE_R + 20), side * (BADGE_R + 30), -side * (BADGE_R + 30)]) {
        for (const f of fractions) {
          const at = e.length * f;
          const p = pointAt(e.samples, at);
          if (offset === 0) {
            candidates.push(p);
            continue;
          }
          const a = pointAt(e.samples, Math.max(0, at - 2));
          const b = pointAt(e.samples, Math.min(e.length, at + 2));
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          candidates.push({ x: p.x - ((b.y - a.y) / len) * offset, y: p.y + ((b.x - a.x) / len) * offset });
        }
      }
      let best = candidates[0]!;
      let bestCost = cost(best, n);
      for (const p of candidates.slice(1)) {
        if (bestCost === 0) break;
        const c = cost(p, n);
        if (c < bestCost) {
          best = p;
          bestCost = c;
        }
      }
      placed.push({ edge: e.id, n, x: best.x, y: best.y });
    }),
  );
  return placed;
}

/**
 * Problems with reduced motion's badges that hide something: a badge sitting on an edge label or a chip (half of it or
 * more over the text), or two badges with different numbers on top of each other. Badges that only touch read fine.
 */
export function lintBadges(layout: DiagramLayout, badges: PlacedBadge[], chips: PlacedChip[], visible: Set<string>): string[] {
  const problems: string[] = [];
  const half = BADGE_R / 2;
  const on = (b: PlacedBadge, r: Rect) => b.x > r.x - half && b.x < r.x + r.w + half && b.y > r.y - half && b.y < r.y + r.h + half;
  const edges = Object.values(layout.edges).filter((e) => visible.has(e.id));
  badges.forEach((b, i) => {
    for (const e of edges) if (e.labelBox && on(b, e.labelBox)) problems.push(`step badge ${b.n} covers the label of edge "${e.id}"`);
    for (const ch of chips) if (on(b, ch)) problems.push(`step badge ${b.n} covers chip "${ch.text}"`);
    for (const o of badges.slice(i + 1)) if (o.n !== b.n && Math.hypot(o.x - b.x, o.y - b.y) < BADGE_R) problems.push(`step badges ${b.n} and ${o.n} overlap`);
  });
  return [...new Set(problems)];
}

function overlaps(a: Rect, b: Rect, slack = 0): boolean {
  return a.x + slack < b.x + b.w && b.x + slack < a.x + a.w && a.y + slack < b.y + b.h && b.y + slack < a.y + a.h;
}

function boundsOf(points: Pt[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Problems with a step's chips: chips on top of each other, other cards, edge labels or arrowheads, or off the diagram. */
export function lintChips(layout: DiagramLayout, chips: PlacedChip[], visible: Set<string>): string[] {
  const problems: string[] = [];
  const nodes = Object.values(layout.nodes).filter((n) => visible.has(n.id));
  const edges = Object.values(layout.edges).filter((e) => visible.has(e.id));
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      if (overlaps(chips[i]!, chips[j]!, 1)) problems.push(`chips "${chips[i]!.text}" and "${chips[j]!.text}" overlap`);
    }
  }
  for (const c of chips) {
    if (c.x < 0 || c.x + c.w > layout.width) problems.push(`chip "${c.text}" runs off the diagram`);
    for (const n of nodes) {
      if (c.kind !== 'edge' && n.id === c.owner) continue;
      if (overlaps(c, n, 1)) problems.push(`chip "${c.text}" covers node "${n.id}"`);
    }
    for (const e of edges) {
      if (e.labelBox && overlaps(c, e.labelBox)) problems.push(`chip "${c.text}" covers the label of edge "${e.id}"`);
      if (overlaps(c, boundsOf(e.arrow))) problems.push(`chip "${c.text}" covers the arrowhead of edge "${e.id}"`);
    }
  }
  return [...new Set(problems)];
}

/**
 * Everything a reader would notice in a diagram, in each layout mode and at every step: crowded cards, lines
 * through cards or labels, and chips that collide. Use it in simulator tests on the specs a simulator builds.
 */
export function lintDiagram(spec: DiagramSpec, modes: readonly LayoutMode[] = ['wide', 'compact', 'narrow']): string[] {
  const problems: string[] = [];
  for (const mode of modes) {
    const layout = layoutDiagram(spec, mode);
    problems.push(...lintLayout(layout));
    const steps = Math.max(1, spec.steps?.length ?? 0);
    for (let i = 0; i < steps; i++) {
      const view = stepView(spec, i);
      const chips = placeChips(layout, view, finalTags(view.flow, layout));
      for (const p of lintChips(layout, chips, view.visible)) problems.push(`step ${i + 1}: ${p} (${mode} layout)`);
      const badges = placeBadges(layout, view, chips);
      for (const p of lintBadges(layout, badges, chips, view.visible)) problems.push(`step ${i + 1}, reduced motion: ${p} (${mode} layout)`);
    }
  }
  return [...new Set(problems)];
}
