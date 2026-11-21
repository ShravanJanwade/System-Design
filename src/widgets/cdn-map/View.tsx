import { useCallback, useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Toggle } from '@/design/primitives';
import { SvgChip } from '@/diagram/svg-parts';
import { useElementWidth, useInView } from '@/lib/hooks';
import { formatInt } from '@/lib/format';
import { useReducedMotion } from '@/state/settings';
import { Challenges, type Challenge } from '@/simulators/shared/Challenges';
import { ControlPanel, Stat } from '@/simulators/shared/SimParts';
import type { WidgetProps } from '../registry';
import {
  ACCESS_MS,
  DEFAULT_CITY,
  EDGES,
  FIBER_KM_PER_MS,
  MAP_ASPECT,
  ORIGIN,
  ROUTE_FACTOR,
  USER_CITIES,
  ballpark,
  buildScene,
  compareRoutes,
  describeScene,
  getCity,
  graticule,
  labelWidth,
  nearestEdge,
  pointAlong,
  project,
  roundKm,
  routeGeometry,
  type Box,
  type CacheState,
  type Pt,
} from './logic';

type Settings = { city: string; cdn: boolean; cache: CacheState };

function fromProps(props: WidgetProps['props']): Settings {
  const city = typeof props?.city === 'string' && USER_CITIES.some((c) => c.id === props.city) ? props.city : DEFAULT_CITY;
  return { city, cdn: props?.cdn === true, cache: props?.cache === 'miss' ? 'miss' : 'hit' };
}

const km = (n: number) => `${formatInt(roundKm(n))} km`;

