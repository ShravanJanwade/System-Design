import { useId, type KeyboardEvent } from 'react';
import { placeBadges, placeChips } from './chips';
import { Glyph } from './glyphs';
import { ROW_CARD, STACK_CARD, type DiagramLayout, type NodeBox, type EdgeRoute } from './layout';
import { EdgeLabel, HatchPattern, SvgChip } from './svg-parts';
import { colorFor } from './types-style';
import type { StepView } from './steps';
import type { Dot, Tag } from './useFlowPlayback';

export type NodeInteraction = {
  /** Called when a learner picks a node (spot-the-bottleneck questions). */
  onSelect: (id: string) => void;
  selected: string | null;
  /** After checking: the right answer, so it can be marked. */
  reveal?: string | null;
  disabled?: boolean;
};

type Props = {
  layout: DiagramLayout;
  view: StepView;
  highlighted: string[];
  dots: Dot[];
  tags: Tag[];
  reduced: boolean;
  scale: number;
  label: string;
  interaction?: NodeInteraction;
};

/**
 * Components outside a step's focus recede (section 5). Lines fade to DIM_LINE, which keeps 3:1 on the panel;
 * cards and edge labels turn into dark "ghost" shapes with muted text instead of fading, so their labels stay AA-readable.
 */
const DIM = 0.35;
const DIM_LINE = 0.42;
const fade = { transition: 'opacity 200ms var(--ease-out)' };
const ghostFade = { transition: 'fill 200ms var(--ease-out), stroke 200ms var(--ease-out)' };

function cleanId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function DiagramSvg({ layout, view, highlighted, dots, tags, reduced, scale, label, interaction }: Props) {
  const uid = cleanId(useId());
  const hatchId = `hatch-${uid}`;
  const edges = Object.values(layout.edges);
  const nodes = Object.values(layout.nodes);

  const opacityOf = (id: string) => {
    if (!view.visible.has(id)) return 0;
    if (view.focus && !view.focus.has(id)) return DIM;
    return 1;
  };

  // Flow edges, numbered in travel order, for highlighting and reduced-motion badges.
  const flowOrder: { edge: string; reverse: boolean; n: number }[] = [];
  view.flow.forEach((group, gi) => group.forEach((hop) => flowOrder.push({ edge: hop.edge, reverse: hop.reverse, n: gi + 1 })));
  const flowEdges = new Set(flowOrder.map((f) => f.edge));

  // Step notes, arrival tags and "Down" tags, placed by the same function the layout check uses.
  const chips = placeChips(layout, view, tags);

  return (
    <svg
      width={layout.width * scale}
      height={layout.height * scale}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={label}
      className="block max-w-none"
    >
      <defs>
        <HatchPattern id={hatchId} />
        {nodes.map((n) => (
          <clipPath key={n.id} id={`clip-${uid}-${cleanId(n.id)}`}>
            <rect width={n.w} height={n.h} rx={8} />
          </clipPath>
        ))}
      </defs>

      {/* Edges */}
      {edges.map((e) => {
        const o = Math.min(opacityOf(e.id), opacityOf(e.from), opacityOf(e.to));
        return <EdgeShape key={e.id} edge={e} opacity={o === DIM ? DIM_LINE : o} active={reduced && flowEdges.has(e.id)} />;
      })}

      {/* Edge labels sit above every line so lines never cross them */}
      {edges.map((e) => {
        if (!e.labelBox || !e.label) return null;
        const o = Math.min(opacityOf(e.id), opacityOf(e.from), opacityOf(e.to));
        return (
          <g key={`label-${e.id}`} opacity={o === 0 ? 0 : 1} style={fade}>
            <EdgeLabel x={e.labelBox.x} y={e.labelBox.y} w={e.labelBox.w} text={e.label} dimmed={o === DIM} />
          </g>
        );
      })}

      {/* Nodes */}
      {nodes.map((n) => (
        <NodeCard
          key={n.id}
          node={n}
          uid={uid}
          hatchId={hatchId}
          opacity={opacityOf(n.id) === 0 ? 0 : 1}
          dimmed={opacityOf(n.id) === DIM}
          failed={view.failed.has(n.id)}
          highlighted={highlighted.includes(n.id)}
          interaction={interaction}
        />
      ))}

      {/* Step notes on edges, then "Down" tags and node chips */}
      {chips.map((c) => (
        <SvgChip key={`${c.kind}-${c.owner}-${c.x}-${c.text}`} x={c.x} y={c.y} text={c.text} tone={c.tone} />
      ))}

      {/* Reduced motion: numbered badges in travel order instead of moving dots */}
      {reduced
        ? placeBadges(layout, view, chips).map((b, i) => (
            <g key={`badge-${i}`} transform={`translate(${b.x} ${b.y})`}>
              <circle r={9} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2} />
              <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--on-signal)">
                {b.n}
              </text>
            </g>
          ))
        : null}

      {/* Request dots */}
      {dots.map((d) => (
        <g key={d.key} transform={`translate(${d.x} ${d.y})`}>
          <circle r={10} fill={d.tone === 'alert' ? 'var(--panel-alert)' : 'var(--signal)'} opacity={0.22} />
          <circle r={5.5} fill={d.tone === 'alert' ? 'var(--panel-alert)' : 'var(--signal)'} stroke="var(--panel)" strokeWidth={2} />
        </g>
      ))}
    </svg>
  );
}

