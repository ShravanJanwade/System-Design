import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { ArrowDown, ArrowUp, Check, GripVertical, X } from 'lucide-react';
import type { ChoiceOption, Question } from '@/content/types';
import { Button } from '@/design/Button';
import { Md, MdInline } from '@/features/learn/Markdown';
import { Diagram } from '@/diagram/Diagram';
import { cn } from '@/lib/cn';
import { createRng, hashString } from '@/lib/random';
import { formatInt } from '@/lib/format';

export type QuestionResult = { correct: boolean };

type Props = {
  question: Question;
  number?: number;
  /** Called once, the first time the learner checks this question. */
  onChecked?: (result: QuestionResult) => void;
};

/** Renders any question kind with "Check answer" and per-option explanations. */
export function QuestionView({ question, number, onChecked }: Props) {
  const prompt = (
    <span className="text-h3 font-bold text-ink">
      {number ? <span className="tabular text-graphite">{number}. </span> : null}
      <MdInline md={question.prompt} />
    </span>
  );
  switch (question.kind) {
    case 'single':
    case 'multi':
      return <ChoiceQuestion q={question} prompt={prompt} onChecked={onChecked} />;
    case 'order':
      return <OrderQuestion q={question} prompt={prompt} onChecked={onChecked} />;
    case 'numeric':
      return <NumericQuestion q={question} prompt={prompt} onChecked={onChecked} />;
    case 'bottleneck':
      return <BottleneckQuestion q={question} prompt={prompt} onChecked={onChecked} />;
  }
}

