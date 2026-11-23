"use client";

/**
 * Minimal external store for a boolean flag kept in sessionStorage.
 *
 * Reading browser-only storage from a state initializer would break SSR, and
 * setting state synchronously inside an effect causes cascading renders, so the
 * flag is exposed through `useSyncExternalStore` instead: it is SSR-safe via the
 * server snapshot and re-renders only when the flag actually changes.
 */

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeSessionFlag(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function readSessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeSessionFlag(key: string, value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(key, "1");
    else window.sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable (private mode or disabled cookies) */
  }
  notify();
}
