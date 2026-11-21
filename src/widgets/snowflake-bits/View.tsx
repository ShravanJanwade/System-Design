import { useState, type CSSProperties, type FormEvent } from 'react';
import { Layers, Plus, Rewind, Timer } from 'lucide-react';
import { Button } from '@/design/Button';
import { Slider } from '@/design/primitives';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Stat } from '@/simulators/shared/SimParts';
import { useReducedMotion } from '@/state/settings';
import type { WidgetProps } from '../registry';
import {
  EPOCH_MS,
  IDS_PER_MS,
  LAST_MS,
  LIFETIME_YEARS,
  MACHINES,
  MAX_MACHINE,
  SEGMENTS,
  START_MS,
  burst,
  decode,
  formatTimestamp,
  nextId,
  parseId,
  toBits,
  type GeneratorState,
  type SegmentKey,
} from './logic';

const SEGMENT_COLOR: Record<SegmentKey, string> = {
  sign: 'var(--panel-muted)',
  time: 'var(--type-edge)',
  machine: 'var(--type-compute)',
  sequence: 'var(--type-database)',
};

const BURST = 5000;

function segmentValue(key: SegmentKey, id: bigint): string {
  const d = decode(id);
  switch (key) {
    case 'sign':
      return 'always 0';
    case 'time':
      return `${formatInt(d.elapsedMs)} ms after the epoch`;
    case 'machine':
      return `machine ${d.machine}`;
    case 'sequence':
      return `number ${d.sequence} in its millisecond`;
  }
}

