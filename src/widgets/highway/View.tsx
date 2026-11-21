import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Slider } from '@/design/primitives';
import { useElementWidth, useInView } from '@/lib/hooks';
import { useReducedMotion } from '@/state/settings';
import { ControlPanel, Stat } from '@/simulators/shared/SimParts';
import type { WidgetProps } from '../registry';
import {
  ARRIVAL_MAX,
  ARRIVAL_MIN,
  ARRIVAL_STEP,
  DEFAULT_CONFIG,
  LANE_GAP_SEC,
  MAX_LANES,
  RUN_SECONDS,
  SNAPSHOT_SECONDS,
  SPEEDS_KMH,
  advance,
  capacityPerMin,
  clampLanes,
  formatClock,
  formatSeconds,
  initialState,
  progress,
  snapshot,
  throughputPerMin,
  tripSeconds,
  waitForNewCar,
  type HighwayConfig,
  type HighwayState,
} from './logic';

function fromProps(props: WidgetProps['props']): HighwayConfig {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const speed = num(props?.speedKmh, DEFAULT_CONFIG.speedKmh);
  return {
    lanes: clampLanes(num(props?.lanes, DEFAULT_CONFIG.lanes)),
    speedKmh: SPEEDS_KMH.includes(speed as (typeof SPEEDS_KMH)[number]) ? speed : DEFAULT_CONFIG.speedKmh,
    arrivalsPerMin: Math.max(ARRIVAL_MIN, Math.min(ARRIVAL_MAX, num(props?.arrivalsPerMin, DEFAULT_CONFIG.arrivalsPerMin))),
  };
}

function speedIndex(speed: number): number {
  const i = SPEEDS_KMH.findIndex((s) => s === speed);
  return i < 0 ? 1 : i;
}

/**
 * The highway: lanes are bandwidth, the speed limit sets latency, and cars delivered
 * per minute are throughput. Arrivals beyond capacity queue at the on-ramp.
 */
