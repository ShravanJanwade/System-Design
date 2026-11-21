import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Pause, Play, RotateCcw, SkipForward, StepForward } from 'lucide-react';
import { Button } from '@/design/Button';
import { Slider } from '@/design/primitives';
import { formatInt } from '@/lib/format';
import { useReducedMotion } from '@/state/settings';
import { ControlPanel } from '@/simulators/shared/SimParts';
import type { WidgetProps } from '../registry';
import {
  FAN_OUT,
  MATCH_CELL,
  SCAN_CELLS,
  TABLE_SIZES,
  TICKS_PER_INDEX_PAGE,
  btreeLevels,
  compare,
  formatDuration,
  formatRows,
  formatTimes,
  frameAt,
  totalTicks,
  type Frame,
} from './logic';

/** One animation tick. The scan takes SCAN_CELLS ticks (about 10 s); the index takes a few. */
const TICK_MS = 50;
/** Which page the lookup visits on each level, left to right, so the path zigzags like a real descent. */
const PATH_SLOTS = [0, 1, 2, 1, 2, 1];
/** The deepest tree the slider can produce, so the drawing keeps one height at every size. */
const MAX_LEVELS = btreeLevels(TABLE_SIZES[TABLE_SIZES.length - 1]!);

function nearestSizeIndex(rows: number): number {
  let best = 0;
  for (let i = 1; i < TABLE_SIZES.length; i++) {
    if (Math.abs(Math.log(TABLE_SIZES[i]!) - Math.log(rows)) < Math.abs(Math.log(TABLE_SIZES[best]!) - Math.log(rows))) best = i;
  }
  return best;
}

function plural(n: number, one: string, many: string): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}

