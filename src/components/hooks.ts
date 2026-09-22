'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';

/** True when the media query matches (false during SSR). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches),
    () => false
  );
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');

export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return { open, onOpen, onClose, toggle, setOpen };
}

export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useEscape(active: boolean, onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        ref.current();
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [active]);
}

export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  active: boolean,
  onOutside: () => void
) {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!active) return;
    const h = (e: PointerEvent) => {
      const t = e.target as Node;
      if (refs.every((r) => !r.current || !r.current.contains(t))) cb.current();
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keeps keyboard focus inside `ref` while active and restores it afterwards. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const first =
      root.querySelector<HTMLElement>('[data-autofocus]') ??
      root.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root).focus();
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    root.addEventListener('keydown', h);
    return () => {
      root.removeEventListener('keydown', h);
      previous?.focus?.();
    };
  }, [ref, active]);
}

/** Prevents the page behind a modal from scrolling. */
export function useLockBody(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/** Re-render every `ms` (live countdowns). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
