/* ==========================================================================
   Valyuta kurslari — O'zbekiston Markaziy banki (cbu.uz)
   --------------------------------------------------------------------------
   CBU har kuni kunlik kurslarni e'lon qiladi. JSON'da har bir valyuta uchun
   `Rate` — nominal (masalan 10 000 JPY yoki 1 USD) uchun so'mdagi qiymat.
   Shu sababli har bir valyuta uchun "1 birlik = necha so'm" ko'rinishiga
   keltiramiz: rate = Rate / Nominal.

   Bu fayl faqat ma'lumot bilan ishlaydi — UI'ga bog'liq emas.
   ========================================================================== */

export interface Currency {
  code: string;
  name: string;
  nameUz: string;
  /** 1 birlik uchun so'mdagi kurs. */
  rate: number;
  /** Oldingi kunga nisbatan o'zgarish (so'mda, 1 birlik uchun). */
  diff: number;
  /** CBU e'lon qilgan sana. */
  date: string;
}

export interface RatesSnapshot {
  fetchedAt: number;
  date: string;
  currencies: Currency[];
}

const ENDPOINT = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/";
const CACHE_KEY = "fapp:rates:v1";

/** CBU kuniga bir marta yangilanadi — 30 daqiqa yetarli. */
const CACHE_TTL = 30 * 60 * 1000;

/** Ro'yxatda doim birinchi turadigan baza valyuta. */
export const UZS: Currency = {
  code: "UZS",
  name: "Uzbek som",
  nameUz: "O'zbek so'mi",
  rate: 1,
  diff: 0,
  date: "",
};

interface RawRate {
  Ccy?: string;
  CcyNm_EN?: string;
  CcyNm_UZ?: string;
  Nominal?: string | number;
  Rate?: string | number;
  Date?: string;
  /** CBU `Diff` deb ataydi; ba'zi nusxalarda `diff`. */
  Diff?: string | number;
  diff?: string | number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(raw: RawRate, date: string): Currency | null {
  const code = (raw.Ccy ?? "").trim().toUpperCase();
  const nominal = toNumber(raw.Nominal) || 1;
  const rate = toNumber(raw.Rate);

  if (!code || rate <= 0) return null;

  return {
    code,
    name: (raw.CcyNm_EN ?? code).trim(),
    nameUz: (raw.CcyNm_UZ ?? raw.CcyNm_EN ?? code).trim(),
    rate: rate / nominal,
    diff: toNumber(raw.Diff ?? raw.diff) / nominal,
    date: raw.Date ?? date,
  };
}

/* --------------------------------------------------------------------------
   Kesh
   -------------------------------------------------------------------------- */

function readCache(): RatesSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as RatesSnapshot;
    if (!Array.isArray(parsed?.currencies) || parsed.currencies.length === 0) return null;
    if (typeof parsed.fetchedAt !== "number") return null;

    return parsed;
  } catch {
    return null;
  }
}

function writeCache(snapshot: RatesSnapshot): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* private mode — jim o'tamiz */
  }
}

export function isFresh(snapshot: RatesSnapshot): boolean {
  return Date.now() - snapshot.fetchedAt < CACHE_TTL;
}

/* --------------------------------------------------------------------------
   Yuklash
   -------------------------------------------------------------------------- */

export async function fetchRates(): Promise<RatesSnapshot> {
  const response = await fetch(ENDPOINT, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`CBU ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("CBU: empty response");
  }

  const rows = payload as RawRate[];
  const date = rows.find((row) => Boolean(row.Date))?.Date ?? "";

  const seen = new Set<string>();
  const currencies: Currency[] = [UZS];

  for (const row of rows) {
    const currency = normalize(row, date);
    if (!currency || currency.code === "UZS" || seen.has(currency.code)) continue;
    seen.add(currency.code);
    currencies.push(currency);
  }

  const snapshot: RatesSnapshot = {
    fetchedAt: Date.now(),
    date,
    currencies,
  };

  writeCache(snapshot);
  return snapshot;
}

export function readRatesCache(): RatesSnapshot | null {
  return readCache();
}

/* --------------------------------------------------------------------------
   Hisoblash va formatlash
   -------------------------------------------------------------------------- */

/** 1 birlik `from` valyutasi necha birlik `to` valyutasiga teng. */
export function crossRate(from: Currency, to: Currency): number {
  if (!to.rate) return 0;
  return from.rate / to.rate;
}

/** Kunlik o'zgarish, foizda (baza valyutaga nisbatan). */
export function changePercent(from: Currency, to: Currency): number | null {
  const previousFrom = from.rate - from.diff;
  const previousTo = to.rate - to.diff;

  if (previousFrom <= 0 || previousTo <= 0) return null;

  const previous = previousFrom / previousTo;
  if (previous === 0) return null;

  return ((from.rate / to.rate - previous) / previous) * 100;
}

/** Kurs uchun qulay format: 11 950 / 160.50 / 1.08 / 0.0105. */
export function formatRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";

  if (value >= 1000) {
    return Math.round(value)
      .toLocaleString("ru-RU")
      .replace(/\u00A0/g, " ");
  }

  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  return value.toFixed(6);
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toFixed(2)}%`;
}

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  RUB: "₽",
  GBP: "£",
  CNY: "¥",
  JPY: "¥",
  KRW: "₩",
  KZT: "₸",
  TRY: "₺",
  INR: "₹",
  CAD: "C$",
  AUD: "A$",
  CHF: "Fr",
  AED: "Dh",
  UZS: "S",
};

/** Kartadagi kichik nishon uchun valyuta belgisi. */
export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code.slice(0, 1);
}

export function findCurrency(currencies: Currency[], code: string): Currency | undefined {
  return currencies.find((currency) => currency.code === code);
}
