import { useDeferredValue, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Chip, Segmented, Slider, Toggle, type ChipTone } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { formatInt, formatMs } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import { formatLag, formatSec, replicationDiagram, summarizeReads } from './diagram';
import {
  COPY_NAME,
  DEFAULT_CONFIG,
  LAG_STEPS,
  MAYA,
  MODES,
  firstSeen,
  firstVanish,
  pinnedFollower,
  reloadRead,
  runReplication,
  type Mode,
  type Read,
  type ReplicationConfig,
  type Verdict,
} from './logic';

type UiConfig = Pick<ReplicationConfig, 'lagMs' | 'mode' | 'readFromLeader' | 'sticky' | 'failLeader'>;

const MODE_LABEL: Record<Mode, string> = { async: 'Asynchronous', sync: 'Synchronous' };

const MODE_HINT: Record<Mode, string> = {
  async: 'The leader confirms each write as soon as it has saved it, and copies it to the followers afterwards.',
  sync: 'The leader confirms a write only once Follower 1 has it too. Follower 2 stays asynchronous.',
};

const VERDICT: Record<Verdict, { label: string; tone: ChipTone }> = {
  fresh: { label: 'Up to date', tone: 'success' },
  'own-edit-missing': { label: 'Her own edit is missing', tone: 'alert' },
  'went-back': { label: 'Went back in time', tone: 'alert' },
  behind: { label: 'Not there yet', tone: 'neutral' },
};

const PINNED = pinnedFollower(MAYA);

function nearestIndex(steps: number[], v: number): number {
  let best = 0;
  for (let i = 0; i < steps.length; i++) if (Math.abs(steps[i]! - v) < Math.abs(steps[best]! - v)) best = i;
  return best;
}

function fromPreset(preset: SimulatorProps['preset']): UiConfig {
  const d = DEFAULT_CONFIG;
  const p = preset ?? {};
  const lag = typeof p.lagMs === 'number' && Number.isFinite(p.lagMs) ? p.lagMs : d.lagMs;
  return {
    lagMs: LAG_STEPS[nearestIndex(LAG_STEPS, lag)]!,
    mode: MODES.includes(p.mode as Mode) ? (p.mode as Mode) : d.mode,
    readFromLeader: p.readFromLeader === true,
    sticky: p.sticky === true,
    failLeader: p.failLeader === true,
  };
}

function readAction(x: Read): string {
  return x.kind === 'profile' ? 'Reloads her profile' : 'Refreshes Sam’s photo';
}

function readSaw(x: Read): string {
  if (x.kind === 'profile') return x.sawNew ? 'the new caption' : 'the old caption';
  return x.sawNew ? 'with the new comment' : 'without the new comment';
}

function routeNote(x: Read): string {
  if (x.route === 'leader') return ', because she just changed it';
  if (x.route === 'pinned') return ', her pinned follower';
  return '';
}