export default function IndexScanWidget({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const startRows = typeof props?.rows === 'number' && props.rows > 0 ? props.rows : 50_000_000;
  const [sizeIndex, setSizeIndex] = useState(() => nearestSizeIndex(startRows));
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);

  const rows = TABLE_SIZES[sizeIndex]!;
  const cmp = useMemo(() => compare(rows), [rows]);
  const end = totalTicks();
  const frame = frameAt(rows, tick);
  const running = playing && !reduced && tick < end;

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => setTick((v) => Math.min(end, v + 1)), TICK_MS);
    return () => window.clearTimeout(t);
  }, [running, tick, end]);

  const changeSize = (i: number) => {
    setSizeIndex(i);
    setTick(0);
    setPlaying(false);
  };
  const togglePlay = () => {
    if (running) return setPlaying(false);
    if (reduced) {
      setTick(end);
      return setPlaying(false);
    }
    if (tick >= end) setTick(0);
    setPlaying(true);
  };
  const stepForward = () => {
    setPlaying(false);
    setTick((v) => Math.min(end, v + TICKS_PER_INDEX_PAGE));
  };
  const restart = () => {
    setPlaying(false);
    setTick(0);
  };
  const skipToEnd = () => {
    setPlaying(false);
    setTick(end);
  };

  const levels = cmp.index.levels;
  const perCell = rows / SCAN_CELLS;

  const scanStatus = frame.scanDone
    ? `Checked all ${formatRows(rows)} rows.`
    : frame.scanCells === 0
      ? `Ready to check ${formatRows(rows)} rows, one by one.`
      : `Checked ${formatRows(frame.scanRows)} of ${formatRows(rows)} rows.${frame.scanPassedMatch ? ' Passed a match, but there could be more, so it keeps going.' : ''}`;
  const indexStatus = frame.indexDone
    ? `Found the row after ${cmp.index.pagesRead} page reads: ${levels} levels, then the row itself.`
    : frame.indexPages === 0
      ? `Ready to walk ${plural(levels, 'level', 'levels')} down from the root.`
      : `Read ${frame.indexPages} of ${cmp.index.pagesRead} pages.`;

  // Announced only at milestones, so screen readers are not flooded on every tick.
  const milestone = [
    frame.indexDone ? 'Index lookup finished.' : frame.indexPages > 0 ? `Index lookup: page ${frame.indexPages} of ${cmp.index.pagesRead}.` : '',
    frame.scanDone ? 'Scan finished.' : frame.scanPassedMatch ? 'The scan passed a match and keeps checking.' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const speedup = cmp.speedup;
  const summary =
    speedup >= 3
      ? `At ${formatRows(rows)} rows, the index lookup is about ${formatTimes(speedup)} times faster than the scan (ballpark).`
      : speedup >= 1
        ? `At ${formatRows(rows)} rows, the two cost about the same: the table is small enough to scan.`
        : `At ${formatRows(rows)} rows, the scan is quicker: there is too little to search for the index to pay off.`;

  const playLabel = running ? 'Pause' : reduced ? 'Show the result' : tick >= end ? 'Play again' : tick > 0 ? 'Resume' : 'Play';

  return (
    <div className="flex flex-col gap-4">
      <div className="on-panel blueprint-grid rounded-panel p-4 sm:p-5">
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-label="Full table scan" className="flex min-w-0 flex-col gap-2">
            <div>
              <p className="text-ui font-semibold text-panel-text">Full table scan</p>
              <p className="tabular min-h-10 text-small text-panel-muted">{scanStatus}</p>
            </div>
            <ScanGrid
              frame={frame}
              label={`Full table scan of ${formatRows(rows)} rows, drawn as ${SCAN_CELLS} squares of ${formatRows(perCell)} rows each. ${scanStatus}`}
            />
            <p className="text-small text-panel-muted">Each square stands for {plural(perCell, 'row', 'rows')}.</p>
          </section>
          <section aria-label="Index lookup" className="flex min-w-0 flex-col gap-2">
            <div>
              <p className="text-ui font-semibold text-panel-text">Index lookup (B-tree)</p>
              <p className="tabular min-h-10 text-small text-panel-muted">{indexStatus}</p>
            </div>
            <BTreeView
              rows={rows}
              levelPages={cmp.index.levelPages}
              pagesRead={frame.indexPages}
              label={`B-tree index with ${plural(levels, 'level', 'levels')}: ${cmp.index.levelPages
                .map((p, i) => `${i === 0 ? 'root' : i === levels - 1 ? 'leaves' : `level ${i + 1}`}, ${plural(p, 'page', 'pages')}`)
                .join('; ')}. ${indexStatus}`}
            />
            <p className="text-small text-panel-muted">Each page points to about {FAN_OUT} pages on the level below.</p>
          </section>
        </div>
        <p className="mt-4 text-small text-panel-muted">
          Not to scale: here both sides move at the same pace, but the scan has {formatRows(rows)} rows to check, as the numbers below show.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="overflow-x-auto rounded-card border border-rule bg-paper">
          <table className="tabular w-full border-collapse text-left text-ui">
            <caption className="sr-only">Ballpark cost of each method on a table of {formatRows(rows)} rows</caption>
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="px-3 py-2.5 font-semibold text-graphite sm:px-4">
                  {formatRows(rows)} rows
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-ink sm:px-4">
                  Full table scan
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold text-ink sm:px-4">
                  Index lookup
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-rule">
                <th scope="row" className="px-3 py-2.5 font-normal text-graphite sm:px-4">
                  Rows checked
                </th>
                <td className="px-3 py-2.5 text-ink sm:px-4">{formatInt(cmp.scan.rowsChecked)}</td>
                <td className="px-3 py-2.5 text-ink sm:px-4">{formatInt(cmp.index.rowsChecked)}</td>
              </tr>
              <tr className="border-b border-rule">
                <th scope="row" className="px-3 py-2.5 font-normal text-graphite sm:px-4">
                  Pages read
                </th>
                <td className="px-3 py-2.5 text-ink sm:px-4">{formatInt(cmp.scan.pagesRead)}</td>
                <td className="px-3 py-2.5 text-ink sm:px-4">
                  {cmp.index.pagesRead} <span className="text-graphite">({plural(levels, 'level', 'levels')} + the row)</span>
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-3 py-2.5 font-normal text-graphite sm:px-4">
                  Ballpark time
                </th>
                <td className="px-3 py-2.5 font-semibold text-ink sm:px-4">{formatDuration(cmp.scan.ms)}</td>
                <td className="px-3 py-2.5 font-semibold text-ink sm:px-4">{formatDuration(cmp.index.ms)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-ui text-ink">{summary}</p>
      </div>

      <ControlPanel>
        <Slider
          id="index-scan-rows"
          label="Table size"
          value={sizeIndex}
          min={0}
          max={TABLE_SIZES.length - 1}
          onChange={changeSize}
          format={(i) => `${formatRows(TABLE_SIZES[i]!)} rows`}
          hint="A log scale: each notch roughly doubles the table."
        />
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">Animation</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={togglePlay}>
              {running ? <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
              {playLabel}
            </Button>
            <Button size="sm" onClick={stepForward} disabled={tick >= end}>
              <StepForward className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Step forward
            </Button>
            {reduced ? null : (
              <Button size="sm" variant="ghost" onClick={skipToEnd} disabled={tick >= end}>
                <SkipForward className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Skip to the end
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={restart} disabled={tick === 0}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Restart
            </Button>
          </div>
          <p className="text-small text-graphite">Each step reads one more index page and checks {(TICKS_PER_INDEX_PAGE / SCAN_CELLS) * 100}% more of the table.</p>
        </div>
      </ControlPanel>

      <p className="sr-only" aria-live="polite">
        {milestone}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Full table scan: the table drawn as a grid of squares               */
/* ------------------------------------------------------------------ */

const GRID_COLS = 20;
const CELL = 12;
const PITCH = 14;
const SCAN_W = GRID_COLS * PITCH + 2;
const SCAN_H = (SCAN_CELLS / GRID_COLS) * PITCH + 2;

function ScanGrid({ frame, label }: { frame: Frame; label: string }) {
  const cells: ReactElement[] = [];
  for (let i = 0; i < SCAN_CELLS; i++) {
    const x = 2 + (i % GRID_COLS) * PITCH;
    const y = 2 + Math.floor(i / GRID_COLS) * PITCH;
    const checked = i < frame.scanCells;
    const current = checked && !frame.scanDone && i === frame.scanCells - 1;
    const match = i === MATCH_CELL && checked;
    if (current || match) {
      cells.push(
        <rect
          key={i}
          x={x}
          y={y}
          width={CELL}
          height={CELL}
          rx={2}
          fill="var(--signal)"
          stroke={match ? 'var(--panel-line)' : 'none'}
          strokeWidth={match ? 1.5 : 0}
        />,
      );
    } else if (checked) {
      cells.push(<rect key={i} x={x} y={y} width={CELL} height={CELL} rx={2} fill="var(--panel-line)" fillOpacity={0.5} />);
    } else {
      cells.push(
        <rect key={i} x={x + 0.5} y={y + 0.5} width={CELL - 1} height={CELL - 1} rx={2} fill="none" stroke="var(--panel-line)" strokeOpacity={0.3} />,
      );
    }
  }
  return (
    <svg viewBox={`0 0 ${SCAN_W} ${SCAN_H}`} width="100%" role="img" aria-label={label} className="block h-auto w-full">
      {cells}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Index lookup: a B-tree, one row of pages per level                  */
/* ------------------------------------------------------------------ */

const SLOT_W = 32;
const SLOT_H = 22;
const SLOT_GAP = 5;
const MAX_SLOTS = 5;
const ROW_PITCH = 40;
const TOP = 6;
const AREA_W = MAX_SLOTS * SLOT_W + (MAX_SLOTS - 1) * SLOT_GAP;
const LABEL_X = 4 + AREA_W + 12;
const TREE_W = 300;
const TREE_H = TOP + MAX_LEVELS * ROW_PITCH + SLOT_H + 6;

type LevelLayout = { y: number; boxes: number[]; ellipsisX: number | null; chosenX: number; pages: number };

function layoutLevels(levelPages: number[]): LevelLayout[] {
  return levelPages.map((pages, level) => {
    const drawn = pages > MAX_SLOTS ? MAX_SLOTS - 1 : pages;
    const slots = pages > MAX_SLOTS ? MAX_SLOTS : drawn;
    const width = slots * SLOT_W + (slots - 1) * SLOT_GAP;
    const left = 4 + (AREA_W - width) / 2;
    const boxes = Array.from({ length: drawn }, (_, s) => left + s * (SLOT_W + SLOT_GAP));
    const chosen = Math.min(PATH_SLOTS[level] ?? 1, drawn - 1);
    return {
      y: TOP + level * ROW_PITCH,
      boxes,
      ellipsisX: pages > MAX_SLOTS ? left + drawn * (SLOT_W + SLOT_GAP) + SLOT_W / 2 : null,
      chosenX: boxes[chosen]! + SLOT_W / 2,
      pages,
    };
  });
}

function BTreeView({ rows, levelPages, pagesRead, label }: { rows: number; levelPages: number[]; pagesRead: number; label: string }) {
  const levels = layoutLevels(levelPages);
  const count = levels.length;
  const rowY = TOP + MAX_LEVELS * ROW_PITCH;
  const found = pagesRead >= count + 1;
  const leaf = levels[count - 1]!;
  const on = 'var(--signal)';

  return (
    <svg viewBox={`0 0 ${TREE_W} ${TREE_H}`} width="100%" role="img" aria-label={label} className="block h-auto w-full">
      {/* Pointers between levels, drawn first so the pages sit on top */}
      {levels.slice(0, -1).map((lv, i) => {
        const next = levels[i + 1]!;
        const lit = pagesRead > i + 1;
        const mid = lv.y + SLOT_H + 9;
        return (
          <path
            key={`p${i}`}
            d={`M${lv.chosenX} ${lv.y + SLOT_H} V${mid} H${next.chosenX} V${next.y}`}
            fill="none"
            stroke={lit ? on : 'var(--panel-line)'}
            strokeOpacity={lit ? 1 : 0.4}
            strokeWidth={lit ? 2 : 1.25}
          />
        );
      })}
      <path
        d={`M${leaf.chosenX} ${leaf.y + SLOT_H} V${rowY}`}
        fill="none"
        stroke={found ? on : 'var(--panel-line)'}
        strokeOpacity={found ? 1 : 0.4}
        strokeWidth={found ? 2 : 1.25}
        strokeDasharray="4 3"
      />

      {levels.map((lv, i) => (
        <g key={`l${i}`}>
          {lv.boxes.map((x, s) => {
            const read = pagesRead > i && x + SLOT_W / 2 === lv.chosenX;
            return (
              <rect
                key={s}
                x={x + 0.5}
                y={lv.y + 0.5}
                width={SLOT_W - 1}
                height={SLOT_H - 1}
                rx={3}
                fill={read ? on : 'var(--panel)'}
                stroke={read ? on : 'var(--panel-line)'}
                strokeOpacity={read ? 1 : 0.45}
              />
            );
          })}
          {lv.ellipsisX !== null ? (
            <text x={lv.ellipsisX} y={lv.y + 15} textAnchor="middle" fontSize={13} fill="var(--panel-muted)">
              …
            </text>
          ) : null}
          <text x={LABEL_X} y={lv.y + 9} fontSize={11} fontWeight={600} fill="var(--panel-text)">
            {i === 0 ? (count === 1 ? 'Root and leaf' : 'Root') : i === count - 1 ? 'Leaves' : `Level ${i + 1}`}
          </text>
          <text x={LABEL_X} y={lv.y + 22} fontSize={11} fill="var(--panel-muted)" className="tabular">
            {plural(lv.pages, 'page', 'pages')}
          </text>
        </g>
      ))}

      <rect
        x={4.5}
        y={rowY + 0.5}
        width={AREA_W - 1}
        height={SLOT_H - 1}
        rx={3}
        fill={found ? 'var(--card)' : 'var(--panel)'}
        stroke={found ? 'none' : 'var(--panel-line)'}
        strokeOpacity={0.45}
      />
      <text x={4 + AREA_W / 2} y={rowY + 15} textAnchor="middle" fontSize={11} fontWeight={600} fill={found ? 'var(--card-ink)' : 'var(--panel-muted)'}>
        {found ? 'Matching row' : 'Row in the table'}
      </text>
      <text x={LABEL_X} y={rowY + 9} fontSize={11} fontWeight={600} fill="var(--panel-text)">
        Table
      </text>
      <text x={LABEL_X} y={rowY + 22} fontSize={11} fill="var(--panel-muted)" className="tabular">
        {formatRows(rows)} rows
      </text>
    </svg>
  );
}
