/**
 * Diagram layout: turns a DiagramSpec (grid positions) into pixel geometry.
 * Pure and DOM-free, so the same code drives rendering and the build-time layout lint.
 *
 * - Columns size to their widest card; gaps grow to fit edge labels.
 * - Edges route orthogonally between card sides, with ports spread along shared sides
 *   and rounded corners.
 * - Two card styles: "row" (glyph beside the label) for wide panels and
 *   "stack" (glyph above the label) for narrow ones.
 * - Narrow layouts are for phones and other small panels: cards shrink to their text and the
 *   margins tighten, so three columns fit a 375 px screen at full size.
 */
import type { DiagramEdge, DiagramSpec, NodeType, Side } from '@/content/types';
import { measureText, roundUp, wrapText } from './text';

export type CardStyle = 'row' | 'stack';
export type LayoutMode = 'wide' | 'compact' | 'narrow';
export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type NodeBox = Rect & {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  lines: string[];
  subLines: string[];
  cx: number;
  cy: number;
  style: CardStyle;
};

export type EdgeRoute = {
  id: string;
  from: string;
  to: string;
  kind: DiagramEdge['kind'];
  label?: string;
  fromSide: Side;
  toSide: Side;
  /** Orthogonal polyline from the source border to just outside the target border. */
  points: Pt[];
  /** Drawn path with rounded corners, ending at the arrowhead base. */
  d: string;
  /** Dense samples along the rounded path, used to move request dots. */
  samples: Pt[];
  length: number;
  /** Arrowhead triangle. */
  arrow: [Pt, Pt, Pt];
  labelBox?: Rect;
  /** A point about a third of the way along, for step-order badges. */
  badge: Pt;
};

export type DiagramLayout = {
  mode: LayoutMode;
  style: CardStyle;
  width: number;
  height: number;
  nodes: Record<string, NodeBox>;
  edges: Record<string, EdgeRoute>;
};

export const PAD = 32;
export const CHIP_H = 20;
export const CHIP_FONT = 12;
const CORNER = 8;
const ARROW_LEN = 8;
const ARROW_HALF = 4.5;
const ARROW_GAP = 3;
const PORT_SPACING = 12;

export const ROW_CARD = {
  minW: 112,
  maxW: 216,
  padL: 16,
  glyph: 20,
  gap: 10,
  padR: 14,
  label: 14,
  sub: 12,
  lineH: 18,
  subLineH: 16,
  minH: 56,
};

export const STACK_CARD = {
  w: 112,
  padX: 8,
  padTop: 12,
  glyph: 20,
  glyphGap: 8,
  label: 14,
  sub: 12,
  lineH: 17,
  subLineH: 15,
  padBottom: 11,
};

const GAPS: Record<CardStyle, { x: number; y: number }> = {
  row: { x: 48, y: 40 },
  stack: { x: 24, y: 32 },
};

/** Narrow layouts: the outer margin, the gap between columns and the narrowest card. */
export const NARROW = { pad: 12, gapX: 24, minW: 80, text: 84, minWidth: 280 };

/* ------------------------------------------------------------------ */

type Placement = { x: number; y: number };

export function chipWidth(text: string): number {
  return Math.ceil(measureText(text, CHIP_FONT, 'semibold')) + 16;
}

