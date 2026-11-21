import { useState, type ReactNode } from 'react';
import { Collapsible } from 'radix-ui';
import { ChevronRight } from 'lucide-react';

/** "Describe this diagram": the diagram's content as text, for screen readers and anyone who prefers lists. */
export function DescribeToggle({ children, label = 'Describe this diagram' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="group inline-flex items-center gap-1 rounded-control text-ui font-semibold text-blueprint hover:underline">
        <ChevronRight className="h-4 w-4 transition-transform ease-ui group-data-[state=open]:rotate-90" strokeWidth={1.5} aria-hidden />
        {label}
      </Collapsible.Trigger>
      <Collapsible.Content className="measure pt-2 pl-5 text-ui text-graphite">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