function polyLength(points: Pt[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return length;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Ocean names give a sense of place on a map with no coastlines. */
const OCEANS = [
  { name: 'Pacific Ocean', lat: 12, lon: -152 },
  { name: 'Atlantic Ocean', lat: 28, lon: -42 },
  { name: 'Indian Ocean', lat: -28, lon: 80 },
];

export default function CdnMapWidget({ props }: WidgetProps) {
  const initial = useMemo(() => fromProps(props), [props]);
  const [s, setS] = useState<Settings>(initial);
  const [touched, setTouched] = useState(false);
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();

  const [measureRef, measured] = useElementWidth<HTMLDivElement>();
  const [viewRef, inView] = useInView<HTMLDivElement>(0.3);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      measureRef(el);
      viewRef(el);
    },
    [measureRef, viewRef],
  );
  const width = Math.floor(measured);

  const change = (patch: Partial<Settings>) => {
    setTouched(true);
    setS((prev) => ({ ...prev, ...patch }));
  };

  const comparison = useMemo(() => compareRoutes(getCity(s.city), s.cache), [s.city, s.cache]);
  const scene = useMemo(() => (width > 0 ? buildScene(s.city, s.cdn, s.cache, width) : null), [s.city, s.cdn, s.cache, width]);
  const description = describeScene(comparison, s.cdn, s.cache);

  /* Readouts, rounded once so the numbers on screen always agree with each other. */
  const direct = ballpark(comparison.direct.roundTripMs);
  const viaCdn = ballpark(comparison.cdn.roundTripMs);
  const change_ = direct - viaCdn;
  const firstDirect = ballpark(comparison.direct.firstVisitMs);
  const firstCdn = ballpark(comparison.cdn.firstVisitMs);
  const sameCity = comparison.edgeKm < 50;
  const edgeNote =
    s.cache === 'miss'
      ? `via ${comparison.edge.name}, then Oregon`
      : sameCity
        ? `edge in ${comparison.edge.name} itself`
        : `${comparison.edge.name} edge, ${km(comparison.edgeKm)} away`;

  /* One request dot: out along the path and back, timed in proportion to the round trip. */
  const activeRtt = s.cdn ? comparison.cdn.roundTripMs : comparison.direct.roundTripMs;
  const routeKey = `${s.city}-${s.cdn}-${s.cache}`;
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    if (reduced || !inView) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let raf = 0;
    const start = performance.now() + 150;
    const duration = Math.min(2600, Math.max(700, activeRtt * 9));
    const tick = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / duration));
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [routeKey, run, reduced, inView, activeRtt]);

  const maya = compareRoutes(getCity('singapore'), 'hit');
  const nairobiHit = compareRoutes(getCity('nairobi'), 'hit');
  const nairobiMiss = compareRoutes(getCity('nairobi'), 'miss');
  const nearby = compareRoutes(getCity('san-francisco'), 'hit');
  const challenges: Challenge[] = [
    {
      id: 'maya',
      prompt: 'Turn the CDN on for Maya in Singapore. How many times faster is a hit than the trip to Oregon?',
      explanation: `About ${Math.round(maya.direct.roundTripMs / maya.cdn.roundTripMs)} times: roughly ${ballpark(maya.direct.roundTripMs)} ms becomes ${ballpark(maya.cdn.roundTripMs)} ms. The photo now comes from inside Singapore instead of from across the Pacific, and nothing about the servers changed.`,
      attempted: s.city === 'singapore' && s.cdn && s.cache === 'hit',
    },
    {
      id: 'miss',
      prompt: 'Switch the edge to a miss. Is the request faster or slower than having no CDN at all?',
      explanation: `Slower, or at best the same: the request stops at the edge, then makes the whole trip to Oregon anyway. From Nairobi, the detour through Johannesburg adds about ${ballpark(nairobiMiss.cdn.roundTripMs - nairobiMiss.direct.roundTripMs)} ms. That is the price of the first request at each edge in a pull CDN; every request after it is a hit.`,
      attempted: s.cdn && s.cache === 'miss',
    },
    {
      id: 'nearby',
      prompt: 'Find a city where the CDN saves almost nothing. Why is the gain so small there?',
      explanation: `San Francisco is only about ${km(nearby.originKm)} from Oregon, so its round trip was already about ${ballpark(nearby.direct.roundTripMs)} ms. A CDN saves time in proportion to distance. For users near the origin, its main benefit is taking load off the origin.`,
      attempted: s.cdn && comparison.savedMs < 10 && s.cache === 'hit',
    },
    {
      id: 'nairobi',
      prompt: 'Pick Nairobi, which has no edge of its own. Which edge serves it, and is it still worth it?',
      explanation: `Johannesburg, about ${km(nairobiHit.edgeKm)} away: a hit takes about ${ballpark(nairobiHit.cdn.roundTripMs)} ms instead of ${ballpark(nairobiHit.direct.roundTripMs)} ms to Oregon. Far better, but not as good as an edge in the same city, which is why CDNs keep adding locations.`,
      attempted: s.city === 'nairobi' && s.cdn,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="on-panel blueprint-grid rounded-panel p-2 sm:p-3">
        <div ref={setRefs} className="w-full">
          {scene ? (
            <MapSvg scene={scene} cdn={s.cdn} cache={s.cache} progress={progress} reduced={reduced} label={`Schematic world map. ${description}`} />
          ) : (
            <div style={{ aspectRatio: `${1 / MAP_ASPECT}` }} />
          )}
        </div>
        <Legend />
      </div>

      <p className="measure text-ui-lg text-ink" aria-live="polite">
        {description}
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <Stat label="Round trip, no CDN" value={`${direct} ms`} note={`to Oregon, ${km(comparison.originKm)} away`} />
        <Stat label="Round trip, with the CDN" value={`${viaCdn} ms`} note={edgeNote} />
        <Stat
          label="Change per round trip"
          value={change_ > 0 ? `−${change_} ms` : change_ < 0 ? `+${-change_} ms` : 'None'}
          note={change_ > 0 ? `${Math.round((change_ / direct) * 100)}% less time` : change_ < 0 ? 'slower: the edge is a detour' : 'the edge sits on the way'}
          tone={change_ > 0 ? 'success' : change_ < 0 ? 'alert' : 'ink'}
        />
      </div>
      <p className="measure text-ui text-graphite">
        A first visit needs three round trips: two handshakes to open a secure connection, then the photo itself. That is about{' '}
        <span className="tabular">{firstDirect} ms</span> straight to Oregon and <span className="tabular">{firstCdn} ms</span> through the CDN
        {firstCdn < firstDirect
          ? s.cache === 'miss'
            ? ', even on a miss, because the handshakes happen at the nearby edge.'
            : '.'
          : ', no faster here, because Oregon is already close.'}{' '}
        All times are ballpark estimates.
      </p>

      <ControlPanel>
        <div className="flex flex-col gap-2">
          <label htmlFor="cdn-map-city" className="text-ui font-semibold text-ink">
            User’s city
          </label>
          <select
            id="cdn-map-city"
            value={s.city}
            onChange={(e) => change({ city: e.target.value })}
            className="h-9 w-full rounded-control border border-control bg-paper px-2.5 text-ui text-ink"
          >
            {USER_CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id === 'singapore' ? 'Singapore (Maya)' : c.name}
              </option>
            ))}
          </select>
          <p className="text-small text-graphite">Nearest edge: {sameCity ? `${comparison.edge.name}, in the same city` : `${comparison.edge.name}, ${km(comparison.edgeKm)} away`}.</p>
        </div>
        <Toggle
          id="cdn-map-cdn"
          label="Use the CDN"
          description="Send the request to the nearest edge instead of to Oregon."
          checked={s.cdn}
          onChange={(cdn) => change({ cdn })}
        />
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">The edge’s copy of the photo</span>
          <Segmented<CacheState>
            label="The edge’s copy of the photo"
            value={s.cache}
            onChange={(cache) => change({ cache })}
            options={[
              { value: 'hit', label: 'Hit' },
              { value: 'miss', label: 'Miss' },
            ]}
          />
          <p className="text-small text-graphite">
            {s.cache === 'hit'
              ? 'The edge already has the photo and answers by itself.'
              : 'The edge does not have it yet, so it fetches it from Oregon first.'}
          </p>
        </div>
        {reduced ? null : (
          <div className="flex items-end">
            <Button size="sm" variant="secondary" onClick={() => setRun((r) => r + 1)}>
              <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Send the request again
            </Button>
          </div>
        )}
      </ControlPanel>

      <Challenges simId="cdn-map" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Times come from straight-line distance: light in fiber covers about {FIBER_KM_PER_MS} km per millisecond, real routes run about{' '}
          {ROUTE_FACTOR} times longer, and the user’s own connection adds about {ACCESS_MS} ms. Real paths follow undersea cables and
          mobile networks add tens of milliseconds, so treat every number as a ballpark. Real CDNs also run far more than the {EDGES.length}{' '}
          edges shown here.
        </p>
      </Callout>
    </div>
  );
}

