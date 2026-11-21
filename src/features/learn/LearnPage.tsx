import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { Clock } from 'lucide-react';
import { getOutline, lessonPath, modules } from '@/content/modules';
import { isLessonWritten } from '@/content/lessons';
import { ProgressRing } from '@/design/primitives';
import { useAllStatuses, statusLabel } from '@/state/progress';
import { cn } from '@/lib/cn';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { StatusIcon } from './StatusIcon';

export default function LearnPage() {
  const statusOf = useAllStatuses();
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <Page>
      <PageHeader
        title="Learn"
        intro="Nine modules, seventy lessons, in order. Each lesson teaches one idea in 8 to 15 minutes and links back to anything it builds on."
      >
        <Link to="/plan" className="md-link w-max text-ui-lg">
          See this week in your study plan
        </Link>
      </PageHeader>
      <div className="flex flex-col gap-12">
        {modules.map((m) => {
          const done = m.lessons.filter((l) => ['done', 'mastered'].includes(statusOf(l.id))).length;
          return (
            <section key={m.id} id={m.id} aria-labelledby={`${m.id}-h`} className="flex scroll-mt-20 flex-col gap-4">
              <div className="flex items-start gap-4">
                <ProgressRing value={done / m.lessons.length} size={44} label={`${done} of ${m.lessons.length} lessons done`}>
                  <span className="tabular text-small font-semibold text-ink">{m.number}</span>
                </ProgressRing>
                <div className="measure">
                  <h2 id={`${m.id}-h`} className="font-display text-h2-sm font-semibold text-ink sm:text-h2">
                    {m.title}
                  </h2>
                  <p className="text-ui-lg text-graphite">{m.summary}</p>
                </div>
              </div>
              <ol className="max-w-[880px] divide-y divide-rule rounded-card border border-rule bg-paper">
                {m.lessons.map((l) => {
                  const written = isLessonWritten(l.id);
                  const status = statusOf(l.id);
                  const inner = (
                    <>
                      <span className="tabular w-10 shrink-0 pt-0.5 text-ui text-graphite">{l.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-ui-lg font-semibold', written ? 'text-ink' : 'text-graphite')}>{l.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-graphite">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                            {l.minutes} min
                          </span>
                          {written ? (
                            <span className="inline-flex items-center gap-1">
                              <StatusIcon status={status} className="h-3.5 w-3.5" />
                              {statusLabel[status]}
                            </span>
                          ) : (
                            <span>Not written in this build</span>
                          )}
                          {l.prerequisites.length ? (
                            <span>
                              Builds on{' '}
                              {l.prerequisites
                                .map((p) => getOutline(p))
                                .filter(Boolean)
                                .map((o) => o!.number)
                                .join(', ')}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={l.id}>
                      {written ? (
                        <Link to={lessonPath(l.id)} className="flex items-start gap-3 px-4 py-3 transition-colors ease-ui hover:bg-wash">
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-start gap-3 px-4 py-3">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </Page>
  );
}