export default function ReplicationSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<UiConfig>(initial);
  const [touched, setTouched] = useState(false);
  const [triedFail, setTriedFail] = useState<Mode[]>(initial.failLeader ? [initial.mode] : []);
  const [step, setStep] = useState(0);

  const deferred = useDeferredValue(ui);
  const result = useMemo(() => runReplication(deferred), [deferred]);
  const spec = useMemo(() => replicationDiagram(result), [result]);

  // Comparison runs for the challenge explanations. A run that matches the current settings is reused.
  const runs = useMemo(() => {
    const pick = (patch: Partial<UiConfig>) =>
      (Object.keys(patch) as (keyof UiConfig)[]).every((k) => deferred[k] === patch[k]) ? result : runReplication({ ...deferred, ...patch });
    return {
      noLeaderReads: pick({ readFromLeader: false }),
      spread: pick({ sticky: false }),
      async: pick({ mode: 'async' }),
      sync: pick({ mode: 'sync' }),
      failAsync: pick({ failLeader: true, mode: 'async' }),
      failSync: pick({ failLeader: true, mode: 'sync' }),
    };
  }, [deferred, result]);

  const update = (patch: Partial<UiConfig>) => {
    setTouched(true);
    const next = { ...ui, ...patch };
    setUi(next);
    if (next.failLeader) setTriedFail((t) => (t.includes(next.mode) ? t : [...t, next.mode]));
    // Show the failure as soon as it is switched on: its steps follow the ones already shown.
    if (next.failLeader && !ui.failLeader) setStep(spec.steps?.length ?? 0);
    if (!next.failLeader && ui.failLeader) setStep(0);
  };

  const reset = () => {
    setUi(initial);
    setStep(0);
  };

  const own = result.counts['own-edit-missing'];
  const back = result.counts['went-back'];
  const fo = result.failover;

  // Challenge 1: read-your-writes.
  const r1 = reloadRead(runs.noLeaderReads);
  const r1Applied = r1 && r1.copy !== 'leader' ? runs.noLeaderReads.caption.applied[r1.copy] : null;
  // Challenge 2: monotonic reads.
  const seen = firstSeen(runs.spread);
  const gone = firstVanish(runs.spread);
  // Challenge 3: synchronous replication and the reload.
  const rs = reloadRead(runs.sync);
  const reloadLine = !rs
    ? ''
    : rs.copy === 'leader'
      ? 'Her reload went to the leader, so she saw the new caption either way.'
      : rs.copy === 'f1'
        ? 'Her reload went to Follower 1, the synchronous follower, so she saw the new caption. A read sent to Follower 2 could still be stale.'
        : rs.verdict === 'own-edit-missing'
          ? 'But her reload went to Follower 2, which is still asynchronous, so she still saw her old caption. Synchronous replication protects against losing data; it does not make every copy current.'
          : 'Her reload went to Follower 2, which is still asynchronous. At this lag it had caught up, but at 500 ms or more it shows the old caption.';
  // Challenge 4: failover.
  const fa = runs.failAsync.failover!;
  const fs = runs.failSync.failover!;

  const challenges: Challenge[] = [
    {
      id: 'read-your-writes',
      prompt: 'Maya saves a new caption, and the reload shows her old one. Fix it without lowering the lag.',
      explanation:
        r1 && r1.verdict === 'own-edit-missing'
          ? `Without the fix, the reload at ${formatSec(r1.at)} went to ${COPY_NAME[r1.copy]}, which ${
              r1Applied === null ? 'had not applied the new caption yet' : `applied the new caption only at ${formatSec(r1Applied)}`
            }, so Maya saw her old one. Sending her own profile reads to the leader for a minute after a change fixes it at any lag, because the leader always has her latest write. That guarantee is called read-your-writes. The cost is extra reads on the leader, which is why the rule covers only data she has just changed.`
          : `At this setting, ${COPY_NAME[r1?.copy ?? 'f2']} already had the new caption when the app reloaded, so nothing looked lost. Raise the lag and the reload shows the old caption; sending her own profile reads to the leader for a minute after a change fixes that at any lag.`,
      attempted: deferred.readFromLeader && r1?.verdict === 'own-edit-missing',
    },
    {
      id: 'monotonic-reads',
      prompt: 'Find the refresh where the new comment vanishes. Then stop it from vanishing without changing the lag.',
      explanation:
        seen && gone
          ? `With reads spread across both followers, the refresh at ${formatSec(seen.at)} went to ${COPY_NAME[seen.copy]}, which had the comment, and the one at ${formatSec(gone.at)} went to ${COPY_NAME[gone.copy]}, which did not have it yet. Pinning each user’s reads to one follower gives monotonic reads: a follower applies changes in order, so once Maya has seen the comment there, every later read shows it too. It may appear a little later, but it never disappears.`
          : `At this setting the comment ${
              seen ? 'reached both followers before Maya could catch them disagreeing' : 'had not reached either follower by her last refresh'
            }, so nothing vanished. Try a lag of 1 s or 2 s, where refreshes alternate between a follower about 1 s behind and one about 2 s behind. Pinning each user’s reads to one follower stops the comment from vanishing.`,
      attempted: deferred.sticky && Boolean(gone),
    },
    {
      id: 'synchronous',
      prompt: 'Switch to synchronous replication. How long does a write take now, and is the old caption gone?',
      explanation: `Asynchronous writes are confirmed in about ${formatMs(runs.async.writeMs)}. Synchronous ones wait for Follower 1 and take about ${formatMs(
        runs.sync.writeMs,
      )}, roughly the lag itself; in exchange, Follower 1 holds every confirmed write. ${reloadLine}`,
      attempted: deferred.mode === 'sync',
    },
    {
      id: 'failover',
      prompt: 'Make the leader’s disk die with asynchronous replication, and count the confirmed writes that are lost. Then try synchronous.',
      explanation: `With asynchronous replication, Follower 1 was about ${formatLag(fa.behindMs)} behind when the leader died, so ${formatInt(
        fa.lost,
      )} writes that users had been told were saved were lost: roughly ${formatInt(DEFAULT_CONFIG.writesPerSec)} writes per second times the lag. With synchronous replication, ${formatInt(
        fs.lost,
      )} were lost, because the leader confirmed a write only once Follower 1 had it. The price was a write time of about ${formatMs(runs.failSync.writeMs)} instead of ${formatMs(
        runs.failAsync.writeMs,
      )}. Either way, writes failed for ${formatLag(DEFAULT_CONFIG.failoverMs)} while Follower 1 was promoted.`,
      attempted: deferred.failLeader && triedFail.includes('async') && triedFail.includes('sync'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Replication simulator"
          intro="Twelve seconds of one Snapgram database: a leader and two followers in Oregon. Change the lag and the replication mode, try the two routing fixes, and make the leader fail."
        />
      ) : null}

      <Diagram
        spec={spec}
        title="Twelve seconds of one database"
        caption="Step through what Maya sees as her writes and her friends’ writes travel from the leader to the followers."
        step={step}
        onStepChange={setStep}
      />

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Own edit missing" value={formatInt(own)} note="reloads that showed her old caption" tone={own > 0 ? 'alert' : 'success'} />
        <Stat label="Went back in time" value={formatInt(back)} note="refreshes where the comment vanished" tone={back > 0 ? 'alert' : 'success'} />
        <Stat label="Write confirmed in" value={formatMs(result.writeMs)} note={result.config.mode === 'sync' ? 'waits for Follower 1' : 'the leader alone'} />
        <Stat
          label="Confirmed writes lost"
          value={fo ? formatInt(fo.lost) : '—'}
          note={fo ? `when the leader died at ${formatSec(fo.at)}` : 'the leader does not fail in this run'}
          tone={fo && fo.lost > 0 ? 'alert' : 'ink'}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div>
          <p className="text-ui font-semibold text-ink">Maya’s reads</p>
          <p className="text-small text-graphite">
            Every read, which copy answered it, and what she saw. {summarizeReads(result)}
          </p>
        </div>
        <ol className="flex flex-col gap-2">
          {result.reads.map((x) => (
            <li key={x.n} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tabular w-12 shrink-0 text-ui font-semibold text-ink">{formatSec(x.at)}</span>
              <span className="min-w-0 flex-1 text-ui text-graphite">
                <span className="text-ink">{readAction(x)}</span> from {COPY_NAME[x.copy]}
                {routeNote(x)}: {readSaw(x)}
              </span>
              <Chip tone={VERDICT[x.verdict].tone}>{VERDICT[x.verdict].label}</Chip>
            </li>
          ))}
        </ol>
        {fo ? (
          <p className="text-ui text-graphite">
            <span className="tabular font-semibold text-ink">{formatSec(fo.at)}</span> The leader’s disk dies; {formatInt(fo.failed)} writes get an error
            until {COPY_NAME[fo.promoted]} takes over at <span className="tabular">{formatSec(fo.promotedAt)}</span>.{' '}
            {fo.lost > 0
              ? `${formatInt(fo.lost)} confirmed writes never reached it and are lost.`
              : 'No confirmed write is lost.'}
          </p>
        ) : null}
      </div>

      <ControlPanel>
        <Slider
          id="rep-lag"
          label="Replication lag"
          value={nearestIndex(LAG_STEPS, ui.lagMs)}
          min={0}
          max={LAG_STEPS.length - 1}
          onChange={(i) => update({ lagMs: LAG_STEPS[i]! })}
          format={(i) => formatLag(LAG_STEPS[i]!)}
          hint={`Follower 1 applies each write about ${formatLag(ui.lagMs)} after the leader. Follower 2 also serves the analytics team and runs about ${formatLag(
            ui.lagMs * DEFAULT_CONFIG.slowFactor,
          )} behind.`}
        />
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">Replication</span>
          <Segmented<Mode>
            label="Replication mode"
            value={ui.mode}
            onChange={(mode) => update({ mode })}
            options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
            className="flex-wrap self-start"
          />
          <p className="text-small text-graphite">{MODE_HINT[ui.mode]}</p>
        </div>
        <Toggle
          id="rep-leader-reads"
          label="Read my own profile from the leader"
          description="For a minute after Maya changes her profile, her reads of it go to the leader."
          checked={ui.readFromLeader}
          onChange={(readFromLeader) => update({ readFromLeader })}
        />
        <Toggle
          id="rep-sticky"
          label="Pin each user’s reads to one follower"
          description={`Maya’s user name hashes to ${COPY_NAME[PINNED]}, so all her follower reads go there.`}
          checked={ui.sticky}
          onChange={(sticky) => update({ sticky })}
        />
        <Toggle
          id="rep-fail"
          label="The leader’s disk dies at 7 s"
          description="Follower 1, the most up-to-date copy, is promoted 3 seconds later."
          checked={ui.failLeader}
          onChange={(failLeader) => update({ failLeader })}
        />
        <div className="flex items-end sm:justify-end">
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting settings
          </Button>
        </div>
      </ControlPanel>

      <Challenges simId="replication" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          The simulation replays 12 seconds of one database taking about 200 writes per second, with lags that drift a little. Here a follower has
          a write only once it has applied it. Real followers usually receive changes within milliseconds and apply them later, and a change that
          has arrived survives a failover even if it was not applied yet. Many databases also let a synchronous follower confirm once the change is
          safely in its log, before applying it, so even that follower can briefly return old data. Real failovers take from seconds to minutes. The
          numbers are illustrative.
        </p>
      </Callout>
    </div>
  );
}
