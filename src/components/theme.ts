'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_KEY = 'treasurydesk.theme.v1';

/** Runs before hydration (inlined in <head>) so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref) {
  const dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => 'system' as ThemePref
  );

  useEffect(() => {
    apply(pref);
    if (pref !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => apply('system');
    mql.addEventListener('change', h);
    return () => mql.removeEventListener('change', h);
  }, [pref]);

  const set = useCallback((p: ThemePref) => {
    try {
      window.localStorage.setItem(THEME_KEY, p);
    } catch {
      /* private mode: applies for this page only */
    }
    apply(p);
    listeners.forEach((l) => l());
  }, []);

  return [pref, set];
}
