import { useDeferredValue, useId, useMemo, useState } from 'react';
import { RotateCcw, Shuffle } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Chip, Segmented, Slider } from '@/design/primitives';
import { Diagram } from '@/diagram/Diagram';
import { formatInt, formatMs, formatPercent } from '@/lib/format';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import { quorumDiagram } from './diagram';
import {
  DEFAULT_CONFIG,
  fastWritesFreshReads,
  listReplicas,
  majorityOf,
  majorityUnderFailure,
  replicaName,
  simulateQuorum,
  staleReadPossible,
  writeAllWithFailure,
  type QuorumConfig,
  type QuorumRound,
  type ReadMode,
  type ReplicaRound,
} from './logic';

type UiConfig = Pick<QuorumConfig, 'n' | 'r' | 'w' | 'failed' | 'readMode' | 'round'>;

const N_MIN = 2;
const N_MAX = 5;

const READ_MODE_HINT: Record<ReadMode, string> = {
  random: 'The coordinator uses the first R replicas to answer.',
  worst: 'The read reaches the replicas the write missed first, so it overlaps the write only when it has to.',
};

function fromPreset(preset: SimulatorProps['preset']): UiConfig {
  const p = preset ?? {};
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback);
  const n = Math.min(N_MAX, Math.max(N_MIN, num(p.n, DEFAULT_CONFIG.n)));
  const quorum = (v: unknown, fallback: number) => Math.min(n, Math.max(1, num(v, fallback)));
  // `failed` lists 1-based replicas, such as "3" or "2,3".
  const failed =
    typeof p.failed === 'string'
      ? p.failed
          .split(',')
          .map((s) => Number(s.trim()) - 1)
          .filter((i) => Number.isInteger(i) && i >= 0 && i < n)
      : [];
  return {
    n,
    w: quorum(p.w, DEFAULT_CONFIG.w),
    r: quorum(p.r, DEFAULT_CONFIG.r),
    failed: [...new Set(failed)].sort((a, b) => a - b),
    readMode: p.readMode === 'worst' ? 'worst' : 'random',
    round: 0,
  };
}

const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);

/** "no failed replica", "1 failed replica", "2 failed replicas". */
function failures(k: number): string {
  return k === 0 ? 'no failed replica' : `${k} failed ${plural(k, 'replica', 'replicas')}`;
}

function writeCell(rd: QuorumRound, x: ReplicaRound): string {
  if (x.down) return 'Missed it (down)';
  if (!rd.writeOk) return 'Refused';
  return x.inWrite ? 'Confirmed' : 'Not yet';
}

function readCell(rd: QuorumRound, x: ReplicaRound): string {
  if (x.down) return 'Cannot answer';
  if (!rd.readOk) return 'Refused';
  if (!x.inRead) return 'Not counted';
  return `Answered v${x.version}${x.repaired ? ', then repaired' : ''}`;
}