function sizeCard(label: string, sublabel: string | undefined, style: CardStyle, fitText = false) {
  if (style === 'row') {
    const c = ROW_CARD;
    const maxText = c.maxW - c.padL - c.glyph - c.gap - c.padR;
    const lines = wrapText(label, maxText, c.label, 'semibold');
    const subLines = sublabel ? wrapText(sublabel, maxText, c.sub, 'regular') : [];
    const textW = Math.max(
      ...lines.map((l) => measureText(l, c.label, 'semibold')),
      ...subLines.map((l) => measureText(l, c.sub, 'regular')),
    );
    const w = Math.min(c.maxW, Math.max(c.minW, roundUp(c.padL + c.glyph + c.gap + textW + c.padR)));
    const h = Math.max(c.minH, roundUp(lines.length * c.lineH + subLines.length * c.subLineH + 20));
    return { w, h, lines, subLines };
  }
  const c = STACK_CARD;
  const maxText = fitText ? NARROW.text : c.w - c.padX * 2;
  const lines = wrapText(label, maxText, c.label, 'semibold');
  const subLines = sublabel ? wrapText(sublabel, maxText, c.sub, 'regular') : [];
  const h = roundUp(
    c.padTop + c.glyph + c.glyphGap + lines.length * c.lineH + subLines.length * c.subLineH + c.padBottom,
  );
  if (!fitText) return { w: c.w, h, lines, subLines };
  // Same wrapping, but the card is only as wide as its longest line.
  const textW = Math.max(
    ...lines.map((l) => measureText(l, c.label, 'semibold')),
    ...subLines.map((l) => measureText(l, c.sub, 'regular')),
  );
  // A single word longer than the wrap width keeps its own line, and the card grows to hold it.
  const w = Math.max(NARROW.minW, Math.ceil((textW + c.padX * 2 + 4) / 4) * 4);
  return { w, h, lines, subLines };
}

function transposeSide(side: Side | undefined): Side | undefined {
  switch (side) {
    case 'top':
      return 'left';
    case 'left':
      return 'top';
    case 'bottom':
      return 'right';
    case 'right':
      return 'bottom';
    default:
      return undefined;
  }
}

