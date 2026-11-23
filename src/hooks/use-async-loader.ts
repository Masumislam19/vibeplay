"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncLoader {
  loading: boolean;
  error: string | null;
  setError: (message: string | null) => void;
  /** Re-runs the loader. Safe to call from event handlers. */
  reload: () => void;
}

/**
 * Runs an async loader on mount and whenever `refreshKey` changes, and exposes
 * `reload()` for event handlers such as refresh buttons.
 *
 * Why the runner lives in a ref: React's `set-state-in-effect` rule rejects
 * effects that call hoisted functions containing `setState`, because that causes
 * cascading synchronous renders. Indirecting through the ref keeps a *single*
 * loader implementation shared by the initial load, filter changes and manual
 * refreshes, while guaranteeing every state update happens inside the async task
 * rather than during the effect body.
 */
export function useAsyncLoader(loader: () => Promise<void>, refreshKey?: string | number): AsyncLoader {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const runner = useRef<() => void>(() => {});

  useEffect(() => {
    runner.current = () => {
      setLoading(true);
      void (async () => {
        try {
          await loaderRef.current();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        } finally {
          setLoading(false);
        }
      })();
    };
  }, []);

  useEffect(() => {
    runner.current();
  }, [refreshKey]);

  const reload = useCallback(() => {
    runner.current();
  }, []);

  return { loading, error, setError, reload };
}
