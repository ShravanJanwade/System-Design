import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, Pause, Play, TriangleExclamationPoint } from 'lucide-react';
import { Button } from '@/design/Button';
import { Segmented, Slider, Toggle } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { useElementWidth } from '@/lib/hooks';
import { ControlPanel, Stat } from '@/simulators/shared/SimParts';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  DEFAULTS,
  MAX_DRIFT_PPM,
  MINUTE_MS,
  START_MS,
  WINDOW_MIN,
  apartPerMinute,
  formatClock,
  formatDrift,
  formatOffset,
  formatSpan,
  maxSkew,
  offsetAt,
  offsetSeries,
  thread,
  type Post,
  type SyncEvery,
} from './logic';

type SyncKey = '1' | '15' | '60' | 'never';

const SYNC_OPTIONS: { value: SyncKey; label: string }[] = [
  { value: '1', label: '1 min' },
  { value: '15', label: '15 min' },
  { value: '60', label: '1 hour' },
  { value: 'never', label: 'Never' },
];

const SYNC_WORDS: Record<SyncKey, string> = { '1': 'every minute', '15': 'every 15 minutes', '60': 'every hour', never: 'never' };

function toSync(k: SyncKey): SyncEvery {
  return k === 'never' ? null : Number(k);
}

function toKey(v: unknown): SyncKey {
  if (v === 1 || v === '1') return '1';
  if (v === 60 || v === '60') return '60';
  if (v === null || v === 0 || v === 'never') return 'never';
  return '15';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const clockAt = (min: number) => formatClock(START_MS + min * MINUTE_MS);

/**
 * Two server clocks drifting apart between syncs, and what that does to a comment thread
 * sorted by timestamp, compared with one sorted by a logical clock.
 */
export default function DriftingClocksWidget({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const [oregonPpm, setOregonPpm] = useState(() => clamp(Math.round(num(props?.oregonPpm, DEFAULTS.oregonPpm) / 10) * 10, -MAX_DRIFT_PPM, MAX_DRIFT_PPM));
  const [singaporePpm, setSingaporePpm] = useState(() =>
    clamp(Math.round(num(props?.singaporePpm, DEFAULTS.singaporePpm) / 10) * 10, -MAX_DRIFT_PPM, MAX_DRIFT_PPM),
  );
  const [syncKey, setSyncKey] = useState<SyncKey>(() => toKey(props?.syncMin ?? DEFAULTS.syncMin));
  const [atMin, setAtMin] = useState(() => clamp(num(props?.atMin, DEFAULTS.atMin), 0, WINDOW_MIN));
  const [gapMs, setGapMs] = useState(() => clamp(Math.round(num(props?.gapMs, DEFAULTS.gapMs) / 10) * 10, 10, 1000));
  const [logical, setLogical] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [measureRef, width] = useElementWidth<HTMLDivElement>();

  const sync = toSync(syncKey);
  const running = playing && atMin < WINDOW_MIN;

  // Time moves in small steps, or in 5-minute jumps when motion is reduced.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setAtMin((m) => Math.min(WINDOW_MIN, m + (reduced ? 5 : 0.5))), reduced ? 700 : 60);
    return () => window.clearTimeout(id);
  }, [running, atMin, reduced]);

  const togglePlay = () => {
    if (running) {
      setPlaying(false);
      return;
    }
    if (atMin >= WINDOW_MIN) setAtMin(0);
    setPlaying(true);
  };

  const tMs = atMin * MINUTE_MS;
  const orOff = offsetAt(tMs, oregonPpm, sync);
  const sgOff = offsetAt(tMs, singaporePpm, sync);
  const skew = sgOff - orOff;
  const peak = maxSkew(oregonPpm, singaporePpm, sync);
  const th = useMemo(() => thread(atMin, gapMs, oregonPpm, singaporePpm, sync), [atMin, gapMs, oregonPpm, singaporePpm, sync]);
  const order = logical ? th.byCounter : th.byTime;
  const wrong = !logical && th.replyFirst;
  const now = clockAt(atMin);

  const summary =
    `Chart of each clock’s error from true time over two hours, from 09:00 to 11:00. Oregon’s clock drifts ${formatDrift(oregonPpm)}; Singapore’s ${formatDrift(singaporePpm)}. ` +
    (sync === null
      ? `They are never synced, so the gap between them keeps growing, to ${formatSpan(peak)} after two hours. `
      : `Both are synced ${SYNC_WORDS[syncKey]}, so the gap between them grows to ${formatSpan(peak)} and then snaps back to zero. `) +
    `At ${now.slice(0, 8)}, Oregon is ${formatOffset(orOff)} and Singapore ${formatOffset(sgOff)} from true time.`;

  const ahead = th.skewMs >= 0 ? 'ahead of' : 'behind';
  const status = logical
    ? `Right order. The comment carries counter ${th.comment.counter}; Oregon saw it before the reply was written, so the reply got ${th.reply.counter} and sorts after it, whatever the clocks say.`
    : th.replyFirst
      ? `Wrong order. The reply was written ${gapMs} ms after the comment, but Singapore’s clock is ${formatSpan(th.skewMs)} ahead of Oregon’s, so the reply’s timestamp is ${formatSpan(th.stampGapMs)} earlier and it sorts first.`
      : `Right order, for now. Singapore’s clock is ${formatSpan(th.skewMs)} ${ahead} Oregon’s, ${th.skewMs >= 0 ? `less than the ${gapMs} ms between the posts` : 'which only widens the gap between the stamps'}. Move closer to the next sync, or sync less often, and watch for the flip.`;

  return (
    <div className="flex flex-col gap-5">
      <div className="on-panel blueprint-grid flex flex-col gap-4 rounded-panel p-3 sm:p-5">
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
          <ClockFace label="True time" time={now} note="what the clocks should read" />
          <ClockFace label="Oregon clock" time={formatClock(START_MS + tMs + orOff)} note={`${formatOffset(orOff)}, drifting ${formatDrift(oregonPpm)}`} swatch="oregon" />
          <ClockFace
            label="Singapore clock"
            time={formatClock(START_MS + tMs + sgOff)}
            note={`${formatOffset(sgOff)}, drifting ${formatDrift(singaporePpm)}`}
            swatch="singapore"
          />
        </div>
        <p className="text-small text-panel-muted">Each clock’s error from true time, in milliseconds. Above the middle line the clock is fast; below it, slow.</p>
        <div ref={measureRef} className="w-full">
          {width > 0 ? (
            <ClockChart width={width} oregonPpm={oregonPpm} singaporePpm={singaporePpm} sync={sync} atMin={atMin} orOff={orOff} sgOff={sgOff} summary={summary} />
          ) : (
            <div style={{ height: 210 }} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Skew now" value={formatOffset(skew)} note="Singapore minus Oregon" />
        <Stat label="Largest skew" value={formatSpan(peak)} note={sync === null ? 'after two hours unsynced' : 'just before each sync'} />
        <Stat label="Drifting apart" value={`${apartPerMinute(oregonPpm, singaporePpm).toFixed(1)} ms`} note="every minute" />
        <Stat label="Thread order" value={wrong ? 'Wrong' : 'Right'} note={logical ? 'by logical clock' : 'by timestamp'} tone={wrong ? 'alert' : 'success'} />
      </div>

      <ControlPanel>
        <Slider
          id="clocks-oregon"
          label="Oregon clock drift"
          value={oregonPpm}
          min={-MAX_DRIFT_PPM}
          max={MAX_DRIFT_PPM}
          step={10}
          onChange={setOregonPpm}
          format={formatDrift}
          hint="Parts per million: 100 ppm is 6 ms a minute."
        />
        <Slider
          id="clocks-singapore"
          label="Singapore clock drift"
          value={singaporePpm}
          min={-MAX_DRIFT_PPM}
          max={MAX_DRIFT_PPM}
          step={10}
          onChange={setSingaporePpm}
          format={formatDrift}
          hint="Real server clocks are often tens of ppm off."
        />
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">Sync both clocks every</span>
          <Segmented<SyncKey> label="Sync both clocks every" value={syncKey} onChange={setSyncKey} options={SYNC_OPTIONS} size="sm" className="self-start" />
          <p className="text-small text-graphite">Each sync snaps a clock back to true time, as the Network Time Protocol (NTP) does.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Slider
            id="clocks-time"
            label="Time"
            value={atMin}
            min={0}
            max={WINDOW_MIN}
            step={1}
            onChange={(v) => {
              setPlaying(false);
              setAtMin(v);
            }}
            format={(v) => clockAt(v).slice(0, 8)}
          />
          <Button onClick={togglePlay} className="self-start" aria-pressed={running}>
            {running ? <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
            {running ? 'Pause time' : atMin >= WINDOW_MIN ? 'Play from 09:00' : 'Play time'}
          </Button>
        </div>
      </ControlPanel>

      <div className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <p className="text-ui font-semibold text-ink">The comment thread at {now.slice(0, 8)}</p>
          <p className="text-small text-graphite">
            Maya comments from Singapore, and her friend replies from Oregon {gapMs} ms later. Each post is stamped by its own region’s clock, and the
            thread is listed {logical ? 'by logical counter' : 'by timestamp'}.
          </p>
        </div>
        <ol className="flex flex-col gap-2" aria-label={`The thread as Snapgram lists it, ${logical ? 'by logical counter' : 'by timestamp'}`}>
          {order.map((p) => (
            <PostRow key={p.id} post={p} logical={logical} misplaced={wrong && p.id === 'reply'} />
          ))}
        </ol>
        <p aria-live="polite" className={cn('flex items-start gap-2 text-ui', wrong ? 'text-alert' : 'text-ink')}>
          {wrong ? (
            <TriangleExclamationPoint className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
          ) : (
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={1.5} aria-hidden />
          )}
          <span>{status}</span>
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Toggle
            id="clocks-logical"
            label="Sort by logical clock"
            checked={logical}
            onChange={setLogical}
            description="Each post carries a counter that travels with it, instead of the server’s time."
          />
          <Slider
            id="clocks-gap"
            label="Reply written after"
            value={gapMs}
            min={10}
            max={1000}
            step={10}
            onChange={setGapMs}
            format={(v) => `${v} ms`}
            hint="A person needs a second or more; a bot or a spam filter, a few milliseconds."
          />
        </div>
      </div>
    </div>
  );
}

function Swatch({ kind }: { kind: 'oregon' | 'singapore' }) {
  return (
    <svg width={22} height={8} aria-hidden className="shrink-0">
      <line
        x1={1}
        x2={21}
        y1={4}
        y2={4}
        stroke={kind === 'oregon' ? 'var(--panel-text)' : 'var(--signal)'}
        strokeWidth={kind === 'oregon' ? 1.75 : 2.25}
        strokeDasharray={kind === 'oregon' ? '5 3' : undefined}
      />
    </svg>
  );
}

function ClockFace({ label, time, note, swatch }: { label: string; time: string; note: string; swatch?: 'oregon' | 'singapore' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-2 text-small text-panel-muted">
        {swatch ? <Swatch kind={swatch} /> : null}
        {label}
      </span>
      <span className="tabular text-[18px] leading-7 text-panel-text sm:text-[20px]">{time}</span>
      <span className="tabular text-small text-panel-muted">{note}</span>
    </div>
  );
}

function PostRow({ post, logical, misplaced }: { post: Post; logical: boolean; misplaced: boolean }) {
  const isReply = post.id === 'reply';
  return (
    <li className={cn('flex flex-col gap-1 rounded-card border p-3', misplaced ? 'border-alert bg-alert-wash' : 'border-rule bg-paper', isReply && 'ml-4 sm:ml-8')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-ui font-semibold text-ink">
          {post.author} <span className="font-normal text-graphite">in {post.region}</span>
        </span>
        <span className="tabular text-small text-graphite">{logical ? `counter ${post.counter}` : `stamped ${formatClock(post.stampMs)}`}</span>
      </div>
      <p className="text-ui text-ink">
        {isReply ? <span className="text-graphite">Replying to Maya: </span> : null}
        {post.text}
      </p>
      {misplaced ? <span className="text-small font-semibold text-alert">Listed above the comment it answers</span> : null}
    </li>
  );
}

const NICE = [20, 50, 100, 200, 500, 1000, 2000];

function tickLabel(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  return `${v > 0 ? '+' : '−'}${abs >= 1000 ? `${abs / 1000} s` : `${abs} ms`}`;
}

/** The two clocks’ errors over the two-hour window: sawtooth lines, a "now" line and direct labels. */
function ClockChart({
  width,
  oregonPpm,
  singaporePpm,
  sync,
  atMin,
  orOff,
  sgOff,
  summary,
}: {
  width: number;
  oregonPpm: number;
  singaporePpm: number;
  sync: SyncEvery;
  atMin: number;
  orOff: number;
  sgOff: number;
  summary: string;
}) {
  const narrow = width < 520;
  const left = 54;
  const right = 10;
  const top = 10;
  const bottom = 24;
  const height = narrow ? 190 : 220;
  const plotW = Math.max(100, width - left - right);
  const plotH = height - top - bottom;
  const span = sync === null ? WINDOW_MIN : Math.min(sync, WINDOW_MIN);
  const peakAbs = (Math.max(Math.abs(oregonPpm), Math.abs(singaporePpm)) * span * MINUTE_MS) / 1_000_000;
  const yMax = NICE.find((s) => s >= peakAbs) ?? 2000;
  const sx = (min: number) => left + (min / WINDOW_MIN) * plotW;
  const sy = (ms: number) => top + plotH / 2 - (Math.max(-yMax, Math.min(yMax, ms)) / yMax) * (plotH / 2);
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const yTicks = [-yMax, -yMax / 2, 0, yMax / 2, yMax];
  const xTicks = narrow ? [0, 60, 120] : [0, 30, 60, 90, 120];

  // Direct labels beside the "now" dots, nudged apart when they would overlap.
  const nx = sx(atMin);
  const labelRight = nx < left + plotW * 0.6;
  let ySg = sy(sgOff);
  let yOr = sy(orOff);
  const minGap = 16;
  if (Math.abs(ySg - yOr) < minGap) {
    const mid = (ySg + yOr) / 2;
    const sgAbove = sgOff >= orOff;
    ySg = mid + (sgAbove ? -minGap / 2 : minGap / 2);
    yOr = mid + (sgAbove ? minGap / 2 : -minGap / 2);
  }
  const clampY = (y: number) => Math.max(top + 8, Math.min(top + plotH - 4, y));
  const halo = { stroke: 'var(--panel)', strokeWidth: 4, strokeLinejoin: 'round' as const, paintOrder: 'stroke' as const };

  return (
    <svg width={width} height={height} role="img" aria-label={summary} className="block select-none">
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={left}
            x2={left + plotW}
            y1={sy(t)}
            y2={sy(t)}
            stroke="var(--panel-line)"
            strokeOpacity={t === 0 ? 0.7 : 0.18}
            strokeDasharray={t === 0 ? undefined : '2 4'}
          />
          <text x={left - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--panel-muted)" className="tabular">
            {tickLabel(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={sx(t)} y={height - 6} textAnchor={t === 0 ? 'start' : t === WINDOW_MIN ? 'end' : 'middle'} fontSize={11} fill="var(--panel-muted)" className="tabular">
          {clockAt(t).slice(0, 5)}
        </text>
      ))}

      <path d={path(offsetSeries(oregonPpm, sync))} fill="none" stroke="var(--panel-text)" strokeWidth={1.75} strokeDasharray="6 4" strokeLinejoin="round" />
      <path d={path(offsetSeries(singaporePpm, sync))} fill="none" stroke="var(--signal)" strokeWidth={2.25} strokeLinejoin="round" />

      <line x1={nx} x2={nx} y1={top} y2={top + plotH} stroke="var(--panel-muted)" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={nx} x2={nx} y1={sy(sgOff)} y2={sy(orOff)} stroke="var(--panel-text)" strokeWidth={3} strokeOpacity={0.55} />
      <circle cx={nx} cy={sy(orOff)} r={4.5} fill="var(--panel)" stroke="var(--panel-text)" strokeWidth={2} />
      <circle cx={nx} cy={sy(sgOff)} r={4.5} fill="var(--signal)" stroke="var(--panel)" strokeWidth={1.5} />

      <g aria-hidden fontSize={12} fontWeight={600} className="tabular">
        <text x={labelRight ? nx + 9 : nx - 9} y={clampY(ySg) + 4} textAnchor={labelRight ? 'start' : 'end'} fill="var(--signal)" {...halo}>
          Singapore {formatOffset(sgOff)}
        </text>
        <text x={labelRight ? nx + 9 : nx - 9} y={clampY(yOr) + 4} textAnchor={labelRight ? 'start' : 'end'} fill="var(--panel-text)" {...halo}>
          Oregon {formatOffset(orOff)}
        </text>
      </g>
    </svg>
  );
}
