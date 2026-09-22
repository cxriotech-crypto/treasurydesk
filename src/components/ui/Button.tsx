'use client';

import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
  'disabled:cursor-not-allowed disabled:opacity-50 select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-st-danger-fg text-white hover:opacity-90 dark:text-bg',
};

// Touch targets are ≥ 40 px on small screens.
const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-[13px] md:h-8',
  md: 'h-10 px-4 text-sm',
};

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  extra?: string
) {
  return cn(base, variants[variant], sizes[size], extra);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  /** Shown as a tooltip when the button is disabled (why it cannot be used). */
  disabledReason?: string | null;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    loading,
    disabled,
    disabledReason,
    className,
    children,
    type = 'button',
    title,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading || !!disabledReason;
  const btn = (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      title={disabledReason ?? title}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? (
        <Icon icon={Loader2} className="animate-spin" />
      ) : icon ? (
        <Icon icon={icon} />
      ) : null}
      {children}
      {iconRight && !loading ? <Icon icon={iconRight} /> : null}
    </button>
  );
  // Disabled buttons swallow hover events; wrap so the reason tooltip still shows.
  return disabledReason ? (
    <span className="inline-flex" title={disabledReason}>
      {btn}
    </span>
  ) : (
    btn
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: 'ghost' | 'secondary';
  badge?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', badge, className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        variant === 'secondary' && 'border border-border-strong bg-surface',
        className
      )}
      {...rest}
    >
      <Icon icon={icon} />
      {badge ? (
        <span className="num absolute right-1 top-1 min-w-[18px] rounded-full bg-st-danger-fg px-1 text-center text-[11px] font-semibold leading-[18px] text-white dark:text-bg">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
});

export function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon ? <Icon icon={icon} /> : null}
      {children}
    </Link>
  );
}
