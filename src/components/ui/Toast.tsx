'use client';

import { Toaster as SonnerToaster, toast as sonner } from 'sonner';

/** App toasts (no alert()). Styled to the design tokens; bottom-right on desktop, bottom on phones. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            '!rounded-lg !border !border-border !bg-surface !text-fg !shadow-pop !font-sans !text-sm',
          description: '!text-muted !text-[13px]',
          success: '[&_[data-icon]]:!text-st-success-fg',
          error: '[&_[data-icon]]:!text-st-danger-fg',
          warning: '[&_[data-icon]]:!text-st-warning-fg',
          closeButton: '!bg-surface !border-border !text-muted',
        },
      }}
    />
  );
}

export const toast = {
  success: (title: string, description?: string) => sonner.success(title, { description }),
  error: (title: string, description?: string) => sonner.error(title, { description }),
  info: (title: string, description?: string) => sonner.message(title, { description }),
  warning: (title: string, description?: string) => sonner.warning(title, { description }),
};

/** Toast an error thrown by a service (AppError messages are written for users). */
export function toastError(e: unknown, fallback = 'Something went wrong') {
  const msg = e instanceof Error ? e.message : fallback;
  sonner.error(msg);
}
