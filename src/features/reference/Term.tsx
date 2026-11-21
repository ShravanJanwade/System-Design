import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Link } from 'react-router';
import { glossaryById } from '@/content/glossary';

/**
 * A glossary term in running text: dotted underline; hover, focus or tap shows a
 * plain-English definition with a link to the glossary.
 */
export function Term({ id, children }: { id: string; children: ReactNode }) {
  const entry = glossaryById.get(id);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const clear = () => window.clearTimeout(timer.current);
  const later = (next: boolean, ms: number) => {
    clear();
    timer.current = window.setTimeout(() => setOpen(next), ms);
  };
  useEffect(() => clear, []);

  if (!entry) return <>{children}</>;

  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      clear();
      setOpen((o) => !o);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        clear();
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="term"
          aria-label={`${typeof children === 'string' ? children : entry.term}: glossary term`}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') later(true, 220);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') later(false, 160);
          }}
          onClick={(e) => {
            // A mouse user who opened it by hovering keeps it open when they click.
            if (open && e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'mouse') e.preventDefault();
          }}
          onKeyDown={onKeyDown}
        >
          {children}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={clear}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') later(false, 160);
          }}
          className="z-50 w-[min(320px,calc(100vw-24px))] rounded-card border border-rule bg-paper p-4 text-ui text-ink shadow-float"
        >
          <p className="font-semibold">{entry.term}</p>
          <p className="mt-1 text-graphite">{entry.definition}</p>
          <Link
            to={`/reference/glossary#${entry.id}`}
            className="mt-2 inline-block font-semibold text-blueprint hover:underline"
            onClick={() => setOpen(false)}
          >
            Open in glossary
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
