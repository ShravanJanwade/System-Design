import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Page title and one-line purpose. Left-aligned, no hero. */
export function PageHeader({ title, intro, children, className }: { title: string; intro?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn('measure flex flex-col gap-2', className)}>
      <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">{title}</h1>
      {intro ? <p className="text-ui-lg text-graphite">{intro}</p> : null}
      {children}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-10 px-4 pt-8 pb-16 sm:px-8 lg:px-12 lg:pt-12', className)}>{children}</div>;
}