function EdgeShape({ edge, opacity, active }: { edge: EdgeRoute; opacity: number; active: boolean }) {
  const color = active ? 'var(--signal)' : 'var(--panel-line)';
  return (
    <g opacity={opacity} style={fade}>
      {edge.kind === 'replication' ? (
        <>
          <path d={edge.d} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" />
          <path d={edge.d} fill="none" stroke="var(--panel)" strokeWidth={2} strokeLinejoin="round" />
        </>
      ) : (
        <path
          d={edge.d}
          fill="none"
          stroke={color}
          strokeWidth={active ? 2 : 1.5}
          strokeDasharray={edge.kind === 'async' ? '6 5' : undefined}
          strokeLinejoin="round"
        />
      )}
      <polygon points={edge.arrow.map((p) => `${p.x},${p.y}`).join(' ')} fill={color} />
    </g>
  );
}

function NodeCard({
  node,
  uid,
  hatchId,
  opacity,
  dimmed,
  failed,
  highlighted,
  interaction,
}: {
  node: NodeBox;
  uid: string;
  hatchId: string;
  opacity: number;
  /** Outside the step's focus: drawn as a ghost card (a failed card keeps its full look). */
  dimmed: boolean;
  failed: boolean;
  highlighted: boolean;
  interaction?: NodeInteraction;
}) {
  const color = colorFor(node.type);
  const external = node.type === 'external';
  const isRow = node.style === 'row';
  const selected = interaction?.selected === node.id;
  const revealCorrect = interaction?.reveal != null && interaction.reveal === node.id;
  const revealWrong = interaction?.reveal != null && selected && interaction.reveal !== node.id;

  let ring: string | null = null;
  if (revealCorrect) ring = 'var(--panel-success)';
  else if (revealWrong) ring = 'var(--panel-alert)';
  else if (selected || highlighted) ring = 'var(--signal)';

  const clickable = interaction && !interaction.disabled;
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (!clickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      interaction.onSelect(node.id);
    }
  };

  const textLines = isRow ? rowText(node) : stackText(node);
  const ghost = dimmed && !failed;

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      opacity={opacity}
      style={{ ...fade, cursor: clickable ? 'pointer' : undefined }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${node.label}${selected ? ', selected' : ''}` : undefined}
      aria-pressed={clickable ? selected : undefined}
      onClick={clickable ? () => interaction.onSelect(node.id) : undefined}
      onKeyDown={onKeyDown}
      className={clickable ? 'diagram-node-button' : undefined}
    >
      {ring ? <rect x={-5} y={-5} width={node.w + 10} height={node.h + 10} rx={12} fill="none" stroke={ring} strokeWidth={2.5} /> : null}
      <rect
        width={node.w}
        height={node.h}
        rx={8}
        fill={ghost ? 'var(--panel-raised)' : 'var(--card)'}
        stroke={ghost ? 'var(--panel-chip-border)' : external ? color : 'none'}
        strokeWidth={ghost ? 1 : external ? 1.5 : 0}
        strokeDasharray={external ? '5 4' : undefined}
        style={ghostFade}
      />
      {failed ? <rect width={node.w} height={node.h} rx={8} fill={`url(#${hatchId})`} /> : null}
      {!external ? (
        <rect width={4} height={node.h} fill={color} opacity={ghost ? DIM : 1} clipPath={`url(#clip-${uid}-${cleanId(node.id)})`} style={fade} />
      ) : null}
      <g opacity={ghost ? 0.55 : 1} style={fade}>
        <Glyph
          type={node.type}
          x={isRow ? ROW_CARD.padL : node.w / 2 - STACK_CARD.glyph / 2}
          y={isRow ? node.h / 2 - ROW_CARD.glyph / 2 : STACK_CARD.padTop}
          size={20}
          color={failed ? 'var(--card-alert)' : ghost ? 'var(--panel-muted)' : color}
        />
      </g>
      {textLines.map((t, i) => (
        <text
          key={i}
          x={t.x}
          y={t.y}
          textAnchor={isRow ? 'start' : 'middle'}
          fontSize={t.size}
          fontWeight={t.weight}
          fill={ghost ? 'var(--panel-muted)' : t.muted ? 'var(--card-muted)' : 'var(--card-ink)'}
          style={ghostFade}
        >
          {t.text}
        </text>
      ))}
      {failed ? <rect x={-1} y={-1} width={node.w + 2} height={node.h + 2} rx={9} fill="none" stroke="var(--panel-alert)" strokeWidth={2} /> : null}
    </g>
  );
}

type TextLine = { text: string; x: number; y: number; size: number; weight: number; muted?: boolean };

function rowText(node: NodeBox): TextLine[] {
  const c = ROW_CARD;
  const blockH = node.lines.length * c.lineH + node.subLines.length * c.subLineH;
  const top = (node.h - blockH) / 2;
  const x = c.padL + c.glyph + c.gap;
  const out: TextLine[] = [];
  node.lines.forEach((l, i) => out.push({ text: l, x, y: top + 13.5 + i * c.lineH, size: c.label, weight: 600 }));
  const subTop = top + node.lines.length * c.lineH;
  node.subLines.forEach((l, i) => out.push({ text: l, x, y: subTop + 12 + i * c.subLineH, size: c.sub, weight: 400, muted: true }));
  return out;
}

function stackText(node: NodeBox): TextLine[] {
  const c = STACK_CARD;
  const x = node.w / 2;
  const top = c.padTop + c.glyph + c.glyphGap;
  const out: TextLine[] = [];
  node.lines.forEach((l, i) => out.push({ text: l, x, y: top + 13 + i * c.lineH, size: c.label, weight: 600 }));
  const subTop = top + node.lines.length * c.lineH;
  node.subLines.forEach((l, i) => out.push({ text: l, x, y: subTop + 12 + i * c.subLineH, size: c.sub, weight: 400, muted: true }));
  return out;
}
