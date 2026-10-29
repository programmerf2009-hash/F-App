/* ==========================================================================
   F News & Weather — shared types
   --------------------------------------------------------------------------
   The news product has its own fixed "Paper & Signal" identity. These types
   deliberately do not depend on F App's Gold / Midnight themes.
   ========================================================================== */

export type NewsTab = "home" | "channels" | "shorts" | "settings" | "studio";

export type NewsCategory =
  | "Top"
  | "Business"
  | "Technology"
  | "Sport"
  | "Local"
  | "World"
  | "Climate"
  | "Culture";

export type FeedScope = "foryou" | "following" | "local";

export type ContentFilter = "all" | "articles" | "flashes";

export type TimeFilter = "any" | "24h" | "week";

export interface FeedFilters {
  categories: NewsCategory[];
  content: ContentFilter;
  time: TimeFilter;
}

export interface NewsChannel {
  id: string;
  name: string;
  handle: string;
  description: string;
  category: NewsCategory;
  ownerName: string;
  ownerNickname: string;
  verified: boolean;
  subscribers: number;
  /** Channel avatar, independent of the cover image. */
  avatar?: string | null;
  cover: string | null;
  tone: string;
  joined: string;
  /** True when this account owns or can edit the channel in Studio. */
  isMine?: boolean;
  /** True only for the account that owns the channel and can transfer it. */
  isOwner?: boolean;
}

export type ArticleBlock =
  | { type: "text"; text: string }
  | { type: "quote"; text: string }
  | { type: "image"; src: string; caption: string }
  | {
      type: "video";
      poster: string;
      caption: string;
      duration: string;
      /** Recorded video URL. Falls back to a poster preview when absent. */
      src?: string;
    };

export interface NewsArticle {
  id: string;
  channelId: string;
  category: NewsCategory;
  title: string;
  summary: string;
  body: ArticleBlock[];
  cover: string;
  region?: string;
  minutesAgo: number;
  readMinutes: number;
  urgent?: boolean;
  tags: string[];
  /** Counted reads. Server-backed stories expose the live counter. */
  views?: number;
  /** ISO publication time. Present on server-backed results for cursor paging. */
  publishedAt?: string;
}

export interface NewsFlash {
  id: string;
  channelId: string;
  title: string;
  poster: string;
  minutesAgo: number;
  duration: string;
  views: number;
  category: NewsCategory;
  /** Optional ISO timestamp. When present it is authoritative over minutesAgo. */
  expiresAt?: string;
  /** Recorded video URL. Present for published server flashes. */
  videoUrl?: string;
}

export interface NewsShort {
  id: string;
  channelId: string;
  caption: string;
  poster: string;
  minutesAgo: number;
  views: number;
  likes: number;
  comments: number;
  duration: string;
  /** Recorded video URL. Present for published server shorts. */
  videoUrl?: string;
}

export interface CreateChannelInput {
  name: string;
  handle: string;
  category: NewsCategory;
  description: string;
}

/* -------------------------------------------------------------------------- */
/* Comments and moderation                                                    */
/* -------------------------------------------------------------------------- */

export type NewsCommentTarget = "article" | "flash" | "short";

export type NewsReportTarget = NewsCommentTarget | "comment" | "channel";

export type NewsReportReason =
  | "spam"
  | "abuse"
  | "misinformation"
  | "copyright"
  | "other";

export type NewsReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

export interface NewsComment {
  id: string;
  parentId: string | null;
  body: string;
  status: "visible" | "removed";
  createdAt: string;
  authorId: string;
  nickname: string;
  avatar: string | null;
  isMine: boolean;
}

export interface NewsReport {
  id: string;
  targetType: NewsReportTarget;
  targetId: string;
  reason: NewsReportReason;
  details: string;
  status: NewsReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  targetSnapshot: string;
  reporterNickname: string;
  targetAuthorNickname: string | null;
}

export interface NewsReportTargetInput {
  type: NewsReportTarget;
  id: string;
  title: string;
}

