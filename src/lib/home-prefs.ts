/* ==========================================================================
   Home ekrani sozlamalari (qurilmada saqlanadi)
   ========================================================================== */

import type { Place } from "./places";

export interface HomePrefs {
  /** Valyuta kartalari (3 ta). */
  slots: string[];
  /** Qiymatlar qaysi valyutada ko'rsatiladi. */
  base: string;
  /** Ob-havo uchun tanlangan joy. `null` — hali tanlanmagan. */
  place: Place | null;
}

const KEY = "fapp:home:v1";

export const DEFAULT_PREFS: HomePrefs = {
  slots: ["USD", "EUR", "RUB"],
  base: "UZS",
  place: null,
};

function isCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3,4}$/.test(value);
}

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<Place>;
  return (
    typeof place.name === "string" &&
    typeof place.region === "string" &&
    typeof place.lat === "number" &&
    typeof place.lon === "number"
  );
}

export function loadHomePrefs(): HomePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;

    const parsed = JSON.parse(raw) as Partial<HomePrefs>;
    const slots = Array.isArray(parsed.slots) ? parsed.slots.filter(isCode).slice(0, 3) : [];

    return {
      slots: slots.length === 3 ? slots : DEFAULT_PREFS.slots,
      base: isCode(parsed.base) ? parsed.base : DEFAULT_PREFS.base,
      place: isPlace(parsed.place) ? parsed.place : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveHomePrefs(prefs: HomePrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode — jim o'tamiz */
  }
}
