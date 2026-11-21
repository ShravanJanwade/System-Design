import { useDeferredValue, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Segmented, Slider, Toggle } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { formatInt, formatMs, formatPercent } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { LineChart } from '../shared/LineChart';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import { formatSec, lbDiagram } from './diagram';
import {
  ALGORITHMS,
  DEFAULT_CONFIG,
  roundRobinOverloads,
  runLbSim,
  serverName,
  slotsFor,
  type Algorithm,
  type LbConfig,
  type LbResult,
} from './logic';

type UiConfig = Pick<
  LbConfig,
  'algorithm' | 'servers' | 'capacity' | 'traffic' | 'olderServer' | 'slowRequests' | 'busyClient' | 'killServer' | 'revive' | 'checkIntervalSec'
>;

const CAPACITY_STEPS = [40, 60, 80, 100, 120, 150, 200];
const CHECK_STEPS = [1, 2, 5, 10];
const TRAFFIC = { min: 40, max: 1200, step: 20 };
const X_TICKS = [0, 10, 20, 30, 40, 50, 60];

const SHORT_LABEL: Record<Algorithm, string> = {
  'round-robin': 'Round robin',
  weighted: 'Weighted',
  'least-connections': 'Least connections',
  'ip-hash': 'IP hash',
};

const HINT: Record<Algorithm, string> = {
  'round-robin': 'Each server gets the next request in turn, whatever it is already doing.',
  weighted: 'Round robin with more turns for bigger servers: a full-size server has weight 2 and the older one weight 1.',
  'least-connections': 'Each request goes to the server with the fewest open requests at that moment.',
  'ip-hash': 'The client’s IP address picks the server, so each client keeps landing on the same one.',
};

