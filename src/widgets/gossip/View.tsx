import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, Shuffle, StepForward } from 'lucide-react';
import { Button } from '@/design/Button';
import { Slider } from '@/design/primitives';
import { formatInt } from '@/lib/format';
import { useElementWidth } from '@/lib/hooks';
import { ControlPanel, Stat } from '@/simulators/shared/SimParts';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  DOWN,
  MAX_FANOUT,
  MAX_NODES,
  MIN_FANOUT,
  MIN_NODES,
  NODE_STEP,
  ORIGIN,
  clampFanout,
  clampNodes,
  gridLayout,
  knownAt,
  messagesUpTo,
  roundsBySize,
  roundsPerDoubling,
  runGossip,
  type GossipRun,
} from './logic';

const ORIGIN_NAME = `cache node ${ORIGIN + 1}`;
const DOWN_NAME = `cache node ${DOWN + 1}`;

/**
 * A cluster on the blueprint panel. One node learns that another is down, and each round every
 * node that knows tells `fanout` random others. Step or play the rounds, then compare sizes.
 */
export default function GossipWidget({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const [nodes, setNodes] = useState(() => clampNodes(props?.nodes));
  const [fanout, setFanout] = useState(() => clampFanout(props?.fanout));
  const [seed, setSeed] = useState(() => (typeof props?.seed === 'number' ? Math.round(props.seed) : 7));
  const [round, setRound] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [measureRef, width] = useElementWidth<HTMLDivElement>();

  const run = useMemo(() => runGossip(nodes, fanout, seed), [nodes, fanout, seed]);
  const total = run.rounds.length;
  const done = round >= total;
  const running = playing && !done;
  const sizes = useMemo(() => roundsBySize(fanout, 40), [fanout]);
  const perDoubling = roundsPerDoubling(sizes);

  // Rounds are discrete states: play just steps through them on a timer.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setRound((r) => Math.min(total, r + 1)), reduced ? 1200 : 800);
    return () => window.clearTimeout(id);
  }, [running, round, total, reduced]);

  const restart = () => {
    setRound(0);
    setPlaying(false);
  };
  const changeNodes = (v: number) => {
    setNodes(clampNodes(v));
    restart();
  };
  const changeFanout = (v: number) => {
    setFanout(clampFanout(v));
    restart();
  };
  const reshuffle = () => {
    setSeed((s) => s + 1);
    restart();
  };
  const step = () => {
    setPlaying(false);
    setRound((r) => Math.min(total, r + 1));
  };
  const togglePlay = () => {
    if (running) {
      setPlaying(false);
      return;
    }
    if (done) setRound(0);
    setPlaying(true);
  };

  const known = knownAt(run, round);
  const sentThisRound = round > 0 ? run.rounds[round - 1]!.length : 0;
  const newThisRound = round > 0 ? run.rounds[round - 1]!.filter((m) => m.news).length : 0;
  const message =
    round === 0
      ? `Round 0: ${ORIGIN_NAME} has just noticed that ${DOWN_NAME} stopped sending heartbeats. It is the only node that knows.`
      : done
        ? `Round ${round}: all ${formatInt(run.live)} live nodes know, after ${formatInt(messagesUpTo(run, round))} messages. The last few took a while: by then, most messages went to nodes that already knew.`
        : `Round ${round}: ${formatInt(sentThisRound)} messages, ${formatInt(newThisRound)} of them news to the node that got them. ${formatInt(known)} of ${formatInt(run.live)} live nodes know.`;

  return (
    <div className="flex flex-col gap-5">
      <div className="on-panel blueprint-grid flex flex-col gap-3 rounded-panel p-3 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-ui font-semibold text-panel-text">The news: {DOWN_NAME} is down</span>
          <span className="tabular text-small text-panel-muted">
            Round {round}: {formatInt(known)} of {formatInt(run.live)} know
          </span>
        </div>
        <div ref={measureRef} className="w-full">
          {width > 0 ? <ClusterSvg run={run} round={round} width={width} reduced={reduced} /> : <div style={{ height: 240 }} />}
        </div>
      </div>
      <p className="measure text-small text-graphite">
        Outlined squares have not heard yet; filled ones know. A ring marks nodes that heard this round. The crossed square is {DOWN_NAME} itself, which is down
        and never answers. Lines show this round’s messages; faint ones went to nodes that already knew.
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Round" value={formatInt(round)} note={done ? 'everyone knows' : 'keep stepping'} />
        <Stat label="Nodes that know" value={`${formatInt(known)}`} note={`of ${formatInt(run.live)} live nodes`} />
        <Stat label="Messages so far" value={formatInt(messagesUpTo(run, round))} note={`${fanout} per informed node per round`} />
        <Stat label="Rounds to reach all" value={done ? formatInt(total) : '–'} note={done ? `for ${formatInt(nodes)} nodes` : 'shown when everyone knows'} tone={done ? 'success' : 'ink'} />
      </div>

      <ControlPanel>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={step} disabled={done}>
              <StepForward className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Next round
            </Button>
            <Button onClick={togglePlay} aria-pressed={running}>
              {running ? <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
              {running ? 'Pause' : done ? 'Play again' : 'Play the rounds'}
            </Button>
            <Button variant="ghost" onClick={restart} disabled={round === 0}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Back to round 0
            </Button>
            <Button variant="ghost" onClick={reshuffle}>
              <Shuffle className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              New random run
            </Button>
          </div>
          <p aria-live="polite" className="min-h-[2.5rem] text-ui text-graphite">
            {message}
          </p>
        </div>
        <Slider
          id="gossip-nodes"
          label="Nodes in the cluster"
          value={nodes}
          min={MIN_NODES}
          max={MAX_NODES}
          step={NODE_STEP}
          onChange={changeNodes}
          format={(v) => `${v} nodes`}
          hint="Snapgram’s cache cluster has 200."
        />
        <Slider
          id="gossip-fanout"
          label="Fanout"
          value={fanout}
          min={MIN_FANOUT}
          max={MAX_FANOUT}
          onChange={changeFanout}
          format={(v) => (v === 1 ? '1 peer per round' : `${v} peers per round`)}
          hint="How many random nodes each informed node tells per round."
        />
      </ControlPanel>

      <SizeTable rows={sizes} nodes={nodes} fanout={fanout} perDoubling={perDoubling} />
    </div>
  );
}