function normal(side: Side): Pt {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

const isHorizontal = (s: Side) => s === 'left' || s === 'right';

function sidePoint(n: Rect & { cx: number; cy: number }, side: Side): Pt {
  switch (side) {
    case 'left':
      return { x: n.x, y: n.cy };
    case 'right':
      return { x: n.x + n.w, y: n.cy };
    case 'top':
      return { x: n.cx, y: n.y };
    case 'bottom':
      return { x: n.cx, y: n.y + n.h };
  }
}

function interp(centers: number[], v: number): number {
  const lo = Math.max(0, Math.min(centers.length - 1, Math.floor(v)));
  const hi = Math.max(0, Math.min(centers.length - 1, Math.ceil(v)));
  if (lo === hi) return centers[lo]!;
  return centers[lo]! + (centers[hi]! - centers[lo]!) * (v - lo);
}

/* ------------------------------------------------------------------ */

export function layoutDiagram(spec: DiagramSpec, mode: LayoutMode = 'wide'): DiagramLayout {
  const style: CardStyle = mode === 'wide' ? 'row' : 'stack';
  const transposed = mode === 'narrow' && !spec.narrow;

  let cols = spec.grid.cols;
  let rows = spec.grid.rows;
  const place: Record<string, Placement> = {};
  for (const n of spec.nodes) place[n.id] = { x: n.x, y: n.y };
  const sideOverride: Record<string, { fromSide?: Side; toSide?: Side }> = {};
  for (const e of spec.edges) sideOverride[e.id] = { fromSide: e.fromSide, toSide: e.toSide };

  if (mode === 'narrow') {
    if (spec.narrow) {
      cols = spec.narrow.grid.cols;
      rows = spec.narrow.grid.rows;
      for (const [id, p] of Object.entries(spec.narrow.positions)) place[id] = { ...p };
      for (const e of spec.edges) {
        const o = spec.narrow.sides?.[e.id];
        sideOverride[e.id] = o ? { ...o } : {};
      }
    } else if (transposed) {
      [cols, rows] = [rows, cols];
      for (const n of spec.nodes) place[n.id] = { x: n.y, y: n.x };
      for (const e of spec.edges) {
        sideOverride[e.id] = { fromSide: transposeSide(e.fromSide), toSide: transposeSide(e.toSide) };
      }
    }
  }

  const narrow = mode === 'narrow';
  const pad = narrow ? NARROW.pad : PAD;

  // 1. Size the cards.
  const sized = spec.nodes.map((n) => ({ node: n, ...sizeCard(n.label, n.sublabel, style, narrow), at: place[n.id]! }));

  // 2. Column widths and row heights from cards sitting on whole grid lines.
  const minCol = style === 'row' ? ROW_CARD.minW : narrow ? NARROW.minW : STACK_CARD.w;
  const minRow = style === 'row' ? ROW_CARD.minH : 72;
  const colW = new Array<number>(cols).fill(minCol);
  const rowH = new Array<number>(rows).fill(minRow);
  for (const s of sized) {
    if (Number.isInteger(s.at.x) && s.at.x >= 0 && s.at.x < cols) colW[s.at.x] = Math.max(colW[s.at.x]!, s.w);
    if (Number.isInteger(s.at.y) && s.at.y >= 0 && s.at.y < rows) rowH[s.at.y] = Math.max(rowH[s.at.y]!, s.h);
  }

  // 3. Gaps, widened where an edge label must sit between two adjacent cards.
  const gapX = new Array<number>(Math.max(0, cols - 1)).fill(narrow ? NARROW.gapX : GAPS[style].x);
  const gapY = new Array<number>(Math.max(0, rows - 1)).fill(GAPS[style].y);
  for (const e of spec.edges) {
    if (!e.label) continue;
    const a = place[e.from];
    const b = place[e.to];
    if (!a || !b) continue;
    const need = roundUp(chipWidth(e.label) + 32);
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    // In a narrow layout, sides set for an edge decide which gap holds its label: top and bottom sides put it
    // between rows even when the cards sit diagonally.
    const o = narrow ? sideOverride[e.id] : undefined;
    const forcedVertical = !!(o?.fromSide && o.toSide && !isHorizontal(o.fromSide) && !isHorizontal(o.toSide));
    if (forcedVertical) {
      const g = Math.floor(Math.min(a.y, b.y));
      if (dy > 0 && dy <= 1 && g >= 0 && g < gapY.length) gapY[g] = Math.max(gapY[g]!, roundUp(CHIP_H + 24));
    } else if (dx >= dy && dx > 0 && dx <= 1) {
      const g = Math.floor(Math.min(a.x, b.x));
      if (g >= 0 && g < gapX.length) gapX[g] = Math.max(gapX[g]!, need);
    } else if (dy > dx && dy <= 1) {
      const g = Math.floor(Math.min(a.y, b.y));
      if (g >= 0 && g < gapY.length) gapY[g] = Math.max(gapY[g]!, roundUp(CHIP_H + 24));
    }
  }

  // A narrow layout is at least NARROW.minWidth wide, centered, so step notes fit beside a single column.
  const gridW = colW.reduce((a, b) => a + b, 0) + gapX.reduce((a, b) => a + b, 0);
  const sidePad = narrow ? Math.max(pad, Math.ceil((NARROW.minWidth - gridW) / 2)) : pad;
  const colCenter: number[] = [];
  let cursor = sidePad;
  for (let c = 0; c < cols; c++) {
    colCenter.push(cursor + colW[c]! / 2);
    cursor += colW[c]! + (gapX[c] ?? 0);
  }
  let width = cursor + sidePad;
  const rowCenter: number[] = [];
  cursor = PAD;
  for (let r = 0; r < rows; r++) {
    rowCenter.push(cursor + rowH[r]! / 2);
    cursor += rowH[r]! + (gapY[r] ?? 0);
  }
  let height = cursor + PAD;

  // 4. Place cards, centered on their grid point.
  const nodes: Record<string, NodeBox> = {};
  for (const s of sized) {
    const cx = interp(colCenter, s.at.x);
    const cy = interp(rowCenter, s.at.y);
    const x = Math.round(cx - s.w / 2);
    const y = Math.round(cy - s.h / 2);
    nodes[s.node.id] = {
      id: s.node.id,
      type: s.node.type,
      label: s.node.label,
      sublabel: s.node.sublabel,
      lines: s.lines,
      subLines: s.subLines,
      x,
      y,
      w: s.w,
      h: s.h,
      cx: x + s.w / 2,
      cy: y + s.h / 2,
      style,
    };
  }

  // 5. Pick sides for every edge: the dominant direction first, then alternatives,
  //    keeping the first route that does not cut through another card.
  type EdgeInfo = { edge: DiagramEdge; fromSide: Side; toSide: Side };
  const infos: EdgeInfo[] = [];
  const allNodes = Object.values(nodes);
  for (const e of spec.edges) {
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (!a || !b) continue;
    const pa = place[e.from]!;
    const pb = place[e.to]!;
    const o = sideOverride[e.id] ?? {};
    const gx = pb.x - pa.x;
    const gy = pb.y - pa.y;
    const horiz: [Side, Side] = gx >= 0 ? ['right', 'left'] : ['left', 'right'];
    const vert: [Side, Side] = gy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
    const candidates: [Side, Side][] =
      Math.abs(gx) >= Math.abs(gy)
        ? [horiz, vert, [horiz[0], vert[1]], [vert[0], horiz[1]]]
        : [vert, horiz, [vert[0], horiz[1]], [horiz[0], vert[1]]];
    let chosen = candidates[0]!;
    if (!o.fromSide && !o.toSide) {
      for (const [fs, ts] of candidates) {
        if (gx === 0 && (fs === 'left' || fs === 'right') && (ts === 'left' || ts === 'right')) continue;
        if (gy === 0 && (fs === 'top' || fs === 'bottom') && (ts === 'top' || ts === 'bottom')) continue;
        const s = sidePoint(a, fs);
        const t = sidePoint(b, ts);
        const pts = simplify(orthogonalRoute(s, fs, t, ts, 0));
        const blocked = allNodes.some(
          (n) => n.id !== a.id && n.id !== b.id && pts.some((p, i) => i > 0 && segmentHitsRect(pts[i - 1]!, p, inflate(n, 4))),
        );
        if (!blocked) {
          chosen = [fs, ts];
          break;
        }
      }
    }
    infos.push({ edge: e, fromSide: o.fromSide ?? chosen[0], toSide: o.toSide ?? chosen[1] });
  }

  // 6. Spread ports along shared sides, ordered by where the other end sits.
  type PortUse = { info: EdgeInfo; end: 'from' | 'to'; other: NodeBox };
  const usage = new Map<string, PortUse[]>();
  for (const info of infos) {
    const a = nodes[info.edge.from]!;
    const b = nodes[info.edge.to]!;
    const k1 = `${a.id}|${info.fromSide}`;
    const k2 = `${b.id}|${info.toSide}`;
    if (!usage.has(k1)) usage.set(k1, []);
    if (!usage.has(k2)) usage.set(k2, []);
    usage.get(k1)!.push({ info, end: 'from', other: b });
    usage.get(k2)!.push({ info, end: 'to', other: a });
  }
  const portOffset = new Map<string, number>(); // `${edgeId}|from` -> offset along side
  const sideCount = new Map<string, number>();
  for (const [key, uses] of usage) {
    const [nodeId, side] = key.split('|') as [string, Side];
    const node = nodes[nodeId]!;
    const along = isHorizontal(side) ? (u: PortUse) => u.other.cy : (u: PortUse) => u.other.cx;
    uses.sort((p, q) => along(p) - along(q));
    const sideLen = isHorizontal(side) ? node.h : node.w;
    const k = uses.length;
    const spacing = k > 1 ? Math.min(PORT_SPACING, (sideLen - 16) / (k - 1)) : 0;
    uses.forEach((u, i) => portOffset.set(`${u.info.edge.id}|${u.end}`, (i - (k - 1) / 2) * spacing));
    sideCount.set(key, k);
  }

  const portPoint = (node: NodeBox, side: Side, offset: number): Pt => {
    switch (side) {
      case 'left':
        return { x: node.x, y: node.cy + offset };
      case 'right':
        return { x: node.x + node.w, y: node.cy + offset };
      case 'top':
        return { x: node.cx + offset, y: node.y };
      case 'bottom':
        return { x: node.cx + offset, y: node.y + node.h };
    }
  };

  // 7. Lane offsets so Z-shaped edges leaving one side in the same direction do not overlap.
  const lane = new Map<string, number>();
  for (const [key, uses] of usage) {
    const [, side] = key.split('|') as [string, Side];
    const outgoing = uses.filter((u) => u.end === 'from');
    for (const dir of [-1, 1]) {
      const group = outgoing.filter((u) => {
        const a = nodes[u.info.edge.from]!;
        const b = u.other;
        const delta = isHorizontal(side) ? b.cy - a.cy : b.cx - a.cx;
        return Math.sign(delta) === dir;
      });
      if (group.length < 2) continue;
      const span = (u: PortUse) => {
        const a = nodes[u.info.edge.from]!;
        return Math.abs(isHorizontal(side) ? u.other.cy - a.cy : u.other.cx - a.cx);
      };
      group.sort((p, q) => span(q) - span(p));
      const towards = side === 'right' || side === 'bottom' ? 1 : -1;
      group.forEach((u, i) => lane.set(u.info.edge.id, (i - (group.length - 1) / 2) * 10 * towards));
    }
  }

  // 8. Route.
  const edges: Record<string, EdgeRoute> = {};
  for (const info of infos) {
    const { edge, fromSide, toSide } = info;
    const a = nodes[edge.from]!;
    const b = nodes[edge.to]!;
    let s = portPoint(a, fromSide, portOffset.get(`${edge.id}|from`) ?? 0);
    let t = portPoint(b, toSide, portOffset.get(`${edge.id}|to`) ?? 0);

    // Straighten nearly aligned facing edges so they do not jog by a few pixels.
    const facing =
      (fromSide === 'right' && toSide === 'left' && t.x > s.x) ||
      (fromSide === 'left' && toSide === 'right' && t.x < s.x) ||
      (fromSide === 'bottom' && toSide === 'top' && t.y > s.y) ||
      (fromSide === 'top' && toSide === 'bottom' && t.y < s.y);
    if (facing) {
      const horiz = isHorizontal(fromSide);
      const diff = horiz ? t.y - s.y : t.x - s.x;
      if (diff !== 0 && Math.abs(diff) < 16) {
        const nFrom = sideCount.get(`${a.id}|${fromSide}`) ?? 1;
        const nTo = sideCount.get(`${b.id}|${toSide}`) ?? 1;
        const keepSource = nFrom >= nTo;
        const target = keepSource ? (horiz ? s.y : s.x) : horiz ? t.y : t.x;
        const lo = horiz ? Math.max(a.y, b.y) + 8 : Math.max(a.x, b.x) + 8;
        const hi = horiz ? Math.min(a.y + a.h, b.y + b.h) - 8 : Math.min(a.x + a.w, b.x + b.w) - 8;
        if (lo <= hi) {
          const v = Math.min(hi, Math.max(lo, target));
          if (horiz) {
            s = { x: s.x, y: v };
            t = { x: t.x, y: v };
          } else {
            s = { x: v, y: s.y };
            t = { x: v, y: t.y };
          }
        }
      }
    }

    const nT = normal(toSide);
    const tip = { x: t.x + nT.x * ARROW_GAP, y: t.y + nT.y * ARROW_GAP };
    // If the middle segment would run along an earlier edge that shares no card with this one (two
    // crossing edges through the same channel), shift it sideways so the two stay readable.
    const others = Object.values(edges).filter((o) => o.from !== edge.from && o.from !== edge.to && o.to !== edge.from && o.to !== edge.to);
    const routeAt = (offset: number) => simplify(orthogonalRoute(s, fromSide, tip, toSide, offset));
    const merges = (pts: Pt[]) => others.some((o) => collinearOverlap(pts, o.points) > 10);
    const crossesCard = (pts: Pt[]) =>
      Object.values(nodes).some((n) => n.id !== edge.from && n.id !== edge.to && pts.some((p, k) => k > 0 && segmentHitsRect(pts[k - 1]!, p, inflate(n, -2))));
    const baseLane = lane.get(edge.id) ?? 0;
    let points = routeAt(baseLane);
    if (merges(points)) {
      points = [12, -12, 24, -24].map((d) => routeAt(baseLane + d)).find((pts) => !merges(pts) && !crossesCard(pts)) ?? points;
    }
    const base = { x: tip.x + nT.x * ARROW_LEN, y: tip.y + nT.y * ARROW_LEN };
    const perp = { x: -nT.y, y: nT.x };
    const arrow: [Pt, Pt, Pt] = [
      tip,
      { x: base.x + perp.x * ARROW_HALF, y: base.y + perp.y * ARROW_HALF },
      { x: base.x - perp.x * ARROW_HALF, y: base.y - perp.y * ARROW_HALF },
    ];
    const drawPoints = [...points.slice(0, -1), base];
    const { d } = roundedPath(drawPoints, CORNER);
    const { samples, length } = roundedPath(points, CORNER);

    let labelBox: Rect | undefined;
    if (edge.label) {
      const seg = longestSegment(points);
      const w = chipWidth(edge.label);
      const mx = (seg[0].x + seg[1].x) / 2;
      const my = (seg[0].y + seg[1].y) / 2;
      labelBox = { x: Math.round(mx - w / 2), y: Math.round(my - CHIP_H / 2), w, h: CHIP_H };
    }

    edges[edge.id] = {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      label: edge.label,
      fromSide,
      toSide,
      points,
      d,
      samples,
      length,
      arrow,
      labelBox,
      badge: pointAt(samples, length * 0.32),
    };
  }

  // 9. Keep every route, arrowhead and label on the canvas: where one runs past an edge (a route around the
  //    outside of a narrow layout, say), shift the drawing and grow the canvas instead of clipping it.
  const MARGIN = 4;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const e of Object.values(edges)) {
    for (const pt of [...e.points, ...e.arrow]) include(pt.x, pt.y);
    if (e.labelBox) {
      include(e.labelBox.x, e.labelBox.y);
      include(e.labelBox.x + e.labelBox.w, e.labelBox.y + e.labelBox.h);
    }
  }
  if (Number.isFinite(minX)) {
    const dx = Math.max(0, Math.ceil(MARGIN - minX));
    const dy = Math.max(0, Math.ceil(MARGIN - minY));
    if (dx || dy) {
      const move = (pt: Pt): Pt => ({ x: pt.x + dx, y: pt.y + dy });
      for (const n of Object.values(nodes)) {
        n.x += dx;
        n.y += dy;
        n.cx += dx;
        n.cy += dy;
      }
      for (const e of Object.values(edges)) {
        e.points = e.points.map(move);
        e.samples = e.samples.map(move);
        e.arrow = [move(e.arrow[0]), move(e.arrow[1]), move(e.arrow[2])];
        e.badge = move(e.badge);
        if (e.labelBox) e.labelBox = { ...e.labelBox, x: e.labelBox.x + dx, y: e.labelBox.y + dy };
        const base = { x: (e.arrow[1].x + e.arrow[2].x) / 2, y: (e.arrow[1].y + e.arrow[2].y) / 2 };
        e.d = roundedPath([...e.points.slice(0, -1), base], CORNER).d;
      }
    }
    width = Math.max(width + dx, Math.ceil(maxX + dx + MARGIN));
    height = Math.max(height + dy, Math.ceil(maxY + dy + MARGIN));
  }

  return { mode, style, width, height, nodes, edges };
}