export const NEWS_REPORT_REASONS: Array<{
  value: NewsReportReason;
  label: string;
  hint: string;
}> = [
  { value: "spam", label: "Spam or bait", hint: "Repeated, misleading or low-value posting." },
  { value: "abuse", label: "Harassment or hate", hint: "Threats, abuse or targeted attacks." },
  {
    value: "misinformation",
    label: "False information",
    hint: "A claim that is materially false or unsafe.",
  },
  { value: "copyright", label: "Copyright", hint: "Someone else's work used without permission." },
  { value: "other", label: "Something else", hint: "Tell the desk what is wrong." },
];

export const NEWS_REPORT_TARGET_LABEL: Record<NewsReportTarget, string> = {
  article: "Article",
  flash: "Flash",
  short: "Short",
  comment: "Comment",
  channel: "Channel",
};

export function reportReasonLabel(reason: NewsReportReason): string {
  return NEWS_REPORT_REASONS.find((item) => item.value === reason)?.label ?? "Report";
}

export interface NewsPrefs {
  placeName: string;
  placeRegion: string;
  units: "c" | "f";
  severeAlerts: boolean;
  breakingAlerts: boolean;
  autoplay: boolean;
  categories: NewsCategory[];
}

export const NEWS_CATEGORIES: NewsCategory[] = [
  "Top",
  "Business",
  "Technology",
  "Sport",
  "Local",
  "World",
  "Climate",
  "Culture",
];

/** Categories that make sense as personal feed interests. */
export const FEED_CATEGORIES: NewsCategory[] = NEWS_CATEGORIES.filter(
  (category) => category !== "Top",
);

export const DEFAULT_FEED_FILTERS: FeedFilters = {
  categories: [],
  content: "all",
  time: "any",
};

export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 100_000) {
    const short = value / 1000;
    return `${short >= 10 ? Math.round(short) : short.toFixed(1).replace(/\.0$/, "")}K`;
  }
  const short = value / 1000;
  return `${Math.round(short)}K`;
}

export function timeAgo(minutes: number): string {
  if (minutes <= 0) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  const days = Math.floor(minutes / (60 * 24));
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export const FLASH_LIFETIME_MINUTES = 24 * 60;

/** A flash stays in the live feed for 24 hours, then moves to the channel archive. */
export function isFlashLive(
  flash: Pick<NewsFlash, "minutesAgo" | "expiresAt">,
  now = Date.now(),
): boolean {
  if (flash.expiresAt) {
    const expiry = Date.parse(flash.expiresAt);
    if (!Number.isNaN(expiry)) return expiry > now;
  }
  return flash.minutesAgo < FLASH_LIFETIME_MINUTES;
}

export function flashHoursLeft(flash: Pick<NewsFlash, "minutesAgo" | "expiresAt">, now = Date.now()): number {
  const minutesLeft = flash.expiresAt
    ? Math.ceil((Date.parse(flash.expiresAt) - now) / 60_000)
    : FLASH_LIFETIME_MINUTES - flash.minutesAgo;
  return Math.max(0, Math.ceil(minutesLeft / 60));
}

export function temperature(value: number, units: NewsPrefs["units"]): string {
  if (units === "f") return `${Math.round((value * 9) / 5 + 32)}°`;
  return `${Math.round(value)}°`;
}

export function temperatureUnit(units: NewsPrefs["units"]): string {
  // The degree symbol is already supplied by temperature(); this is a suffix.
  return units === "f" ? "F" : "C";
}

export function slugifyHandle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

export function categoryAccent(category: NewsCategory): string {
  switch (category) {
    case "Business":
      return "#3B5BDB";
    case "Technology":
      return "#6D4AFF";
    case "Sport":
      return "#D97706";
    case "Local":
      return "#0F9D76";
    case "World":
      return "#2563EB";
    case "Climate":
      return "#0E8FA3";
    case "Culture":
      return "#B45309";
    default:
      return "#E5483F";
  }
}
