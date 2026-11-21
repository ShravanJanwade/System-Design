import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Pause, Play, RefreshCw, X } from 'lucide-react';
import { Button } from '@/design/Button';
import { Segmented, Slider } from '@/design/primitives';
import { cn } from '@/lib/cn';
import { useElementWidth } from '@/lib/hooks';
import { useReducedMotion } from '@/state/settings';
import { ControlPanel, Stat } from '@/simulators/shared/SimParts';
import type { WidgetProps } from '../registry';
import {
  AXIS_END,
  DELAYED_AFTER,
  DELAY_MAX,
  DELAY_STEP,
  LATENESS_MAX,
  WINDOW_SIZES,
  describeAt,
  explainPost,
  formatClock,
  formatCounts,
  formatMinutes,
  normalizeConfig,
  runStream,
  slideFor,
  totalsAt,
  watermarkAt,
  windowAt,
  windowLabel,
  type Counts,
  type Fate,
  type StreamConfig,
  type StreamRun,
  type WindowKind,
  type WindowView,
} from './logic';

/** Minutes of stream time per second of playback. */
const SPEED = 3;

const LEFT = 64;
const RIGHT = 14;
const Y_CLOCK = 12;
const Y_ARRIVED = 36;
const Y_POSTED = 90;
const BAND_TOP = 108;
const BAND_H = 24;
const BAND_GAP = 6;

function fromProps(props: WidgetProps['props']): StreamConfig {
  const p = props ?? {};
  return normalizeConfig({
    kind: p.kind === 'sliding' ? 'sliding' : 'tumbling',
    size: typeof p.size === 'number' ? p.size : undefined,
    watermarkDelay: typeof p.watermarkDelay === 'number' ? p.watermarkDelay : undefined,
    allowedLateness: typeof p.allowedLateness === 'number' ? p.allowedLateness : undefined,
  });
}

function PostMark({ x, y, fate, r }: { x: number; y: number; fate: Fate; r: number }) {
  if (fate === 'dropped') {
    return (
      <g stroke="var(--panel-alert)" strokeWidth={2} strokeLinecap="round">
        <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
        <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} />
      </g>
    );
  }
  if (fate === 'updated') return <circle cx={x} cy={y} r={r} fill="var(--panel)" stroke="var(--panel-success)" strokeWidth={2} />;
  return <circle cx={x} cy={y} r={r} fill="var(--signal)" />;
}

