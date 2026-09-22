'use client';

/**
 * Reactive data hooks. Screens call services through `useData`, which re-runs the fetcher whenever
 * the store changes (any write, in this tab or another) or the signed-in user changes — so approving
 * as one role visibly updates every other screen and dashboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getRevision, subscribe } from '@/data/store';
import type { AppUser } from '@/domain/types';
import { getSessionRevision, sessionUser, subscribeSession } from './core';

export function useStoreRevision(): number {
  return useSyncExternalStore(subscribe, getRevision, () => 0);
}

export function useSessionRevision(): number {
  return useSyncExternalStore(subscribeSession, getSessionRevision, () => 0);
}

export interface DataState<T> {
  data: T | undefined;
  error: Error | null;
  /** True until the first result (or error) arrives. */
  loading: boolean;
  /** True while re-fetching after a change (previous data stays on screen). */
  refreshing: boolean;
  reload: () => void;
}

export function useData<T>(fetcher: () => Promise<T>, deps: unknown[]): DataState<T> {
  const storeRev = useStoreRevision();
  const sessionRev = useSessionRevision();
  const [manual, setManual] = useState(0);
  const [state, setState] = useState<{
    data: T | undefined;
    error: Error | null;
    loading: boolean;
    refreshing: boolean;
  }>({
    data: undefined,
    error: null,
    loading: true,
    refreshing: false,
  });
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    const mine = ++seq.current;
    setState((s) => ({
      ...s,
      refreshing: s.data !== undefined,
      loading: s.data === undefined && !s.error ? true : s.loading,
    }));
    fetchRef.current().then(
      (data) => {
        if (mine === seq.current)
          setState({ data, error: null, loading: false, refreshing: false });
      },
      (error: unknown) => {
        if (mine === seq.current) {
          setState((s) => ({
            ...s,
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
            refreshing: false,
          }));
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeRev, sessionRev, manual, ...deps]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, error: null, loading: s.data === undefined }));
    setManual((n) => n + 1);
  }, []);

  return { ...state, reload };
}

/** The signed-in user (re-renders on sign-in, role switch, sign-out and user edits). Null during SSR. */
export function useCurrentUser(): AppUser | null {
  const key = useSyncExternalStore(
    (cb) => {
      const a = subscribe(cb);
      const b = subscribeSession(cb);
      return () => {
        a();
        b();
      };
    },
    () => `${getSessionRevision()}:${getRevision()}`,
    () => ''
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (key ? sessionUser() : null), [key]);
}
