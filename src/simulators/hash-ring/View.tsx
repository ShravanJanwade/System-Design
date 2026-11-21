import { useDeferredValue, useMemo, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider } from '@/design/primitives';
import { formatPercent } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import {
  DEFAULT_VNODES,
  MAX_SERVERS,
  MIN_SERVERS,
  RING_SIZE,
  VNODE_STEPS,
  buildRing,
  makeKeys,
  nextServerId,
  runRing,
  sampleOwners,
  serverName,
  type RingChange,
  type RingResult,
  type VNode,
} from './logic';

type Method = 'ring' | 'modulo';
type Ui = { servers: number[]; previous: number[] | null; vnodes: number };

/** Keys drawn as dots on the ring. */
const SAMPLE = 400;
const VIEW = 360;
const C = VIEW / 2;
const R = 116;
/** Server labels are drawn only when the ring has this many positions or fewer. */
const MAX_LABELS = 16;

function nearestStep(v: number): number {
  let best = 0;
  for (let i = 0; i < VNODE_STEPS.length; i++) if (Math.abs(VNODE_STEPS[i]! - v) < Math.abs(VNODE_STEPS[best]! - v)) best = i;
  return best;
}

function fromPreset(preset: SimulatorProps['preset']): Ui {
  const p = preset ?? {};
  const count = typeof p.servers === 'number' && Number.isFinite(p.servers) ? Math.round(p.servers) : 4;
  const vnodes = typeof p.vnodes === 'number' && Number.isFinite(p.vnodes) ? p.vnodes : DEFAULT_VNODES;
  const n = Math.min(MAX_SERVERS, Math.max(MIN_SERVERS, count));
  return { servers: Array.from({ length: n }, (_, i) => i + 1), previous: null, vnodes: VNODE_STEPS[nearestStep(vnodes)]! };
}

const fmt = (v: number) => v.toFixed(1);

function polar(pos: number, radius: number): [number, number] {
  const a = (pos / RING_SIZE) * 2 * Math.PI;
  return [C + radius * Math.sin(a), C - radius * Math.cos(a)];
}

/** A clockwise arc of the ring from one position to another, wrapping past the top. */
function arcPath(from: number, to: number, radius: number): string {
  let span = to - from;
  if (span <= 0) span += RING_SIZE;
  const [x1, y1] = polar(from, radius);
  if (span >= RING_SIZE * 0.999) {
    const [x2, y2] = polar(from + RING_SIZE / 2, radius);
    return `M${fmt(x1)} ${fmt(y1)}A${radius} ${radius} 0 1 1 ${fmt(x2)} ${fmt(y2)}A${radius} ${radius} 0 1 1 ${fmt(x1)} ${fmt(y1)}`;
  }
  const [x2, y2] = polar(from + span, radius);
  return `M${fmt(x1)} ${fmt(y1)}A${radius} ${radius} 0 ${span > RING_SIZE / 2 ? 1 : 0} 1 ${fmt(x2)} ${fmt(y2)}`;
}

function ticks(positions: number[], inner: number, outer: number): string {
  return positions
    .map((p) => {
      const [x1, y1] = polar(p, inner);
      const [x2, y2] = polar(p, outer);
      return `M${fmt(x1)} ${fmt(y1)}L${fmt(x2)} ${fmt(y2)}`;
    })
    .join('');
}

type Label = { key: string; server: number; x: number; y: number; tone: 'plain' | 'new' | 'gone' };

/** Number badges outside the ring, pushed further out when two would overlap. */
function placeLabels(items: { v: VNode; tone: Label['tone'] }[]): Label[] {
  const out: Label[] = [];
  for (const { v, tone } of [...items].sort((a, b) => a.v.pos - b.v.pos)) {
    let [x, y] = polar(v.pos, R + 24);
    if (out.some((l) => Math.hypot(l.x - x, l.y - y) < 22)) [x, y] = polar(v.pos, R + 46);
    out.push({ key: `${v.server}-${v.replica}-${tone}`, server: v.server, x, y, tone });
  }
  return out;
}

