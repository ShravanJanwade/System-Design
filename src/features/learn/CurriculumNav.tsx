import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { modules, lessonPath } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { useAllStatuses } from '@/state/progress';
import { cn } from '@/lib/cn';
import { StatusIcon } from './StatusIcon';

/** The curriculum tree: modules, then lessons with their status. */
export function CurriculumNav({ currentLessonId, onNavigate }: { currentLessonId?: string; onNavigate?: () => void }) {
  const statusOf = useAllStatuses();
  const currentModule = modules.find((m) => m.lessons.some((l) => l.id === currentLessonId))?.id;
  const [open, setOpen] = useState<string[]>(currentModule ? [currentModule] : ['m1']);

  return (
    <nav aria-label="Curriculum" className="flex flex-col gap-0.5">
      {modules.map((m) => {
        const expanded = open.includes(m.id);
        return (
          <div key={m.id}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen((o) => (o.includes(m.id) ? o.filter((x) => x !== m.id) : [...o, m.id]))}
              className="flex w-full items-start gap-1.5 rounded-control px-2 py-1.5 text-left text-ui text-ink hover:bg-wash"
            >
              <ChevronRight
                className={cn('mt-0.5 h-4 w-4 shrink-0 text-graphite transition-transform ease-ui', expanded && 'rotate-90')}
                strokeWidth={1.5}
                aria-hidden
              />
              <span>
                <span className="tabular text-graphite">{m.number}.</span> <span className="font-semibold">{m.title}</span>
              </span>
            </button>
            {expanded ? (
              <ul className="mb-1 ml-[22px] flex flex-col border-l border-rule">
                {m.lessons.map((l) => {
                  const written = isLessonWritten(l.id);
                  const current = l.id === currentLessonId;
                  const body = (
                    <>
                      <StatusIcon status={statusOf(l.id)} written={written} className="mt-0.5" />
                      <span className="tabular w-8 shrink-0 text-graphite">{l.number}</span>
                      <span className="min-w-0">{l.title}</span>
                    </>
                  );
                  return (
                    <li key={l.id} className="-ml-px">
                      {written ? (
                        <Link
                          to={lessonPath(l.id)}
                          onClick={onNavigate}
                          aria-current={current ? 'page' : undefined}
                          className={cn(
                            'flex items-start gap-2 border-l-2 py-1.5 pr-2 pl-3 text-ui transition-colors ease-ui',
                            current ? 'border-blueprint bg-blueprint-wash font-semibold text-ink' : 'border-transparent text-ink hover:bg-wash',
                          )}
                        >
                          {body}
                        </Link>
                      ) : (
                        <span className="flex items-start gap-2 border-l-2 border-transparent py-1.5 pr-2 pl-3 text-ui text-graphite">
                          {body}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
