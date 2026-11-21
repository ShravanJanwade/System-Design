import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpLeft, RotateCcw } from 'lucide-react';
import type { DecisionNode, DecisionResult } from '@/content/types';
import { cn } from '@/lib/cn';
import { lessonPath, getOutline } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { MdInline } from '@/features/learn/Markdown';
import { DescribeToggle } from './DescribeToggle';

type Answer = { node: DecisionNode; choice: number };

/**
 * A decision flowchart the learner walks: answer a question, the path lights up,
 * and the final card gives a recommendation with the reason.
 */
export function DecisionTree({ tree, title, caption }: { tree: DecisionNode; title: string; caption?: string }) {
  const [answers, setAnswers] = useState<Answer[]>([]);

  let current: DecisionNode | DecisionResult = tree;
  for (const a of answers) current = a.node.options[a.choice]!.next;

  const choose = (node: DecisionNode, choice: number) => setAnswers((prev) => [...prev, { node, choice }]);
  const back = () => setAnswers((prev) => prev.slice(0, -1));
  const restart = () => setAnswers([]);

  return (
    <figure className="flex flex-col gap-3">
      <div className="measure">
        <p className="text-ui font-semibold text-ink">{title}</p>
        {caption ? (
          <p className="text-ui text-graphite">
            <MdInline md={caption} />
          </p>
        ) : null}
      </div>
      <div className="on-panel blueprint-grid rounded-panel p-4 sm:p-6">
        <ol className="flex flex-col" aria-label={`${title}: answered questions`}>
          {answers.map((a, i) => (
            <li key={a.node.id} className="flex flex-col items-start">
              <div className="w-full max-w-[34rem] rounded-card bg-card px-4 py-3 text-card-ink">
                <p className="text-ui font-semibold">
                  <MdInline md={a.node.question} />
                </p>
                <p className="mt-1.5 inline-flex rounded-full bg-signal px-2.5 py-0.5 text-small font-semibold text-on-signal">
                  {a.node.options[a.choice]!.label}
                </p>
              </div>
              <span aria-hidden className={cn('ml-6 block h-6 w-0.5 bg-signal', i === answers.length - 1 && 'h-7')} />
            </li>
          ))}
        </ol>

        {current.kind === 'question' ? (
          <QuestionCard key={current.id} node={current} onChoose={(i) => choose(current as DecisionNode, i)} />
        ) : (
          <ResultCard result={current} />
        )}

        {answers.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={back}
              className="inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-ui font-semibold text-panel-text hover:bg-panel-raised"
            >
              <ArrowUpLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Change last answer
            </button>
            <button
              type="button"
              onClick={restart}
              className="inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-ui font-semibold text-panel-text hover:bg-panel-raised"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Start over
            </button>
          </div>
        ) : null}
      </div>
      <DescribeToggle label="Show the whole flowchart">
        <TreeOutline node={tree} path={answers} depth={0} />
      </DescribeToggle>
    </figure>
  );
}

function QuestionCard({ node, onChoose }: { node: DecisionNode; onChoose: (i: number) => void }) {
  return (
    <div className="w-full max-w-[34rem] rounded-card bg-card px-4 py-4 text-card-ink" role="group" aria-label={node.question}>
      <p className="text-ui-lg font-semibold">
        <MdInline md={node.question} />
      </p>
      {node.help ? (
        <p className="mt-1 text-ui text-card-muted">
          <MdInline md={node.help} />
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {node.options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onChoose(i)}
            className={cn(
              'rounded-control border border-[color-mix(in_srgb,var(--card-ink)_22%,transparent)] px-3 py-1.5 text-ui font-semibold text-card-ink',
              'transition-colors ease-ui hover:border-[var(--panel)] hover:bg-[color-mix(in_srgb,var(--signal)_30%,var(--card))]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal)]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: DecisionResult }) {
  const outline = result.lessonId ? getOutline(result.lessonId) : undefined;
  return (
    <div className="w-full max-w-[34rem] overflow-hidden rounded-card bg-card text-card-ink" aria-live="polite">
      <div className="border-l-4 border-[var(--signal)] px-4 py-4">
        <p className="text-small font-semibold text-card-muted">Recommendation</p>
        <p className="mt-0.5 font-display text-h3 font-semibold">{result.title}</p>
        <p className="mt-1.5 text-ui">
          <MdInline md={result.why} />
        </p>
        {outline && isLessonWritten(outline.id) ? (
          <Link to={lessonPath(outline.id)} className="mt-2 inline-block text-ui font-semibold text-[var(--panel)] underline">
            Read {outline.number}: {outline.title}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function TreeOutline({ node, path, depth }: { node: DecisionNode | DecisionResult; path: Answer[]; depth: number }) {
  if (node.kind === 'result') {
    return (
      <p>
        <strong className="text-ink">{node.title}.</strong> <MdInline md={node.why} />
      </p>
    );
  }
  const chosen = path[depth]?.node.id === node.id ? path[depth]?.choice : undefined;
  return (
    <div>
      <p className="font-semibold text-ink">
        <MdInline md={node.question} />
      </p>
      <ul className="mt-1 list-disc space-y-2 pl-5">
        {node.options.map((o, i) => (
          <li key={o.label}>
            <span className={cn(chosen === i && 'font-semibold text-ink')}>
              {o.label}
              {chosen === i ? ' (your answer)' : ''}
            </span>
            <div className="mt-1">
              <TreeOutline node={o.next} path={chosen === i ? path : []} depth={depth + 1} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