function listNames(flows: RingChange['flows']): string {
  const parts = flows.map((f) => `${serverName(f.server)} (${formatPercent(f.share)})`);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function describe(r: RingResult, method: Method): string {
  const base = `Hash ring with ${r.servers.length} cache nodes, ${r.vnodes} position${r.vnodes === 1 ? '' : 's'} each. The busiest node holds ${formatPercent(
    r.loads.find((l) => l.server === r.busiest)!.share,
  )} of the keys, against a fair share of ${formatPercent(r.fair)}.`;
  const c = r.change;
  if (!c) return base;
  const what = c.kind === 'add' ? `${serverName(c.server)} joined` : `${serverName(c.server)} left`;
  return `${base} In the last change, ${what}: on the ring ${formatPercent(c.ringMoved)} of keys moved, and with hash % N ${formatPercent(
    c.moduloMoved,
  )} moved. Highlighted keys: those that moved ${method === 'ring' ? 'on the ring' : 'with hash % N'}.`;
}

function RingSvg({ r, method }: { r: RingResult; method: Method }) {
  const dots = useMemo(
    () =>
      makeKeys()
        .slice(0, SAMPLE)
        .map((k) => {
          const [x, y] = polar(k.pos, R - 17);
          return { key: k.key, x: Number(fmt(x)), y: Number(fmt(y)) };
        }),
    [],
  );
  const c = r.change;
  const added = c?.kind === 'add' ? c.server : null;
  const gone = c?.kind === 'remove' ? c.server : null;
  const moved = c ? (method === 'ring' ? c.movedRing : c.movedModulo) : null;

  const plain = r.ring.filter((v) => v.server !== added).map((v) => v.pos);
  const fresh = r.ring.filter((v) => v.server === added).map((v) => v.pos);
  /** Where the departed server used to sit. */
  const goneRing = useMemo(() => (gone === null ? [] : buildRing([gone], r.vnodes)), [gone, r.vnodes]);

  const total = r.ring.length;
  const labels =
    total <= MAX_LABELS
      ? placeLabels([
          ...r.ring.map((v) => ({ v, tone: (v.server === added ? 'new' : 'plain') as Label['tone'] })),
          ...goneRing.map((v) => ({ v, tone: 'gone' as const })),
        ])
      : [];

  const big = c ? formatPercent(method === 'ring' ? c.ringMoved : c.moduloMoved) : `${r.servers.length} nodes`;
  const line1 = c ? 'of keys moved' : `${r.vnodes} position${r.vnodes === 1 ? '' : 's'} each`;
  const line2 = c ? (method === 'ring' ? 'on the ring' : 'with hash % N') : 'add or remove a node';

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width="100%" className="mx-auto block max-w-[440px]" role="img" aria-label={describe(r, method)}>
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--panel-line)" strokeOpacity={0.4} strokeWidth={2} />
      {c && method === 'ring'
        ? c.changedArcs.map((a, i) => (
            <path key={i} d={arcPath(a.from, a.to, R)} fill="none" stroke="var(--signal)" strokeWidth={7} strokeLinecap="butt" />
          ))
        : null}
      {goneRing.length ? <path d={ticks(goneRing.map((v) => v.pos), R + 7, R + 14)} stroke="var(--panel-alert)" strokeWidth={1.5} /> : null}
      <path d={ticks(plain, R - 6, R + 6)} stroke="var(--panel-line)" strokeWidth={total > 400 ? 1 : 1.5} />
      {fresh.length ? <path d={ticks(fresh, R - 9, R + 9)} stroke="var(--signal)" strokeWidth={total > 400 ? 1.25 : 2} /> : null}
      <g>
        {dots.map((d, i) =>
          moved && moved[i] ? null : <circle key={d.key} cx={d.x} cy={d.y} r={1.7} fill="var(--panel-muted)" opacity={0.55} />,
        )}
        {moved ? dots.map((d, i) => (moved[i] ? <circle key={d.key} cx={d.x} cy={d.y} r={2.6} fill="var(--signal)" /> : null)) : null}
      </g>
      {labels.map((l) => (
        <g key={l.key}>
          <circle
            cx={l.x}
            cy={l.y}
            r={10}
            fill={l.tone === 'gone' ? 'none' : l.tone === 'new' ? 'var(--signal)' : 'var(--card)'}
            stroke={l.tone === 'gone' ? 'var(--panel-alert)' : 'none'}
            strokeDasharray={l.tone === 'gone' ? '3 2' : undefined}
          />
          <text
            x={l.x}
            y={l.y + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={l.tone === 'gone' ? 'var(--panel-alert)' : l.tone === 'new' ? 'var(--on-signal)' : 'var(--card-ink)'}
            className="tabular"
          >
            {l.server}
          </text>
        </g>
      ))}
      <text x={C} y={C - 4} textAnchor="middle" fontSize={30} fontWeight={700} fill="var(--panel-text)" className="tabular">
        {big}
      </text>
      <text x={C} y={C + 18} textAnchor="middle" fontSize={12} fill="var(--panel-muted)">
        {line1}
      </text>
      <text x={C} y={C + 34} textAnchor="middle" fontSize={12} fill="var(--panel-muted)">
        {line2}
      </text>
    </svg>
  );
}