/* ------------------------------------------------------------------ */
/* Routing helpers                                                     */
/* ------------------------------------------------------------------ */

export function orthogonalRoute(s: Pt, fromSide: Side, t: Pt, toSide: Side, laneOffset: number): Pt[] {
  const dS = normal(fromSide);
  const dT = normal(toSide);
  const hFrom = isHorizontal(fromSide);
  const hTo = isHorizontal(toSide);
  const STUB = 20;

  if (hFrom && hTo) {
    const facing = fromSide !== toSide && Math.sign(t.x - s.x) === dS.x;
    if (facing) {
      if (Math.abs(s.y - t.y) < 0.5) return [s, t];
      const mx = (s.x + t.x) / 2 + laneOffset;
      return [s, { x: mx, y: s.y }, { x: mx, y: t.y }, t];
    }
    if (fromSide === toSide) {
      const x = dS.x > 0 ? Math.max(s.x, t.x) + 24 + Math.abs(laneOffset) : Math.min(s.x, t.x) - 24 - Math.abs(laneOffset);
      return [s, { x, y: s.y }, { x, y: t.y }, t];
    }
    const s1 = { x: s.x + dS.x * STUB, y: s.y };
    const t1 = { x: t.x + dT.x * STUB, y: t.y };
    const my = (s.y + t.y) / 2 + laneOffset;
    return [s, s1, { x: s1.x, y: my }, { x: t1.x, y: my }, t1, t];
  }

  if (!hFrom && !hTo) {
    const facing = fromSide !== toSide && Math.sign(t.y - s.y) === dS.y;
    if (facing) {
      if (Math.abs(s.x - t.x) < 0.5) return [s, t];
      const my = (s.y + t.y) / 2 + laneOffset;
      return [s, { x: s.x, y: my }, { x: t.x, y: my }, t];
    }
    if (fromSide === toSide) {
      const y = dS.y > 0 ? Math.max(s.y, t.y) + 24 + Math.abs(laneOffset) : Math.min(s.y, t.y) - 24 - Math.abs(laneOffset);
      return [s, { x: s.x, y }, { x: t.x, y }, t];
    }
    const s1 = { x: s.x, y: s.y + dS.y * STUB };
    const t1 = { x: t.x, y: t.y + dT.y * STUB };
    const mx = (s.x + t.x) / 2 + laneOffset;
    return [s, s1, { x: mx, y: s1.y }, { x: mx, y: t1.y }, t1, t];
  }

  if (hFrom && !hTo) {
    // Leave sideways, arrive vertically: an L when the target lies ahead and on the entry side.
    if (Math.sign(t.x - s.x) === dS.x && Math.sign(t.y - s.y) === -dT.y) return [s, { x: t.x, y: s.y }, t];
    const s1 = { x: s.x + dS.x * STUB, y: s.y };
    const t1 = { x: t.x, y: t.y + dT.y * STUB };
    return [s, s1, { x: s1.x, y: t1.y }, t1, t];
  }

  // Leave vertically, arrive sideways.
  if (Math.sign(t.y - s.y) === dS.y && Math.sign(t.x - s.x) === -dT.x) return [s, { x: s.x, y: t.y }, t];
  const s1 = { x: s.x, y: s.y + dS.y * STUB };
  const t1 = { x: t.x + dT.x * STUB, y: t.y };
  return [s, s1, { x: t1.x, y: s1.y }, t1, t];
}

