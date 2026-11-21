import { useDeferredValue, useMemo, useState, type MouseEvent } from 'react';
import { Plus, RotateCcw, Users } from 'lucide-react';
import { Button } from '@/design/Button';
import { useElementWidth } from '@/lib/hooks';
import { Callout, CalloutLead, Segmented, Slider } from '@/design/primitives';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import {
  CAPACITY_STEPS,
  CROWDS,
  CROWD_SIZE,
  ADD_COUNT,
  DEFAULT_CAPACITY,
  DEFAULT_PRECISION,
  MAP,
  MAX_POINTS,
  MAX_PRECISION,
  MIN_PRECISION,
  SEARCH_RADIUS_KM,
  SPOTS,
  SPOT_ORDER,
  addCrowd,
  addScattered,
  boxSizeKm,
  encodeGeohash,
  formatCell,
  gridLines,
  initialPoints,
  leafAt,
  runGeohash,
  runQuadtree,
  sharedPrefix,
  type Box,
  type GeohashRun,
  type LatLon,
  type Point,
  type QuadRun,
  type SpotId,
} from './logic';

type Mode = 'geohash' | 'quadtree';
type Spot = SpotId | 'custom';
type Ui = { mode: Mode; precision: number; capacity: number; spot: Spot; center: LatLon; points: Point[]; crowds: number };

const VIEW = 400;
const LON_SPAN = MAP.lonMax - MAP.lonMin;
const LAT_SPAN = MAP.latMax - MAP.latMin;
const MAP_KM = boxSizeKm(MAP);
const RX = (SEARCH_RADIUS_KM / MAP_KM.widthKm) * VIEW;
const RY = (SEARCH_RADIUS_KM / MAP_KM.heightKm) * VIEW;

const round = (v: number) => Math.round(v * 10) / 10;
const xOf = (lon: number) => round(((lon - MAP.lonMin) / LON_SPAN) * VIEW);
const yOf = (lat: number) => round(((MAP.latMax - lat) / LAT_SPAN) * VIEW);
const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A cell as an SVG rectangle, clipped to the map. */
function rectOf(box: Box) {
  const x0 = Math.max(0, xOf(box.lonMin));
  const x1 = Math.min(VIEW, xOf(box.lonMax));
  const y0 = Math.max(0, yOf(box.latMax));
  const y1 = Math.min(VIEW, yOf(box.latMin));
  return { x: x0, y: y0, width: round(Math.max(0, x1 - x0)), height: round(Math.max(0, y1 - y0)) };
}

function pickNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function fromPreset(preset: SimulatorProps['preset']): Ui {
  const p = preset ?? {};
  const precision = Math.min(MAX_PRECISION, Math.max(MIN_PRECISION, Math.round(pickNumber(p.precision, DEFAULT_PRECISION))));
  const wanted = pickNumber(p.capacity, DEFAULT_CAPACITY);
  const capacity = CAPACITY_STEPS.reduce((best, c) => (Math.abs(c - wanted) < Math.abs(best - wanted) ? c : best), CAPACITY_STEPS[0]);
  const spot: SpotId = SPOT_ORDER.includes(p.spot as SpotId) ? (p.spot as SpotId) : 'downtown';
  return { mode: p.mode === 'quadtree' ? 'quadtree' : 'geohash', precision, capacity, spot, center: SPOTS[spot].at, points: initialPoints(), crowds: 0 };
}