export default function HashRingSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<Ui>(initial);
  const [method, setMethod] = useState<Method>('ring');
  const [touched, setTouched] = useState(false);
  const [tried, setTried] = useState<number[]>([initial.vnodes]);

  const deferred = useDeferredValue(ui);
  const result = useMemo(() => runRing(deferred), [deferred]);
  const samples = useMemo(() => sampleOwners(result), [result]);
  const spread = useMemo(() => {
    const at = (vnodes: number) => {
      const r = runRing({ servers: deferred.servers, previous: null, vnodes });
      const sorted = [...r.loads].sort((a, b) => b.share - a.share);
      return { top: sorted[0]!, bottom: sorted[sorted.length - 1]!, fair: r.fair };
    };
    return { one: at(1), many: at(DEFAULT_VNODES) };
  }, [deferred.servers]);

  const touch = () => setTouched(true);
  const add = () => {
    touch();
    setUi((u) => (u.servers.length >= MAX_SERVERS ? u : { ...u, previous: u.servers, servers: [...u.servers, nextServerId(u.servers)].sort((a, b) => a - b) }));
  };
  const remove = (server: number) => {
    touch();
    setUi((u) => (u.servers.length <= MIN_SERVERS ? u : { ...u, previous: u.servers, servers: u.servers.filter((s) => s !== server) }));
  };
  const setVnodes = (vnodes: number) => {
    touch();
    setUi((u) => ({ ...u, vnodes }));
    setTried((t) => (t.includes(vnodes) ? t : [...t, vnodes]));
  };
  const reset = () => {
    setUi(initial);
    setMethod('ring');
  };

  const c = result.change;
  const quietest = result.loads.reduce((low, l) => (l.share < low.share ? l : low), result.loads[0]!);
  const busiest = result.loads.find((l) => l.server === result.busiest)!;
  const barScale = Math.max(2 * result.fair, ...result.loads.map((l) => l.share)) * 1.04;
  const pct = (v: number) => `${Math.min(100, (v / barScale) * 100)}%`;
  const ownerText = (pair: [number, number]) =>
    !c ? serverName(pair[1]) : pair[0] === pair[1] ? `${serverName(pair[1])}, stayed` : `${serverName(pair[0])} to ${serverName(pair[1])}`;

  const challenges: Challenge[] = [
    {
      id: 'grow',
      prompt: 'Grow the cluster from four nodes to five. What share of keys moves on the ring, and with `hash % N`?',
      explanation:
        c && c.kind === 'add'
          ? `With \`hash % N\`, ${formatPercent(c.moduloMoved)} of keys moved: dividing by a new N changes almost every remainder, so almost every key points at a different node. On the ring, ${formatPercent(c.ringMoved)} moved, and every one of them went to ${serverName(c.server)}, which is exactly its new share. No other key changed hands.`
          : 'Going from four nodes to five, `hash % N` moves about four keys in five, because dividing by 5 instead of 4 changes almost every remainder. The ring moves about a fifth, all of them to the new node.',
      attempted: !!c && c.kind === 'add' && c.before.length === 4,
    },
    {
      id: 'leave',
      prompt: 'Remove a node. Which keys move, and where do they go?',
      explanation:
        c && c.kind === 'remove'
          ? `Only ${serverName(c.server)}’s keys moved: ${formatPercent(c.ringMoved)} of all keys, the share it held. ${
              c.flows.length === 1
                ? `All of them went to ${serverName(c.flows[0]!.server)}, its neighbor clockwise, whose load jumps.`
                : `They spread over ${listNames(c.flows)}, because its many positions had many different neighbors.`
            } Every other key stayed put. With \`hash % N\`, ${formatPercent(c.moduloMoved)} moved, though only ${formatPercent(c.mustMove)} had to.`
          : 'On the ring, only the departed node’s keys move, each to the next node clockwise. With `hash % N`, most keys move.',
      attempted: !!c && c.kind === 'remove',
    },
    {
      id: 'vnodes',
      prompt: 'Set one virtual node per server and compare the load on each node. Then raise it again.',
      explanation: `With one position each, the gaps between servers on the ring are random, so ${serverName(spread.one.top.server)} got ${formatPercent(
        spread.one.top.share,
      )} of the keys and ${serverName(spread.one.bottom.server)} only ${formatPercent(spread.one.bottom.share)}. With ${DEFAULT_VNODES} positions each, the gaps average out: every node holds between ${formatPercent(
        spread.many.bottom.share,
      )} and ${formatPercent(spread.many.top.share)}, against a fair share of ${formatPercent(spread.many.fair)}.`,
      attempted: tried.includes(1) && tried.some((v) => v >= 100),
    },
    {
      id: 'neighbor',
      prompt: 'With one virtual node per server, add a node. Whose keys does it take?',
      explanation:
        c && c.kind === 'add' && result.vnodes === 1
          ? `With one position, the new node takes keys from just one server, the next one clockwise: ${serverName(c.flows[0]!.server)} gave up all ${formatPercent(
              c.ringMoved,
            )} of the keys that moved. Every other node keeps its load, even or not. With many virtual nodes, a new node takes a small slice from every server, which is how the Dynamo paper describes it.`
          : 'With one position, a new node takes keys only from the next server clockwise. With many virtual nodes, it takes a small slice from every server.',
      attempted: !!c && c.kind === 'add' && result.vnodes === 1,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Consistent hashing ring"
          intro="Snapgram’s cache nodes and 10,000 keys share one ring. Add or remove a node, compare how many keys move on the ring and with hash % N, and change how many positions each server takes."
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-ui font-semibold text-ink">Show which keys moved with</span>
        <Segmented<Method>
          label="Show which keys moved with"
          value={method}
          onChange={(m) => {
            touch();
            setMethod(m);
          }}
          options={[
            { value: 'ring', label: 'The ring' },
            { value: 'modulo', label: 'hash % N' },
          ]}
          className="self-start"
        />
      </div>

      <section aria-label="Hash ring" className="on-panel blueprint-grid flex flex-col gap-3 rounded-panel p-3 sm:p-4">
        <RingSvg r={result} method={method} />
        <p className="text-small text-panel-muted">
          White ticks are the cache nodes’ positions on the ring{result.ring.length <= MAX_LABELS ? ', numbered by node' : ''}. Dots are{' '}
          {SAMPLE} of the 10,000 keys; each belongs to the first tick clockwise from it.{' '}
          {c
            ? method === 'ring'
              ? 'Yellow dots moved in the last change, and yellow stretches of the ring changed owner.'
              : 'Yellow dots moved in the last change with hash % N, which ignores the ring.'
            : 'Add or remove a node to see which keys move.'}
          {c && c.kind === 'add' ? ` The new node’s ticks are yellow.` : ''}
          {c && c.kind === 'remove' ? ` Red marks show where ${serverName(c.server)} used to be.` : ''}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat
          label="Moved on the ring"
          value={c ? formatPercent(c.ringMoved) : 'None yet'}
          note={c ? `${formatPercent(c.mustMove)} had to move` : 'add or remove a node'}
          tone={c ? 'success' : 'ink'}
        />
        <Stat
          label="Moved with hash % N"
          value={c ? formatPercent(c.moduloMoved) : 'None yet'}
          note={c ? `same change, ${c.before.length} to ${result.servers.length} nodes` : 'for the same change'}
          tone={c ? 'alert' : 'ink'}
        />
        <Stat
          label="Busiest node"
          value={`${result.peak.toFixed(2)}×`}
          note={`${serverName(busiest.server)}: ${formatPercent(busiest.share)} of keys`}
          tone={result.peak >= 1.3 ? 'alert' : 'ink'}
        />
        <Stat
          label="Quietest node"
          value={`${(quietest.share / result.fair).toFixed(2)}×`}
          note={`${serverName(quietest.server)}: ${formatPercent(quietest.share)} of keys`}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-ui font-semibold text-ink">Keys per node</p>
          <p className="text-small text-graphite">The dark tick marks a fair share, {formatPercent(result.fair)}.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {result.loads.map((l) => (
            <li key={l.server} className="grid grid-cols-[5rem_minmax(0,1fr)_3.25rem_auto] items-center gap-3">
              <span className="text-ui text-ink">
                {serverName(l.server)}
                {c && c.kind === 'add' && c.server === l.server ? <span className="block text-small text-graphite">new</span> : null}
              </span>
              <div className="relative h-2 rounded-full bg-wash" aria-hidden>
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(l.share), background: 'var(--type-cache)' }} />
                <div className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-ink" style={{ left: pct(result.fair) }} />
              </div>
              <span className="tabular text-right text-ui text-ink">{formatPercent(l.share)}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(l.server)}
                disabled={result.servers.length <= MIN_SERVERS}
                aria-label={`Remove ${serverName(l.server)}`}
              >
                <Minus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                <span className="hidden sm:inline">Remove</span>
              </Button>
            </li>
          ))}
        </ul>
        <Button size="sm" onClick={add} disabled={result.servers.length >= MAX_SERVERS} className="self-start">
          <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Add a node
        </Button>
      </div>

      <div className="rounded-card border border-rule bg-paper p-4 sm:p-5">
        <p className="text-ui font-semibold text-ink">Where some keys live</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left text-ui">
            <thead>
              <tr className="text-small text-graphite">
                <th className="py-1 pr-3 font-semibold">Key</th>
                <th className="py-1 pr-3 font-semibold">On the ring</th>
                <th className="py-1 font-semibold">With hash % N</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.key} className="border-t border-rule">
                  <td className="py-1.5 pr-3">
                    <code className="md-code">{s.key}</code>
                  </td>
                  <td className={c && s.ring[0] !== s.ring[1] ? 'py-1.5 pr-3 font-semibold text-ink' : 'py-1.5 pr-3 text-graphite'}>
                    {ownerText(s.ring)}
                  </td>
                  <td className={c && s.modulo[0] !== s.modulo[1] ? 'py-1.5 font-semibold text-ink' : 'py-1.5 text-graphite'}>
                    {ownerText(s.modulo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-small text-graphite">
          {c ? `Owners before and after the last change. Bold rows moved.` : 'Each key’s owner now. Change the cluster to see which ones move.'}
        </p>
      </div>

      <ControlPanel>
        <Slider
          id="ring-vnodes"
          label="Virtual nodes per server"
          value={VNODE_STEPS.indexOf(ui.vnodes)}
          min={0}
          max={VNODE_STEPS.length - 1}
          onChange={(i) => setVnodes(VNODE_STEPS[i]!)}
          format={(i) => `${VNODE_STEPS[i]} position${VNODE_STEPS[i] === 1 ? '' : 's'}`}
          hint="Each server takes this many places on the ring. The last change is replayed with the new setting."
        />
        <div className="flex flex-wrap items-end gap-2">
          <Button size="sm" onClick={add} disabled={ui.servers.length >= MAX_SERVERS}>
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Add a node
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to four nodes
          </Button>
        </div>
      </ControlPanel>

      <Challenges simId="hash-ring" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Here every app server learns about a change at the same instant, and all 10,000 keys are equally popular. Real clients hear
          about new and failed nodes over a few seconds, stores keep copies of each key on the next nodes clockwise, and one very hot
          key still lands on one node.
        </p>
      </Callout>
    </div>
  );
}
