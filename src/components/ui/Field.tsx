'use client';

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export const controlClass = (invalid?: boolean, extra?: string) =>
  cn(
    'block w-full min-w-0 rounded-md border bg-surface px-3 text-sm text-fg placeholder:text-subtle',
    'h-10 md:h-9 focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring',
    'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted read-only:bg-surface-2',
    invalid ? 'border-st-danger-fg' : 'border-border-strong',
    extra
  );

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Optional element on the right of the label (e.g. an fx marker or action link). */
  aside?: ReactNode;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Label + control + hint + inline error, wired together for screen readers. */
export function Field({ label, hint, error, required, className, aside, children }: FieldProps) {
  const auto = useId();
  const id = (isValidElement(children) && children.props.id) || auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-muted">
          {label}
          {required ? <span className="ml-0.5 text-st-danger-fg">*</span> : null}
        </label>
        {aside}
      </div>
      {control}
      {hint && !error ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="mt-1 text-xs font-medium text-st-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  invalid?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, prefix, suffix, className, ...rest },
  ref
) {
  const inv = invalid || rest['aria-invalid'] === true;
  if (!prefix && !suffix)
    return <input ref={ref} className={controlClass(inv, className)} {...rest} />;
  return (
    <div className="relative">
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
          {prefix}
        </span>
      ) : null}
      <input
        ref={ref}
        className={controlClass(inv, cn(prefix ? 'pl-8' : '', suffix ? 'pr-10' : '', className))}
        {...rest}
      />
      {suffix ? (
        <span className="absolute inset-y-0 right-2 flex items-center text-sm text-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={controlClass(
        invalid || rest['aria-invalid'] === true,
        cn('h-auto py-2 md:h-auto', className)
      )}
      {...rest}
    />
  );
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const Select = forwardRef<
  HTMLSelectElement,
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
    options: SelectOption[];
    placeholder?: string;
    invalid?: boolean;
  }
>(function Select({ options, placeholder, invalid, className, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={controlClass(
          invalid || rest['aria-invalid'] === true,
          cn('appearance-none pr-9', className)
        )}
        {...rest}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        icon={ChevronDown}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
});

export const DateInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  function DateInput(props, ref) {
    return <Input ref={ref} type="date" {...props} />;
  }
);

export const TimeInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  function TimeInput(props, ref) {
    return <Input ref={ref} type="time" {...props} />;
  }
);
