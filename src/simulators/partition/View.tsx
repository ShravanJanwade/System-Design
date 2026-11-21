import { useMemo, useState } from 'react';
import { Database, Eye, Heart, Link2, PenLine, RotateCcw, Unlink, UserPlus } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Chip, Segmented, type ChipTone } from '@/design/primitives';
import { formatInt, formatMs } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import {
  CLAIMANT,
  LOCAL_MS,
  REGION_NAME,
  REGIONS,
  RTT_MS,
  TIMEOUT_MS,
  USERNAME,
  describeQueue,
  differences,
  firstRefusal,
  formatClock,
  initialState,
  joinList,
  lastConflictMerge,
  lastDivergedRead,
  lastWrite,
  otherRegion,
  step,
  totalLikes,
  totals,
  writesWithLinkUp,
  type Action,
  type Field,
  type LogEntry,
  type Mode,
  type Outcome,
  type PartitionState,
  type Region,
  type WriteKind,
} from './logic';

const MODE_LABEL: Record<Mode, string> = { consistency: 'Consistency first', availability: 'Availability first' };

const MODE_HINT: Record<Mode, string> = {
  consistency: `A write counts only once both regions have stored it. With the link up it waits one round trip, about ${RTT_MS} ms; with the link cut it is refused.`,
  availability: `The region that receives a write stores it and answers in about ${LOCAL_MS} ms. With the link cut, the other region hears about it only after the link heals.`,
};

const WHO: Record<Region, string> = {
  oregon: `Maya’s laptop, and ${CLAIMANT.oregon} signing up`,
  singapore: `Maya’s phone, and ${CLAIMANT.singapore} signing up`,
};

const FIELD_NAME: Record<Field, string> = { caption: 'caption', likes: 'likes', username: USERNAME };

const OUTCOME_CHIP: Record<Outcome, { tone: ChipTone; label: string }> = {
  accepted: { tone: 'success', label: 'Accepted' },
  refused: { tone: 'alert', label: 'Refused' },
  taken: { tone: 'neutral', label: 'Name taken' },
  read: { tone: 'blueprint', label: 'Read' },
  link: { tone: 'neutral', label: 'Link' },
  mode: { tone: 'neutral', label: 'Mode' },
};

const WRITE_BUTTONS: { write: WriteKind; label: string; Icon: typeof Heart }[] = [
  { write: 'like', label: 'Like the photo', Icon: Heart },
  { write: 'caption', label: 'Change the caption', Icon: PenLine },
  { write: 'claim', label: `Sign up as ${USERNAME}`, Icon: UserPlus },
];

const REGION_NOUN = (r: Region) => REGION_NAME[r];

function fromPreset(preset: SimulatorProps['preset']): Mode {
  return preset?.mode === 'availability' ? 'availability' : 'consistency';
}

/** A white card on the panel: one region's copy of the data. */
function RegionCard({ region, state, diffs }: { region: Region; state: PartitionState; diffs: Field[] }) {
  const rep = state.replicas[region];
  const queue = describeQueue(state.queued[region]);
  const differs = (f: Field) =>
    diffs.includes(f) ? (
      <Chip tone="signal" className="ml-1.5 align-middle">
        differs
      </Chip>
    ) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-card bg-card p-4 text-card-ink" style={{ borderTop: '3px solid var(--type-database)' }}>
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} style={{ color: 'var(--type-database)' }} aria-hidden />
        <div className="flex min-w-0 flex-col">
          <span className="text-ui font-semibold">{REGION_NAME[region]} copy</span>
          <span className="text-small text-card-muted">{WHO[region]}</span>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-ui">
        <dt className="text-card-muted">Caption</dt>
        <dd className="min-w-0">
          “{rep.caption.text}”{differs('caption')}
          <span className="tabular block text-small text-card-muted">
            saved {formatClock(rep.caption.at)} in {REGION_NOUN(rep.caption.from)}
          </span>
        </dd>
        <dt className="text-card-muted">Likes</dt>
        <dd className="min-w-0">
          <span className="tabular font-semibold">{formatInt(totalLikes(rep))}</span>
          {differs('likes')}
          <span className="tabular block text-small text-card-muted">
            {rep.likes.oregon} counted in Oregon + {rep.likes.singapore} in Singapore
          </span>
        </dd>
        <dt className="text-card-muted">{USERNAME}</dt>
        <dd className="min-w-0">
          {rep.username ? `Taken by ${rep.username.owner}` : 'Free'}
          {differs('username')}
        </dd>
      </dl>
      {queue.length ? (
        <p className="border-t border-dashed pt-2 text-small text-card-muted" style={{ borderColor: 'var(--card-muted)' }}>
          Waiting to send to {REGION_NAME[otherRegion(region)]}: {joinList(queue)}.
        </p>
      ) : null}
    </div>
  );
}