function describeMap(ui: Ui, geo: GeohashRun, quad: QuadRun): string {
  const where = ui.spot === 'custom' ? 'at a spot you picked' : SPOTS[ui.spot].label.toLowerCase();
  if (ui.mode === 'geohash') {
    return `Map of central Singapore with ${ui.points.length} photos, cut into geohash cells of ${ui.precision} characters, each ${formatCell(
      geo.cellBox,
    )}. Maya is ${where}, in cell ${geo.centerHash}. Her 1 km search reads ${s(geo.cells.length, 'cell')}, checks ${s(
      geo.checked.length,
      'photo',
    )} and finds ${geo.found.length}, ${geo.foundInNeighbors.length} of them in neighboring cells.`;
  }
  return `Map of central Singapore with ${ui.points.length} photos in a quadtree with room for ${s(ui.capacity, 'photo')} per cell: ${s(
    quad.leaves.length,
    'cell',
  )}, the smallest ${formatCell(quad.deepest.box)}. Maya is ${where}. Her 1 km search reads ${s(quad.scanned.length, 'cell')}, checks ${s(
    quad.checked.length,
    'photo',
  )} and finds ${quad.found.length}.`;
}

function MapSvg({ ui, geo, quad, onPick }: { ui: Ui; geo: GeohashRun; quad: QuadRun; onPick: (p: LatLon) => void }) {
  const isGeo = ui.mode === 'geohash';
  const checked = new Set(isGeo ? geo.checked : quad.checked);
  const found = new Set(isGeo ? geo.found : quad.found);
  const levels = useMemo(() => {
    const out: { precision: number; lons: number[]; lats: number[] }[] = [];
    for (let p = MIN_PRECISION + 1; p <= ui.precision; p++) out.push({ precision: p, ...gridLines(p) });
    return out;
  }, [ui.precision]);
  const maxCount = Math.max(1, ...geo.occupied.map((c) => c.count));
  const cx = xOf(ui.center.lon);
  const cy = yOf(ui.center.lat);
  // The map scales with the panel; type is sized so it never shows smaller than about 11 px on screen.
  const [measureRef, shownWidth] = useElementWidth<HTMLDivElement>();
  const scale = shownWidth > 0 ? shownWidth / VIEW : 1;
  const type = (desktop: number, minPx: number) => Math.max(desktop, minPx / scale);
  const cellFont = type(ui.precision <= 5 ? 13 : 10, 11);
  const mayaFont = type(12, 12);
  const labelBelow = cy - RY - 8 < mayaFont + 2;

  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onPick({ lon: MAP.lonMin + fx * LON_SPAN, lat: MAP.latMax - fy * LAT_SPAN });
  };

  const scannedBoxes = isGeo ? geo.cells.map((c) => ({ key: c.hash, box: c.box, own: c.own, label: c.hash })) : quad.scanned.map((n) => ({ key: n.key || 'root', box: n.box, own: false, label: '' }));
  const showLabels = isGeo && geo.cells.length <= 10;

  return (
    <div ref={measureRef} className="mx-auto w-full max-w-[480px]">
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width="100%"
      className="block cursor-crosshair"
      role="img"
      aria-label={describeMap(ui, geo, quad)}
      onClick={pick}
    >
      <rect x={0} y={0} width={VIEW} height={VIEW} fill="none" stroke="var(--panel-line)" strokeOpacity={0.6} strokeWidth={2} />

      {isGeo
        ? geo.occupied.map((c) => {
            const r = rectOf(c.box);
            return <rect key={`o-${c.hash}`} {...r} fill="var(--panel-line)" fillOpacity={0.04 + 0.16 * (c.count / maxCount)} />;
          })
        : null}

      {isGeo
        ? levels.map((l) => {
            const finest = l.precision === ui.precision;
            const d = [...l.lons.map((lon) => `M${xOf(lon)} 0V${VIEW}`), ...l.lats.map((lat) => `M0 ${yOf(lat)}H${VIEW}`)].join('');
            return <path key={l.precision} d={d} stroke="var(--panel-line)" strokeOpacity={finest ? 0.3 : 0.6} strokeWidth={finest ? 1 : 1.5} fill="none" />;
          })
        : quad.leaves.map((n) => {
            const r = rectOf(n.box);
            return <rect key={n.key || 'root'} {...r} fill="none" stroke="var(--panel-line)" strokeOpacity={0.4} strokeWidth={1} />;
          })}

      {scannedBoxes.map((c) => {
        const r = rectOf(c.box);
        return (
          <rect key={`s-${c.key}`} {...r} fill="var(--signal)" fillOpacity={0.16} stroke="var(--signal)" strokeWidth={c.own ? 2.5 : 1.25} />
        );
      })}

      {showLabels
        ? scannedBoxes.map((c) => {
            const r = rectOf(c.box);
            // Monospace characters are about 0.6 em wide; skip a label its cell cannot hold.
            if (r.width < c.label.length * 0.6 * cellFont + 8 || r.height < cellFont + 6) return null;
            return (
              <text
                key={`l-${c.key}`}
                x={r.x + 4}
                y={r.y + cellFont + 3}
                fontSize={cellFont}
                fontWeight={c.own ? 700 : 500}
                fill="var(--panel-text)"
                stroke="var(--panel)"
                strokeWidth={3}
                paintOrder="stroke"
                className="font-mono"
              >
                {c.label}
              </text>
            );
          })
        : null}

      <g>
        {ui.points.map((p) =>
          checked.has(p.id) ? null : <circle key={p.id} cx={xOf(p.lon)} cy={yOf(p.lat)} r={1.8} fill="var(--panel-muted)" opacity={0.75} />,
        )}
        {ui.points.map((p) =>
          checked.has(p.id) && !found.has(p.id) ? (
            <circle key={p.id} cx={xOf(p.lon)} cy={yOf(p.lat)} r={2.6} fill="none" stroke="var(--signal)" strokeWidth={1.2} />
          ) : null,
        )}
        {ui.points.map((p) =>
          found.has(p.id) ? <circle key={p.id} cx={xOf(p.lon)} cy={yOf(p.lat)} r={3} fill="var(--signal)" stroke="var(--panel)" strokeWidth={0.75} /> : null,
        )}
      </g>

      <ellipse cx={cx} cy={cy} rx={round(RX)} ry={round(RY)} fill="none" stroke="var(--panel-line)" strokeWidth={1.5} strokeDasharray="5 4" />
      <circle cx={cx} cy={cy} r={5} fill="var(--card)" stroke="var(--panel)" strokeWidth={2} />
      <text
        x={Math.min(VIEW - 24, Math.max(24, cx))}
        y={labelBelow ? cy + RY + mayaFont + 4 : cy - RY - 7}
        textAnchor="middle"
        fontSize={mayaFont}
        fontWeight={700}
        fill="var(--panel-text)"
        stroke="var(--panel)"
        strokeWidth={3}
        paintOrder="stroke"
      >
        Maya
      </text>
    </svg>
    </div>
  );
}