/** The cluster as a grid of squares on the blueprint panel, with this round’s messages as lines. */
function ClusterSvg({ run, round, width, reduced }: { run: GossipRun; round: number; width: number; reduced: boolean }) {
  const g = gridLayout(run.n, width);
  const pad = 8;
  const at = (i: number) => ({ x: g.offsetX + (i % g.cols) * g.cell + g.cell / 2, y: pad + Math.floor(i / g.cols) * g.cell + g.cell / 2 });
  const size = Math.max(7, g.cell * 0.56);
  const messages = round > 0 ? (run.rounds[round - 1] ?? []) : [];
  const known = knownAt(run, round);
  const label =
    `A cluster of ${run.n} cache nodes drawn as a grid. ${ORIGIN_NAME} noticed first; ${DOWN_NAME} is down. ` +
    `After round ${round}, ${known} of ${run.live} live nodes know${round > 0 ? `, ${run.rounds[round - 1]!.filter((m) => m.news).length} of them heard this round` : ''}.`;
  const transition = reduced ? undefined : 'fill 240ms ease-out, stroke 240ms ease-out';

  return (
    <svg width={width} height={g.height} role="img" aria-label={label} className="block select-none">
      <g aria-hidden>
        {messages.map((m, i) => {
          const a = at(m.from);
          const b = at(m.to);
          return (
            <line
              key={`${round}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--panel-line)"
              strokeOpacity={m.news ? 0.75 : 0.16}
              strokeWidth={m.news ? 1.25 : 1}
            />
          );
        })}
        {run.learnedAt.map((r, i) => {
          const { x, y } = at(i);
          const down = i === DOWN;
          const knows = r >= 0 && r <= round;
          const fresh = round > 0 && r === round;
          const isOrigin = i === ORIGIN;
          return (
            <g key={i}>
              {fresh || isOrigin ? (
                <rect
                  x={x - size / 2 - 3}
                  y={y - size / 2 - 3}
                  width={size + 6}
                  height={size + 6}
                  rx={3}
                  fill="none"
                  stroke={isOrigin ? 'var(--signal)' : 'var(--panel-text)'}
                  strokeWidth={1.5}
                  strokeDasharray={isOrigin ? '2 2' : undefined}
                />
              ) : null}
              <rect
                x={x - size / 2}
                y={y - size / 2}
                width={size}
                height={size}
                rx={2}
                fill={knows ? 'var(--signal)' : 'var(--panel)'}
                stroke={down ? 'var(--panel-alert)' : knows ? 'var(--signal)' : 'var(--panel-line)'}
                strokeOpacity={knows || down ? 1 : 0.7}
                strokeWidth={down ? 1.75 : 1.25}
                style={{ transition }}
              />
              {down ? (
                <path
                  d={`M${x - size / 2 + 2} ${y - size / 2 + 2} L${x + size / 2 - 2} ${y + size / 2 - 2} M${x + size / 2 - 2} ${y - size / 2 + 2} L${x - size / 2 + 2} ${y + size / 2 - 2}`}
                  stroke="var(--panel-alert)"
                  strokeWidth={1.5}
                />
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function SizeTable({
  rows,
  nodes,
  fanout,
  perDoubling,
}: {
  rows: { nodes: number; log2: number; rounds: number }[];
  nodes: number;
  fanout: number;
  perDoubling: number;
}) {
  const max = Math.max(...rows.map((r) => r.rounds));
  return (
    <div className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <p className="text-ui font-semibold text-ink">How the rounds grow with the cluster</p>
        <p className="text-small text-graphite">
          Average rounds until every live node knows, over 40 random runs per size, with a fanout of {fanout}. Each size is double the one before.
        </p>
      </div>
      <table className="tabular w-full text-ui">
        <thead>
          <tr className="border-b border-rule text-left text-small text-graphite">
            <th scope="col" className="py-1.5 pr-3 font-semibold">
              Nodes
            </th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">
              Doublings from 1 (log₂ N)
            </th>
            <th scope="col" className="w-1/2 py-1.5 font-semibold">
              Average rounds
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const near = Math.abs(Math.log2(nodes) - r.log2) < 0.5;
            return (
              <tr key={r.nodes} className="border-b border-rule last:border-b-0">
                <th scope="row" className={near ? 'py-1.5 pr-3 text-left font-semibold text-ink' : 'py-1.5 pr-3 text-left font-normal text-ink'}>
                  {formatInt(r.nodes)}
                  {near ? <span className="ml-1 text-small font-normal text-graphite">(near yours)</span> : null}
                </th>
                <td className="py-1.5 pr-3 text-ink">{r.log2}</td>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-9 shrink-0 text-ink">{r.rounds.toFixed(1)}</span>
                    <span className="h-2 min-w-0 flex-1" aria-hidden>
                      <span className="block h-2 rounded-full bg-blueprint" style={{ width: `${(r.rounds / max) * 100}%` }} />
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-ui text-ink">
        Doubling the cluster adds about {perDoubling.toFixed(1)} {perDoubling >= 0.95 && perDoubling < 1.05 ? 'round' : 'rounds'}, not twice as many rounds: the
        time to reach everyone grows with log N.
      </p>
    </div>
  );
}