function Verdict({ correct, children }: { correct: boolean; children?: ReactNode }) {
  return (
    <div className={cn('flex items-start gap-2 text-ui-lg', correct ? 'text-success' : 'text-alert')} role="status">
      {correct ? <Check className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden /> : <X className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden />}
      <div>
        <p className="font-bold">{correct ? 'Correct.' : 'Not quite.'}</p>
        {children ? <div className="text-ink">{children}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChoiceQuestion({
  q,
  prompt,
  onChecked,
}: {
  q: Extract<Question, { kind: 'single' | 'multi' }>;
  prompt: ReactNode;
  onChecked?: (r: QuestionResult) => void;
}) {
  const name = useId();
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const multi = q.kind === 'multi';
  const correctSet = q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
  const isCorrect = picked.length === correctSet.length && correctSet.every((i) => picked.includes(i));

  const toggle = (i: number) => {
    if (checked) return;
    setPicked((prev) => (multi ? (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]) : [i]));
  };
  const check = () => {
    setChecked(true);
    onChecked?.({ correct: isCorrect });
  };

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1">
        {prompt}
        {multi ? <span className="mt-1 block text-ui text-graphite">Select all that apply.</span> : null}
      </legend>
      <div className="flex flex-col gap-2">
        {q.options.map((o, i) => (
          <OptionRow
            key={i}
            option={o}
            name={name}
            type={multi ? 'checkbox' : 'radio'}
            selected={picked.includes(i)}
            checked={checked}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>
      {checked ? (
        <Verdict correct={isCorrect}>
          {isCorrect ? null : <p className="text-ui">The explanation under each option says why.</p>}
        </Verdict>
      ) : (
        <div>
          <Button variant="primary" onClick={check} disabled={picked.length === 0}>
            Check answer
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function OptionRow({
  option,
  name,
  type,
  selected,
  checked,
  onToggle,
}: {
  option: ChoiceOption;
  name: string;
  type: 'radio' | 'checkbox';
  selected: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const state = !checked ? 'idle' : option.correct ? 'right' : selected ? 'wrong' : 'other';
  return (
    <div
      className={cn(
        'rounded-card border px-4 py-3 transition-colors ease-ui',
        state === 'idle' && (selected ? 'border-blueprint bg-blueprint-wash' : 'border-rule bg-paper hover:border-graphite'),
        state === 'right' && 'border-success bg-success-wash',
        state === 'wrong' && 'border-alert bg-alert-wash',
        state === 'other' && 'border-rule bg-paper',
      )}
    >
      <label htmlFor={id} className={cn('flex items-start gap-3', !checked && 'cursor-pointer')}>
        <input
          id={id}
          type={type}
          name={name}
          checked={selected}
          disabled={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--blueprint)]"
        />
        <span className="text-ui-lg text-ink">
          <MdInline md={option.text} />
        </span>
        {checked && (option.correct || selected) ? (
          <span className={cn('ml-auto shrink-0 text-small font-bold', option.correct ? 'text-success' : 'text-alert')}>
            {option.correct ? (selected ? 'Your answer, correct' : 'Correct answer') : 'Your answer'}
          </span>
        ) : null}
      </label>
      {checked ? (
        <p className="mt-2 pl-7 text-ui text-graphite">
          <MdInline md={option.why} />
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function shuffledOrder(items: string[], seedText: string): number[] {
  const idx = items.map((_, i) => i);
  const rng = createRng(hashString(seedText));
  for (let attempt = 0; attempt < 10; attempt++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    if (idx.some((v, i) => v !== i)) break;
  }
  return idx;
}

function OrderQuestion({
  q,
  prompt,
  onChecked,
}: {
  q: Extract<Question, { kind: 'order' }>;
  prompt: ReactNode;
  onChecked?: (r: QuestionResult) => void;
}) {
  const initial = useMemo(() => shuffledOrder(q.items, q.prompt), [q.items, q.prompt]);
  const [order, setOrder] = useState<number[]>(initial);
  const [checked, setChecked] = useState(false);
  const isCorrect = order.every((v, i) => v === i);
  const labelId = useId();

  const move = (from: number, to: number) => {
    if (checked || to < 0 || to >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div id={labelId}>
        {prompt}
        <span className="mt-1 block text-ui text-graphite">
          Drag the steps into order, or use the arrow buttons. With a step focused, Alt plus the up or down arrow moves it.
        </span>
      </div>
      <Reorder.Group axis="y" values={order} onReorder={checked ? () => undefined : setOrder} className="flex flex-col gap-2" aria-labelledby={labelId}>
        {order.map((itemIndex, pos) => (
          <OrderItem
            key={itemIndex}
            value={itemIndex}
            text={q.items[itemIndex]!}
            position={pos}
            total={order.length}
            checked={checked}
            rightPlace={itemIndex === pos}
            onMove={(to) => move(pos, to)}
          />
        ))}
      </Reorder.Group>
      {checked ? (
        <Verdict correct={isCorrect}>
          {!isCorrect ? (
            <div className="mt-1 text-ui">
              <p className="font-semibold">The right order:</p>
              <ol className="mt-1 list-decimal pl-5">
                {q.items.map((it) => (
                  <li key={it}>
                    <MdInline md={it} />
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className="mt-2 text-ui text-graphite">
            <MdInline md={q.why} />
          </p>
        </Verdict>
      ) : (
        <div>
          <Button
            variant="primary"
            onClick={() => {
              setChecked(true);
              onChecked?.({ correct: isCorrect });
            }}
          >
            Check answer
          </Button>
        </div>
      )}
    </div>
  );
}

function OrderItem({
  value,
  text,
  position,
  total,
  checked,
  rightPlace,
  onMove,
}: {
  value: number;
  text: string;
  position: number;
  total: number;
  checked: boolean;
  rightPlace: boolean;
  onMove: (to: number) => void;
}) {
  const controls = useDragControls();
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onMove(position - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onMove(position + 1);
    }
  };
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={controls}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`${text}. Position ${position + 1} of ${total}.`}
      className={cn(
        'flex items-center gap-2 rounded-card border bg-paper px-2 py-2 text-ui-lg text-ink',
        checked ? (rightPlace ? 'border-success' : 'border-alert') : 'border-rule',
      )}
    >
      <span
        onPointerDown={(e) => !checked && controls.start(e)}
        className={cn('flex h-8 w-6 shrink-0 touch-none items-center justify-center text-graphite', !checked && 'cursor-grab')}
        aria-hidden
      >
        <GripVertical className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <span className="tabular w-6 shrink-0 text-ui text-graphite">{position + 1}.</span>
      <span className="flex-1">
        <MdInline md={text} />
      </span>
      {!checked ? (
        <span className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={() => onMove(position - 1)}
            disabled={position === 0}
            aria-label={`Move "${text}" up`}
            className="flex h-8 w-8 items-center justify-center rounded-control text-graphite hover:bg-wash disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => onMove(position + 1)}
            disabled={position === total - 1}
            aria-label={`Move "${text}" down`}
            className="flex h-8 w-8 items-center justify-center rounded-control text-graphite hover:bg-wash disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </span>
      ) : null}
    </Reorder.Item>
  );
}

/* ------------------------------------------------------------------ */

/** Accepts "1200", "1,200", "1.2k", "3m", "2e6". */
export function parseNumber(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '');
  const m = /^(-?\d*\.?\d+(?:e[+-]?\d+)?)(k|m|b)?$/.exec(s);
  if (!m) return null;
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : m[2] === 'b' ? 1e9 : 1;
  const v = Number(m[1]) * mult;
  return Number.isFinite(v) ? v : null;
}

export function withinTolerance(value: number, answer: number, tolerance: number): boolean {
  if (answer === 0) return Math.abs(value) < 1e-9;
  const lo = Math.min(answer / tolerance, answer * tolerance);
  const hi = Math.max(answer / tolerance, answer * tolerance);
  return value >= lo && value <= hi;
}

function NumericQuestion({
  q,
  prompt,
  onChecked,
}: {
  q: Extract<Question, { kind: 'numeric' }>;
  prompt: ReactNode;
  onChecked?: (r: QuestionResult) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(false);
  const value = parseNumber(text);
  const isCorrect = value !== null && withinTolerance(value, q.answer, q.tolerance);
  const lo = q.answer / q.tolerance;
  const hi = q.answer * q.tolerance;

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor={id}>{prompt}</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          disabled={checked}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value !== null && !checked) {
              setChecked(true);
              onChecked?.({ correct: isCorrect });
            }
          }}
          className="tabular h-10 w-40 rounded-control border border-control bg-paper px-3 text-ui-lg text-ink focus-visible:border-blueprint"
          aria-describedby={`${id}-unit`}
        />
        <span id={`${id}-unit`} className="text-ui text-graphite">
          {q.unit}
        </span>
      </div>
      {text && value === null && !checked ? (
        <p className="text-ui text-alert">Enter a number, such as 1200, 1,200 or 1.2k.</p>
      ) : null}
      {checked ? (
        <Verdict correct={isCorrect}>
          <p className="text-ui">
            Reference answer: <strong className="tabular">{formatInt(q.answer)} {q.unit}</strong>. Anything from{' '}
            <span className="tabular">{formatInt(lo)}</span> to <span className="tabular">{formatInt(hi)}</span> counts, because estimates only need the right order of magnitude.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ui text-graphite">
            {q.solution.map((line, i) => (
              <li key={i}>
                <MdInline md={line} />
              </li>
            ))}
          </ol>
        </Verdict>
      ) : (
        <div>
          <Button
            variant="primary"
            disabled={value === null}
            onClick={() => {
              setChecked(true);
              onChecked?.({ correct: isCorrect });
            }}
          >
            Check answer
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BottleneckQuestion({
  q,
  prompt,
  onChecked,
}: {
  q: Extract<Question, { kind: 'bottleneck' }>;
  prompt: ReactNode;
  onChecked?: (r: QuestionResult) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const isCorrect = selected === q.answerNodeId;
  const selectedLabel = q.diagram.nodes.find((n) => n.id === selected)?.label;
  const answerLabel = q.diagram.nodes.find((n) => n.id === q.answerNodeId)?.label;

  return (
    <div className="flex flex-col gap-4">
      <div>
        {prompt}
        <span className="mt-1 block text-ui text-graphite">Click or tab to the component that breaks first, then check your answer.</span>
      </div>
      <Diagram
        spec={q.diagram}
        variant="plain"
        interaction={{
          selected,
          onSelect: (id) => !checked && setSelected(id),
          reveal: checked ? q.answerNodeId : null,
          disabled: checked,
        }}
      />
      <p className="text-ui text-graphite" aria-live="polite">
        {selected ? (
          <>
            Selected: <strong className="text-ink">{selectedLabel}</strong>
          </>
        ) : (
          'Nothing selected yet.'
        )}
      </p>
      {checked ? (
        <Verdict correct={isCorrect}>
          {!isCorrect && selected ? (
            <p className="text-ui">
              <strong>{selectedLabel}:</strong> <MdInline md={q.others[selected] ?? ''} />
            </p>
          ) : null}
          <div className="mt-1 text-ui">
            <strong>{answerLabel}:</strong> <Md md={q.why} className="inline text-ui [&>p]:inline" />
          </div>
        </Verdict>
      ) : (
        <div>
          <Button
            variant="primary"
            disabled={!selected}
            onClick={() => {
              setChecked(true);
              onChecked?.({ correct: isCorrect });
            }}
          >
            Check answer
          </Button>
        </div>
      )}
    </div>
  );
}
