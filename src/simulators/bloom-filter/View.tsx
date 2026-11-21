import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { Eraser, ListChecks, Plus, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Slider } from '@/design/primitives';
import { formatInt, formatPercent } from '@/lib/format';
import { useElementWidth } from '@/lib/hooks';
import type { SimulatorProps } from '../registry';
import { Challenges, type Challenge } from '../shared/Challenges';
import { ControlPanel, SimHeader, Stat } from '../shared/SimParts';
import {
  DEFAULTS,
  MAX_HASHES,
  MAX_ITEMS,
  MIN_HASHES,
  PROBE_COUNT,
  SIZE_STEPS,
  analyze,
  buildFilter,
  checkUnseen,
  positionsFor,
  seenPhoto,
  type BloomFilter,
  type CurvePoint,
} from './logic';

type Focus = { kind: 'add' | 'check'; item: string } | null;
type Start = { bitsIndex: number; hashes: number; photos: number };

const NONE: number[] = [];
const CELL = 16;

function nearestIndex(steps: readonly number[], v: number): number {
  let best = 0;
  for (let i = 0; i < steps.length; i++) if (Math.abs(steps[i]! - v) < Math.abs(steps[best]! - v)) best = i;
  return best;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function fromPreset(preset: SimulatorProps['preset']): Start {
  const bits = typeof preset?.bits === 'number' ? preset.bits : DEFAULTS.bits;
  const hashes = typeof preset?.hashes === 'number' ? preset.hashes : DEFAULTS.hashes;
  const photos = typeof preset?.photos === 'number' ? preset.photos : DEFAULTS.photos;
  return {
    bitsIndex: nearestIndex(SIZE_STEPS, bits),
    hashes: clamp(Math.round(hashes), MIN_HASHES, MAX_HASHES),
    photos: clamp(Math.round(photos), 0, MAX_ITEMS),
  };
}

const firstPhotos = (n: number) => Array.from({ length: n }, (_, i) => seenPhoto(i));
const hashWord = (k: number) => (k === 1 ? 'hash function' : 'hash functions');

/** "3", "3 and 9", "3, 9 and 41". */
function listNumbers(values: readonly number[]): string {
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

function bitsPhrase(values: readonly number[]): string {
  return `${values.length === 1 ? 'bit' : 'bits'} ${listNumbers(values)}`;
}

/** The array as a grid of squares: filled squares are 1. The focused item's bits are outlined. */
function BitGrid({ array, marked, zeros, label }: { array: Uint8Array; marked: readonly number[]; zeros: readonly number[]; label: string }) {
  const size = array.length;
  const cols = size <= 128 ? 16 : size <= 512 ? 32 : 64;
  const rows = Math.ceil(size / cols);
  const zeroSet = new Set(zeros);
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push(
      <rect
        key={i}
        x={(i % cols) * CELL + 2}
        y={Math.floor(i / cols) * CELL + 2}
        width={CELL - 4}
        height={CELL - 4}
        rx={2}
        fill={array[i] ? 'var(--card)' : 'none'}
        stroke="var(--panel-line)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  return (
    <svg viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} width="100%" role="img" aria-label={label} className="block" style={{ maxWidth: cols * 28 }}>
      {cells}
      {[...new Set(marked)].map((p) => {
        const zero = zeroSet.has(p);
        return (
          <rect
            key={`m${p}`}
            x={(p % cols) * CELL + 0.5}
            y={Math.floor(p / cols) * CELL + 0.5}
            width={CELL - 1}
            height={CELL - 1}
            rx={3}
            fill="none"
            stroke={zero ? 'var(--panel-alert)' : 'var(--signal)'}
            strokeWidth={2.5}
            strokeDasharray={zero ? '3 2' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function Swatch({ kind }: { kind: 'one' | 'zero' | 'marked' | 'ruled-out' }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <rect
        x={1.5}
        y={1.5}
        width={11}
        height={11}
        rx={2}
        fill={kind === 'one' ? 'var(--card)' : 'none'}
        stroke={kind === 'marked' ? 'var(--signal)' : kind === 'ruled-out' ? 'var(--panel-alert)' : 'var(--panel-line)'}
        strokeWidth={kind === 'marked' || kind === 'ruled-out' ? 2 : 1}
        strokeDasharray={kind === 'ruled-out' ? '3 2' : undefined}
      />
    </svg>
  );
}

function niceMax(pct: number): number {
  for (const step of [1, 2, 5, 10, 20, 50, 100]) if (pct <= step) return step;
  return 100;
}

/** Expected rate (line) and observed rate (dots) for every number of hash functions, at the current size and photo count. */
function RateChart({ curve, current }: { curve: CurvePoint[]; current: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = 180;
  const left = 44;
  const right = 12;
  const top = 12;
  const bottom = 30;
  const w = Math.max(0, width - left - right);
  const h = height - top - bottom;
  const yMax = niceMax(Math.max(...curve.map((p) => Math.max(p.expected, p.observed))) * 100);
  const slot = w / curve.length;
  const sx = (k: number) => left + (k - 0.5) * slot;
  const sy = (pct: number) => top + h - (Math.min(pct, yMax) / yMax) * h;
  const line = curve.map((p, i) => `${i ? 'L' : 'M'}${sx(p.hashes).toFixed(1)} ${sy(p.expected * 100).toFixed(1)}`).join(' ');
  const lowest = curve.reduce((a, b) => (b.expected < a.expected ? b : a));
  const here = curve.find((p) => p.hashes === current);
  const summary = here
    ? `The expected rate is lowest at ${lowest.hashes} ${hashWord(lowest.hashes)}, ${formatPercent(lowest.expected)}. At your ${current}, it is ${formatPercent(here.expected)} expected and ${formatPercent(here.observed)} observed.`
    : 'No data.';
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-ui font-semibold text-ink">False-positive rate by number of hash functions</figcaption>
      <div ref={ref} className="w-full">
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label={`False-positive rate by number of hash functions. ${summary}`} className="block overflow-visible">
            <rect x={sx(current) - slot / 2} y={top} width={slot} height={h} fill="var(--wash)" />
            {[0, yMax / 2, yMax].map((t) => (
              <g key={t}>
                <line x1={left} x2={left + w} y1={sy(t)} y2={sy(t)} stroke="var(--rule)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
                <text x={left - 8} y={sy(t) + 4} textAnchor="end" fontSize={12} fill="var(--graphite)" className="tabular">
                  {`${t}%`}
                </text>
              </g>
            ))}
            {curve.map((p) => (
              <text
                key={`x${p.hashes}`}
                x={sx(p.hashes)}
                y={height - 10}
                textAnchor="middle"
                fontSize={12}
                fontWeight={p.hashes === current ? 700 : 400}
                fill={p.hashes === current ? 'var(--ink)' : 'var(--graphite)'}
                className="tabular"
              >
                {p.hashes}
              </text>
            ))}
            <path d={line} fill="none" stroke="var(--blueprint)" strokeWidth={1.75} strokeLinejoin="round" />
            {curve.map((p) => (
              <circle key={`o${p.hashes}`} cx={sx(p.hashes)} cy={sy(p.observed * 100)} r={3.5} fill="var(--graphite)" />
            ))}
          </svg>
        ) : (
          <div style={{ height }} />
        )}
      </div>
      <p className="text-small text-graphite">
        Line: expected, from the formula. Dots: observed, from {formatInt(PROBE_COUNT)} photos that were never added. Shaded column: your setting.
      </p>
    </figure>
  );
}

export default function BloomFilterSimulator({ preset, embedded }: SimulatorProps) {
  const start = useMemo(() => fromPreset(preset), [preset]);
  const [bitsIndex, setBitsIndex] = useState(start.bitsIndex);
  const [hashes, setHashes] = useState(start.hashes);
  const [items, setItems] = useState<string[]>(() => firstPhotos(start.photos));
  const [nextPhoto, setNextPhoto] = useState(start.photos);
  const [focus, setFocus] = useState<Focus>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState(`Maya’s filter starts with ${start.photos} photos she has seen. Add photos, or check one to see its bits.`);
  const [probeCursor, setProbeCursor] = useState(0);
  const [foundFalsePositive, setFoundFalsePositive] = useState(false);
  const [hashMoves, setHashMoves] = useState(0);
  const [touched, setTouched] = useState(false);

  const bits = SIZE_STEPS[bitsIndex]!;
  const config = useMemo(() => ({ items, bits, hashes }), [items, bits, hashes]);
  const deferred = useDeferredValue(config);
  const a = useMemo(() => analyze(deferred.items, deferred.bits, deferred.hashes), [deferred]);
  const n = a.items;

  const focusInfo = useMemo(() => {
    if (!focus) return null;
    const positions = [...new Set(positionsFor(focus.item, a.bits, a.hashes))].sort((x, y) => x - y);
    const zeros = positions.filter((p) => a.filter.array[p] === 0);
    return { ...focus, positions, zeros };
  }, [focus, a]);

  const currentFilter = () => buildFilter(items, bits, hashes);

  const describeAdd = (item: string, before: BloomFilter) => {
    const positions = [...new Set(positionsFor(item, bits, hashes))].sort((x, y) => x - y);
    const already = positions.filter((p) => before.array[p] === 1).length;
    const tail =
      already === 0
        ? 'All of them were 0 and are now 1.'
        : already === positions.length
          ? 'Every one of them was already 1, set by other items, so nothing changed.'
          : `${already} of them ${already === 1 ? 'was' : 'were'} already 1, set by other items.`;
    return `Added ${item}. Its ${hashes} ${hashWord(hashes)} point to ${bitsPhrase(positions)}. ${tail}`;
  };

  const limitMessage = `The simulator holds at most ${MAX_ITEMS} items. Clear the filter to start again.`;

  const addPhotos = (count: number) => {
    setTouched(true);
    const room = MAX_ITEMS - items.length;
    if (room <= 0) {
      setMessage(limitMessage);
      return;
    }
    const have = new Set(items);
    const added: string[] = [];
    let i = nextPhoto;
    while (added.length < Math.min(count, room)) {
      const photo = seenPhoto(i++);
      if (!have.has(photo)) added.push(photo);
    }
    const before = currentFilter();
    const last = added[added.length - 1]!;
    setItems([...items, ...added]);
    setNextPhoto(i);
    setFocus({ kind: 'add', item: last });
    setMessage(added.length === 1 ? describeAdd(last, before) : `Added ${added.length} photos Maya has seen. The outlined bits belong to the last one, ${last}.`);
  };

  const addTyped = () => {
    const item = text.trim();
    if (!item) return;
    setTouched(true);
    if (items.includes(item)) {
      setFocus({ kind: 'add', item });
      setMessage(`${item} is already in the filter. Adding it again would set the same bits, so nothing changes.`);
      return;
    }
    if (items.length >= MAX_ITEMS) {
      setMessage(limitMessage);
      return;
    }
    const before = currentFilter();
    setItems([...items, item]);
    setFocus({ kind: 'add', item });
    setMessage(describeAdd(item, before));
  };

  const checkTyped = (e: FormEvent) => {
    e.preventDefault();
    const item = text.trim();
    if (!item) return;
    setTouched(true);
    const r = currentFilter().check(item);
    setFocus({ kind: 'check', item });
    if (!r.maybe) {
      const zeros = [...r.zeros].sort((x, y) => x - y);
      setMessage(`${item}: ${bitsPhrase(zeros)} ${zeros.length === 1 ? 'is' : 'are'} 0, so it was definitely never added.`);
    } else if (items.includes(item)) {
      setMessage(`${item}: all its bits are 1, so the filter says maybe. It was added, so this maybe is right.`);
    } else {
      setFoundFalsePositive(true);
      setMessage(`${item}: all its bits are 1, so the filter says maybe, but it was never added. That is a false positive: other items set every one of its bits.`);
    }
  };

  const checkBatch = () => {
    setTouched(true);
    const r = checkUnseen(currentFilter(), new Set(items), probeCursor, 10);
    setProbeCursor(r.next);
    const maybes = r.results.filter((c) => c.maybe).map((c) => c.item);
    const last = r.results[r.results.length - 1];
    if (maybes.length) setFoundFalsePositive(true);
    const shown = maybes[0] ?? last?.item;
    if (shown) setFocus({ kind: 'check', item: shown });
    setMessage(
      maybes.length === 0
        ? `Checked 10 photos Maya has never seen. The filter said definitely not to all of them; the outlined bits belong to the last one, ${last?.item ?? ''}.`
        : `Checked 10 photos Maya has never seen. The filter said maybe to ${maybes.length}: ${maybes.join(', ')}. ${maybes.length === 1 ? 'That is a false positive' : 'Those are false positives'}; the outlined bits belong to ${maybes[0]}.`,
    );
  };

  const clearAll = () => {
    setTouched(true);
    setItems([]);
    setNextPhoto(0);
    setFocus(null);
    setProbeCursor(0);
    setMessage('The filter is empty. Every bit is 0, so every check answers definitely not.');
  };

  const reset = () => {
    setBitsIndex(start.bitsIndex);
    setHashes(start.hashes);
    setItems(firstPhotos(start.photos));
    setNextPhoto(start.photos);
    setFocus(null);
    setProbeCursor(0);
    setText('');
    setMessage(`Back to the start: ${start.photos} photos in ${SIZE_STEPS[start.bitsIndex]} bits, with ${start.hashes} ${hashWord(start.hashes)}.`);
  };

  const focusLine = focusInfo
    ? focusInfo.kind === 'add'
      ? `${focusInfo.item} sets ${bitsPhrase(focusInfo.positions)}.`
      : focusInfo.zeros.length
        ? `${focusInfo.item} checks ${bitsPhrase(focusInfo.positions)}. ${focusInfo.zeros.length === 1 ? 'Bit' : 'Bits'} ${listNumbers(focusInfo.zeros)} ${focusInfo.zeros.length === 1 ? 'is' : 'are'} 0: definitely not in the set.`
        : `${focusInfo.item} checks ${bitsPhrase(focusInfo.positions)}. All are 1: maybe in the set.`
    : 'Filled squares are bits set to 1, numbered from 0 at the top left. Add or check a photo to outline its bits.';

  const challenges: Challenge[] = [
    {
      id: 'false-positive',
      prompt: 'Check photos Maya has never seen until the filter wrongly says maybe.',
      explanation:
        'Every bit that photo maps to had already been set by other photos, so the filter cannot tell it from a photo it holds. At the starting settings, roughly 1 unseen photo in 16 to 20 gets through. The opposite never happens: a photo you added always finds all its bits set, so a Bloom filter has no false negatives.',
      attempted: foundFalsePositive,
    },
    {
      id: 'overfill',
      prompt: 'Keep adding photos without growing the array until the observed false-positive rate passes 50%.',
      explanation:
        'A Bloom filter never refuses an item; it just fills up. With 128 bits and 3 hash functions, about 65 photos set four bits in five, and then most strangers find all three of their bits already set. Size a filter for the items it will hold: about 9.6 bits per item for 1%.',
      attempted: a.observed.rate >= 0.5,
    },
    {
      id: 'best-k',
      prompt: 'Put 50 photos in a 512-bit array, then find the number of hash functions with the lowest false-positive rate.',
      explanation:
        'The expected rate is lowest near (bits ÷ photos) × ln 2: 512 ÷ 50 × 0.69 ≈ 7, and 6 to 8 are almost as good, so the observed dots may bottom out at any of them. With fewer hash functions, each check reads too few bits, so strangers pass easily; with more, every photo sets more bits and the array fills up. The chart shows the dip, with both ends higher.',
      attempted: hashMoves >= 2 && n >= 20 && a.bestExact <= MAX_HASHES + 0.5 && Math.abs(a.hashes - a.best) <= 1,
    },
    {
      id: 'size',
      prompt: 'With 50 photos, find the smallest array that keeps the expected rate under 1%.',
      explanation:
        'About 9.6 bits per photo with 7 hash functions gives 1%, so 50 photos need about 480 bits. Here 512 bits is the smallest size that gets under 1%, at about 0.7% with 7 hash functions, while 384 bits cannot get below about 2.5%. Redis’s documentation gives the same rule: 9.6 bits and 7 hash functions per item for 1%.',
      attempted: n >= 50 && a.expected < 0.01 && a.bits / n <= 12,
    },
  ];

  const best = n
    ? a.bestExact > MAX_HASHES + 0.5
      ? `ideally ${a.bestExact.toFixed(0)}; 12 is the most here`
      : `(${a.bits} ÷ ${n}) × ln 2 ≈ ${a.bestExact.toFixed(1)}`
    : 'add photos first';

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <SimHeader
          title="Bloom filter"
          intro="Maya’s seen-photos filter, with a real bit array and real hash functions. Add photos, check photos she has never seen, and compare the observed false-positive rate with the formula."
        />
      ) : null}

      <div className="on-panel blueprint-grid flex flex-col gap-3 rounded-panel p-3 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-ui font-semibold text-panel-text">Maya’s seen-photos filter</span>
          <span className="tabular text-small text-panel-muted">
            {formatInt(a.bits)} bits, {a.hashes} {hashWord(a.hashes)}, {formatInt(n)} {n === 1 ? 'photo' : 'photos'}
          </span>
        </div>
        <BitGrid
          array={a.filter.array}
          marked={focusInfo?.positions ?? NONE}
          zeros={focusInfo?.kind === 'check' ? focusInfo.zeros : NONE}
          label={`A ${a.bits}-bit array with ${a.setCount} bits set to 1. ${focusLine}`}
        />
        <p className="tabular text-small text-panel-text">{focusLine}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-panel-muted" aria-hidden>
          <li className="flex items-center gap-1.5">
            <Swatch kind="one" />1
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="zero" />0
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="marked" />
            the photo’s bits
          </li>
          <li className="flex items-center gap-1.5">
            <Swatch kind="ruled-out" />a 0 that rules it out
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        <Stat label="Photos added" value={formatInt(n)} note={n ? `${(a.bits / n).toFixed(1)} bits per photo` : 'none yet'} />
        <Stat label="Bits set to 1" value={formatInt(a.setCount)} note={`${formatPercent(a.fillRatio)} of ${formatInt(a.bits)}`} />
        <Stat label="Best number of hash functions" value={n ? String(a.best) : '–'} note={best} />
        <Stat label="Expected false positives" value={formatPercent(a.expected)} note="from the formula" />
        <Stat
          label="Observed false positives"
          value={formatPercent(a.observed.rate)}
          note={`${formatInt(a.observed.falsePositives)} of ${formatInt(a.observed.checked)} photos never added`}
          tone={a.observed.rate >= 0.5 ? 'alert' : 'ink'}
        />
      </div>

      <ControlPanel>
        <Slider
          id="bloom-bits"
          label="Bits in the array"
          value={bitsIndex}
          min={0}
          max={SIZE_STEPS.length - 1}
          onChange={(i) => {
            setBitsIndex(i);
            setTouched(true);
          }}
          format={(i) => `${formatInt(SIZE_STEPS[i]!)} bits`}
          hint="Real filters use millions of bits; this one is small enough to show every bit."
        />
        <Slider
          id="bloom-hashes"
          label="Hash functions"
          value={hashes}
          min={MIN_HASHES}
          max={MAX_HASHES}
          onChange={(k) => {
            setHashes(k);
            setHashMoves((m) => m + 1);
            setTouched(true);
          }}
          hint="How many bits each photo sets, and how many each check reads."
        />
      </ControlPanel>

      <div className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <span className="text-ui font-semibold text-ink">Photos Maya has seen</span>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => addPhotos(1)}>
              <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Add 1 photo
            </Button>
            <Button onClick={() => addPhotos(10)}>
              <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Add 10 photos
            </Button>
            <Button onClick={() => addPhotos(50)}>
              <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Add 50 photos
            </Button>
            <Button variant="primary" onClick={checkBatch}>
              <ListChecks className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Check 10 unseen photos
            </Button>
          </div>
        </div>
        <form onSubmit={checkTyped} className="flex flex-col gap-2">
          <label htmlFor="bloom-item" className="text-ui font-semibold text-ink">
            Any photo or word
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="bloom-item"
              type="text"
              value={text}
              maxLength={40}
              onChange={(e) => setText(e.target.value)}
              placeholder="photo-10000, or any word"
              className="h-10 min-w-0 flex-1 rounded-control border border-control bg-paper px-3 font-mono text-ui text-ink"
            />
            <div className="flex gap-2">
              <Button type="button" onClick={addTyped} disabled={!text.trim()}>
                <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Add it
              </Button>
              <Button type="submit" disabled={!text.trim()}>
                <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Check it
              </Button>
            </div>
          </div>
        </form>
        <p aria-live="polite" className="min-h-[2.5rem] text-ui text-graphite">
          {message}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={clearAll}>
            <Eraser className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Clear the filter
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Reset to the starting settings
          </Button>
        </div>
      </div>

      <div className="rounded-card border border-rule bg-paper p-4 sm:p-5">
        <RateChart curve={a.curve} current={a.hashes} />
      </div>

      <Challenges simId="bloom-filter" challenges={challenges} touched={touched} />

      <Callout kind="simplification">
        <p className="text-ui-lg text-ink">
          <CalloutLead kind="simplification" />
          This filter is tiny so you can see every bit; real ones hold millions of items in millions of bits. The observed rate comes from checking{' '}
          {formatInt(PROBE_COUNT)} photos that were never added, so it wobbles around the formula, most in small arrays, where a few bits make a big
          difference. Each hash function here is the item’s FNV-1a hash mixed with a different seed; real libraries often derive all k positions
          from two hash values.
        </p>
      </Callout>
    </div>
  );
}