function LinkStatus({ up }: { up: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 md:flex-col md:gap-1 md:px-1 md:py-0">
      <span
        aria-hidden
        className="hidden h-10 md:block"
        style={up ? { width: 2, background: 'var(--panel-line)' } : { width: 0, borderLeft: '2px dashed var(--panel-alert)' }}
      />
      {up ? (
        <Link2 className="h-5 w-5 text-panel-text" strokeWidth={1.5} aria-hidden />
      ) : (
        <Unlink className="h-5 w-5 text-panel-alert" strokeWidth={1.5} aria-hidden />
      )}
      <span className={up ? 'text-small font-semibold text-panel-text' : 'text-small font-semibold text-panel-alert'}>{up ? 'Linked' : 'Link cut'}</span>
      <span className="tabular text-small text-panel-muted md:text-center">{up ? `≈ ${RTT_MS} ms round trip` : 'nothing gets across'}</span>
    </div>
  );
}

function describeState(s: PartitionState, diffs: Field[]): string {
  const o = s.replicas.oregon;
  const g = s.replicas.singapore;
  const copy = (name: string, r: typeof o) =>
    `${name} copy: caption “${r.caption.text}”, ${totalLikes(r)} likes, ${USERNAME} ${r.username ? `taken by ${r.username.owner}` : 'free'}.`;
  return `${s.linkUp ? 'The link between the regions is up.' : 'The link between the regions is cut.'} ${copy('Oregon', o)} ${copy('Singapore', g)} ${
    diffs.length ? `The copies disagree on the ${joinList(diffs.map((f) => FIELD_NAME[f]))}.` : 'The copies agree.'
  }`;
}

function writeNoun(e: LogEntry): string {
  if (e.action.kind !== 'write') return 'write';
  return e.action.write === 'caption' ? 'caption change' : e.action.write === 'claim' ? 'sign-up' : 'like';
}

