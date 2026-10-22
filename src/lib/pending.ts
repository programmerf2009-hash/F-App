/* ==========================================================================
   Navbadge uchun kichik global store — do'stlik so'rovlari soni.
   ========================================================================== */

import { useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return count;
}

export function setPendingCount(next: number): void {
  const value = Math.max(0, Math.trunc(next));
  if (value === count) return;
  count = value;
  for (const listener of listeners) listener();
}

export function usePendingCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
