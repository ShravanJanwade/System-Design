import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Slider, Toggle } from '@/design/primitives';
import { measureText } from '@/diagram/text';
import { useElementWidth } from '@/lib/hooks';
import { ControlPanel, Stat } from '@/simulators/shared/SimParts';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  MAX_OLD_VIEW_PERCENT,
  PLAIN,
  PLAIN_LINES,
  PLAIN_TOTAL,
  SCALE_MAX,
  SNAPGRAM,
  biggestLine,
  breakEvenOldViewPercent,
  changeVsPlain,
  choicesFromProps,
  costLines,
  describeBill,
  formatChange,
  formatUsd,
  scaleTicks,
  totalUsd,
  type Choices,
  type CostLine,
} from './logic';

const TICKS = scaleTicks(SCALE_MAX);

/** Snapgram's monthly bill as horizontal bars, with toggles for three cost-saving or cost-adding design choices. */
export default function CostBars({ props }: WidgetProps) {
  const start = useMemo(() => choicesFromProps(props), [props]);
  const [choices, setChoices] = useState<Choices>(start);
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const reduced = useReducedMotion();

  const lines = useMemo(() => costLines(choices), [choices]);
  const total = totalUsd(lines);
  const change = changeVsPlain(choices);
  const biggest = biggestLine(lines);
  const breakEven = breakEvenOldViewPercent(choices);
  const summary = describeBill(choices);

  const set = (patch: Partial<Choices>) => setChoices((c) => ({ ...c, ...patch }));

  let verdict: string;
  let losing = false;
  if (!choices.coldStorage) {
    verdict = 'Turn on colder storage to see when the fees for reading old photos cancel out the saving.';
  } else if (breakEven > MAX_OLD_VIEW_PERCENT) {
    verdict = `With the second copy also cold, colder storage keeps saving money across this whole range; it would break even only at about ${Math.round(breakEven)}% of views.`;
  } else if (choices.oldViewPercent > breakEven) {
    losing = true;
    verdict = `At ${choices.oldViewPercent}% of views, reading old photos back costs more than colder storage saves. It breaks even at about ${Math.round(breakEven)}%.`;
  } else {
    verdict = `Colder storage saves money until about ${Math.round(breakEven)}% of views are of photos over a year old.`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="on-panel blueprint-grid rounded-panel p-3 sm:p-4">
        <div ref={measureRef} className="w-full">
          {width > 0 ? (
            <BarsSvg width={width} lines={lines} biggestId={biggest.id} reduced={reduced} summary={summary} />
          ) : (
            <div style={{ height: 316 }} />
          )}
        </div>
      </div>
      <p className="measure text-small text-graphite">
        Rough monthly cost of each line at list prices. The yellow bar is the biggest line. A dashed outline marks a line’s cost in the plain
        design (no CDN, every photo in standard storage, one region), and the arrow shows where it went.
      </p>

      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-3" aria-live="polite">
        <Stat label="Total a month" value={formatUsd(total)} note={`Plain design: ${formatUsd(PLAIN_TOTAL)}`} />
        <Stat
          label="Against the plain design"
          value={formatChange(change)}
          note={change < 0 ? 'Cheaper' : change > 0 ? 'More expensive' : 'Same bill'}
          tone={change < -0.005 ? 'success' : change > 0.005 ? 'alert' : 'ink'}
        />
        <Stat label="Biggest line" value={biggest.short} note={`${Math.round((biggest.usd / total) * 100)}% of the total`} />
      </div>

      <ControlPanel>
        <Toggle
          id="cost-cold"
          label="Move photos older than a year to colder storage"
          description="$0.004 per GB-month instead of about $0.022, plus $0.03 per GB read back."
          checked={choices.coldStorage}
          onChange={(v) => set({ coldStorage: v })}
        />
        <Toggle
          id="cost-cdn"
          label="Serve photos through a CDN"
          description="$0.085 per GB falling to $0.02 at volume; fetches from storage to the CDN are free."
          checked={choices.cdn}
          onChange={(v) => set({ cdn: v })}
        />
        <Toggle
          id="cost-second-region"
          label="Copy photos to a second region"
          description="$0.02 per GB to copy new photos to Singapore, then every photo is stored again there."
          checked={choices.secondRegion}
          onChange={(v) => set({ secondRegion: v })}
        />
        <Slider
          id="cost-old-views"
          label="Views of photos over a year old"
          value={choices.oldViewPercent}
          min={0}
          max={MAX_OLD_VIEW_PERCENT}
          onChange={(v) => set({ oldViewPercent: v })}
          format={(v) => `${v}% of views`}
          hint="Each one is read back from colder storage, when that is on."
        />
        <div className="flex flex-col gap-3 sm:col-span-2">
          <p className={losing ? 'text-ui text-alert' : 'text-ui text-ink'} aria-live="polite">
            {verdict}
          </p>
          <div>
            <Button size="sm" variant="ghost" onClick={() => setChoices(PLAIN)}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Reset to the plain design
            </Button>
          </div>
        </div>
      </ControlPanel>

      <details className="rounded-card border border-rule bg-paper p-4">
        <summary className="cursor-pointer text-ui font-semibold text-ink">How each line is worked out</summary>
        <dl className="mt-3 flex flex-col gap-2">
          {lines.map((l) => (
            <div key={l.id} className="grid gap-x-3 sm:grid-cols-[11rem_1fr]">
              <dt className="text-small font-semibold text-ink">
                {l.short} <span className="tabular font-normal text-graphite">{l.usd < 0.5 ? 'off' : formatUsd(l.usd)}</span>
              </dt>
              <dd className="text-small text-graphite">{l.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-small text-graphite">
          Illustrative workload: one million daily users, from the estimate in lesson 2.6. About{' '}
          {Math.round(SNAPGRAM.storedGb / 1_000_000)} petabytes of photos, {Math.round(SNAPGRAM.oldShare * 100)}% of them over a year old;
          about {(SNAPGRAM.servedGb / 1_000_000).toFixed(1)} petabytes sent to phones a month; {SNAPGRAM.machines} general-purpose
          machines standing in for every server. Prices are Amazon Web Services list prices for Oregon, and Singapore for the copy,
          checked in November 2026. Request fees, free allowances, taxes and discounts are left out, so this is a ballpark of relative
          sizes, not a real bill.
        </p>
      </details>
    </div>
  );
}

const FONT = 12;
const ROW = 46;
const TOP = 4;

function BarsSvg({
  width,
  lines,
  biggestId,
  reduced,
  summary,
}: {
  width: number;
  lines: CostLine[];
  biggestId: string;
  reduced: boolean;
  summary: string;
}) {
  const plotW = Math.max(160, width - 4);
  const plotBottom = TOP + lines.length * ROW;
  const height = plotBottom + 22;
  const sx = (usd: number) => (Math.max(0, Math.min(usd, SCALE_MAX)) / SCALE_MAX) * plotW;
  const grow = reduced ? undefined : { transition: 'width 300ms ease' };

  return (
    <svg width={width} height={height} role="img" aria-label={summary} className="block select-none">
      {TICKS.map((t, i) => (
        <g key={t} aria-hidden>
          <line x1={sx(t) + 0.5} x2={sx(t) + 0.5} y1={TOP} y2={plotBottom} stroke="var(--panel-line)" strokeOpacity={0.18} strokeDasharray="2 4" />
          <text
            x={sx(t)}
            y={height - 6}
            textAnchor={i === 0 ? 'start' : i === TICKS.length - 1 ? 'end' : 'middle'}
            fontSize={11}
            fill="var(--panel-muted)"
            className="tabular"
          >
            {formatUsd(t)}
          </text>
        </g>
      ))}

      {lines.map((l, i) => {
        const y = TOP + i * ROW;
        const before = PLAIN_LINES.find((p) => p.id === l.id)?.usd ?? 0;
        const changed = Math.abs(before - l.usd) >= 0.5;
        const now = l.usd < 0.5 ? 'off' : formatUsd(l.usd);
        const was = changed ? `${formatUsd(before)} → ` : '';
        const valueW = measureText(`${was}${now}`, FONT, 'semibold');
        const label = measureText(l.label, FONT, 'semibold') + valueW + 16 <= plotW ? l.label : l.short;
        return (
          <g key={l.id} aria-hidden>
            <text x={0} y={y + 14} fontSize={FONT} fontWeight={600} fill="var(--panel-text)">
              {label}
            </text>
            <text x={plotW} y={y + 14} textAnchor="end" fontSize={FONT} className="tabular">
              {was ? <tspan fill="var(--panel-muted)">{was}</tspan> : null}
              <tspan fill="var(--panel-text)" fontWeight={700}>
                {now}
              </tspan>
            </text>
            <rect x={0} y={y + 22} width={plotW} height={14} rx={2} fill="var(--panel-line)" fillOpacity={0.08} />
            <rect
              x={0}
              y={y + 22}
              width={sx(l.usd)}
              height={14}
              rx={2}
              fill={l.id === biggestId ? 'var(--signal)' : 'var(--panel-line)'}
              fillOpacity={0.9}
              style={grow}
            />
            {changed && before >= 0.5 ? (
              <rect
                x={0.75}
                y={y + 22.75}
                width={Math.max(0, sx(before) - 1.5)}
                height={12.5}
                rx={2}
                fill="none"
                stroke="var(--panel-line)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