function MapSvg({
  scene,
  cdn,
  cache,
  progress,
  reduced,
  label,
}: {
  scene: NonNullable<ReturnType<typeof buildScene>>;
  cdn: boolean;
  cache: CacheState;
  progress: number;
  reduced: boolean;
  label: string;
}) {
  const { width: W, height: H, comparison } = scene;
  const grid = graticule();
  const active = routeGeometry(scene.route, W, H);
  // The option not taken, drawn faintly for comparison: Oregon when the CDN is on, the nearest edge when it is off.
  const other = routeGeometry(cdn ? comparison.direct : comparison.cdn.kind === 'edge-hit' ? comparison.cdn : { ...comparison.cdn, legs: comparison.cdn.legs.slice(0, 1) }, W, H);
  const targetIsOrigin = !cdn || cache === 'miss';
  const nearest = nearestEdge(comparison.user).edge;

  // The request dot: out along the path in the first half, back in the second.
  let dot: Pt | null = null;
  let ping: number | null = null;
  if (!reduced && progress < 1) {
    if (active.length < 2) ping = progress;
    else {
      const along = progress < 0.5 ? (progress / 0.5) * active.length : (1 - (progress - 0.5) / 0.5) * active.length;
      dot = pointAlong(active.outbound, along);
    }
  }

  const oceans = OCEANS.map((o) => {
    const p = project(o, W, H);
    const w = labelWidth(o.name);
    return { ...o, x: p.x - w / 2, y: p.y - 6, box: { x: p.x - w / 2, y: p.y - 12, w, h: 16 } };
  }).filter((o) => o.box.x > 2 && o.box.x + o.box.w < W - 2 && !scene.labels.some((l) => overlaps(l.box, o.box)));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block">
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={6} fill="var(--panel)" stroke="var(--panel-chip-border)" strokeWidth={1} />

      {/* Latitude and longitude lines every 30 degrees; the equator a little stronger. */}
      {grid.meridians.map((lon) => {
        const x = project({ lat: 0, lon }, W, H).x;
        return <line key={`m${lon}`} x1={x} x2={x} y1={1} y2={H - 1} stroke="var(--panel-line)" strokeOpacity={0.14} strokeWidth={1} />;
      })}
      {grid.parallels.map((lat) => {
        const y = project({ lat, lon: 0 }, W, H).y;
        return (
          <line key={`p${lat}`} x1={1} x2={W - 1} y1={y} y2={y} stroke="var(--panel-line)" strokeOpacity={lat === 0 ? 0.32 : 0.14} strokeWidth={1} />
        );
      })}
      <text x={8} y={project({ lat: 0, lon: 0 }, W, H).y - 5} fontSize={11} fill="var(--panel-muted)">
        Equator
      </text>
      {oceans.map((o) => (
        <text key={o.name} x={o.x} y={o.y} fontSize={11} fill="var(--panel-muted)" fontStyle="italic">
          {o.name}
        </text>
      ))}

      {/* The option not taken */}
      {other.arcs.map((arc, i) =>
        other.length > 2 ? (
          <path key={`o${i}`} d={arc.d} fill="none" stroke="var(--panel-line)" strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="4 5" />
        ) : null,
      )}

      {/* Every edge and user city */}
      {EDGES.map((e) => {
        const p = project(e, W, H);
        return <Diamond key={e.id} p={p} size={5} />;
      })}
      {USER_CITIES.map((c) => {
        const p = project(c, W, H);
        return <circle key={c.id} cx={p.x} cy={p.y} r={3} fill="var(--panel-muted)" />;
      })}

      {/* The request's path */}
      {active.arcs.map((arc, i) => (
        <g key={`a${i}`}>
          <path d={arc.d} fill="none" stroke="var(--panel-line)" strokeWidth={2} strokeLinecap="round" />
          <Arrowhead samples={arc.samples} />
        </g>
      ))}

      {/* Highlighted places */}
      <Square p={scene.origin} ring={targetIsOrigin} />
      {cdn ? <Diamond p={project(nearest, W, H)} size={7} ring /> : null}
      <circle cx={scene.user.x} cy={scene.user.y} r={5.5} fill="var(--card)" stroke="var(--signal)" strokeWidth={2.5} />

      {/* Labels */}
      {scene.labels.map((l) =>
        l.kind === 'chip' ? (
          <SvgChip key={l.id} x={Math.round(l.box.x)} y={Math.round(l.box.y)} text={l.text} tone="signal" />
        ) : (
          <text
            key={l.id}
            x={l.box.x + 2}
            y={l.box.y + 12}
            fontSize={12}
            fontWeight={600}
            fill="var(--panel-text)"
            stroke="var(--panel)"
            strokeWidth={4}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {l.text}
          </text>
        ),
      )}

      {/* The moving request */}
      {dot ? (
        <g transform={`translate(${dot.x} ${dot.y})`}>
          <circle r={10} fill="var(--signal)" opacity={0.22} />
          <circle r={5.5} fill="var(--signal)" stroke="var(--panel)" strokeWidth={2} />
        </g>
      ) : null}
      {ping !== null ? (
        <circle cx={scene.user.x} cy={scene.user.y} r={7 + 16 * ping} fill="none" stroke="var(--signal)" strokeWidth={2} opacity={1 - ping} />
      ) : null}
    </svg>
  );
}

