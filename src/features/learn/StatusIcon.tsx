import { CheckCheck, Circle, CircleCheck, CircleDashed, CircleDot } from 'lucide-react';
import type { LessonStatus } from '@/state/progress';
import { statusLabel } from '@/state/progress';
import { cn } from '@/lib/cn';

/** Lesson status as an icon with an accessible label. Shape, not just color, carries the meaning. */
export function StatusIcon({ status, written = true, className }: { status: LessonStatus; written?: boolean; className?: string }) {
  const cls = cn('h-4 w-4 shrink-0', className);
  if (!written) return <CircleDashed className={cn(cls, 'text-graphite')} strokeWidth={1.5} aria-label="Not written yet" />;
  switch (status) {
    case 'not-started':
      return <Circle className={cn(cls, 'text-graphite')} strokeWidth={1.5} aria-label={statusLabel[status]} />;
    case 'in-progress':
      return <CircleDot className={cn(cls, 'text-blueprint')} strokeWidth={1.5} aria-label={statusLabel[status]} />;
    case 'done':
      return <CircleCheck className={cn(cls, 'text-success')} strokeWidth={1.5} aria-label={statusLabel[status]} />;
    case 'mastered':
      return <CheckCheck className={cn(cls, 'text-success')} strokeWidth={1.5} aria-label={statusLabel[status]} />;
  }
}
