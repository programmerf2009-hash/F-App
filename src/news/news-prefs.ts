import { CITIES, DISTRICTS, DEFAULT_PLACE, type Place } from "../lib/places";
import { DEMO_CHANNELS } from "./news-data";
import {
  FEED_CATEGORIES,
  type NewsCategory,
  type NewsChannel,
  type NewsPrefs,
} from "./news-types";

const PREFS_KEY = "fapp:news:prefs:v1";
const FOLLOWS_KEY = "fapp:news:follows:v1";
const CHANNELS_KEY = "fapp:news:channels:v1";

export const DEFAULT_NEWS_PREFS: NewsPrefs = {
  placeName: DEFAULT_PLACE.name,
  placeRegion: DEFAULT_PLACE.region,
  units: "c",
  severeAlerts: true,
  breakingAlerts: true,
  autoplay: false,
  categories: ["Top", "Local", "Business", "Technology"],
};

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — the session still works in memory */
  }
}

export function loadNewsPrefs(): NewsPrefs {
  const stored = readJson<Partial<NewsPrefs>>(PREFS_KEY);
  if (!stored) return DEFAULT_NEWS_PREFS;

  const categories = Array.isArray(stored.categories)
    ? stored.categories.filter((category): category is NewsCategory =>
        FEED_CATEGORIES.includes(category as NewsCategory),
      )
    : DEFAULT_NEWS_PREFS.categories;

  return {
    placeName:
      typeof stored.placeName === "string" && stored.placeName
        ? stored.placeName
        : DEFAULT_NEWS_PREFS.placeName,
    placeRegion:
      typeof stored.placeRegion === "string" && stored.placeRegion
        ? stored.placeRegion
        : DEFAULT_NEWS_PREFS.placeRegion,
    units: stored.units === "f" ? "f" : "c",
    severeAlerts:
      typeof stored.severeAlerts === "boolean"
        ? stored.severeAlerts
        : DEFAULT_NEWS_PREFS.severeAlerts,
    breakingAlerts:
      typeof stored.breakingAlerts === "boolean"
        ? stored.breakingAlerts
        : DEFAULT_NEWS_PREFS.breakingAlerts,
    autoplay: typeof stored.autoplay === "boolean" ? stored.autoplay : DEFAULT_NEWS_PREFS.autoplay,
    categories: categories.length > 0 ? categories : DEFAULT_NEWS_PREFS.categories,
  };
}

export function saveNewsPrefs(prefs: NewsPrefs): void {
  writeJson(PREFS_KEY, prefs);
}

export function resolvePlace(prefs: NewsPrefs): Place {
  return (
    [...CITIES, ...DISTRICTS].find(
      (place) => place.name === prefs.placeName && place.region === prefs.placeRegion,
    ) ?? DEFAULT_PLACE
  );
}

export function loadFollowed(): string[] {
  const stored = readJson<string[]>(FOLLOWS_KEY);
  if (Array.isArray(stored)) return stored.filter((id) => typeof id === "string");
  return ["f-newsroom", "tashkent-today"];
}

export function saveFollowed(ids: string[]): void {
  writeJson(FOLLOWS_KEY, ids);
}

export function loadMyChannels(): NewsChannel[] {
  const stored = readJson<NewsChannel[]>(CHANNELS_KEY);
  if (!Array.isArray(stored)) return [];

  return stored.filter(
    (channel) =>
      channel &&
      typeof channel.id === "string" &&
      typeof channel.name === "string" &&
      typeof channel.handle === "string" &&
      channel.isMine === true,
  );
}

export function saveMyChannels(channels: NewsChannel[]): void {
  writeJson(CHANNELS_KEY, channels);
}

export function handleTaken(channels: NewsChannel[], handle: string, ignoreId?: string): boolean {
  const normalized = handle.trim().toLowerCase();
  return channels.some(
    (channel) => channel.id !== ignoreId && channel.handle.toLowerCase() === normalized,
  );
}

/** All seeded handles, useful before a custom channel has been added. */
export function seededHandleTaken(handle: string): boolean {
  return DEMO_CHANNELS.some((channel) => channel.handle.toLowerCase() === handle.toLowerCase());
}