/** Drop repeated points and collinear middles. */
export function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1]!;
      const b = out[i]!;
      const c = out[i + 1]!;
      const collinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (collinear) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Path with rounded corners, plus dense samples along it. */
export function roundedPath(points: Pt[], radius: number): { d: string; samples: Pt[]; length: number } {
  if (points.length === 0) return { d: '', samples: [], length: 0 };
  const first = points[0]!;
  let d = `M${fmt(first.x)} ${fmt(first.y)}`;
  const samples: Pt[] = [first];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const c = points[i]!;
    const next = points[i + 1]!;
    const lin = dist(prev, c);
    const lout = dist(c, next);
    const r = Math.min(radius, lin / 2, lout / 2);
    const a = { x: c.x - ((c.x - prev.x) / lin) * r, y: c.y - ((c.y - prev.y) / lin) * r };
    const b = { x: c.x + ((next.x - c.x) / lout) * r, y: c.y + ((next.y - c.y) / lout) * r };
    d += ` L${fmt(a.x)} ${fmt(a.y)} Q${fmt(c.x)} ${fmt(c.y)} ${fmt(b.x)} ${fmt(b.y)}`;
    samples.push(a);
    for (const tt of [0.25, 0.5, 0.75]) {
      const u = 1 - tt;
      samples.push({ x: u * u * a.x + 2 * u * tt * c.x + tt * tt * b.x, y: u * u * a.y + 2 * u * tt * c.y + tt * tt * b.y });
    }
    samples.push(b);
  }
  const last = points[points.length - 1]!;
  d += ` L${fmt(last.x)} ${fmt(last.y)}`;
  samples.push(last);
  let length = 0;
  for (let i = 1; i < samples.length; i++) length += dist(samples[i - 1]!, samples[i]!);
  return { d, samples, length };
}

