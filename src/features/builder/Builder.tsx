import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowLeftRight, ArrowRight, ListChecks, Move, Trash2, X } from 'lucide-react';
import type { NodeType } from '@/content/types';
import { Diagram } from '@/diagram/Diagram';
import { GlyphIcon } from '@/diagram/glyphs';
import { colorFor } from '@/diagram/types-style';
import { Button, IconButton } from '@/design/Button';
import { Dialog } from '@/design/Dialog';
import { Segmented } from '@/design/primitives';
import { useElementWidth } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import {
  CONNECTION_KINDS,
  DEFAULT_LABEL,
  GRID_COLS,
  GRID_ROWS,
  KIND_HELP,
  KIND_LABEL,
  MAX_LABEL,
  PALETTE,
  EMPTY_DESIGN,
  connect,
  disconnect,
  displayLabel,
  edgesOf,
  getNode,
  moveNode,
  nodeAt,
  placeNode,
  removeNode,
  renameNode,
  reverseConnection,
  setConnectionKind,
  toDiagramSpec,
  type BuilderDesign,
  type BuilderEdge,
  type BuilderNode,
  type ConnectionKind,
} from './model';
import { checkDesign, type CheckContext } from './rules';
import { BuilderFeedback } from './Feedback';

const TYPE_MIME = 'application/x-blueprint-type';
const NODE_MIME = 'application/x-blueprint-node';

type Mode = { kind: 'idle' } | { kind: 'place'; type: NodeType } | { kind: 'move'; id: string };
const IDLE: Mode = { kind: 'idle' };

export type ArchitectureBuilderProps = {
  design: BuilderDesign;
  onChange: (design: BuilderDesign) => void;
  /** The problem's concepts and load, for the checker. Pass a stable (memoized) object. */
  context?: CheckContext;
  /** Accessible name of the canvas. */
  label?: string;
  className?: string;
};

/**
 * The architecture builder (blueprint section 10): a palette of the diagram engine's component types,
 * a grid canvas to place and connect them, and a rule-based checker. Works by pointer (tap a component,
 * then a cell; or drag), by keyboard alone (arrow keys move around the grid), and on a phone.
 */