export default function QuorumSimulator({ preset, embedded }: SimulatorProps) {
  const initial = useMemo(() => fromPreset(preset), [preset]);
  const [ui, setUi] = useState<UiConfig>(initial);
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState(0);
  const failedLabelId = useId();

  const deferred = useDeferredValue(ui);
  const result = useMemo(() => simulateQuorum(deferred), [deferred]);
  const spec = useMemo(() => quorumDiagram(result), [result]);

  // Reference runs for the challenge explanations; they depend only on N.
  const reference = useMemo(() => {
    const n = deferred.n;
    const m = majorityOf(n);
    return {
      m,
      majority: simulateQuorum({ n, w: m, r: m }).stats,
      writeOne: simulateQuorum({ n, w: 1, r: n }).stats,
      writeAll: simulateQuorum({ n, w: n, r: 1 }).stats,
    };
  }, [deferred.n]);

  const update = (patch: Partial<UiConfig>) => {
    setTouched(true);
    setUi((prev) => {
      const next = { ...prev, ...patch };
      next.w = Math.min(next.w, next.n);
      next.r = Math.min(next.r, next.n);
      next.failed = next.failed.filter((i) => i < next.n);
      return next;
    });
  };

  const toggleReplica = (i: number) =>
    update({ failed: ui.failed.includes(i) ? ui.failed.filter((x) => x !== i) : [...ui.failed, i].sort((a, b) => a - b) });

  const reset = () => {
    setUi(initial);
    setStep(0);
  };

  const { config: c, math, round: rd, stats } = result;
  const sum = c.r + c.w;
  const { m } = reference;

  const staleExplanation = (() => {
    if (!staleReadPossible(c)) {
      return 'When R + W is not more than N, the replicas a read asks can all be ones the write has not reached yet, so the read returns an old version.';
    }
    if (!math.writeAvailable || !math.readAvailable) {
      return `R + W = ${sum} is not more than N = ${c.n}, so a read can miss the latest write. Right now, though, ${listReplicas(c.failed)} ${plural(c.failed.length, 'is', 'are')} down and the ${math.writeAvailable ? 'read' : 'write'} is refused: bring a replica back to see a stale read.`;
    }
    const worst =
      math.worstCaseStale === 1
        ? 'in the worst case every read does'
        : `in the worst case none can, but only because ${failures(c.failed.length)} ${plural(c.failed.length, 'leaves', 'leave')} too few replicas to avoid the write`;
    const counted = c.readMode === 'random' ? ` (${formatInt(stats.staleReads)} of ${formatInt(stats.rounds)} simulated rounds)` : '';
    return `R + W = ${sum} is not more than N = ${c.n}, so a read can ask only replicas the write has not reached yet. Right after a write, ${formatPercent(math.staleChance)} of reads miss it${counted}, and ${worst}. Raise R or W until R + W > N, or accept stale reads where they do no harm, such as view counts.`;
  })();

  const tolerance =
    math.writeTolerates === math.readTolerates
      ? `both survive ${failures(math.writeTolerates)}`
      : `writes survive ${failures(math.writeTolerates)} and reads ${failures(math.readTolerates)}`;
  const majorityExplanation = `With W = ${c.w} and R = ${c.r} out of N = ${c.n}, ${tolerance}. ${
    c.failed.length ? `With ${listReplicas(c.failed)} down` : 'With every replica up'
  }, writes are ${math.writeAvailable ? 'still accepted' : 'refused'} and reads are ${math.readAvailable ? 'still answered' : 'refused'}. A majority on both sides survives losing any minority of the replicas, one of three or two of five, and two majorities always overlap, which is why it is the usual default.`;

  const comparable = m < c.n;
  const one = reference.writeOne;
  const maj = reference.majority;
  const fastExplanation = `With W = 1, only R = ${c.n} guarantees fresh reads, because every read must hear from all ${c.n} replicas. ${
    comparable && one.writeWait && maj.writeWait && one.readWait && maj.readWait
      ? `Writes wait only for the fastest replica, typically ${formatMs(one.writeWait.median)} against ${formatMs(maj.writeWait.median)} with a majority of ${m}, but reads now wait for the slowest: the slowest 1% took ${formatMs(one.readWait.p99)} against ${formatMs(maj.readWait.p99)}. `
      : 'Writes wait only for the fastest replica, but every read waits for the slowest. '
  }One failed replica also blocks every read, so Snapgram’s view counts pair W = 1 with R = 1 instead and accept counts that are briefly stale.`;

  const all = reference.writeAll;
  const allExplanation = `With W = N = ${c.n}, even R = 1 sees the latest write, so reads are cheap and survive ${failures(c.n - 1)}. But every write needs every replica, so ${
    c.failed.length ? `with ${listReplicas(c.failed)} down, every write is refused` : 'a single failed replica would refuse every write'
  }. ${
    comparable && all.writeWait && maj.writeWait
      ? `Even with all replicas up, each write waits for the slowest one: the slowest 1% of writes took ${formatMs(all.writeWait.p99)}, against ${formatMs(maj.writeWait.p99)} with W = ${m}.`
      : 'Even with all replicas up, each write waits for the slowest one.'
  }`;

  const challenges: Challenge[] = [
    {
      id: 'stale-read',
      prompt: 'Make a stale read possible: lower R or W until R + W is no longer more than N. Then switch the read to the worst case.',
      explanation: staleExplanation,
      attempted: staleReadPossible(c),
    },
    {
      id: 'majority-failures',
      prompt: 'Keep majority quorums, such as N = 3, W = 2 and R = 2, and fail replicas one at a time. When do writes stop, and when do reads stop?',
      explanation: majorityExplanation,
      attempted: majorityUnderFailure(c),
    },
    {
      id: 'fast-writes',
      prompt: 'Snapgram’s view counts use W = 1 for speed. Set W = 1 and find the smallest R that still guarantees fresh reads. What does it cost?',
      explanation: fastExplanation,
      attempted: fastWritesFreshReads(c),
    },
    {
      id: 'write-all',
      prompt: 'Make every replica confirm each write (W = N), then fail one replica.',
      explanation: allExplanation,
      attempted: writeAllWithFailure(c),
    },
  ];

  const overlapNote =
    math.minOverlap === 0 ? 'a read and a write can share none' : `${plural(math.minOverlap, 'replica', 'replicas')} in every read and every write`;

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Quorum explorer"
          intro="One key in Snapgram’s activity store, copied to N replicas. Set how many must confirm a write and how many must answer a read, fail some replicas, and check whether the read still sees the latest write."
        />
      ) : null}

      <Diagram
        spec={spec}
        title="One write, then one read"
        caption={`Round ${formatInt(ui.round + 1)}. Step through the write and the read; the table below lists every replica.`}
        step={step}
        onStepChange={setStep}
      />

      <div className="overflow-x-auto rounded-card border border-rule bg-paper">
        <table className="w-full min-w-[420px] text-left text-ui">
          <caption className="sr-only">Each replica’s version when the read arrives, and its part in the write and the read.</caption>
          <thead>
            <tr className="text-small text-graphite">
              <th scope="col" className="px-3 py-2 font-semibold">
                Replica
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Holds
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Write (W = {c.w})
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Read (R = {c.r})
              </th>
            </tr>
          </thead>
          <tbody>
            {rd.replicas.map((x) => (
              <tr key={x.index} className="border-t border-rule text-ink">
                <th scope="row" className="px-3 py-2 font-semibold whitespace-nowrap">
                  {replicaName(x.index)}{' '}
                  {rd.overlap.includes(x.index) ? (
                    <Chip tone="signal" className="ml-1">
                      in both
                    </Chip>
                  ) : null}
                </th>
                <td className="tabular px-3 py-2">{x.down ? 'Down' : `v${x.version}`}</td>
                <td className="px-3 py-2 text-graphite">{writeCell(rd, x)}</td>
                <td className="px-3 py-2 text-graphite">{readCell(rd, x)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat
          label="Every read sees the latest write"
          value={math.guaranteed ? 'Guaranteed' : 'Not guaranteed'}
          note={math.guaranteed ? `R + W = ${sum}, more than N = ${c.n}` : `R + W = ${sum}, not more than N = ${c.n}`}
          tone={math.guaranteed ? 'success' : 'alert'}
        />
        <Stat
          label="This read returned"
          value={rd.returned === null ? 'Nothing' : `v${rd.returned}`}
          note={rd.fresh === null ? 'the read was refused' : rd.fresh ? 'the latest version' : `stale: the latest is v${rd.latest}`}
          tone={rd.fresh === true ? 'success' : 'alert'}
        />
        <Stat label="Smallest overlap" value={formatInt(math.minOverlap)} note={overlapNote} />
        <Stat
          label="Stale reads"
          value={formatInt(stats.staleReads)}
          note={`in ${formatInt(stats.rounds)} rounds${c.readMode === 'worst' ? ', worst case' : ''}`}
          tone={stats.staleReads > 0 ? 'alert' : 'ink'}
        />
        <Stat
          label="Writes"
          value={math.writeAvailable ? 'Accepted' : 'Refused'}
          note={`survive ${failures(math.writeTolerates)}`}
          tone={math.writeAvailable ? 'ink' : 'alert'}
        />
        <Stat
          label="Reads"
          value={math.readAvailable ? 'Answered' : 'Refused'}
          note={`survive ${failures(math.readTolerates)}`}
          tone={math.readAvailable ? 'ink' : 'alert'}
        />
        <Stat
          label="Typical write wait"
          value={stats.writeWait ? formatMs(stats.writeWait.median) : 'None'}
          note={stats.writeWait ? `slowest 1%: ${formatMs(stats.writeWait.p99)}` : 'every write is refused'}
        />
        <Stat
          label="Typical read wait"
          value={stats.readWait ? formatMs(stats.readWait.median) : 'None'}
          note={stats.readWait ? `slowest 1%: ${formatMs(stats.readWait.p99)}` : 'every read is refused'}
        />
      </div>

      <ControlPanel>
        <Slider
          id="quorum-n"
          label="Replicas (N)"
          value={ui.n}
          min={N_MIN}
          max={N_MAX}
          onChange={(n) => update({ n })}
          format={(v) => `${v} copies`}
          hint="How many replicas keep a copy of each key."
        />
        <Slider
          id="quorum-w"
          label="Write quorum (W)"
          value={ui.w}
          min={1}
          max={ui.n}
          onChange={(w) => update({ w })}
          format={(v) => `${v} of ${ui.n}`}
          hint="Confirmations the coordinator waits for before a write counts."
        />
        <Slider
          id="quorum-r"
          label="Read quorum (R)"
          value={ui.r}
          min={1}
          max={ui.n}
          onChange={(r) => update({ r })}
          format={(v) => `${v} of ${ui.n}`}
          hint="Answers the coordinator waits for; it returns the highest version among them."
        />
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">Which replicas answer the read</span>
          <Segmented<ReadMode>
            label="Which replicas answer the read"
            value={ui.readMode}
            onChange={(readMode) => update({ readMode })}
            options={[
              { value: 'random', label: 'First to reply' },
              { value: 'worst', label: 'Worst case' },
            ]}
          />
          <p className="text-small text-graphite">{READ_MODE_HINT[ui.readMode]}</p>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span id={failedLabelId} className="text-ui font-semibold text-ink">
            Fail replicas
          </span>
          <div role="group" aria-labelledby={failedLabelId} className="flex flex-wrap gap-2">
            {Array.from({ length: ui.n }, (_, i) => {
              const down = ui.failed.includes(i);
              return (
                <Button key={i} size="sm" variant={down ? 'danger' : 'secondary'} onClick={() => toggleReplica(i)}>
                  {down ? `Bring back ${replicaName(i)}` : `Fail ${replicaName(i)}`}
                </Button>
              );
            })}
          </div>
          <p className="text-small text-graphite">A failed replica misses the write and cannot answer the read.</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button size="sm" onClick={() => update({ round: ui.round + 1 })}>
            <Shuffle className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Run another write and read
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting settings
          </Button>
        </div>
      </ControlPanel>

      <Challenges simId="quorum" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          Each round sends the read while the replicas outside the write quorum are still applying the write, which is when a stale read is
          most likely; in a real store that window usually lasts milliseconds. Real stores also repair replicas in the background, can write to
          stand-in nodes when replicas are down (a sloppy quorum), and must settle two writes made at the same moment. The wait times are
          illustrative.
        </p>
      </Callout>
    </div>
  );
}
