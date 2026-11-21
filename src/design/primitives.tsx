import { useState, type ReactNode } from 'react';
import { Collapsible, Slider as RSlider, Switch, Tabs as RTabs, ToggleGroup } from 'radix-ui';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------ */
/* Keyboard hint                                                       */
/* ------------------------------------------------------------------ */

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-rule bg-paper px-1.5',
        'font-sans text-[12px] leading-none font-semibold text-graphite',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

export type ChipTone = 'neutral' | 'blueprint' | 'success' | 'alert' | 'signal';

const chipTones: Record<ChipTone, string> = {
  neutral: 'bg-wash text-graphite',
  blueprint: 'bg-blueprint-wash text-blueprint',
  success: 'bg-success-wash text-success',
  alert: 'bg-alert-wash text-alert',
  signal: 'bg-signal text-on-signal',
};

export function Chip({ tone = 'neutral', children, className }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-small font-semibold', chipTones[tone], className)}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Callout                                                             */
/* ------------------------------------------------------------------ */

export type CalloutKind = 'intuition' | 'interview' | 'mistake' | 'simplification' | 'deeper';

const calloutRule: Record<CalloutKind, string> = {
  intuition: 'border-blueprint',
  interview: 'border-success',
  mistake: 'border-alert',
  simplification: 'border-graphite',
  deeper: 'border-graphite',
};

export const calloutLabel: Record<CalloutKind, string> = {
  intuition: 'Intuition.',
  interview: 'In the interview.',
  mistake: 'Common mistake.',
  simplification: 'Simplification.',
  deeper: 'Go deeper.',
};

const calloutLabelColor: Record<CalloutKind, string> = {
  intuition: 'text-blueprint',
  interview: 'text-success',
  mistake: 'text-alert',
  simplification: 'text-graphite',
  deeper: 'text-graphite',
};

/**
 * A 3 px left rule in the tone's color. The type is the bold first word of the text,
 * passed in `lead` so it flows inline with the first paragraph.
 */
export function Callout({ kind, children, className }: { kind: CalloutKind; children: ReactNode; className?: string }) {
  return (
    <aside className={cn('border-l-[3px] pl-5', calloutRule[kind], className)} aria-label={calloutLabel[kind].replace('.', '')}>
      {children}
    </aside>
  );
}

export function CalloutLead({ kind, text }: { kind: CalloutKind; text?: string }) {
  return <strong className={cn('font-bold', calloutLabelColor[kind])}>{text ?? calloutLabel[kind]} </strong>;
}

export function CollapsibleCallout({
  title = 'Go deeper',
  summary,
  children,
  defaultOpen = false,
}: {
  title?: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="border-l-[3px] border-graphite pl-5">
      <Collapsible.Trigger className="group flex w-full items-start gap-2 text-left">
        <ChevronRight
          className="mt-[5px] h-[18px] w-[18px] shrink-0 text-graphite transition-transform ease-ui group-data-[state=open]:rotate-90"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="text-body">
          <strong className="font-bold text-graphite">{title}.</strong>{' '}
          {summary ? <span className="text-graphite">{summary}</span> : null}
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content className="pt-4">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export function Tabs({
  value,
  onValueChange,
  items,
  className,
  label,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: { value: string; label: string; content: ReactNode }[];
  className?: string;
  label: string;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RTabs.List aria-label={label} className="flex gap-1 border-b border-rule">
        {items.map((it) => (
          <RTabs.Trigger
            key={it.value}
            value={it.value}
            className={cn(
              '-mb-px border-b-2 border-transparent px-3 pt-2 pb-2.5 text-ui font-semibold text-graphite transition-colors ease-ui',
              'hover:text-ink data-[state=active]:border-blueprint data-[state=active]:text-ink',
            )}
          >
            {it.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((it) => (
        <RTabs.Content key={it.value} value={it.value} className="rounded-card pt-5">
          {it.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                   */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn('inline-flex rounded-control border border-rule bg-wash p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'rounded-[4px] font-semibold text-graphite transition-colors ease-ui hover:text-ink',
            'data-[state=on]:bg-paper data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--control-border)]',
            size === 'md' ? 'h-8 px-3 text-ui' : 'h-7 px-2.5 text-small',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Slider                                                              */
/* ------------------------------------------------------------------ */

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  id,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  id?: string;
  hint?: string;
}) {
  const shown = format ? format(value) : String(value);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ui font-semibold text-ink">
          {label}
        </label>
        <span className="tabular text-ui text-graphite">{shown}</span>
      </div>
      <RSlider.Root
        id={id}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
        min={min}
        max={max}
        step={step}
        className="relative flex h-5 w-full touch-none items-center select-none"
      >
        <RSlider.Track className="relative h-1 grow rounded-full bg-wash-strong">
          <RSlider.Range className="absolute h-full rounded-full bg-blueprint" />
        </RSlider.Track>
        <RSlider.Thumb
          aria-label={label}
          aria-valuetext={shown}
          className="block h-[18px] w-[18px] rounded-full border-2 border-blueprint bg-paper transition-transform ease-ui hover:scale-110"
        />
      </RSlider.Root>
      {hint ? <p className="text-small text-graphite">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle (switch)                                                     */
/* ------------------------------------------------------------------ */

export function Toggle({
  label,
  checked,
  onChange,
  description,
  id,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-ui font-semibold text-ink">
          {label}
        </label>
        {description ? <span className="text-small text-graphite">{description}</span> : null}
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors ease-ui',
          'border-control bg-wash-strong data-[state=checked]:border-blueprint data-[state=checked]:bg-blueprint',
        )}
      >
        <Switch.Thumb
          className={cn(
            'block h-[18px] w-[18px] translate-x-[2px] rounded-full bg-paper transition-transform ease-ui',
            'shadow-[0_0_0_1px_var(--control-border)] data-[state=checked]:translate-x-[18px]',
          )}
        />
      </Switch.Root>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress ring                                                       */
/* ------------------------------------------------------------------ */

export function ProgressRing({
  value,
  size = 40,
  stroke = 3,
  label,
  children,
}: {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--blueprint)"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          strokeLinecap={v > 0 ? 'round' : 'butt'}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 300ms var(--ease-out)' }}
        />
      </svg>
      {children ? <span className="absolute inset-0 flex items-center justify-center">{children}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Section heading with anchor                                         */
/* ------------------------------------------------------------------ */

export function SectionHeading({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn('font-display text-h2-sm font-semibold text-ink sm:text-h2', className)}>
      {children}
    </h2>
  );
}
