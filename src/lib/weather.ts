/* ==========================================================================
   Ob-havo — Open-Meteo (api.open-meteo.com)
   --------------------------------------------------------------------------
   Bepul, API kalitsiz va CORS ochiq. Vaqt mintaqasi — Asia/Tashkent, ya'ni
   butun O'zbekiston uchun bitta mintaqa ishlatiladi.
   ========================================================================== */

import { CITIES, DISTRICTS, type Place } from "./places";

export interface WeatherNow {
  /** Joriy harorat, °C. */
  temp: number;
  /** His qilinadigan harorat, °C. */
  feels: number;
  humidity: number;
  wind: number;
  code: number;
  isDay: boolean;
  high: number;
  low: number;
  /** Open-Meteo bergan mahalliy vaqt (ISO). */
  time: string;
  fetchedAt: number;
}

export type WeatherKind =
  | "clear"
  | "mostly-clear"
  | "partly"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "freezing"
  | "snow"
  | "showers"
  | "thunder";

export interface WeatherLook {
  kind: WeatherKind;
  label: string;
}

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "weather_code",
  "wind_speed_10m",
].join(",");

const DAILY_FIELDS = ["temperature_2m_max", "temperature_2m_min"].join(",");

interface ApiResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

/** WMO kodlari → ko'rinish. */
export function describeWeather(code: number): WeatherLook {
  if (code === 0) return { kind: "clear", label: "Clear sky" };
  if (code === 1) return { kind: "mostly-clear", label: "Mainly clear" };
  if (code === 2) return { kind: "partly", label: "Partly cloudy" };
  if (code === 3) return { kind: "overcast", label: "Overcast" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Fog" };
  if (code >= 51 && code <= 55) return { kind: "drizzle", label: "Drizzle" };
  if (code === 56 || code === 57) return { kind: "freezing", label: "Freezing drizzle" };
  if (code >= 61 && code <= 65) return { kind: "rain", label: "Rain" };
  if (code === 66 || code === 67) return { kind: "freezing", label: "Freezing rain" };
  if (code >= 71 && code <= 77) return { kind: "snow", label: "Snow" };
  if (code >= 80 && code <= 82) return { kind: "showers", label: "Rain showers" };
  if (code === 85 || code === 86) return { kind: "snow", label: "Snow showers" };
  if (code >= 95) return { kind: "thunder", label: "Thunderstorm" };
  return { kind: "partly", label: "Cloudy" };
}

/** Shahar/tuman markaziga eng yaqin joyni topadi. */
export function nearestPlace(lat: number, lon: number): Place {
  let best: Place = CITIES[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const place of [...CITIES, ...DISTRICTS]) {
    const distance = haversine(lat, lon, place.lat, place.lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = place;
    }
  }

  return best;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* --------------------------------------------------------------------------
   Geolokatsiya
   -------------------------------------------------------------------------- */

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 5 * 60 * 1000,
    });
  });
}

export function locationPermission(): Promise<PermissionState | null> {
  if (!navigator.permissions?.query) return Promise.resolve(null);

  return navigator.permissions
    .query({ name: "geolocation" })
    .then((status) => status.state)
    .catch(() => null);
}

/* --------------------------------------------------------------------------
   Yuklash (10 daqiqalik xotira kesh)
   -------------------------------------------------------------------------- */

const MEMORY_TTL = 10 * 60 * 1000;
const memory = new Map<string, WeatherNow>();

function cacheKey(place: Place): string {
  return `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
}

export async function fetchWeather(place: Place): Promise<WeatherNow> {
  const key = cacheKey(place);
  const cached = memory.get(key);
  if (cached && Date.now() - cached.fetchedAt < MEMORY_TTL) return cached;

  const params = new URLSearchParams({
    latitude: place.lat.toFixed(4),
    longitude: place.lon.toFixed(4),
    current: CURRENT_FIELDS,
    daily: DAILY_FIELDS,
    timezone: "Asia/Tashkent",
    forecast_days: "2",
    wind_speed_unit: "kmh",
  });

  const response = await fetch(`${ENDPOINT}?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);

  const payload = (await response.json()) as ApiResponse;
  const current = payload.current;
  if (!current || typeof current.temperature_2m !== "number") {
    throw new Error("Open-Meteo: empty response");
  }

  const weather: WeatherNow = {
    temp: Math.round(current.temperature_2m),
    feels: Math.round(current.apparent_temperature ?? current.temperature_2m),
    humidity: Math.round(current.relative_humidity_2m ?? 0),
    wind: Math.round(current.wind_speed_10m ?? 0),
    code: current.weather_code ?? 0,
    isDay: current.is_day !== 0,
    high: Math.round(payload.daily?.temperature_2m_max?.[0] ?? current.temperature_2m),
    low: Math.round(payload.daily?.temperature_2m_min?.[0] ?? current.temperature_2m),
    time: current.time ?? "",
    fetchedAt: Date.now(),
  };

  memory.set(key, weather);
  return weather;
}
