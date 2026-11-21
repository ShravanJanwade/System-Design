import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** A readout: label above, large tabular value, optional context line. */
export function Stat({ label, value, note, tone = 'ink' }: { label: string; value: string; note?: string; tone?: 'ink' | 'alert' | 'success' }) {
  return (
    <div className="flex flex-col gap-0.5 border-l border-rule pl-3">
      <span className="text-small text-graphite">{label}</span>
      <span
        className={cn(
          'tabular font-display text-[26px] leading-8 font-semibold',
          tone === 'alert' ? 'text-alert' : tone === 'success' ? 'text-success' : 'text-ink',
        )}
      >
        {value}
      </span>
      {note ? <span className="text-small text-graphite">{note}</span> : null}
    </div>
  );
}

/** Groups simulator controls on a paper surface. */
export function ControlPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-5 rounded-card border border-rule bg-paper p-4 sm:grid-cols-2 sm:p-5', className)}>{children}</div>;
}

export function SimHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="measure flex flex-col gap-1">
      <h3 className="font-display text-h2-sm font-semibold text-ink">{title}</h3>
      <p className="text-ui-lg text-graphite">{intro}</p>
    </div>
  );
}