function Diamond({ p, size, ring = false }: { p: Pt; size: number; ring?: boolean }) {
  return (
    <g>
      {ring ? <circle cx={p.x} cy={p.y} r={size + 5} fill="none" stroke="var(--signal)" strokeWidth={2} /> : null}
      <path
        d={`M${p.x} ${p.y - size} L${p.x + size} ${p.y} L${p.x} ${p.y + size} L${p.x - size} ${p.y} Z`}
        fill="var(--type-edge)"
        stroke="var(--panel-line)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </g>
  );
}

function Square({ p, ring }: { p: Pt; ring: boolean }) {
  return (
    <g>
      {ring ? <circle cx={p.x} cy={p.y} r={12} fill="none" stroke="var(--signal)" strokeWidth={2} /> : null}
      <rect x={p.x - 6} y={p.y - 6} width={12} height={12} rx={2} fill="var(--card)" stroke="var(--type-compute)" strokeWidth={2.5} />
    </g>
  );
}

/** A small arrowhead just short of the arc's end, pointing along it. */
function Arrowhead({ samples }: { samples: Pt[] }) {
  const length = polyLength(samples);
  if (length < 28) return null;
  const tip = pointAlong(samples, length - 11);
  const back = pointAlong(samples, length - 19);
  const dx = tip.x - back.x;
  const dy = tip.y - back.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const baseX = tip.x - ux * 7;
  const baseY = tip.y - uy * 7;
  const points = [
    [tip.x, tip.y],
    [baseX - uy * 4, baseY + ux * 4],
    [baseX + uy * 4, baseY - ux * 4],
  ]
    .map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`)
    .join(' ');
  return <polygon points={points} fill="var(--panel-line)" />;
}

function Legend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 px-1 text-small text-panel-muted" aria-label="Map key">
      <li className="flex items-center gap-1.5">
        <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
          <path d="M7 1.5 L12.5 7 L7 12.5 L1.5 7 Z" fill="var(--type-edge)" stroke="var(--panel-line)" strokeWidth={1.5} strokeLinejoin="round" />
        </svg>
        CDN edge
      </li>
      <li className="flex items-center gap-1.5">
        <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
          <rect x={2} y={2} width={10} height={10} rx={2} fill="var(--card)" stroke="var(--type-compute)" strokeWidth={2} />
        </svg>
        Origin in {ORIGIN.name}
      </li>
      <li className="flex items-center gap-1.5">
        <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
          <circle cx={7} cy={7} r={3} fill="var(--panel-muted)" />
        </svg>
        User city
      </li>
      <li className="flex items-center gap-1.5">
        <svg width={22} height={14} viewBox="0 0 22 14" aria-hidden>
          <line x1={1} x2={21} y1={7} y2={7} stroke="var(--panel-line)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4" />
        </svg>
        The other option
      </li>
      <li>Schematic: a grid of latitude and longitude, no coastlines.</li>
    </ul>
  );
}