export default function GeoMapSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<Ui>(initial);
  const [touched, setTouched] = useState(false);
  const [triedPrecisions, setTriedPrecisions] = useState<number[]>([initial.precision]);
  const [triedCapacities, setTriedCapacities] = useState<number[]>([initial.capacity]);

  const deferred = useDeferredValue(ui);
  const geo = useMemo(() => runGeohash(deferred.points, deferred.center, deferred.precision), [deferred.points, deferred.center, deferred.precision]);
  const quad = useMemo(() => runQuadtree(deferred.points, deferred.center, deferred.capacity), [deferred.points, deferred.center, deferred.capacity]);
  const byPrecision = useMemo(() => {
    const at = (p: number) => runGeohash(deferred.points, deferred.center, p);
    return { four: at(4), six: at(6), seven: at(7) };
  }, [deferred.points, deferred.center]);
  const edge = useMemo(() => runGeohash(deferred.points, SPOTS.edge.at, Math.max(5, deferred.precision)), [deferred.points, deferred.precision]);
  const byCapacity = useMemo(
    () => ({ one: runQuadtree(deferred.points, deferred.center, 1), sixteen: runQuadtree(deferred.points, deferred.center, 16) }),
    [deferred.points, deferred.center],
  );

  const touch = () => setTouched(true);
  const update = (patch: Partial<Ui>) => {
    touch();
    setUi((u) => ({ ...u, ...patch }));
  };
  const setPrecision = (precision: number) => {
    update({ precision });
    setTriedPrecisions((t) => (t.includes(precision) ? t : [...t, precision]));
  };
  const setCapacity = (capacity: number) => {
    update({ capacity });
    setTriedCapacities((t) => (t.includes(capacity) ? t : [...t, capacity]));
  };
  const moveTo = (spot: Spot, center: LatLon) => update({ spot, center });
  const addPhotos = () => {
    touch();
    setUi((u) => ({ ...u, points: addScattered(u.points) }));
  };
  const dropCrowd = () => {
    touch();
    setUi((u) => (u.points.length >= MAX_POINTS ? u : { ...u, points: addCrowd(u.points, u.crowds), crowds: u.crowds + 1 }));
  };
  const reset = () => setUi(initial);

  const isGeo = ui.mode === 'geohash';
  const full = ui.points.length >= MAX_POINTS;

  const edgeNeighbors = edge.cells.filter((c) => !c.own);
  const edgeTop = (() => {
    const counts = new Map<string, number>();
    for (const id of edge.foundInNeighbors) {
      const p = deferred.points.find((q) => q.id === id);
      if (!p) continue;
      const h = encodeGeohash(p.lat, p.lon, edge.precision);
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    let best = '';
    let most = 0;
    for (const [h, n] of counts) if (n > most) [best, most] = [h, n];
    return best;
  })();

  const crowdLeaves =
    deferred.crowds > 0
      ? { under: leafAt(quad.tree, CROWDS[(deferred.crowds - 1) % CROWDS.length]!), quiet: leafAt(quad.tree, SPOTS.quiet.at) }
      : null;

  const { four, six, seven } = byPrecision;
  const { one, sixteen } = byCapacity;

  const challenges: Challenge[] = [
    {
      id: 'precision',
      prompt: 'Set the geohash precision to 4 characters, then to 7. Compare the cells scanned and the photos checked.',
      explanation: `At 4 characters one cell, ${formatCell(four.cellBox)}, covers the whole map, so the search reads ${s(four.cells.length, 'cell')} and checks all ${
        four.checked.length
      } photos: no better than reading every row. At 7 characters the cells are ${formatCell(seven.cellBox)}, so it checks only ${s(
        seven.checked.length,
        'photo',
      )}, but it has to read ${seven.cells.length} cells. Six characters sit in between, with ${six.cells.length} cells and ${six.checked.length} photos checked.`,
      attempted: triedPrecisions.includes(4) && triedPrecisions.includes(7),
    },
    {
      id: 'edge',
      prompt: 'Put Maya on a cell edge. How many of the photos she finds sit in a neighboring cell?',
      explanation:
        edge.foundInNeighbors.length > 0
          ? `At ${edge.precision} characters, Maya’s cell is \`${edge.centerHash}\`, and her circle also crosses into ${s(edgeNeighbors.length, 'neighboring cell')}. ${
              edge.foundInNeighbors.length
            } of the ${edge.found.length} photos she finds sit in those neighbors, such as \`${edgeTop}\`. A search for her own cell’s prefix would miss every one of them, which is why a nearby query always reads the neighbors too.`
          : 'Photos just across a cell edge have a different geohash, so a search of Maya’s own cell misses them. A nearby query always reads the neighboring cells too.',
      attempted: isGeo && ui.spot === 'edge' && ui.precision >= 5,
    },
    {
      id: 'crowd',
      prompt: 'Switch to the quadtree and drop a crowd. What happens to the cells under it?',
      explanation: crowdLeaves
        ? `Under the newest crowd, the cells split ${s(crowdLeaves.under.depth, 'time')}, down to ${formatCell(crowdLeaves.under.box)}, while the quiet corner’s cell split only ${s(
            crowdLeaves.quiet.depth,
            'time',
          )} and is still ${formatCell(crowdLeaves.quiet.box)}. A cell splits whenever it holds more than ${s(
            deferred.capacity,
            'photo',
          )}, so the tree is fine where photos are dense and coarse where they are sparse. A fixed grid cannot do that.`
        : 'A cell splits into four whenever it holds more photos than its capacity, so the cells under a crowd shrink to a few hundred meters while empty corners stay kilometers wide.',
      attempted: ui.mode === 'quadtree' && ui.crowds >= 1,
    },
    {
      id: 'capacity',
      prompt: 'In the quadtree, set the capacity to 1 photo per cell, then to 16. Compare the cells scanned and the photos checked.',
      explanation: `With room for 1 photo per cell, the search reads ${s(one.scanned.length, 'cell')} and checks ${s(one.checked.length, 'photo')}. With room for 16, it reads ${s(
        sixteen.scanned.length,
        'cell',
      )} and checks ${s(sixteen.checked.length, 'photo')}. Both find the same ${s(
        one.found.length,
        'photo',
      )}. Small cells mean more cells to read and big cells mean more photos to check, so capacity is a tuning knob, just like geohash precision.`,
      attempted: triedCapacities.includes(1) && triedCapacities.includes(16),
    },
  ];

  const ownLeaf = leafAt(quad.tree, deferred.center);

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Geospatial map"
          intro="A sketch of central Singapore, about 10 km across, with Snapgram photos on it. Cut it into geohash cells or a quadtree, then watch which cells Maya’s search for photos within 1 km has to read."
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-ui font-semibold text-ink">Index</span>
        <Segmented<Mode>
          label="Index"
          value={ui.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: 'geohash', label: 'Geohash grid' },
            { value: 'quadtree', label: 'Quadtree' },
          ]}
          className="self-start"
        />
      </div>

      <section aria-label="Map" className="on-panel blueprint-grid flex flex-col gap-3 rounded-panel p-3 sm:p-4">
        <MapSvg ui={deferred} geo={geo} quad={quad} onPick={(p) => moveTo('custom', p)} />
        <p className="text-small text-panel-muted">
          {isGeo
            ? `White lines are geohash cell edges; brighter lines are the larger cells they split from, and shading shows how many photos each cell holds.`
            : `White squares are the quadtree’s cells: each splits into four once it holds more than ${s(ui.capacity, 'photo')}.`}{' '}
          Yellow cells are the ones the search reads. Filled yellow dots are photos within 1 km of Maya, hollow ones were checked but are too far,
          and small grey dots were never read. Click the map to move Maya.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {isGeo ? (
          <Stat label="Maya’s cell" value={geo.centerHash} note={formatCell(geo.cellBox)} />
        ) : (
          <Stat label="Cells in the tree" value={String(quad.leaves.length)} note={`smallest ${formatCell(quad.deepest.box)}`} />
        )}
        <Stat
          label="Cells scanned"
          value={String(isGeo ? geo.cells.length : quad.scanned.length)}
          note={isGeo ? 'one range scan each' : `${quad.visited} tree nodes visited`}
        />
        <Stat
          label="Photos checked"
          value={String(isGeo ? geo.checked.length : quad.checked.length)}
          note={`of ${ui.points.length} on the map`}
          tone={(isGeo ? geo.checked.length : quad.checked.length) > 3 * Math.max(1, isGeo ? geo.found.length : quad.found.length) ? 'alert' : 'ink'}
        />
        <Stat
          label="Photos found"
          value={String(isGeo ? geo.found.length : quad.found.length)}
          note={isGeo && geo.foundInNeighbors.length ? `${geo.foundInNeighbors.length} in neighboring cells` : 'within 1 km'}
          tone="success"
        />
      </div>

      <div className="rounded-card border border-rule bg-paper p-4 sm:p-5">
        {isGeo ? (
          <>
            <p className="text-ui font-semibold text-ink">Cells this search reads</p>
            {geo.cells.length <= 12 ? (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Geohash cells read by the search">
                {geo.cells.map((c) => {
                  const k = c.own ? c.hash.length : sharedPrefix(c.hash, geo.centerHash);
                  return (
                    <li
                      key={c.hash}
                      className={c.own ? 'rounded-full border-2 border-ink px-2.5 py-0.5 font-mono text-small' : 'rounded-full border border-rule px-2.5 py-0.5 font-mono text-small'}
                    >
                      <span className={c.own ? 'font-bold text-ink' : 'text-graphite'}>{c.hash.slice(0, k)}</span>
                      <span className="font-bold text-ink">{c.hash.slice(k)}</span>
                      {c.own ? <span className="font-sans text-graphite"> Maya’s cell</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-ui text-graphite">
                {geo.cells.length} cells: too many to list. Each one is a separate range scan of the index.
              </p>
            )}
            <p className="mt-2 text-small text-graphite">
              Grey characters are the prefix a neighbor shares with Maya’s cell; bold ones differ. Close neighbors can differ early.
            </p>
          </>
        ) : (
          <>
            <p className="text-ui font-semibold text-ink">Maya’s cell in the tree</p>
            <p className="mt-2 text-ui text-graphite">
              {ownLeaf.depth === 0 ? (
                'The whole map is still one cell.'
              ) : (
                <>
                  Path <code className="md-code">{ownLeaf.key}</code>, {s(ownLeaf.depth, 'split')} down from the whole map, {formatCell(ownLeaf.box)}, holding{' '}
                  {s(ownLeaf.items.length, 'photo')}. Each digit picks a quarter: 0 north-west, 1 north-east, 2 south-west, 3 south-east.
                </>
              )}
            </p>
          </>
        )}
      </div>

      <ControlPanel>
        {isGeo ? (
          <Slider
            id="geo-precision"
            label="Geohash precision"
            value={ui.precision}
            min={MIN_PRECISION}
            max={MAX_PRECISION}
            onChange={setPrecision}
            format={(v) => `${v} characters`}
            hint="Each extra character splits every cell into 32 smaller ones."
          />
        ) : (
          <Slider
            id="geo-capacity"
            label="Cell capacity"
            value={CAPACITY_STEPS.indexOf(ui.capacity as (typeof CAPACITY_STEPS)[number])}
            min={0}
            max={CAPACITY_STEPS.length - 1}
            onChange={(i) => setCapacity(CAPACITY_STEPS[i]!)}
            format={(i) => `${s(CAPACITY_STEPS[i]!, 'photo')} per cell`}
            hint="A cell splits into four quarters when it holds more photos than this."
          />
        )}
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">Where Maya is</span>
          <Segmented<Spot>
            label="Where Maya is"
            value={ui.spot}
            onChange={(spot) => spot !== 'custom' && moveTo(spot, SPOTS[spot].at)}
            options={SPOT_ORDER.map((id) => ({ value: id, label: SPOTS[id].label }))}
            size="sm"
            className="flex-wrap self-start"
          />
          <p className="text-small text-graphite">Or click the map to move her.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <Button size="sm" onClick={addPhotos} disabled={full}>
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Add {ADD_COUNT} photos
          </Button>
          <Button size="sm" onClick={dropCrowd} disabled={full}>
            <Users className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Drop a crowd of {CROWD_SIZE}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset the map
          </Button>
          {full ? <span className="text-small text-graphite">The map is full at {MAX_POINTS} photos.</span> : null}
        </div>
      </ControlPanel>

      <Challenges simId="geo-map" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          The map is a flat sketch with a few hundred photos, and every search uses a 1 km circle. Real indexes hold millions of points, adjacent
          cells are often merged into one range scan, and geohash cells shrink toward the poles. Many systems use R-trees, Google’s S2 or Uber’s
          H3 instead of plain geohashes.
        </p>
      </Callout>
    </div>
  );
}