/** Point at a distance along a sampled path. */
export function pointAt(samples: Pt[], at: number): Pt {
  if (samples.length === 0) return { x: 0, y: 0 };
  let remaining = Math.max(0, at);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const len = dist(a, b);
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  return samples[samples.length - 1]!;
}

function longestSegment(points: Pt[]): [Pt, Pt] {
  let best: [Pt, Pt] = [points[0]!, points[points.length - 1]!];
  let bestLen = -1;
  for (let i = 1; i < points.length; i++) {
    const len = dist(points[i - 1]!, points[i]!);
    if (len > bestLen) {
      bestLen = len;
      best = [points[i - 1]!, points[i]!];
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Layout lint, used by the content check                              */
/* ------------------------------------------------------------------ */

function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Does an axis-aligned segment pass through the interior of a rectangle? */
export function segmentHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return minX < r.x + r.w && maxX > r.x && minY < r.y + r.h && maxY > r.y;
}

/** The longest stretch where two polylines run along the same horizontal or vertical line. */
export function collinearOverlap(a: Pt[], b: Pt[]): number {
  let worst = 0;
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const p = a[i - 1]!;
      const q = a[i]!;
      const r = b[j - 1]!;
      const s = b[j]!;
      if (Math.abs(p.y - q.y) < 0.5 && Math.abs(r.y - s.y) < 0.5 && Math.abs(p.y - r.y) < 2) {
        worst = Math.max(worst, Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)));
      }
      if (Math.abs(p.x - q.x) < 0.5 && Math.abs(r.x - s.x) < 0.5 && Math.abs(p.x - r.x) < 2) {
        worst = Math.max(worst, Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)));
      }
    }
  }
  return worst;
}

