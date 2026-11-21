import { Link } from 'react-router';
import { Check, CircleHelp } from 'lucide-react';
import { getOutline, lessonPath } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { plural } from '@/lib/format';
import type { Finding } from './rules';

function LessonRef({ id }: { id: string }) {
  const o = getOutline(id);
  if (!o) return null;
  const text = `Lesson ${o.number}: ${o.title}`;
  return isLessonWritten(id) ? (
    <Link to={lessonPath(id)} className="md-link text-ui">
      {text}
    </Link>
  ) : (
    <span className="text-ui text-graphite">{text}</span>
  );
}

/** The checker's findings: questions to think about first, then what already works. */
export function BuilderFeedback({ findings, onShowNode, headingId }: { findings: Finding[]; onShowNode?: (id: string) => void; headingId: string }) {
  const issues = findings.filter((f) => f.tone === 'issue');
  const goods = findings.filter((f) => f.tone === 'good');
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-card border border-rule bg-paper p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-h3 font-bold text-ink">
          Feedback on your design
        </h3>
        <p className="text-ui text-graphite">These come from simple rules about structure and load, so treat them as an interviewer’s prompts. They update as you edit.</p>
      </div>

      {issues.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-ui font-semibold text-ink">{plural(issues.length, 'question')} to think about</p>
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {issues.map((f) => (
              <li key={`${f.id}-${f.topic}`} className="flex gap-3 py-3">
                <CircleHelp className="mt-0.5 h-[18px] w-[18px] shrink-0 text-blueprint" strokeWidth={1.5} aria-hidden />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-ui-lg text-ink">{f.text}</p>
                  {f.lessonId || (f.nodeIds?.length && onShowNode) ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {f.lessonId ? <LessonRef id={f.lessonId} /> : null}
                      {f.nodeIds?.length && onShowNode ? (
                        <button type="button" onClick={() => onShowNode(f.nodeIds![0]!)} className="text-ui font-semibold text-blueprint hover:underline">
                          Show on the canvas
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-ui-lg text-ink">The rules found nothing missing. Walk one request through the design out loud, then compare it with the walkthrough.</p>
      )}

      {goods.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-ui font-semibold text-ink">What works</p>
          <ul className="flex flex-col gap-2">
            {goods.map((f) => (
              <li key={`${f.id}-${f.topic}`} className="flex gap-3">
                <Check className="mt-0.5 h-[18px] w-[18px] shrink-0 text-success" strokeWidth={1.5} aria-hidden />
                <span className="text-ui-lg text-ink">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