/** 64 cells in four colored segments. Bits that changed since the last ID are outlined, and fill in left to right. */
function BitLayout({ id, previous, reduced }: { id: bigint | null; previous: bigint | null; reduced: boolean }) {
  const bits = id === null ? null : toBits(id);
  const before = previous === null ? null : toBits(previous);
  const label =
    id === null
      ? 'A 64-bit Snowflake ID layout, empty: 1 sign bit, 41 timestamp bits, 10 machine bits and 12 sequence bits.'
      : (() => {
          const d = decode(id);
          return `Snowflake ID ${id.toString()} in 64 bits: sign bit 0; 41 timestamp bits holding ${formatInt(d.elapsedMs)} milliseconds after the epoch, which is ${formatTimestamp(d.timestampMs)}; 10 machine bits holding ${d.machine}; 12 sequence bits holding ${d.sequence}.`;
        })();
  return (
    <div className="on-panel blueprint-grid flex flex-col gap-4 rounded-panel p-3 sm:p-5">
      <div className="flex flex-col gap-1">
        <span className="text-small text-panel-muted">Snowflake ID</span>
        <span className="font-mono text-[20px] leading-7 break-all text-panel-text sm:text-[24px]">{id === null ? 'No ID yet' : id.toString()}</span>
      </div>
      <div role="img" aria-label={label} className="flex flex-wrap gap-x-3 gap-y-4">
        {SEGMENTS.map((seg) => {
          const color = SEGMENT_COLOR[seg.key];
          return (
            <div key={seg.key} className="flex min-w-0 flex-col gap-1.5" style={{ maxWidth: '100%' }}>
              <div className="flex flex-col">
                <span className="text-small font-semibold text-panel-text">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: color }} aria-hidden />
                  {seg.label}, {seg.bits} {seg.bits === 1 ? 'bit' : 'bits'}
                </span>
                <span className="tabular text-small text-panel-muted">{id === null ? ' ' : segmentValue(seg.key, id)}</span>
              </div>
              <div className="flex flex-wrap gap-[2px]" aria-hidden>
                {Array.from({ length: seg.bits }, (_, i) => {
                  const at = seg.start + i;
                  const bit = bits ? bits[at]! : '0';
                  const changed = bits !== null && before !== null && before[at] !== bit;
                  const style: CSSProperties = {
                    background: bit === '1' ? `color-mix(in srgb, ${color} 55%, var(--card))` : 'var(--card)',
                    borderColor: color,
                    transitionProperty: 'background-color, color',
                    transitionDuration: reduced ? '0ms' : '160ms',
                    transitionDelay: reduced ? '0ms' : `${at * 6}ms`,
                  };
                  return (
                    <span
                      key={at}
                      className={cn(
                        'tabular inline-flex h-6 w-[13px] items-center justify-center rounded-[2px] border text-[11px] font-semibold',
                        bit === '1' ? 'text-card-ink' : 'text-card-muted',
                        changed && 'outline-2 outline-offset-1 outline-signal',
                      )}
                      style={style}
                    >
                      {bit}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SnowflakeBitsWidget({ props }: WidgetProps) {
  const reduced = useReducedMotion();
  const startMachine = typeof props?.machine === 'number' ? Math.max(0, Math.min(MAX_MACHINE, Math.round(props.machine))) : 7;
  const [clockMs, setClockMs] = useState(START_MS);
  const [machine, setMachine] = useState(startMachine);
  const [gens, setGens] = useState<Record<number, GeneratorState>>({});
  const [current, setCurrent] = useState<bigint | null>(null);
  const [previous, setPrevious] = useState<bigint | null>(null);
  const [history, setHistory] = useState<{ id: bigint; machine: number; sequence: number }[]>([]);
  const [made, setMade] = useState(0);
  const [message, setMessage] = useState('Press “Generate an ID” to make the first one.');
  const [decodeText, setDecodeText] = useState('');

  const show = (id: bigint) => {
    setPrevious(current);
    setCurrent(id);
  };

  const remember = (id: bigint, count = 1) => {
    const d = decode(id);
    setHistory((h) => [{ id, machine: d.machine, sequence: d.sequence }, ...h].slice(0, 6));
    setMade((m) => m + count);
    setDecodeText(id.toString());
  };

  const refusedMessage = (resumeAtMs: number) =>
    `Refused. The clock reads ${formatTimestamp(clockMs)}, but machine ${machine} already used ${formatTimestamp(resumeAtMs)}. Snowflake waits rather than risk repeating an ID; advance the clock to continue.`;

  const generate = () => {
    const r = nextId(gens[machine] ?? null, clockMs, machine);
    if (r.kind === 'refused') {
      setMessage(refusedMessage(r.resumeAtMs));
      return;
    }
    setGens((g) => ({ ...g, [machine]: r.state }));
    if (r.waitedMs > 0) setClockMs(r.parts.timestampMs);
    show(r.id);
    remember(r.id);
    setMessage(
      r.waitedMs > 0
        ? 'This millisecond’s 4,096 sequence numbers were used up, so the generator waited for the next millisecond and started again at 0.'
        : r.parts.sequence > 0
          ? `Same millisecond as the last ID from machine ${machine}, so the sequence went up to ${r.parts.sequence}. Only the last bits changed.`
          : `A new millisecond for machine ${machine}, so the sequence starts at 0.`,
    );
  };

  const makeBurst = () => {
    const b = burst(gens[machine] ?? null, clockMs, machine, BURST);
    if (b.ids.length === 0) {
      const state = gens[machine];
      setMessage(refusedMessage(state ? state.lastMs : clockMs));
      return;
    }
    const last = b.ids[b.ids.length - 1]!;
    const inFirst = b.ids.filter((id) => decode(id).timestampMs === clockMs).length;
    setGens((g) => ({ ...g, [machine]: b.state }));
    setClockMs(b.clockMs);
    show(last);
    remember(last, b.ids.length);
    setMessage(
      `Made ${formatInt(b.ids.length)} IDs as fast as possible. ${formatInt(inFirst)} fit in ${formatTimestamp(clockMs)}; the sequence then ran out, so the rest waited for the next millisecond. All ${formatInt(b.ids.length)} are different.`,
    );
  };

  const advance = () => {
    setClockMs((c) => Math.min(LAST_MS, c + 1));
    setMessage('The clock moved forward 1 millisecond. The next ID starts a new sequence.');
  };

  const setBack = () => {
    setClockMs((c) => Math.max(EPOCH_MS, c - 2));
    setMessage('The clock was corrected 2 milliseconds backwards, as a time sync might do. Try generating an ID now.');
  };

  const parsed = parseId(decodeText);
  const decoded = parsed.ok ? decode(parsed.id) : null;

  const onDecode = (e: FormEvent) => {
    e.preventDefault();
    if (parsed.ok) {
      show(parsed.id);
      setMessage('The bits above now show the ID you decoded.');
    }
  };

  const shown = current === null ? null : decode(current);

  return (
    <div className="flex flex-col gap-5">
      <BitLayout id={current} previous={previous} reduced={reduced} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Time" value={shown ? formatTimestamp(shown.timestampMs).slice(11, 23) : '–'} note={shown ? `${formatTimestamp(shown.timestampMs).slice(0, 10)} UTC` : 'from the timestamp bits'} />
        <Stat label="Machine" value={shown ? String(shown.machine) : '–'} note="0 to 1,023" />
        <Stat label="Sequence" value={shown ? String(shown.sequence) : '–'} note="0 to 4,095 per millisecond" />
        <Stat label="IDs made" value={formatInt(made)} note="by you, all different" />
      </div>

      <div className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <p className="tabular text-ui text-ink">
          <span className="font-semibold">Simulated clock:</span> {formatTimestamp(clockMs)}
        </p>
        <Slider
          id="snowflake-machine"
          label="Machine number"
          value={machine}
          min={0}
          max={MAX_MACHINE}
          onChange={setMachine}
          hint="Each server gets its own number, so servers never make the same ID."
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={generate}>
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Generate an ID
          </Button>
          <Button onClick={advance}>
            <Timer className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Advance the clock 1 ms
          </Button>
          <Button onClick={makeBurst}>
            <Layers className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Make {formatInt(BURST)} IDs at once
          </Button>
          <Button variant="ghost" onClick={setBack}>
            <Rewind className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Set the clock back 2 ms
          </Button>
        </div>
        <p aria-live="polite" className="min-h-[2.5rem] text-ui text-graphite">
          {message}
        </p>
        {history.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-ui font-semibold text-ink">Recent IDs, newest first</p>
            <ul className="flex flex-col divide-y divide-rule">
              {history.map((h, i) => (
                <li key={`${h.id.toString()}-${i}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
                  <span className="font-mono text-code break-all text-ink">{h.id.toString()}</span>
                  <span className="tabular text-small text-graphite">
                    machine {h.machine}, sequence {h.sequence}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <form onSubmit={onDecode} className="flex flex-col gap-3 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <label htmlFor="snowflake-decode" className="text-ui font-semibold text-ink">
          Decode an ID
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="snowflake-decode"
            type="text"
            inputMode="numeric"
            value={decodeText}
            onChange={(e) => setDecodeText(e.target.value)}
            placeholder="Paste a Snowflake ID"
            className="h-10 min-w-0 flex-1 rounded-control border border-control bg-paper px-3 font-mono text-ui text-ink"
            aria-describedby="snowflake-decode-result"
          />
          <Button type="submit" disabled={!parsed.ok}>
            Show its bits
          </Button>
        </div>
        <div id="snowflake-decode-result" aria-live="polite" className="text-ui">
          {decodeText.trim() === '' ? (
            <p className="text-graphite">Generated IDs appear here automatically; you can also type your own.</p>
          ) : decoded ? (
            <dl className="tabular grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ink">
              <dt className="text-graphite">Time</dt>
              <dd>
                {formatTimestamp(decoded.timestampMs)}, {formatInt(decoded.elapsedMs)} ms after the epoch
              </dd>
              <dt className="text-graphite">Machine</dt>
              <dd>{decoded.machine}</dd>
              <dt className="text-graphite">Sequence</dt>
              <dd>{decoded.sequence}</dd>
            </dl>
          ) : (
            <p className="text-alert">{parsed.ok ? '' : parsed.error}</p>
          )}
        </div>
      </form>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <Stat label="Per millisecond" value={formatInt(IDS_PER_MS)} note="IDs per machine, from 12 bits" />
        <Stat label="Per second" value="≈ 4.1M" note="IDs per machine at most" />
        <Stat label="Machines" value={formatInt(MACHINES)} note="from 10 bits" />
        <Stat
          label="Timestamps last"
          value={`≈ ${LIFETIME_YEARS.toFixed(1)} years`}
          note={`41 bits of ms: ${new Date(EPOCH_MS).getUTCFullYear()} to ${new Date(LAST_MS).getUTCFullYear()}`}
        />
      </div>
    </div>
  );
}