/** Problems a reader would notice: crowded cards, lines through cards, labels on lines, edges that merge. */
export function lintLayout(layout: DiagramLayout): string[] {
  const problems: string[] = [];
  const nodes = Object.values(layout.nodes);
  const edges = Object.values(layout.edges);

  // Edges with no card in common must not share a stretch of line, or they read as one connection.
  // (Edges into the same card, or out of the same card, may merge like the branches of a tree.)
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i]!;
      const f = edges[j]!;
      if (e.from === f.from || e.from === f.to || e.to === f.from || e.to === f.to) continue;
      if (collinearOverlap(e.points, f.points) > 10) problems.push(`edges "${e.id}" and "${f.id}" run along the same line (${layout.mode} layout)`);
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      if (rectsOverlap(inflate(a, 11.5), inflate(b, 11.5))) {
        problems.push(`nodes "${a.id}" and "${b.id}" are closer than 24 px (${layout.mode} layout)`);
      }
    }
  }

  for (const e of edges) {
    for (let k = 1; k < e.points.length; k++) {
      const a = e.points[k - 1]!;
      const b = e.points[k]!;
      for (const n of nodes) {
        if (n.id === e.from || n.id === e.to) continue;
        if (segmentHitsRect(a, b, inflate(n, -2))) {
          problems.push(`edge "${e.id}" passes through node "${n.id}" (${layout.mode} layout)`);
        }
      }
      for (const other of edges) {
        if (other.id === e.id || !other.labelBox) continue;
        if (segmentHitsRect(a, b, inflate(other.labelBox, -1))) {
          problems.push(`edge "${e.id}" crosses the label of edge "${other.id}" (${layout.mode} layout)`);
        }
      }
    }
    if (e.labelBox) {
      for (const n of nodes) {
        if (rectsOverlap(inflate(e.labelBox, 2), n)) {
          problems.push(`label of edge "${e.id}" overlaps node "${n.id}" (${layout.mode} layout)`);
        }
      }
      for (const other of edges) {
        if (other.id <= e.id || !other.labelBox) continue;
        if (rectsOverlap(e.labelBox, other.labelBox)) {
          problems.push(`labels of edges "${e.id}" and "${other.id}" overlap (${layout.mode} layout)`);
        }
      }
    }
  }
  return [...new Set(problems)];
}
