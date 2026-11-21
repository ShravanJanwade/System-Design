import type { ReactNode } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Centered dialog with one soft shadow (a floating layer). */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
        <RDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2',
            'rounded-card border border-rule bg-paper p-6 shadow-float focus-visible:outline-none',
            className,
          )}
        >
          <RDialog.Title className="font-display text-h2-sm font-semibold text-ink">{title}</RDialog.Title>
          {description ? <RDialog.Description className="mt-2 text-ui-lg text-graphite">{description}</RDialog.Description> : null}
          <div className="mt-5">{children}</div>
          <RDialog.Close
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-control text-graphite hover:bg-wash"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </RDialog.Close>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Side sheet used for the lesson rails on small screens. */
export function Drawer({
  open,
  onOpenChange,
  title,
  side = 'left',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  side?: 'left' | 'right';
  children: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)]" />
        <RDialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed top-0 bottom-0 z-50 flex w-[min(22rem,calc(100vw-48px))] flex-col bg-paper shadow-float focus-visible:outline-none',
            side === 'left' ? 'left-0 border-r border-rule' : 'right-0 border-l border-rule',
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-rule px-4">
            <RDialog.Title className="text-ui-lg font-semibold text-ink">{title}</RDialog.Title>
            <RDialog.Close
              className="flex h-9 w-9 items-center justify-center rounded-control text-graphite hover:bg-wash"
              aria-label="Close"
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </RDialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