export function ArchitectureBuilder({ design, onChange, context, label = 'Design canvas', className }: ArchitectureBuilderProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [mode, setMode] = useState<Mode>(IDLE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [kind, setKind] = useState<ConnectionKind>('sync');
  const [message, setMessage] = useState('');
  const [focus, setFocus] = useState({ x: 0, y: 0 });
  const [checked, setChecked] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());

  const selected = getNode(design, selectedId);
  const moving = mode.kind === 'move' ? getNode(design, mode.id) : undefined;

  // A selection or move whose component is gone (cleared, or deleted elsewhere) ends.
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
    if (mode.kind === 'move' && !moving) setMode(IDLE);
  }, [selectedId, selected, mode.kind, moving]);

  // Escape cancels placing or moving from anywhere on the page.
  useEffect(() => {
    if (mode.kind === 'idle') return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode(IDLE);
        setMessage('Canceled.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode.kind]);

  const findings = useMemo(() => (checked ? checkDesign(design, context) : []), [checked, design, context]);

  const focusCell = (x: number, y: number) => {
    setFocus({ x, y });
    cellRefs.current.get(`${x},${y}`)?.focus();
  };

  const where = (x: number, y: number) => `row ${y + 1}, column ${x + 1}`;

  const place = (type: NodeType, x: number, y: number) => {
    const r = placeNode(design, type, x, y);
    if (!r.id) {
      setMessage('That cell is taken. Pick an empty cell.');
      return;
    }
    onChange(r.design);
    setSelectedId(r.id);
    setMode(IDLE);
    setMessage(`Placed ${DEFAULT_LABEL[type]} in ${where(x, y)}.`);
  };

  const move = (id: string, x: number, y: number) => {
    const node = getNode(design, id);
    if (!node) return;
    if (nodeAt(design, x, y)) {
      setMessage('That cell is taken. Pick an empty cell.');
      return;
    }
    onChange(moveNode(design, id, x, y));
    setMode(IDLE);
    setMessage(`Moved ${displayLabel(node)} to ${where(x, y)}.`);
  };

  const link = (from: string, to: string, k: ConnectionKind) => {
    const a = getNode(design, from);
    const b = getNode(design, to);
    if (!a || !b || from === to) return;
    onChange(connect(design, from, to, k));
    setMessage(`Connected ${displayLabel(a)} to ${displayLabel(b)}, ${KIND_LABEL[k].toLowerCase()}.`);
  };

  const remove = (id: string) => {
    const node = getNode(design, id);
    if (!node) return;
    onChange(removeNode(design, id));
    if (selectedId === id) setSelectedId(null);
    setMessage(`Deleted ${displayLabel(node)}.`);
  };

  const activate = (x: number, y: number) => {
    const node = nodeAt(design, x, y);
    if (mode.kind === 'move') {
      if (node?.id === mode.id) {
        setMode(IDLE);
        setMessage('Move canceled.');
      } else move(mode.id, x, y);
      return;
    }
    if (mode.kind === 'place') {
      if (node) setMessage('That cell is taken. Pick an empty cell.');
      else place(mode.type, x, y);
      return;
    }
    if (node) setSelectedId(node.id === selectedId ? null : node.id);
    else setSelectedId(null);
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const { x, y } = focus;
    let nx = x;
    let ny = y;
    switch (e.key) {
      case 'ArrowRight':
        nx = Math.min(GRID_COLS - 1, x + 1);
        break;
      case 'ArrowLeft':
        nx = Math.max(0, x - 1);
        break;
      case 'ArrowDown':
        ny = Math.min(GRID_ROWS - 1, y + 1);
        break;
      case 'ArrowUp':
        ny = Math.max(0, y - 1);
        break;
      case 'Home':
        nx = 0;
        if (e.ctrlKey) ny = 0;
        break;
      case 'End':
        nx = GRID_COLS - 1;
        if (e.ctrlKey) ny = GRID_ROWS - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activate(x, y);
        return;
      case 'Delete':
      case 'Backspace': {
        const n = nodeAt(design, x, y);
        if (n) {
          e.preventDefault();
          remove(n.id);
        }
        return;
      }
      case 'Escape':
        if (selectedId && mode.kind === 'idle') {
          e.preventDefault();
          setSelectedId(null);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    focusCell(nx, ny);
  };

  const showNode = (id: string) => {
    const n = getNode(design, id);
    if (!n) return;
    setView('edit');
    setSelectedId(id);
    window.requestAnimationFrame(() => focusCell(n.x, n.y));
  };

  const instruction =
    mode.kind === 'place'
      ? `Placing ${DEFAULT_LABEL[mode.type]}. Choose an empty cell.`
      : mode.kind === 'move' && moving
        ? `Moving ${displayLabel(moving)}. Choose an empty cell.`
        : design.nodes.length
          ? 'Select a component to rename, connect, move or delete it.'
          : 'Pick a component, then an empty cell. On a computer you can also drag it onto the canvas.';

  const spec = useMemo(() => toDiagramSpec(design), [design]);

  return (
    <div className={cn('flex min-w-0 flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={setView}
          label="Canvas view"
          size="sm"
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'preview', label: 'Preview as a diagram' },
          ]}
        />
        <div className="flex items-center gap-3">
          <span className="tabular text-small text-graphite">
            {design.nodes.length} {design.nodes.length === 1 ? 'component' : 'components'}, {design.edges.length}{' '}
            {design.edges.length === 1 ? 'connection' : 'connections'}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)} disabled={!design.nodes.length}>
            <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Clear canvas
          </Button>
        </div>
      </div>

      {view === 'edit' ? (
        <>
          <Palette armed={mode.kind === 'place' ? mode.type : null} onArm={(t) => {
            setMode(t ? { kind: 'place', type: t } : IDLE);
            setMessage(t ? `Placing ${DEFAULT_LABEL[t]}. Move to an empty cell on the canvas and press Enter.` : 'Canceled.');
          }} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn('text-ui', mode.kind === 'idle' ? 'text-graphite' : 'font-semibold text-ink')}>{instruction}</p>
            {mode.kind !== 'idle' ? (
              <Button size="sm" variant="secondary" onClick={() => setMode(IDLE)}>
                Cancel
              </Button>
            ) : null}
          </div>

          <Canvas
            design={design}
            label={label}
            mode={mode}
            selectedId={selectedId}
            focus={focus}
            cellRefs={cellRefs.current}
            onFocusCell={(x, y) => setFocus({ x, y })}
            onActivate={(x, y) => {
              setFocus({ x, y });
              activate(x, y);
            }}
            onKeyDown={onGridKey}
            onDropType={(t, x, y) => place(t, x, y)}
            onDropNode={(id, x, y) => {
              const target = nodeAt(design, x, y);
              if (!target) move(id, x, y);
              else if (target.id !== id) link(id, target.id, kind);
            }}
          />

          {selected ? (
            <Inspector
              key={selected.id}
              uid={uid}
              design={design}
              node={selected}
              kind={kind}
              onKind={setKind}
              onChange={onChange}
              onLink={link}
              onClose={() => setSelectedId(null)}
              onMove={() => {
                setMode({ kind: 'move', id: selected.id });
                setMessage(`Moving ${displayLabel(selected)}. Choose an empty cell and press Enter.`);
                focusCell(selected.x, selected.y);
              }}
              onDelete={() => remove(selected.id)}
            />
          ) : null}
        </>
      ) : spec ? (
        <Diagram spec={spec} variant="plain" />
      ) : (
        <div className="on-panel blueprint-grid flex h-48 items-center justify-center rounded-panel px-6 text-center">
          <p className="text-ui text-panel-muted">Nothing to preview yet. Switch to Edit and place a component first.</p>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {message}
      </p>

      {checked ? (
        <BuilderFeedback findings={findings} onShowNode={showNode} headingId={`${uid}-feedback`} />
      ) : (
        <div>
          <Button onClick={() => setChecked(true)}>
            <ListChecks className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Check my design
          </Button>
        </div>
      )}

      <Dialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the canvas?"
        description="This removes every component and connection from this design. It cannot be undone."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            onClick={() => {
              onChange(EMPTY_DESIGN);
              setSelectedId(null);
              setMode(IDLE);
              setConfirmClear(false);
              setMessage('Canvas cleared.');
            }}
          >
            Clear canvas
          </Button>
          <Button onClick={() => setConfirmClear(false)}>Keep my design</Button>
        </div>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

function TypeBadge({ type, size = 24 }: { type: NodeType; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[5px] bg-card"
      style={{ width: size, height: size, color: colorFor(type), boxShadow: 'inset 0 0 0 1px var(--rule)' }}
      aria-hidden
    >
      <GlyphIcon type={type} size={Math.round(size * 0.72)} />
    </span>
  );
}

function Palette({ armed, onArm }: { armed: NodeType | null; onArm: (t: NodeType | null) => void }) {
  return (
    <div role="group" aria-label="Components to place" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pt-1 pb-2 sm:flex-wrap sm:overflow-visible sm:pb-1">
      {PALETTE.map((t) => {
        const on = armed === t;
        return (
          <button
            key={t}
            type="button"
            draggable
            aria-pressed={on}
            onClick={() => onArm(on ? null : t)}
            onDragStart={(e) => {
              e.dataTransfer.setData(TYPE_MIME, t);
              e.dataTransfer.setData('text/plain', DEFAULT_LABEL[t]);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-control border pr-3 pl-1.5 text-small font-semibold whitespace-nowrap transition-colors ease-ui',
              on ? 'border-blueprint bg-blueprint-wash text-ink shadow-[inset_0_0_0_1px_var(--blueprint)]' : 'border-rule bg-paper text-ink hover:bg-wash',
            )}
          >
            <TypeBadge type={t} />
            {DEFAULT_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

const PAD = 8;
const MIN_CELL_W = 84;
const ARROW = 7;

type CanvasProps = {
  design: BuilderDesign;
  label: string;
  mode: Mode;
  selectedId: string | null;
  focus: { x: number; y: number };
  cellRefs: Map<string, HTMLDivElement>;
  onFocusCell: (x: number, y: number) => void;
  onActivate: (x: number, y: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onDropType: (type: NodeType, x: number, y: number) => void;
  onDropNode: (id: string, x: number, y: number) => void;
};

function Canvas({ design, label, mode, selectedId, focus, cellRefs, onFocusCell, onActivate, onKeyDown, onDropType, onDropNode }: CanvasProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const cellW = Math.max(MIN_CELL_W, Math.floor((width - PAD * 2) / GRID_COLS));
  const compact = cellW < 136;
  const cellH = compact ? 92 : 80;
  const insetX = compact ? 10 : 14;
  const insetY = compact ? 10 : 12;
  const cardW = cellW - insetX * 2;
  const cardH = cellH - insetY * 2;
  const gridW = cellW * GRID_COLS + PAD * 2;
  const gridH = cellH * GRID_ROWS + PAD * 2;
  const overflows = width > 0 && gridW > width + 1;
  const placing = mode.kind !== 'idle';

  const center = (n: BuilderNode) => ({ x: PAD + n.x * cellW + cellW / 2, y: PAD + n.y * cellH + cellH / 2 });

  const accepts = (e: DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    return types.includes(TYPE_MIME) || types.includes(NODE_MIME);
  };

  const rows = Array.from({ length: GRID_ROWS }, (_, y) => y);
  const cols = Array.from({ length: GRID_COLS }, (_, x) => x);

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="on-panel blueprint-grid overflow-x-auto rounded-panel">
        <div
          role="grid"
          aria-label={`${label}: ${GRID_ROWS} rows by ${GRID_COLS} columns. Use the arrow keys to move between cells.`}
          aria-rowcount={GRID_ROWS}
          aria-colcount={GRID_COLS}
          onKeyDown={onKeyDown}
          className="relative"
          style={{ width: gridW, height: gridH, padding: PAD }}
        >
          {width > 0 ? (
            <svg width={gridW} height={gridH} className="pointer-events-none absolute top-0 left-0" aria-hidden="true">
              {design.edges.map((e) => (
                <EdgeLine key={e.id} edge={e} design={design} center={center} halfW={cardW / 2 + 1.5} halfH={cardH / 2 + 1.5} />
              ))}
            </svg>
          ) : null}
          {rows.map((y) => (
            <div key={y} role="row" aria-rowindex={y + 1} className="relative flex">
              {cols.map((x) => {
                const key = `${x},${y}`;
                const node = nodeAt(design, x, y);
                const isFocus = focus.x === x && focus.y === y;
                const isSelected = Boolean(node && node.id === selectedId);
                const isMoving = Boolean(node && mode.kind === 'move' && mode.id === node.id);
                const connections = node ? edgesOf(design, node.id).length : 0;
                const cellLabel = node
                  ? `${displayLabel(node)}, ${DEFAULT_LABEL[node.type].toLowerCase()}, ${connections} ${connections === 1 ? 'connection' : 'connections'}, ${'row'} ${y + 1}, column ${x + 1}`
                  : `Empty, row ${y + 1}, column ${x + 1}`;
                return (
                  <div
                    key={key}
                    ref={(el) => {
                      if (el) cellRefs.set(key, el);
                      else cellRefs.delete(key);
                    }}
                    role="gridcell"
                    aria-colindex={x + 1}
                    aria-selected={isSelected}
                    aria-label={cellLabel}
                    tabIndex={isFocus ? 0 : -1}
                    onFocus={() => onFocusCell(x, y)}
                    onClick={() => onActivate(x, y)}
                    onDragOver={(e) => {
                      if (!accepts(e)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = Array.from(e.dataTransfer.types).includes(TYPE_MIME) ? 'copy' : 'move';
                      if (dragOver !== key) setDragOver(key);
                    }}
                    onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                    onDrop={(e) => {
                      setDragOver(null);
                      const t = e.dataTransfer.getData(TYPE_MIME);
                      const id = e.dataTransfer.getData(NODE_MIME);
                      if (!t && !id) return;
                      e.preventDefault();
                      onFocusCell(x, y);
                      if (t) onDropType(t as NodeType, x, y);
                      else onDropNode(id, x, y);
                    }}
                    className="relative flex shrink-0 cursor-pointer items-center justify-center rounded-card outline-offset-[-2px]"
                    style={{ width: cellW, height: cellH }}
                  >
                    {node ? (
                      <NodeCard node={node} compact={compact} width={cardW} height={cardH} ring={isSelected || isMoving} dropTarget={dragOver === key} />
                    ) : (
                      <span
                        aria-hidden
                        className="block rounded-card border border-dashed transition-colors ease-ui"
                        style={{
                          width: cardW,
                          height: cardH,
                          background: 'color-mix(in srgb, var(--panel-raised) 70%, transparent)',
                          borderColor: dragOver === key ? 'var(--signal)' : placing ? 'var(--panel-chip-border)' : 'var(--panel-grid-major)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {overflows ? <p className="text-small text-graphite">The canvas is wider than your screen. Scroll it sideways to reach every column.</p> : null}
    </div>
  );
}

function NodeCard({ node, compact, width, height, ring, dropTarget }: { node: BuilderNode; compact: boolean; width: number; height: number; ring: boolean; dropTarget: boolean }) {
  const color = colorFor(node.type);
  const external = node.type === 'external';
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(NODE_MIME, node.id);
        e.dataTransfer.setData('text/plain', displayLabel(node));
        e.dataTransfer.effectAllowed = 'copyMove';
      }}
      className={cn('relative flex overflow-hidden rounded-card bg-card text-card-ink', compact ? 'flex-col items-center px-1.5 pt-2.5 text-center' : 'items-center gap-2.5 pr-3 pl-4')}
      style={{
        width,
        height,
        boxShadow: ring || dropTarget ? '0 0 0 2px var(--panel), 0 0 0 4.5px var(--signal)' : undefined,
        border: external ? `1.5px dashed ${color}` : undefined,
      }}
    >
      {!external ? <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} aria-hidden /> : null}
      <span className="shrink-0" style={{ color }} aria-hidden>
        <GlyphIcon type={node.type} size={compact ? 18 : 20} />
      </span>
      <span
        className={cn(
          'line-clamp-2 min-w-0 font-semibold break-words',
          compact ? 'mt-1.5 text-[12px] leading-[15px]' : 'text-[14px] leading-[18px]',
        )}
      >
        {displayLabel(node)}
      </span>
    </span>
  );
}

function EdgeLine({
  edge,
  design,
  center,
  halfW,
  halfH,
}: {
  edge: BuilderEdge;
  design: BuilderDesign;
  center: (n: BuilderNode) => { x: number; y: number };
  halfW: number;
  halfH: number;
}) {
  const a = getNode(design, edge.from);
  const b = getNode(design, edge.to);
  if (!a || !b) return null;
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Two connections between the same pair run side by side.
  const twoWay = design.edges.some((e) => e.from === edge.to && e.to === edge.from);
  const off = twoWay ? 5 : 0;
  const px = -uy * off;
  const py = ux * off;
  const t = Math.min(ux ? halfW / Math.abs(ux) : Infinity, uy ? halfH / Math.abs(uy) : Infinity);
  const sx = ca.x + ux * t + px;
  const sy = ca.y + uy * t + py;
  const ex = cb.x - ux * t + px;
  const ey = cb.y - uy * t + py;
  const bx = ex - ux * ARROW;
  const by = ey - uy * ARROW;
  const arrow = `${ex},${ey} ${bx - uy * 4},${by + ux * 4} ${bx + uy * 4},${by - ux * 4}`;
  const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`;
  return (
    <g>
      {edge.kind === 'replication' ? (
        <>
          <path d={d} stroke="var(--panel-line)" strokeWidth={5} fill="none" />
          <path d={d} stroke="var(--panel)" strokeWidth={2} fill="none" />
        </>
      ) : (
        <path d={d} stroke="var(--panel-line)" strokeWidth={1.5} strokeDasharray={edge.kind === 'async' ? '6 5' : undefined} fill="none" />
      )}
      <polygon points={arrow} fill="var(--panel-line)" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Inspector                                                           */
/* ------------------------------------------------------------------ */

const selectClass = 'h-9 min-w-0 rounded-control border border-control bg-paper px-2 text-ui text-ink';

function Inspector({
  uid,
  design,
  node,
  kind,
  onKind,
  onChange,
  onLink,
  onClose,
  onMove,
  onDelete,
}: {
  uid: string;
  design: BuilderDesign;
  node: BuilderNode;
  kind: ConnectionKind;
  onKind: (k: ConnectionKind) => void;
  onChange: (d: BuilderDesign) => void;
  onLink: (from: string, to: string, kind: ConnectionKind) => void;
  onClose: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const edges = edgesOf(design, node.id);
  const others = design.nodes.filter((n) => n.id !== node.id);
  const [target, setTarget] = useState('');
  const targetId = others.some((n) => n.id === target) ? target : (others[0]?.id ?? '');
  const name = (id: string) => {
    const n = getNode(design, id);
    return n ? displayLabel(n) : '';
  };

  return (
    <section aria-labelledby={`${uid}-insp`} className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TypeBadge type={node.type} size={32} />
          <div className="min-w-0">
            <h3 id={`${uid}-insp`} className="truncate text-ui-lg font-semibold text-ink">
              {displayLabel(node)}
            </h3>
            <p className="text-small text-graphite">
              {DEFAULT_LABEL[node.type]}, row {node.y + 1}, column {node.x + 1}
            </p>
          </div>
        </div>
        <IconButton label="Close the component panel" onClick={onClose}>
          <X className="h-4 w-4" strokeWidth={1.5} />
        </IconButton>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-name`} className="text-ui font-semibold text-ink">
          Name
        </label>
        <input
          id={`${uid}-name`}
          value={node.label}
          maxLength={MAX_LABEL}
          onChange={(e) => onChange(renameNode(design, node.id, e.target.value))}
          onBlur={() => {
            if (!node.label.trim()) onChange(renameNode(design, node.id, DEFAULT_LABEL[node.type]));
          }}
          className="h-10 w-full max-w-sm rounded-control border border-control bg-paper px-3 text-ui-lg text-ink focus:border-blueprint"
        />
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-ui font-semibold text-ink">Connections</h4>
        {edges.length ? (
          <ul className="flex flex-col divide-y divide-rule rounded-control border border-rule">
            {edges.map((e) => {
              const desc = `${name(e.from)} to ${name(e.to)}`;
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-1.5 text-ui text-ink">
                    <span className="font-semibold">{name(e.from)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-graphite" strokeWidth={1.5} aria-label="to" />
                    <span className="font-semibold">{name(e.to)}</span>
                  </span>
                  <select
                    aria-label={`Kind of connection, ${desc}`}
                    value={e.kind}
                    onChange={(ev) => onChange(setConnectionKind(design, e.id, ev.target.value as ConnectionKind))}
                    className={selectClass}
                  >
                    {CONNECTION_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <IconButton label={`Reverse the direction, ${desc}`} size="sm" onClick={() => onChange(reverseConnection(design, e.id))}>
                    <ArrowLeftRight className="h-4 w-4" strokeWidth={1.5} />
                  </IconButton>
                  <IconButton label={`Remove the connection, ${desc}`} size="sm" onClick={() => onChange(disconnect(design, e.id))}>
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-ui text-graphite">No connections yet.</p>
        )}

        {others.length ? (
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 pt-1">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`${uid}-to`} className="text-small font-semibold text-graphite">
                {displayLabel(node)} sends to
              </label>
              <select id={`${uid}-to`} value={targetId} onChange={(e) => setTarget(e.target.value)} className={cn(selectClass, 'max-w-[16rem]')}>
                {others.map((n) => (
                  <option key={n.id} value={n.id}>
                    {displayLabel(n)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-semibold text-graphite">Kind</span>
              <Segmented
                value={kind}
                onChange={onKind}
                label="Kind of new connection"
                size="sm"
                options={CONNECTION_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
            </div>
            <Button size="sm" variant="primary" onClick={() => targetId && onLink(node.id, targetId, kind)}>
              Add connection
            </Button>
          </div>
        ) : (
          <p className="text-ui text-graphite">Place another component to connect this one to it.</p>
        )}
        <p className="text-small text-graphite">
          Sync {KIND_HELP.sync}, async {KIND_HELP.async} (dashed), replication {KIND_HELP.replication} (double line). On a computer, drag one component onto another to connect them.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
        <Button size="sm" onClick={onMove}>
          <Move className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Move
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Delete
        </Button>
      </div>
    </section>
  );
}