function Timeline({ run, now, width }: { run: StreamRun; now: number; width: number }) {
  const pw = Math.max(160, width - LEFT - RIGHT);
  const svgWidth = LEFT + pw + RIGHT;
  const x = (t: number) => LEFT + (Math.min(AXIS_END, Math.max(0, t)) / AXIS_END) * pw;
  const clampLabel = (v: number) => Math.min(LEFT + pw - 30, Math.max(LEFT + 30, v));
  const rows = run.config.kind === 'tumbling' ? 1 : 2;
  const bandY = (row: number) => BAND_TOP + row * (BAND_H + BAND_GAP);
  const bandsBottom = bandY(rows - 1) + BAND_H;
  const wmLabelY = bandsBottom + 16;
  const tickY = bandsBottom + 36;
  const height = tickY + 6;
  const tickStep = pw >= 420 ? 5 : 15;
  const ticks = Array.from({ length: Math.floor(AXIS_END / tickStep) + 1 }, (_, i) => i * tickStep);
  const r = pw < 320 ? 3.5 : 4.5;
  const wm = Math.max(0, watermarkAt(run.config, now));
  const arrived = run.posts.filter((p) => p.post.arrival <= now);
  const waiting = run.posts.filter((p) => p.post.eventTime <= now && p.post.arrival > now);
  const views = run.windows.map((w) => windowAt(w, now));

  return (
    <svg width={svgWidth} height={height} viewBox={`0 0 ${svgWidth} ${height}`} role="img" aria-label={describeAt(run, now)} className="block">
      {ticks.map((t) => (
        <line key={`g${t}`} x1={x(t)} x2={x(t)} y1={Y_ARRIVED - 10} y2={bandsBottom} stroke="var(--panel-line)" strokeOpacity={0.3} strokeWidth={1} />
      ))}

      <text x={10} y={Y_ARRIVED + 4} fontSize={12} fontWeight={600} fill="var(--panel-text)">
        Arrived
      </text>
      <text x={10} y={Y_POSTED + 4} fontSize={12} fontWeight={600} fill="var(--panel-text)">
        Posted
      </text>
      <text x={10} y={BAND_TOP + BAND_H / 2 + 4} fontSize={12} fontWeight={600} fill="var(--panel-text)">
        Windows
      </text>
      <line x1={x(0)} x2={x(AXIS_END)} y1={Y_ARRIVED} y2={Y_ARRIVED} stroke="var(--panel-line)" strokeWidth={1} />
      <line x1={x(0)} x2={x(AXIS_END)} y1={Y_POSTED} y2={Y_POSTED} stroke="var(--panel-line)" strokeWidth={1} />

      {views.map((v) => {
        const w = v.window;
        const x1 = x(w.start) + 1.5;
        const x2 = x(w.end) - 1.5;
        const y = bandY(w.row);
        const done = v.phase !== 'collecting';
        return (
          <g key={w.index}>
            <rect
              x={x1}
              y={y}
              width={Math.max(0, x2 - x1)}
              height={BAND_H}
              rx={4}
              fill={done ? 'var(--panel-raised)' : 'none'}
              stroke={v.phase === 'open' ? 'var(--signal)' : done ? 'var(--panel-text)' : 'var(--panel-muted)'}
              strokeWidth={v.phase === 'open' ? 1.5 : 1}
              strokeDasharray={done ? undefined : '3 3'}
            />
            {x2 - x1 >= 14 && (done || v.count > 0) ? (
              <text
                x={(x1 + x2) / 2}
                y={y + BAND_H / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={done ? 700 : 400}
                fill={done ? 'var(--panel-text)' : 'var(--panel-muted)'}
                className="tabular"
              >
                {v.count}
              </text>
            ) : null}
            {v.updates > 0 ? <circle cx={x2 - 4} cy={y + 4} r={2.5} fill="var(--panel-success)" /> : null}
          </g>
        );
      })}

      {arrived.map((p) => (
        <line
          key={`c${p.post.id}`}
          x1={x(p.post.eventTime)}
          y1={Y_POSTED - r - 1}
          x2={x(p.post.arrival)}
          y2={Y_ARRIVED + 4}
          stroke={p.delay >= DELAYED_AFTER ? 'var(--panel-text)' : 'var(--panel-line)'}
          strokeOpacity={p.delay >= DELAYED_AFTER ? 0.85 : 0.6}
          strokeWidth={1}
          strokeDasharray={p.delay >= DELAYED_AFTER ? '3 3' : undefined}
        />
      ))}
      {waiting.map((p) => (
        <circle key={`w${p.post.id}`} cx={x(p.post.eventTime)} cy={Y_POSTED} r={r} fill="none" stroke="var(--panel-muted)" strokeWidth={1.25} strokeDasharray="2 2" />
      ))}
      {arrived.map((p) => (
        <circle key={`a${p.post.id}`} cx={x(p.post.arrival)} cy={Y_ARRIVED} r={3} fill="var(--panel)" stroke="var(--panel-text)" strokeWidth={1.25} />
      ))}
      {arrived.map((p) => (
        <PostMark key={`e${p.post.id}`} x={x(p.post.eventTime)} y={Y_POSTED} fate={p.worst} r={r} />
      ))}

      <line x1={x(wm)} x2={x(wm)} y1={Y_POSTED - 16} y2={bandsBottom + 4} stroke="var(--panel-text)" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={clampLabel(x(wm))} y={wmLabelY} textAnchor="middle" fontSize={11} fill="var(--panel-text)">
        watermark
      </text>
      <line x1={x(now)} x2={x(now)} y1={Y_ARRIVED - 14} y2={Y_ARRIVED + 10} stroke="var(--signal)" strokeWidth={2} />
      <text x={clampLabel(x(now))} y={Y_CLOCK} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--signal)" className="tabular">
        {formatClock(now)}
      </text>

      {ticks.map((t) => (
        <text key={`t${t}`} x={x(t)} y={tickY} textAnchor="middle" fontSize={11} fill="var(--panel-muted)" className="tabular">
          {formatClock(t)}
        </text>
      ))}
    </svg>
  );
}

function LegendItem({ children, icon }: { children: string; icon: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <svg width={14} height={14} viewBox="-7 -7 14 14" aria-hidden className="shrink-0">
        {icon}
      </svg>
      <span>{children}</span>
    </li>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-small text-panel-text">
      <LegendItem icon={<circle r={4.5} fill="var(--signal)" />}>Counted on time</LegendItem>
      <LegendItem icon={<circle r={4} fill="var(--panel)" stroke="var(--panel-success)" strokeWidth={2} />}>Late, updated a result</LegendItem>
      <LegendItem
        icon={
          <g stroke="var(--panel-alert)" strokeWidth={2} strokeLinecap="round">
            <line x1={-4} y1={-4} x2={4} y2={4} />
            <line x1={-4} y1={4} x2={4} y2={-4} />
          </g>
        }
      >
        Too late, dropped
      </LegendItem>
      <LegendItem icon={<circle r={4} fill="none" stroke="var(--panel-muted)" strokeWidth={1.25} strokeDasharray="2 2" />}>Posted, still on the phone</LegendItem>
    </ul>
  );
}