export default function PartitionSimulator({ preset, embedded }: SimulatorProps) {
  const startMode = useMemo(() => fromPreset(preset), [preset]);
  const [state, setState] = useState<PartitionState>(() => initialState(startMode));
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const act = (a: Action) => {
    setTouched(true);
    setNotice(null);
    setState((s) => step(s, a));
  };

  const changeMode = (mode: Mode) => {
    if (!state.linkUp) {
      setTouched(true);
      setNotice('Heal the link before switching modes. A real system picks its mode before trouble starts, not halfway through it.');
      return;
    }
    act({ kind: 'mode', mode });
  };

  const reset = () => {
    setState(initialState(startMode));
    setNotice(null);
  };

  const diffs = differences(state);
  const count = totals(state);
  const last = lastWrite(state);
  const latest = state.log[state.log.length - 1];
  const recent = state.log.slice(-8).reverse();

  const refusal = firstRefusal(state);
  const diverged = lastDivergedRead(state);
  const conflict = lastConflictMerge(state);
  const timed = writesWithLinkUp(state);

  const challenges: Challenge[] = [
    {
      id: 'refuse',
      prompt: 'With consistency first, cut the link and change Maya’s caption from Singapore. What happens, and why?',
      explanation:
        refusal && refusal.action.kind === 'write'
          ? `${REGION_NAME[refusal.action.from]} waited ${formatMs(TIMEOUT_MS)} for ${REGION_NAME[otherRegion(refusal.action.from)]} to confirm the ${writeNoun(refusal)}, heard nothing, and refused it. That is the consistency choice: no reader anywhere can see two different versions, but the user gets an error until the link heals. Reads still work here, because no write can succeed on either side while the link is down, so both copies stay the same.`
          : 'A write that must be stored in both regions cannot finish while they cannot talk, so the consistency choice is to refuse it and keep both copies the same.',
      attempted: refusal !== undefined,
    },
    {
      id: 'diverge',
      prompt: 'Switch to availability first, cut the link, and send likes or caption changes from both sides. Then read from each side.',
      explanation:
        diverged?.read && diverged.action.kind === 'read'
          ? `Every write was accepted in about ${LOCAL_MS} ms, so nobody saw an error. But ${REGION_NAME[diverged.action.from]} answered with ${diverged.read.snapshot.likes} likes and “${diverged.read.snapshot.caption}”, while ${REGION_NAME[otherRegion(diverged.action.from)]} had accepted ${
              diverged.read.behind.length ? joinList(diverged.read.behind) : 'changes'
            } it could not see. Each region answers from what it knows, and a reader cannot tell that the other side has moved on.`
          : 'Each region accepts writes on its own, so the two copies drift apart, and a reader sees whichever version its region holds.',
      attempted: diverged !== undefined,
    },
    {
      id: 'merge',
      prompt: 'With availability first, change the caption on both sides while the link is cut, then heal it. Which caption survives, and what happens to the likes?',
      explanation: conflict
        ? [
            `The likes merged with none lost: each region counts its own, and the merge adds them up to ${formatInt(conflict.likesAfter)}.`,
            conflict.caption.conflict && conflict.caption.discarded
              ? `The captions could not both survive: last write wins kept “${conflict.caption.kept.text}”, saved at ${formatClock(conflict.caption.kept.at)}, and silently dropped “${conflict.caption.discarded.text}”.`
              : '',
            conflict.username.conflict && conflict.username.keeper && conflict.username.renamed
              ? `Both regions also gave away ${USERNAME}. ${conflict.username.keeper.owner} claimed it first and keeps it, so ${conflict.username.renamed.owner} must pick a new name, which no merge rule can do quietly.`
              : `Try the same with ${USERNAME}: two people can end up owning one name, which no merge rule can fix quietly.`,
            'That is why Snapgram keeps likes on the availability side and usernames on the consistency side.',
          ]
            .filter(Boolean)
            .join(' ')
        : 'Likes merge by adding each region’s count, so none are lost. A caption can hold only one value, so last write wins keeps the newest edit and drops the other.',
      attempted: conflict !== undefined,
    },
    {
      id: 'latency',
      prompt: 'Leave the link up and make one write in each mode. How long does each take, and why?',
      explanation:
        timed.consistency && timed.availability
          ? `With consistency first, the write waited for the other region to store it: ${formatMs(timed.consistency.latencyMs ?? 0)}, almost all of it the round trip across the Pacific. With availability first it returned in ${formatMs(
              timed.availability.latencyMs ?? 0,
            )}, and the other region got the change a moment later. That cost is paid on every write even when nothing is broken: the “else” half of PACELC, latency or consistency.`
          : `Waiting for the other region adds a round trip of about ${RTT_MS} ms to every consistent write, even with no partition. Answering locally takes about ${LOCAL_MS} ms but lets the copies differ for a moment.`,
      attempted: timed.consistency !== undefined && timed.availability !== undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Partition playground"
          intro="Two copies of Snapgram’s data, in Oregon and Singapore. Cut the link between them, choose consistency or availability, and send requests to either side."
        />
      ) : null}

      <figure className="flex flex-col gap-3">
        <div className="on-panel blueprint-grid rounded-panel p-3 sm:p-5">
          <div
            role="img"
            aria-label={describeState(state, diffs)}
            className="grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-3"
          >
            <RegionCard region="oregon" state={state} diffs={diffs} />
            <LinkStatus up={state.linkUp} />
            <RegionCard region="singapore" state={state} diffs={diffs} />
          </div>
        </div>
        <figcaption aria-live="polite" className="measure min-h-[3rem] text-ui-lg text-ink">
          {notice ?? (latest ? (
            <>
              <span className="tabular font-semibold">{formatClock(latest.t)}</span> {latest.text}
            </>
          ) : (
            'Both copies hold the same data, and the link is up. Send a request from either region, or cut the link.'
          ))}
        </figcaption>
      </figure>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Writes accepted" value={formatInt(count.accepted)} note={count.taken ? `${count.taken} found ${USERNAME} taken` : 'stored and confirmed'} />
        <Stat label="Writes refused" value={formatInt(count.refused)} note="could not confirm with the other region" tone={count.refused > 0 ? 'alert' : 'ink'} />
        <Stat
          label="Copies agree"
          value={diffs.length ? 'No' : 'Yes'}
          note={diffs.length ? `${joinList(diffs.map((f) => FIELD_NAME[f]))} ${diffs.length === 1 ? 'differs' : 'differ'}` : 'same data in both regions'}
          tone={diffs.length ? 'alert' : 'ink'}
        />
        <Stat
          label="Last write took"
          value={last?.latencyMs != null ? formatMs(last.latencyMs) : '–'}
          note={
            !last
              ? 'no writes yet'
              : last.outcome === 'refused'
                ? 'timed out, then refused'
                : last.mode === 'consistency'
                  ? 'waited for the other region'
                  : 'answered locally'
          }
          tone={last?.outcome === 'refused' ? 'alert' : 'ink'}
        />
      </div>

      <ControlPanel>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-ui font-semibold text-ink">During a partition, choose</span>
          <Segmented<Mode>
            label="Mode"
            value={state.mode}
            onChange={changeMode}
            options={[
              { value: 'consistency', label: MODE_LABEL.consistency },
              { value: 'availability', label: MODE_LABEL.availability },
            ]}
            className="flex-wrap self-start"
          />
          <p className="text-small text-graphite">
            {MODE_HINT[state.mode]}
            {state.linkUp ? '' : ' Heal the link to change the mode.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          {state.linkUp ? (
            <Button variant="danger" onClick={() => act({ kind: 'cut' })}>
              <Unlink className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Cut the link
            </Button>
          ) : (
            <Button variant="primary" onClick={() => act({ kind: 'heal' })}>
              <Link2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Heal the link and merge
            </Button>
          )}
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the start
          </Button>
        </div>

        {REGIONS.map((region) => (
          <div key={region} role="group" aria-labelledby={`partition-${region}`} className="flex flex-col gap-2">
            <div className="flex flex-col">
              <span id={`partition-${region}`} className="text-ui font-semibold text-ink">
                Requests to {REGION_NAME[region]}
              </span>
              <span className="text-small text-graphite">{WHO[region]}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {WRITE_BUTTONS.map(({ write, label, Icon }) => (
                <Button key={write} size="sm" onClick={() => act({ kind: 'write', write, from: region })} aria-label={`${label}, sent to ${REGION_NAME[region]}`}>
                  <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  {label}
                </Button>
              ))}
              <Button size="sm" onClick={() => act({ kind: 'read', from: region })} aria-label={`Read the photo from ${REGION_NAME[region]}`}>
                <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Read the photo
              </Button>
            </div>
          </div>
        ))}
      </ControlPanel>

      {recent.length ? (
        <div className="flex flex-col gap-2 rounded-card border border-rule bg-paper p-4 sm:p-5">
          <p className="text-ui font-semibold text-ink">What happened, newest first</p>
          <ol className="flex flex-col divide-y divide-rule">
            {recent.map((e) => {
              const chip = OUTCOME_CHIP[e.outcome];
              const where = e.action.kind === 'write' || e.action.kind === 'read' ? REGION_NAME[e.action.from] : null;
              return (
                <li key={e.t} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:gap-3">
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-small font-semibold text-ink">{formatClock(e.t)}</span>
                    <Chip tone={e.merge?.changed ? 'signal' : chip.tone}>{e.merge ? 'Merge' : chip.label}</Chip>
                  </span>
                  <span className="text-ui text-graphite">
                    {where ? <span className="font-semibold text-ink">{where}. </span> : null}
                    {e.text}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <Challenges simId="partition" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Two copies, one link, and a clock that moves one second per action. Real systems usually keep three or more copies, so the side with a
          majority can keep working during a partition; they notice a cut with heartbeats instead of one timeout per write, use version numbers to
          tell a conflict from a plain update, and see partitions that are partial or one-way. The latencies are ballpark.
        </p>
      </Callout>
    </div>
  );
}
