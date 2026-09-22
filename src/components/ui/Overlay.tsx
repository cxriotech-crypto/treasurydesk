'use client';

import { useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEscape, useFocusTrap, useLockBody } from '../hooks';
import { IconButton } from './Button';
import { cn } from './cn';

const noopSubscribe = () => () => undefined;

/** Renders into <body>. Synchronous on the client (so focus traps find their content), nothing on the server. */
function Portal({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  return isClient ? createPortal(children, document.body) : null;
}

/**
 * The dimmed backdrop. It sits below the toast layer (z-40) and the panel (z-50), so a toast
 * stays readable while a dialog is open without ever covering the dialog's buttons.
 */
function Scrim({ onClose }: { onClose?: () => void }) {
  return <div className="fixed inset-0 z-30 bg-overlay/50" onClick={onClose} aria-hidden />;
}

interface PanelProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Prevent closing by overlay click / Esc (e.g. while saving). */
  dismissible?: boolean;
  /** Accessible name when `title` is not plain text. */
  ariaLabel?: string;
}

/**
 * Modal dialog. Centred on tablet and desktop; a full-height sheet on phones.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  size = 'md',
  ariaLabel,
}: PanelProps & { size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  useLockBody(open);
  useEscape(open && dismissible, onClose);
  if (!open) return null;
  return (
    <Portal>
      <Scrim onClose={dismissible ? onClose : undefined} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-stretch justify-center md:items-center md:p-6">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : ariaLabel}
          tabIndex={-1}
          className={cn(
            'pointer-events-auto relative flex w-full flex-col bg-surface shadow-pop focus:outline-none',
            'h-full md:h-auto md:max-h-[calc(100vh-3rem)] md:rounded-lg md:border md:border-border',
            size === 'sm' ? 'md:max-w-md' : size === 'lg' ? 'md:max-w-3xl' : 'md:max-w-xl'
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 md:px-5">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
            </div>
            {dismissible ? (
              <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1" />
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end md:px-5">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

/** Side drawer (right by default); on phones it takes the full width. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  dismissible = true,
  width = 'md:max-w-lg',
  ariaLabel,
}: PanelProps & { side?: 'left' | 'right'; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  useLockBody(open);
  useEscape(open && dismissible, onClose);
  if (!open) return null;
  return (
    <Portal>
      <Scrim onClose={dismissible ? onClose : undefined} />
      <div className="pointer-events-none fixed inset-0 z-50">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : ariaLabel}
          tabIndex={-1}
          className={cn(
            'pointer-events-auto absolute inset-y-0 flex w-full flex-col bg-surface shadow-pop focus:outline-none',
            width,
            side === 'right'
              ? 'right-0 md:border-l md:border-border'
              : 'left-0 md:border-r md:border-border'
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
            </div>
            {dismissible ? (
              <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1" />
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

/** Bottom sheet for phones (e.g. filters, the controls checklist). */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  ariaLabel,
}: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  useLockBody(open);
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <Scrim onClose={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : ariaLabel}
          tabIndex={-1}
          className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-lg border-t border-border bg-surface shadow-pop focus:outline-none"
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-4 py-2">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
            </div>
            <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-border p-4">{footer}</div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}

export { Portal };