export default function HighwayWidget({ props }: WidgetProps) {
  const initial = useMemo(() => fromProps(props), [props]);
  const [cfg, setCfg] = useState<HighwayConfig>(initial);
  const [sim, setSim] = useState<HighwayState>(initialState);
  const [playing, setPlaying] = useState(true);
  const reduced = useReducedMotion();

  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const [viewRef, inView] = useInView<HTMLDivElement>(0.2);
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      measureRef(el);
      viewRef(el);
    },
    [measureRef, viewRef],
  );

  const cfgRef = useRef(cfg);
  useEffect(() => {
    cfgRef.current = cfg;
  }, [cfg]);

  const finished = sim.t >= RUN_SECONDS - 1e-6;

  useEffect(() => {
    if (reduced || !playing || !inView || finished) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      setSim((s) => (s.t >= RUN_SECONDS ? s : advance(s, Math.min(dt, RUN_SECONDS - s.t), cfgRef.current)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, playing, inView, finished]);

  const still = useMemo(() => snapshot(cfg, SNAPSHOT_SECONDS), [cfg]);
  const shown = reduced ? still : sim;

  const update = (patch: Partial<HighwayConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    if (finished) {
      setSim(initialState());
      setPlaying(true);
    }
  };
  const restart = () => {
    setSim(initialState());
    setPlaying(true);
  };

  const trip = tripSeconds(cfg.speedKmh);
  const capacity = capacityPerMin(cfg.lanes);
  const throughput = throughputPerMin(cfg);
  const overloaded = cfg.arrivalsPerMin > capacity;
  const wait = waitForNewCar(shown, cfg);
  const waiting = shown.queue.length;
  const newTrip = wait + trip;

  const description =
    `A road with ${cfg.lanes} of ${MAX_LANES} lanes open and a ${cfg.speedKmh} km/h speed limit. ` +
    `${cfg.arrivalsPerMin} cars arrive each minute and the open lanes can carry ${capacity}. ` +
    (waiting > 0
      ? `${waiting} cars are waiting at the on-ramp, so a car arriving now needs ${formatSeconds(newTrip)} in all.`
      : `Nobody waits at the on-ramp, so each car takes ${formatSeconds(trip)}.`);

  return (
    <div className="flex flex-col gap-5">
      <div className="on-panel blueprint-grid rounded-panel p-3 sm:p-4">
        <div ref={setRefs} className="w-full">
          {width > 0 ? <Road width={width} state={shown} cfg={cfg} label={description} /> : <div style={{ height: 170 }} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {reduced ? (
          <p className="text-small text-graphite">
            A still picture after one minute of traffic, with the same numbers. Turn off reduced motion in Settings to watch the cars move.
          </p>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => (finished ? restart() : setPlaying((p) => !p))}
            >
              {playing && !finished ? (
                <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              ) : (
                <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              )}
              {finished ? 'Start again' : playing ? 'Pause' : 'Resume'}
            </Button>
            <Button size="sm" variant="ghost" onClick={restart}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Restart with an empty road
            </Button>
            <span className="tabular text-small text-graphite">
              {formatClock(shown.t)} of {formatClock(RUN_SECONDS)}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Trip time for one car" value={formatSeconds(trip)} note="Latency: set by the speed limit" />
        <Stat label="Capacity" value={`${capacity} a minute`} note="Bandwidth: set by the lanes" />
        <Stat
          label="Throughput"
          value={`${throughput} a minute`}
          note={overloaded ? 'Capped by the lanes' : 'Cars delivered, once traffic settles'}
        />
        <Stat
          label="A car arriving now takes"
          value={formatSeconds(newTrip)}
          note={waiting > 0 ? `${waiting} cars waiting at the on-ramp` : 'No wait at the on-ramp'}
          tone={wait >= 1 ? 'alert' : 'ink'}
        />
      </div>

      <ControlPanel>
        <Slider
          id="highway-lanes"
          label="Lanes"
          value={cfg.lanes}
          min={1}
          max={MAX_LANES}
          onChange={(lanes) => update({ lanes })}
          format={(v) => (v === 1 ? '1 lane' : `${v} lanes`)}
          hint={`Each lane takes one car every ${LANE_GAP_SEC} seconds: ${60 / LANE_GAP_SEC} a minute.`}
        />
        <Slider
          id="highway-speed"
          label="Speed limit"
          value={speedIndex(cfg.speedKmh)}
          min={0}
          max={SPEEDS_KMH.length - 1}
          onChange={(i) => update({ speedKmh: SPEEDS_KMH[i] ?? DEFAULT_CONFIG.speedKmh })}
          format={(i) => `${SPEEDS_KMH[i]} km/h`}
          hint="Sets how long one car takes to cross the stretch of road."
        />
        <Slider
          id="highway-arrivals"
          label="Cars arriving"
          value={cfg.arrivalsPerMin}
          min={ARRIVAL_MIN}
          max={ARRIVAL_MAX}
          step={ARRIVAL_STEP}
          onChange={(arrivalsPerMin) => update({ arrivalsPerMin })}
          format={(v) => `${v} a minute`}
          hint="How many cars want to use the road. Above capacity, a queue forms."
        />
        <div className="flex items-end">
          <Button size="sm" variant="ghost" onClick={() => update(initial)}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset the settings
          </Button>
        </div>
      </ControlPanel>
    </div>
  );
}

/** The road itself, drawn at 1:1 pixel scale so the labels stay readable on phones. */
function Road({ width, state, cfg, label }: { width: number; state: HighwayState; cfg: HighwayConfig; label: string }) {
  const compact = width < 520;
  const laneH = compact ? 20 : 24;
  const carW = compact ? 10 : 14;
  const carH = compact ? 7 : 9;
  const top = 26;
  const roadH = MAX_LANES * laneH;
  const bottom = top + roadH;
  const height = bottom + 28;
  const queueW = Math.round(Math.min(168, Math.max(64, width * 0.2)));
  const roadX = queueW + 16;
  const roadW = Math.max(80, width - roadX - 2);

  const slotW = carW + 4;
  const cols = Math.max(1, Math.floor((queueW - 6) / slotW));
  const visible = cols * MAX_LANES;
  const queued = state.queue.slice(0, visible);
  const hidden = state.queue.length - queued.length;
  const travel = roadW - carW - 8;

  return (
    <svg width={width} height={height} role="img" aria-label={label} className="block">
      {/* Labels */}
      <text x={0} y={16} fontSize={12} fontWeight={600} fill="var(--panel-text)">
        On-ramp
      </text>
      <text x={roadX} y={16} fontSize={12} fontWeight={600} fill="var(--panel-text)">
        Speed limit {cfg.speedKmh} km/h
      </text>
      {roadW > 230 ? (
        <text x={roadX + roadW} y={16} fontSize={12} textAnchor="end" fill="var(--panel-muted)">
          Exit
        </text>
      ) : null}

      {/* On-ramp */}
      <rect x={0.5} y={top + 0.5} width={queueW - 1} height={roadH - 1} rx={6} fill="none" stroke="var(--panel-line)" strokeOpacity={0.45} strokeDasharray="4 4" />
      {state.queue.length === 0 ? (
        <text x={queueW / 2} y={top + roadH / 2 + 4} fontSize={12} textAnchor="middle" fill="var(--panel-muted)">
          No queue
        </text>
      ) : null}
      {queued.map((car, i) => {
        const col = Math.floor(i / MAX_LANES);
        const row = i % MAX_LANES;
        return (
          <rect
            key={car.id}
            x={queueW - 4 - (col + 1) * slotW + 2}
            y={top + row * laneH + (laneH - carH) / 2}
            width={carW}
            height={carH}
            rx={2}
            fill="var(--signal)"
            stroke="var(--panel)"
            strokeWidth={1}
            opacity={0.85}
          />
        );
      })}
      <path
        d={`M${queueW + 4} ${top + roadH / 2 - 5} L${queueW + 11} ${top + roadH / 2} L${queueW + 4} ${top + roadH / 2 + 5}`}
        fill="none"
        stroke="var(--panel-line)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Road */}
      <rect x={roadX} y={top} width={roadW} height={roadH} fill="var(--panel-raised)" />
      {Array.from({ length: MAX_LANES }, (_, lane) =>
        lane >= cfg.lanes ? (
          <g key={`closed-${lane}`}>
            <rect x={roadX} y={top + lane * laneH} width={roadW} height={laneH} fill="var(--panel)" />
            <text x={roadX + roadW / 2} y={top + lane * laneH + laneH / 2 + 4} fontSize={11} textAnchor="middle" fill="var(--panel-muted)">
              Lane closed
            </text>
          </g>
        ) : null,
      )}
      {Array.from({ length: MAX_LANES - 1 }, (_, i) => (
        <line
          key={`divider-${i}`}
          x1={roadX}
          x2={roadX + roadW}
          y1={top + (i + 1) * laneH}
          y2={top + (i + 1) * laneH}
          stroke="var(--panel-line)"
          strokeOpacity={0.55}
          strokeDasharray="8 8"
        />
      ))}
      <line x1={roadX} x2={roadX + roadW} y1={top} y2={top} stroke="var(--panel-line)" strokeWidth={1.5} />
      <line x1={roadX} x2={roadX + roadW} y1={bottom} y2={bottom} stroke="var(--panel-line)" strokeWidth={1.5} />

      {/* Cars on the road */}
      {state.road.map((car) => (
        <rect
          key={car.id}
          x={roadX + 4 + progress(car, state.t) * travel}
          y={top + car.lane * laneH + (laneH - carH) / 2}
          width={carW}
          height={carH}
          rx={2}
          fill="var(--signal)"
          stroke="var(--panel)"
          strokeWidth={1}
        />
      ))}

      {/* Bottom row */}
      {hidden > 0 ? (
        <text x={0} y={bottom + 19} fontSize={12} fontWeight={600} fill="var(--panel-alert)">
          +{hidden} more waiting
        </text>
      ) : null}
      <text x={roadX + roadW} y={bottom + 19} fontSize={12} textAnchor="end" fill="var(--panel-muted)" className="tabular">
        Delivered: {state.delivered}
      </text>
    </svg>
  );
}
