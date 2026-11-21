import { useMemo, useState } from 'react';
import type { DiagramSpec, FlowItem } from '@/content/types';
import { Toggle } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { formatMs } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import { buildJourney, journeyDiagram, type Hop, type JourneyOptions } from './logic';

function withSteps(spec: DiagramSpec, hops: Hop[]): DiagramSpec {
  return {
    ...spec,
    steps: hops.map((hop) => {
      const flow: FlowItem[] = [];
      if (hop.edge) {
        flow.push({ edge: hop.edge, reverse: Boolean(hop.reverse) });
        if (hop.roundTrip) flow.push({ edge: hop.edge, reverse: !hop.reverse });
      }
      const target = hop.edge ?? hop.at ?? 'browser';
      return {
        caption: `**${hop.label}, ${formatMs(hop.ms)}.** ${hop.detail}`,
        flow,
        focus: hop.edge ? [hop.edge] : [target],
        notes: [{ target, text: formatMs(hop.ms), tone: 'signal' as const }],
      };
    }),
  };
}

export default function RequestJourneySimulator({ preset, embedded }: SimulatorProps) {
  const [opts, setOpts] = useState<JourneyOptions>({ dnsCached: preset?.dnsCached === true, cdn: preset?.cdn === true });
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState(0);
  const [visitedEnd, setVisitedEnd] = useState<string[]>([]);

  const journey = useMemo(() => buildJourney(opts), [opts]);
  const spec = useMemo(() => withSteps(journeyDiagram(opts), journey.hops), [opts, journey]);
  const slowest = useMemo(() => buildJourney({ dnsCached: false, cdn: false }).totalMs, []);
  const fastest = useMemo(() => buildJourney({ dnsCached: true, cdn: true }).totalMs, []);
  const key = `${opts.dnsCached ? 'dns' : 'nodns'}-${opts.cdn ? 'cdn' : 'nocdn'}`;

  const change = (patch: Partial<JourneyOptions>) => {
    setTouched(true);
    setOpts((o) => ({ ...o, ...patch }));
    setStep(0);
  };

  const onStep = (i: number) => {
    setStep(i);
    if (i === journey.hops.length - 1 && !visitedEnd.includes(key)) setVisitedEnd((v) => [...v, key]);
  };

  const challenges: Challenge[] = [
    {
      id: 'cdn',
      prompt: 'Turn the CDN on. Which hops got faster, and which did not?',
      explanation:
        'The handshakes and the photo now go to an edge about 10 ms away instead of 150 ms. The page itself is personal, so the edge still forwards it to Oregon and back. The ocean crossing does not disappear; it happens once instead of four times.',
      attempted: opts.cdn,
    },
    {
      id: 'fastest',
      prompt: 'Find the fastest combination. How many times faster is it than the slowest?',
      explanation: `With both the DNS cache and the CDN, the page takes about ${formatMs(fastest)}, against ${formatMs(slowest)} with neither: roughly three times faster. Most of the saving comes from not crossing an ocean for every round trip.`,
      attempted: opts.cdn && opts.dnsCached,
    },
    {
      id: 'dns-share',
      prompt: 'With the CDN on, turn the DNS cache off. How big a share of the total is the DNS lookup now?',
      explanation:
        'About 100 ms of roughly 350 ms, close to a third. Once the network path is short, a cold DNS lookup becomes one of the biggest costs. That is why DNS answers are cached at every level, from the browser to the resolver.',
      attempted: opts.cdn && !opts.dnsCached,
    },
    {
      id: 'slowest-hop',
      prompt: 'With both switches off, step to the end. Which steps take the longest, and what do they have in common?',
      explanation:
        'Every step that crosses the ocean costs about 150 ms: the TCP handshake, the TLS handshake, the request and response, and the photo. The database query takes 3 ms. Distance, not computing, dominates, so the fix is to move content closer to users.',
      attempted: visitedEnd.includes('nodns-nocdn'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Request journey"
          intro="A reader in Singapore opens a Snapgram photo. Snapgram’s servers are in Oregon, about 150 ms away and back. Step through every hop."
        />
      ) : null}

      <ControlPanel>
        <Toggle
          id="journey-dns"
          label="DNS cache"
          description="The resolver already knows snapgram.com from an earlier lookup."
          checked={opts.dnsCached}
          onChange={(dnsCached) => change({ dnsCached })}
        />
        <Toggle
          id="journey-cdn"
          label="CDN"
          description="Connections and the photo go to a nearby edge server in Singapore."
          checked={opts.cdn}
          onChange={(cdn) => change({ cdn })}
        />
      </ControlPanel>

      <Diagram key={key} spec={spec} step={step} onStepChange={onStep} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Total" value={formatMs(journey.totalMs)} note={opts.cdn || opts.dnsCached ? `vs. ${formatMs(slowest)} with neither` : 'the slowest setting'} />
        <Stat label="DNS lookup" value={formatMs(journey.byPhase.dns)} />
        <Stat label="Handshakes" value={formatMs(journey.byPhase.connect)} />
        <Stat label="Page and photo" value={formatMs(journey.byPhase.request + journey.byPhase.server + journey.byPhase.response + journey.byPhase.asset)} />
      </div>

      <Waterfall hops={journey.hops} total={journey.totalMs} current={step} onSelect={onStep} />

      <Challenges simId="request-journey" challenges={challenges} touched={touched} />
    </div>
  );
}

function Waterfall({ hops, total, current, onSelect }: { hops: Hop[]; total: number; current: number; onSelect: (i: number) => void }) {
  return (
    <figure className="flex flex-col gap-2 rounded-card border border-rule bg-paper p-4 sm:p-5">
      <figcaption className="text-ui font-semibold text-ink">Where the time goes</figcaption>
      <p className="text-small text-graphite">Each bar starts when the previous hop ends. Select a row to jump to that step.</p>
      <ol className="mt-1 flex flex-col">
        {hops.map((h, i) => {
          const left = (h.startMs / total) * 100;
          const width = Math.max(0.6, (h.ms / total) * 100);
          const active = i === current;
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'grid w-full grid-cols-[minmax(7.5rem,11rem)_1fr] items-center gap-3 rounded-control px-1.5 py-1 text-left transition-colors ease-ui',
                  active ? 'bg-wash' : 'hover:bg-wash',
                )}
              >
                <span className={cn('truncate text-small', active ? 'font-bold text-ink' : 'text-graphite')}>{h.label}</span>
                <span className="relative h-5">
                  <span
                    className={cn('absolute top-1 h-3 rounded-[2px]', active ? 'bg-signal ring-1 ring-ink/40' : 'bg-blueprint')}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                  <span
                    className="tabular absolute top-0 text-[12px] leading-5 text-graphite"
                    style={left + width > 82 ? { right: `${100 - left + 1}%` } : { left: `calc(${left + width}% + 6px)` }}
                  >
                    {formatMs(h.ms)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="tabular mt-1 text-right text-small text-graphite">Total {formatMs(total)}</p>
    </figure>
  );
}
