import { Link } from 'react-router';
import { Circle, Clock, MessagesSquare, PencilRuler } from 'lucide-react';
import { getOutline, lessonPath } from '@/content/modules';
import { getProblem } from '@/content/problem-list';
import { isLessonWritten } from '@/content/lessons';
import { isProblemWritten } from '@/content/problems';
import { StatusIcon } from '@/features/learn/StatusIcon';
import { useAllStatuses, statusLabel } from '@/state/progress';
import type { PlanItem } from '@/state/plan';
import { cn } from '@/lib/cn';

export function hoursLabel(minutes: number): string {
  const h = Math.round((minutes / 60) * 2) / 2;
  if (h < 1) return `about ${Math.max(5, Math.round(minutes / 5) * 5)} min`;
  return `about ${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** One week's items: lessons link to the lesson and show their status; problems open their workspace; mocks start from the Problems page. */
export function PlanItemList({ items, limit }: { items: PlanItem[]; limit?: number }) {
  const statusOf = useAllStatuses();
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="flex flex-col">
      {shown.map((item, i) => {
        if (item.kind === 'lesson') {
          const o = getOutline(item.id);
          if (!o) return null;
          const written = isLessonWritten(item.id);
          const status = statusOf(item.id);
          const label = (
            <>
              <span className="tabular w-9 shrink-0 text-graphite">{o.number}</span>
              <span className="min-w-0 flex-1">
                {o.title}
                {item.skim ? <span className="ml-2 text-small text-graphite">skim</span> : null}
              </span>
              <span className="tabular shrink-0 text-small text-graphite">{item.minutes} min</span>
            </>
          );
          return (
            <li key={`l-${item.id}`} className="flex items-start gap-2 border-b border-rule py-2 last:border-b-0">
              <StatusIcon status={status} written={written} className="mt-0.5" />
              <span className="sr-only">{written ? statusLabel[status] : 'Not written yet'}: </span>
              {written ? (
                <Link to={lessonPath(item.id)} className={cn('flex min-w-0 flex-1 gap-2 text-ui text-ink hover:underline')}>
                  {label}
                </Link>
              ) : (
                <span className="flex min-w-0 flex-1 gap-2 text-ui text-graphite">{label}</span>
              )}
            </li>
          );
        }
        if (item.kind === 'problem') {
          const p = getProblem(item.id);
          const label = (
            <>
              <span className="min-w-0 flex-1">
                Problem: {p?.title ?? item.id}
                <span className="ml-2 text-small text-graphite">Tier {p?.tier}</span>
              </span>
              <span className="tabular shrink-0 text-small text-graphite">{item.minutes} min</span>
            </>
          );
          return (
            <li key={`p-${item.id}`} className="flex items-start gap-2 border-b border-rule py-2 last:border-b-0">
              <PencilRuler className="mt-0.5 h-4 w-4 shrink-0 text-graphite" strokeWidth={1.5} aria-hidden />
              {isProblemWritten(item.id) ? (
                <Link to={`/problems/${item.id}`} className="flex min-w-0 flex-1 gap-2 text-ui text-ink hover:underline">
                  {label}
                </Link>
              ) : (
                <span className="flex min-w-0 flex-1 gap-2 text-ui text-graphite">{label}</span>
              )}
            </li>
          );
        }
        return (
          <li key={`m-${item.number}-${i}`} className="flex items-start gap-2 border-b border-rule py-2 last:border-b-0">
            <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0 text-graphite" strokeWidth={1.5} aria-hidden />
            <Link to="/problems" className="flex min-w-0 flex-1 gap-2 text-ui text-ink hover:underline">
              <span className="min-w-0 flex-1">Timed mock interview {item.number}</span>
              <span className="tabular shrink-0 text-small text-graphite">{item.minutes} min</span>
            </Link>
          </li>
        );
      })}
      {limit && items.length > limit ? (
        <li className="flex items-center gap-2 pt-2 text-ui text-graphite">
          <Circle className="h-4 w-4 shrink-0 opacity-0" strokeWidth={1.5} aria-hidden />
          and {items.length - limit} more
        </li>
      ) : null}
    </ul>
  );
}

/** Lessons done out of lessons planned for a week. */
export function useWeekProgress(items: PlanItem[]): { done: number; total: number } {
  const statusOf = useAllStatuses();
  const lessons = items.filter((i) => i.kind === 'lesson');
  return {
    done: lessons.filter((i) => ['done', 'mastered'].includes(statusOf((i as { id: string }).id))).length,
    total: lessons.length,
  };
}

export function WeekMeta({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ui text-graphite">
      <Clock className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      {hoursLabel(minutes)}
    </span>
  );
}
