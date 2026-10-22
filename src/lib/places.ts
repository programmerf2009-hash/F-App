/* ==========================================================================
   O'zbekiston joylari (shaharlar + tumanlar)
   --------------------------------------------------------------------------
   Ma'lumot `scripts/build-places.py` bilan GADM 4.1 chegaralaridan yasaladi.
   Toshkent shahrining 11 ta tumani GADM'da alohida yo'q — skriptda qo'lda
   qo'shilgan.
   ========================================================================== */

import { UZBEKISTAN_PLACES, type Place } from "../data/uzbekistan-places";

export type { Place };

export const CITIES: Place[] = UZBEKISTAN_PLACES.cities;
export const DISTRICTS: Place[] = UZBEKISTAN_PLACES.districts;

/** Viloyatlar alifbo tartibida, Toshkent shahri birinchi. */
export const REGIONS: string[] = Array.from(new Set(DISTRICTS.map((item) => item.region))).sort(
  (a, b) => {
    if (a === "Toshkent shahri") return -1;
    if (b === "Toshkent shahri") return 1;
    return a.localeCompare(b);
  },
);

export const DEFAULT_PLACE: Place =
  CITIES.find((city) => city.name === "Toshkent") ?? CITIES[0];

export function placeLabel(place: Place): string {
  return place.name;
}

export function samePlace(a: Place | null, b: Place | null): boolean {
  if (!a || !b) return false;
  return a.name === b.name && a.region === b.region;
}