function fromPreset(preset: SimulatorProps['preset']): UiConfig {
  const d = DEFAULT_CONFIG;
  const p = preset ?? {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const servers = Math.min(6, Math.max(2, Math.round(num(p.servers, d.servers))));
  const killServer = Math.round(num(p.killServer, d.killServer));
  return {
    algorithm: ALGORITHMS.includes(p.algorithm as Algorithm) ? (p.algorithm as Algorithm) : d.algorithm,
    servers,
    capacity: num(p.capacity, d.capacity),
    traffic: num(p.traffic, d.traffic),
    olderServer: p.olderServer === true,
    slowRequests: p.slowRequests === true,
    busyClient: p.busyClient === true,
    killServer: killServer >= 1 && killServer <= servers ? killServer : 0,
    revive: p.revive !== false,
    checkIntervalSec: num(p.checkIntervalSec, d.checkIntervalSec),
  };
}

function nearestIndex(steps: number[], v: number): number {
  let best = 0;
  for (let i = 0; i < steps.length; i++) if (Math.abs(steps[i]! - v) < Math.abs(steps[best]! - v)) best = i;
  return best;
}

/** 1, 2 or 5 times a power of ten, at least 10. */
function niceMax(v: number): number {
  if (v <= 10) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

type Line = { t: number; text: string };

/** The stopped server's story as plain sentences, which also serve as the charts' text alternative. */
function healthCheckLines(r: LbResult): Line[] {
  if (r.killed < 0) return [];
  const name = serverName(r.killed);
  let fails = 0;
  let passes = 0;
  return r.events
    .filter((e) => e.server === r.killed)
    .map((e) => {
      switch (e.kind) {
        case 'down':
          return { t: e.t, text: `${name} stops answering. Requests sent to it hang, then fail.` };
        case 'check-failed':
          fails++;
          return { t: e.t, text: `Health check fails (${fails} in a row).` };
        case 'removed':
          return { t: e.t, text: `The balancer takes ${name} out of rotation.` };
        case 'up':
          return { t: e.t, text: `${name} is running again, but gets no requests yet.` };
        case 'check-passed':
          passes++;
          return { t: e.t, text: `Health check passes (${passes} in a row).` };
        case 'readded':
          return { t: e.t, text: `${name} is back in rotation.` };
      }
    });
}

export default function LoadBalancerSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<UiConfig>(initial);
  const [touched, setTouched] = useState(false);
  const [tried, setTried] = useState<Algorithm[]>(initial.slowRequests ? [initial.algorithm] : []);
  const [step, setStep] = useState(0);

  const deferred = useDeferredValue(ui);
  const result = useMemo(() => runLbSim(deferred), [deferred]);
  const spec = useMemo(() => lbDiagram(result), [result]);

  // Comparison runs for the challenge explanations, only when they are needed.
  const fasterChecks = useMemo(
    () => (result.killed >= 0 && deferred.checkIntervalSec > 1 ? runLbSim({ ...deferred, checkIntervalSec: 1 }) : null),
    [deferred, result],
  );
  const pair = useMemo(() => {
    if (!deferred.slowRequests) return null;
    const pick = (algorithm: Algorithm) => (deferred.algorithm === algorithm ? result : runLbSim({ ...deferred, algorithm }));
    return { rr: pick('round-robin'), lc: pick('least-connections') };
  }, [deferred, result]);

  const update = (patch: Partial<UiConfig>) => {
    setTouched(true);
    const next = { ...ui, ...patch };
    if (next.killServer > next.servers) next.killServer = 0;
    if (patch.killServer !== undefined && patch.killServer !== ui.killServer) setStep(0);
    setUi(next);
    if (next.slowRequests) setTried((t) => (t.includes(next.algorithm) ? t : [...t, next.algorithm]));
  };

  const reset = () => {
    setUi(initial);
    setStep(0);
  };

  const slots = slotsFor(ui.capacity);
  const fleetCapacity = ui.capacity * (ui.olderServer ? ui.servers - 0.5 : ui.servers);
  const dead = result.killed >= 0 ? serverName(result.killed) : '';
  const lines = healthCheckLines(result);
  const story = result.killed >= 0 && (spec.steps?.length ?? 0) > 1;
  const perSecond = 1000 / DEFAULT_CONFIG.bucketMs;
  const half = DEFAULT_CONFIG.bucketMs / 2000;

  const badPoints = result.buckets.map((b) => ({ x: b.t + half, y: (b.failed + b.turnedAway) * perSecond }));
  const badMax = niceMax(Math.max(0, ...badPoints.map((p) => p.y)));
  const markers = lines
    .filter((_, i) => {
      const kind = result.events.filter((e) => e.server === result.killed)[i]?.kind;
      return kind === 'down' || kind === 'removed' || kind === 'up' || kind === 'readded';
    })
    .map((l) => ({ x: l.t, label: `${formatSec(l.t)}: ${l.text}` }));

  const { timeline } = result;
  const challenges: Challenge[] = [
    {
      id: 'overload',
      prompt: 'Make round robin overload one server while the others still have room.',
      explanation:
        'Round robin counts turns, not work. The older server gets the same share as the others but finishes only half as many requests, so its queue fills and it turns requests away while the rest have room to spare. Weighted round robin gives it half the turns, and least connections adapts on its own: a slow server holds its requests longer, so it looks busier. A run of slow uploads can do the same to any one server.',
      attempted: roundRobinOverloads(result),
    },
    {
      id: 'kill',
      prompt: 'Stop a server at 20 seconds. How many requests fail before the health checks react? Then make that number smaller.',
      explanation:
        result.killed >= 0 && timeline.removed !== null
          ? `${dead} stopped at 20 s, but the balancer only took it out at ${formatSec(timeline.removed)}, after ${result.config.unhealthyThreshold} failed checks ${formatSec(result.config.checkIntervalSec)} apart. Until then it kept sending ${dead} about ${formatPercent(result.deadShare)} of requests, and ${formatInt(result.totals.failed)} failed. ${
              fasterChecks
                ? `Checking every second cuts that to about ${formatInt(fasterChecks.totals.failed)}; the cost is more check traffic and a higher chance of removing a server that only hiccuped.`
                : 'That is already the fastest setting here; real balancers also retry a failed request on another server.'
            }${
              result.config.algorithm === 'least-connections'
                ? ' Least connections loses fewer than round robin here: the hanging requests make the dead server look busy. A server that failed requests instantly would look idle instead, and attract even more.'
                : ''
            }`
          : 'Requests sent to a dead server fail until the health checks notice, so the number of failures grows with the time between checks.',
      attempted: result.killed >= 0 && result.totals.failed > 0,
    },
    {
      id: 'ip-hash',
      prompt: 'Choose IP hash and turn on the very busy client. What happens to its server?',
      explanation:
        result.busyServer >= 0
          ? `Every request from the busy client hashes to the same server, ${serverName(result.busyServer)}, so it gets ${formatPercent(result.servers[result.busyServer]!.share)} of all requests${
              result.servers[result.busyServer]!.turnedAway > 0 ? ` and turns away ${formatInt(result.servers[result.busyServer]!.turnedAway)}` : ''
            }. Hashing keeps each client on one server, which helps caches and sticky sessions, but it cannot split one heavy client. Hundreds of people behind one office or mobile network address look like a single client, too.`
          : 'Hashing keeps each client on one server, so it cannot split the load of one heavy client.',
      attempted: result.config.algorithm === 'ip-hash' && result.config.busyClient,
    },
    {
      id: 'compare',
      prompt: 'Mix in slow requests, then compare round robin with least connections. Which keeps waits short, and why?',
      explanation: pair
        ? `With round robin, ${formatPercent(pair.rr.wait.waitedShare)} of requests waited in a queue, and the slowest 1% waited ${formatMs(pair.rr.wait.p99)} or more. With least connections: ${formatPercent(pair.lc.wait.waitedShare)} and ${formatMs(pair.lc.wait.p99)}. Round robin keeps giving turns to a server stuck on several uploads; least connections sees its open requests pile up and sends new ones elsewhere.`
        : 'Round robin keeps giving turns to a server stuck on slow requests; least connections sees its open requests pile up and sends new ones elsewhere.',
      attempted: tried.includes('round-robin') && tried.includes('least-connections'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Load balancer simulator"
          intro="One minute of Snapgram traffic, spread across app servers. Pick an algorithm and change the fleet, then stop a server and watch the health checks react."
        />
      ) : null}

      {story ? (
        <Diagram
          spec={spec}
          title={`${dead} stops answering at 20 seconds`}
          caption="Step through what the balancer sees. The charts below show the same minute."
          step={step}
          onStepChange={setStep}
        />
      ) : (
        <figure className="flex flex-col gap-3">
          <Diagram spec={spec} variant="plain" />
          <figcaption className="measure text-ui-lg text-ink">{spec.steps?.[0]?.caption}</figcaption>
        </figure>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat
          label="Failed"
          value={formatInt(result.totals.failed)}
          note={result.killed >= 0 ? `sent to ${dead} while it was down` : 'no server stopped'}
          tone={result.totals.failed > 0 ? 'alert' : 'ink'}
        />
        <Stat
          label="Turned away"
          value={formatInt(result.totals.turnedAway)}
          note="a server’s queue was full"
          tone={result.totals.turnedAway > 0 ? 'alert' : 'ink'}
        />
        <Stat label="Had to wait" value={formatPercent(result.wait.waitedShare)} note={`average wait ${formatMs(result.wait.mean)}`} />
        <Stat label="Wait, 99th percentile" value={formatMs(result.wait.p99)} note="1 request in 100 waited longer" />
      </div>

      <div className="flex flex-col gap-6 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <LineChart
          title="Failed or turned away, per second"
          series={[{ id: 'bad', label: 'Failed or turned away', points: badPoints, tone: 'alert' }]}
          xMax={DEFAULT_CONFIG.durationSec}
          yMax={badMax}
          xTicks={X_TICKS}
          yTicks={[0, badMax / 2, badMax]}
          formatX={(v) => `${v} s`}
          formatY={(v) => formatInt(v)}
          markers={markers}
          height={150}
          summary={`${formatInt(result.totals.failed)} requests failed and ${formatInt(result.totals.turnedAway)} were turned away during the minute.${
            lines.length ? ` ${lines.map((l) => `${formatSec(l.t)}: ${l.text}`).join(' ')}` : ''
          }`}
        />

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-ui font-semibold text-ink">Requests at each server</p>
            <p className="text-small text-graphite">
              Working plus waiting. Above the dashed line every worker is busy and new requests wait in a queue; at the top of the chart the
              queue is full and the server turns requests away.
            </p>
          </div>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {result.servers.map((s) => (
              <LineChart
                key={s.index}
                title={`${s.name}${s.older ? ' (older)' : ''}, ${formatPercent(s.share)} of requests`}
                series={[{ id: `app${s.index}`, label: s.name, points: result.buckets.map((b) => ({ x: b.t + half, y: b.open[s.index]! })) }]}
                xMax={DEFAULT_CONFIG.durationSec}
                yMax={s.slots + s.queueLimit}
                xTicks={[0, 20, 40, 60]}
                yTicks={[0, s.slots, s.slots + s.queueLimit]}
                formatX={(v) => `${v} s`}
                formatY={(v) => formatInt(v)}
                thresholds={[{ y: s.slots, label: `${s.slots} workers busy` }]}
                markers={s.index === result.killed ? markers : []}
                height={120}
                summary={`${s.name} received ${formatPercent(s.share)} of requests. It held up to ${formatInt(s.peakOpen)} at once, with up to ${formatInt(
                  s.maxQueue,
                )} waiting${s.turnedAway ? `, and turned away ${formatInt(s.turnedAway)}` : ''}${s.failed ? `; ${formatInt(s.failed)} sent to it failed` : ''}.`}
              />
            ))}
          </div>
        </div>

        {lines.length ? (
          <div>
            <p className="text-ui font-semibold text-ink">Health checks for {dead}</p>
            <ol className="mt-2 flex flex-col gap-1 text-ui text-graphite">
              {lines.map((l, i) => (
                <li key={i}>
                  <span className="tabular font-semibold text-ink">{formatSec(l.t)}</span> {l.text}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <ControlPanel>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Algorithm</span>
          <Segmented<Algorithm>
            label="Algorithm"
            value={ui.algorithm}
            onChange={(algorithm) => update({ algorithm })}
            options={ALGORITHMS.map((a) => ({ value: a, label: SHORT_LABEL[a] }))}
            className="flex-wrap"
          />
          <p className="text-small text-graphite">{HINT[ui.algorithm]}</p>
        </div>
        <Slider
          id="lb-servers"
          label="App servers"
          value={ui.servers}
          min={2}
          max={6}
          onChange={(servers) => update({ servers })}
          format={(v) => `${v} servers`}
        />
        <Slider
          id="lb-capacity"
          label="Capacity per server"
          value={nearestIndex(CAPACITY_STEPS, ui.capacity)}
          min={0}
          max={CAPACITY_STEPS.length - 1}
          onChange={(i) => update({ capacity: CAPACITY_STEPS[i]! })}
          format={(i) => `${CAPACITY_STEPS[i]} requests/s`}
          hint={`${slots} workers, and the average request takes 100 ms.`}
        />
        <Slider
          id="lb-traffic"
          label="Traffic"
          value={ui.traffic}
          min={TRAFFIC.min}
          max={TRAFFIC.max}
          step={TRAFFIC.step}
          onChange={(traffic) => update({ traffic })}
          format={(v) => `${formatInt(v)} requests/s`}
          hint={`The servers can finish about ${formatInt(fleetCapacity)} requests/s together.`}
        />
        <Slider
          id="lb-checks"
          label="Health check every"
          value={nearestIndex(CHECK_STEPS, ui.checkIntervalSec)}
          min={0}
          max={CHECK_STEPS.length - 1}
          onChange={(i) => update({ checkIntervalSec: CHECK_STEPS[i]! })}
          format={(i) => `${CHECK_STEPS[i]} s`}
          hint="Two failed checks in a row take a server out; two passes bring it back."
        />
        <Toggle
          id="lb-older"
          label="One older, slower server"
          description={`${serverName(ui.servers - 1)} takes twice as long on every request.`}
          checked={ui.olderServer}
          onChange={(olderServer) => update({ olderServer })}
        />
        <Toggle
          id="lb-slow"
          label="Mix in slow requests"
          description="1 request in 20 is a photo upload that takes about a second; the rest take about 50 ms."
          checked={ui.slowRequests}
          onChange={(slowRequests) => update({ slowRequests })}
        />
        <Toggle
          id="lb-busy"
          label="One very busy client"
          description="One IP address sends 30% of all requests, like a partner’s sync job."
          checked={ui.busyClient}
          onChange={(busyClient) => update({ busyClient })}
        />
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">Server that stops answering at 20 s</span>
          <Segmented<string>
            label="Server that stops answering at 20 seconds"
            size="sm"
            value={String(ui.killServer)}
            onChange={(v) => update({ killServer: Number(v) })}
            options={[{ value: '0', label: 'None' }, ...Array.from({ length: ui.servers }, (_, i) => ({ value: String(i + 1), label: `App ${i + 1}` }))]}
            className="flex-wrap"
          />
        </div>
        {ui.killServer > 0 ? (
          <Toggle
            id="lb-revive"
            label="Bring it back at 40 s"
            description="It restarts, and must pass health checks before it gets requests again."
            checked={ui.revive}
            onChange={(revive) => update({ revive })}
          />
        ) : null}
        <div className="sm:col-span-2">
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting settings
          </Button>
        </div>
      </ControlPanel>

      <Challenges simId="load-balancer" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          The simulation plays one minute in 10 ms steps, and each server is a pool of workers with a short queue. Real balancers also retry
          failed requests on another server, let a server finish its open requests before removing it, and probe a real endpoint such as{' '}
          <code className="md-code">/health</code>. The numbers are illustrative.
        </p>
      </Callout>
    </div>
  );
}
