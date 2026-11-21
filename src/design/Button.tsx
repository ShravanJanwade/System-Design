import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Tooltip } from 'radix-ui';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap select-none ' +
  'transition-colors ease-ui disabled:opacity-50 aria-disabled:opacity-60';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-blueprint text-on-blueprint hover:bg-[color-mix(in_srgb,var(--blueprint)_88%,var(--ink))]',
  secondary: 'border border-rule bg-paper text-ink hover:bg-wash hover:border-[color-mix(in_srgb,var(--rule)_60%,var(--graphite))]',
  ghost: 'text-ink hover:bg-wash',
  danger: 'border border-alert text-alert bg-paper hover:bg-alert-wash',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-ui',
  md: 'h-10 px-4 text-ui',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string): string {
  return cn(base, variants[variant], sizes[size], extra);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />;
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  tone?: 'paper' | 'panel';
  size?: 'sm' | 'md';
  /** Show the label as a tooltip. On by default. */
  tip?: boolean;
  tipSide?: 'top' | 'bottom' | 'left' | 'right';
};

/** Square ghost button with an accessible label and a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, tone = 'paper', size = 'md', tip = true, tipSide = 'top', className, type = 'button', ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control transition-colors ease-ui disabled:opacity-40',
        size === 'md' ? 'h-9 w-9' : 'h-8 w-8',
        tone === 'paper' ? 'text-graphite hover:bg-wash hover:text-ink' : 'text-panel-text hover:bg-panel-raised',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
  if (!tip) return button;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={tipSide}
          sideOffset={6}
          className="z-50 rounded-control bg-ink px-2 py-1 text-small text-canvas shadow-float"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});