function countsAt(v: WindowView, now: number): Counts {
  const c = { ...v.window.first };
  for (const u of v.window.updates) if (u.at <= now) c[u.post.tag]++;
  return c;
}

const FATE_ICON: Record<Fate, typeof Check> = { 'on-time': Check, updated: RefreshCw, dropped: X };
const FATE_WORD: Record<Fate, string> = { 'on-time': 'Counted on time', updated: 'Updated a result', dropped: 'Dropped' };

export default function StreamWindowsWidget({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const initial = useMemo(() => fromProps(props), [props]);
  const [cfg, setCfg] = useState<StreamConfig>(initial);
  const [now, setNow] = useState(AXIS_END);
  const [playing, setPlaying] = useState(false);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const run = useMemo(() => runStream(cfg), [cfg]);

  useEffect(() => {
    if (!playing) return;
    if (reduced) {
      const id = window.setInterval(() => setNow((n) => Math.min(AXIS_END, Math.floor(n) + 1)), 450);
      return () => window.clearInterval(id);
    }
    let raf = 0;
    let last: number | null = null;
    const tick = (t: number) => {
      if (last !== null) {
        const dt = Math.min(0.1, (t - last) / 1000);
        setNow((n) => Math.min(AXIS_END, n + dt * SPEED));
      }
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced]);

  useEffect(() => {
    if (playing && now >= AXIS_END) setPlaying(false);
  }, [playing, now]);

  const update = (patch: Partial<StreamConfig>) => setCfg((c) => normalizeConfig({ ...c, ...patch }));
  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (now >= AXIS_END) setNow(0);
    setPlaying(true);
  };

  const t = totalsAt(run, now);
  const views = run.windows.map((w) => windowAt(w, now));
  const published = views.filter((v) => v.phase !== 'collecting');
  const delayed = run.posts.filter((p) => p.delay >= DELAYED_AFTER && p.post.arrival <= now);
  const sizeIndex = Math.max(0, WINDOW_SIZES.indexOf(cfg.size as (typeof WINDOW_SIZES)[number]));
  const slide = slideFor(cfg.kind, cfg.size);

  return (
    <div className="flex flex-col gap-4">
      <div className="on-panel blueprint-grid flex flex-col gap-2 rounded-panel px-1 py-3 sm:px-3">
        <div ref={ref} className="w-full">
          {width > 0 ? <Timeline run={run} now={now} width={width} /> : <div style={{ height: 190 }} />}
        </div>
        <Legend />
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:flex-row sm:items-end sm:gap-5 sm:p-5">
        <Button size="sm" variant="primary" onClick={togglePlay} className="self-start sm:self-end">
          {playing ? <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
          {playing ? 'Pause' : now >= AXIS_END ? 'Play from 18:00' : 'Play'}
        </Button>
        <div className="flex-1">
          <Slider
            id="sw-clock"
            label="Clock"
            value={now}
            min={0}
            max={AXIS_END}
            step={0.5}
            onChange={(v) => {
              setPlaying(false);
              setNow(v);
            }}
            format={(v) => formatClock(v)}
            hint="Posts appear as the stream processor receives them. Drag to any moment, or play the 45 minutes from the start."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Counted on time" value={String(t['on-time'])} note={`of ${t.arrived} posts arrived`} />
        <Stat label="Updated a result" value={String(t.updated)} note="late, but the window was kept" tone={t.updated ? 'success' : 'ink'} />
        <Stat label="Dropped" value={String(t.dropped)} note="too late; only a batch job counts them" tone={t.dropped ? 'alert' : 'ink'} />
        <Stat label="Results publish" value={formatMinutes(cfg.watermarkDelay)} note="after each window ends" />
      </div>

      <ControlPanel>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Window type</span>
          <Segmented<WindowKind>
            label="Window type"
            value={cfg.kind}
            onChange={(kind) => update({ kind })}
            options={[
              { value: 'tumbling', label: 'Tumbling' },
              { value: 'sliding', label: 'Sliding' },
            ]}
            className="self-start"
          />
          <p className="text-small text-graphite">
            {cfg.kind === 'tumbling'
              ? 'Back-to-back windows that never overlap: each post counts in exactly one.'
              : `A new window starts every ${formatMinutes(slide)}, so windows overlap and most posts count in two.`}
          </p>
        </div>
        <Slider
          id="sw-size"
          label="Window size"
          value={sizeIndex}
          min={0}
          max={WINDOW_SIZES.length - 1}
          onChange={(i) => update({ size: WINDOW_SIZES[i] })}
          format={(i) => formatMinutes(WINDOW_SIZES[i] ?? cfg.size)}
        />
        <Slider
          id="sw-delay"
          label="Watermark delay"
          value={cfg.watermarkDelay}
          min={0}
          max={DELAY_MAX}
          step={DELAY_STEP}
          onChange={(watermarkDelay) => update({ watermarkDelay })}
          format={(v) => formatMinutes(v)}
          hint="How far the watermark trails the clock. Each window publishes this long after it ends."
        />
        <Slider
          id="sw-lateness"
          label="Allowed lateness"
          value={cfg.allowedLateness}
          min={0}
          max={LATENESS_MAX}
          onChange={(allowedLateness) => update({ allowedLateness })}
          format={(v) => formatMinutes(v)}
          hint="How long a window is kept after it publishes. A late post in that time updates the result; later ones are dropped."
        />
      </ControlPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Window results so far" className="flex flex-col gap-2 rounded-card border border-rule bg-paper p-4">
          <h4 className="text-ui-lg font-semibold text-ink">Results so far</h4>
          {published.length ? (
            <table className="w-full border-collapse text-ui">
              <thead>
                <tr className="text-left text-small text-graphite">
                  <th scope="col" className="pb-1 font-normal">
                    Window
                  </th>
                  <th scope="col" className="pb-1 font-normal">
                    Published
                  </th>
                  <th scope="col" className="pb-1 text-right font-normal">
                    Stream
                  </th>
                  <th scope="col" className="pb-1 text-right font-normal">
                    Batch
                  </th>
                </tr>
              </thead>
              <tbody>
                {published.map((v) => {
                  const w = v.window;
                  const ups = w.updates.filter((u) => u.at <= now);
                  return (
                    <tr key={w.index} className="border-t border-rule align-top">
                      <th scope="row" className="tabular py-1.5 pr-2 text-left font-semibold text-ink">
                        {windowLabel(w)}
                      </th>
                      <td className="tabular py-1.5 pr-2 text-graphite">
                        {formatClock(w.emitAt)}
                        {ups.length ? <span className="block text-small text-success">updated {ups.map((u) => formatClock(u.at)).join(', ')}</span> : null}
                      </td>
                      <td className="tabular py-1.5 text-right text-ink">
                        <span className="font-semibold">{v.count}</span>
                        <span className="block text-small text-graphite">{formatCounts(countsAt(v, now))}</span>
                      </td>
                      <td className="tabular py-1.5 text-right text-ink">
                        {w.exactTotal}
                        {v.dropped ? <span className="block text-small text-alert">{v.dropped} dropped</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-small text-graphite">No window has published yet. A window publishes once the watermark passes its end.</p>
          )}
          <p className="text-small text-graphite">
            Stream: the count the processor has published. Batch: what a job over every post, run later, would count.
          </p>
        </section>

        <section aria-label="Delayed posts" className="flex flex-col gap-2 rounded-card border border-rule bg-paper p-4">
          <h4 className="text-ui-lg font-semibold text-ink">Delayed posts</h4>
          {delayed.length ? (
            <ul className="flex flex-col gap-3">
              {delayed.map((o) => {
                const Icon = FATE_ICON[o.worst];
                return (
                  <li key={o.post.id} className="flex gap-2">
                    <Icon
                      className={cn('mt-0.5 h-4 w-4 shrink-0', o.worst === 'dropped' ? 'text-alert' : o.worst === 'updated' ? 'text-success' : 'text-graphite')}
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-ui text-ink">
                        <span className="sr-only">{FATE_WORD[o.worst]}: </span>
                        <span className="font-semibold">#{o.post.tag}</span>, posted <span className="tabular">{formatClock(o.post.eventTime)}</span>, arrived{' '}
                        <span className="tabular">{formatClock(o.post.arrival)}</span> ({formatMinutes(o.delay)} later)
                      </p>
                      <ul className="flex flex-col gap-0.5 text-small text-graphite">
                        {explainPost(run, o).map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-small text-graphite">No delayed post has arrived yet. Six of the 26 posts arrive a minute or more after they were posted.</p>
          )}
        </section>
      </div>
    </div>
  );
}
