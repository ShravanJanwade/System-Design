import { useId, useMemo, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@/design/Button';
import { Callout, CalloutLead, Chip, Segmented, type ChipTone } from '@/design/primitives';
import { cn } from '@/lib/cn';
import type { WidgetProps } from '../registry';
import {
  BUDGET_MINUTES,
  COLUMNS,
  ESSENTIALS,
  PROMPTS,
  QUESTION_SECONDS,
  VALUE_LABEL,
  formatMinutes,
  getPrompt,
  normalizePromptId,
  summarize,
  togglePick,
  type PromptId,
  type WorksheetQuestion,
} from './logic';

const VALUE_TONE: Record<WorksheetQuestion['value'], ChipTone> = { essential: 'success', useful: 'blueprint', low: 'alert' };

function valueLabel(q: WorksheetQuestion): string {
  if (q.value !== 'essential') return VALUE_LABEL[q.value];
  const e = ESSENTIALS.find((x) => x.id === q.essential);
  return e ? `Essential: ${e.label.toLowerCase()}` : VALUE_LABEL.essential;
}

/**
 * Requirements worksheet: the learner picks the questions they would ask after a one-line prompt.
 * Picked questions reveal the interviewer's answer and what it changes, and fill the worksheet.
 * "Review my questions" shows the skipped essentials, the low-value picks and the time used.
 * Props: `prompt` ('photo-sharing' or 'url-shortener', default 'photo-sharing').
 */
export default function RequirementsWorksheet({ props }: WidgetProps) {
  const [promptId, setPromptId] = useState<PromptId>(() => normalizePromptId(props?.prompt));
  const [picked, setPicked] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const uid = useId();

  const prompt = getPrompt(promptId);
  const summary = useMemo(() => summarize(prompt, picked), [prompt, picked]);
  const last = summary.asked.at(-1);

  const switchPrompt = (id: PromptId) => {
    setPromptId(id);
    setPicked([]);
    setReviewed(false);
  };
  const reset = () => {
    setPicked([]);
    setReviewed(false);
  };

  return (
    <div className="flex flex-col gap-5">
      {PROMPTS.length > 1 ? (
        <Segmented<PromptId>
          label="Interview prompt"
          value={promptId}
          onChange={switchPrompt}
          options={PROMPTS.map((p) => ({ value: p.id, label: p.label }))}
          className="self-start"
        />
      ) : null}

      <div className="rounded-card border border-rule bg-paper p-4 sm:p-5">
        <p className="text-small font-semibold text-graphite">The interviewer says</p>
        <p className="mt-1 text-h3 font-bold text-ink">“{prompt.prompt}”</p>
        <p className="mt-2 text-ui text-graphite">
          Pick the questions you would ask in the first {BUDGET_MINUTES} minutes. Each one reveals the answer and what it changes.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-ui font-semibold text-ink">Questions you could ask</legend>
        <ul className="flex flex-col gap-2">
          {prompt.questions.map((q) => {
            const on = picked.includes(q.id);
            const inputId = `${uid}-${q.id}`;
            return (
              <li key={q.id} className={cn('rounded-card border bg-paper', on ? 'border-blueprint' : 'border-rule')}>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={on}
                    onChange={() => setPicked((p) => togglePick(p, q.id))}
                    className="mt-1 h-4 w-4 shrink-0 [accent-color:var(--blueprint)]"
                    aria-describedby={on ? `${inputId}-reveal` : undefined}
                  />
                  <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer text-ui-lg text-ink">
                    {q.ask}
                  </label>
                  {reviewed ? (
                    <Chip tone={VALUE_TONE[q.value]} className="ml-7 sm:ml-0">
                      {valueLabel(q)}
                    </Chip>
                  ) : null}
                </div>
                {on ? (
                  <div id={`${inputId}-reveal`} className="flex flex-col gap-1.5 border-t border-rule px-3 pt-2.5 pb-3 sm:pl-10">
                    <p className="text-ui text-ink">
                      <strong className="font-semibold">Interviewer:</strong> {q.answer}
                    </p>
                    <p className="text-ui text-graphite">
                      <strong className="font-semibold text-ink">What it changes:</strong> {q.impact}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <p className="sr-only" aria-live="polite">
        {last ? `Interviewer: ${last.answer}` : ''}
      </p>

      <section aria-label="Your requirements worksheet" className="rounded-card border border-rule bg-paper p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-ui-lg font-semibold text-ink">Your worksheet</h4>
          <p className="text-small text-graphite tabular">
            {summary.asked.length} {summary.asked.length === 1 ? 'question' : 'questions'}, about {formatMinutes(summary.minutes)} of {BUDGET_MINUTES} minutes
          </p>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {COLUMNS.map((c) => {
            const lines = summary.worksheet[c.id];
            return (
              <div key={c.id} className="flex flex-col gap-1.5 border-l border-rule pl-3">
                <h5 className="text-small font-semibold text-graphite">{c.label}</h5>
                {lines.length > 0 ? (
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-ui text-ink">
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ui text-graphite">Nothing yet</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setReviewed(true)} disabled={picked.length === 0}>
          Review my questions
        </Button>
        <Button variant="ghost" onClick={reset} disabled={picked.length === 0 && !reviewed}>
          <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Clear my picks
        </Button>
      </div>

      {reviewed ? (
        <div aria-live="polite" className="flex flex-col gap-4">
          <p className="text-ui-lg text-ink">{summary.verdict}</p>

          <div>
            <h4 className="text-ui font-semibold text-ink">The five essential questions</h4>
            <ul className="mt-2 flex flex-col gap-2">
              {ESSENTIALS.map((e) => {
                const asked = summary.covered.includes(e.id);
                return (
                  <li key={e.id} className="flex items-start gap-2">
                    {asked ? (
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.5} aria-hidden />
                    ) : (
                      <X className="mt-0.5 h-5 w-5 shrink-0 text-alert" strokeWidth={1.5} aria-hidden />
                    )}
                    <p className="text-ui text-ink">
                      <strong className="font-semibold">
                        {e.label}: {asked ? 'asked' : 'skipped'}.
                      </strong>
                      {asked ? null : <span className="text-graphite"> {e.miss}</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          {summary.lowValue.length > 0 ? (
            <Callout kind="mistake">
              <p className="text-ui text-ink">
                <CalloutLead kind="mistake" text="Low-value questions." />
                These answers change nothing in the design, and each one costs about {QUESTION_SECONDS} seconds.
              </p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ui text-ink">
                {summary.lowValue.map((q) => (
                  <li key={q.id}>{q.ask}</li>
                ))}
              </ul>
            </Callout>
          ) : null}

          {summary.overBudget ? (
            <p className="text-ui text-alert">
              Over budget: {summary.asked.length} questions take about {formatMinutes(summary.minutes)} minutes, and requirements get about {BUDGET_MINUTES}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
