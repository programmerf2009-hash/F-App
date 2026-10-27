/* ==========================================================================
   F News live data layer
   --------------------------------------------------------------------------
   Supabase is the source of truth when supabase/news-schema.sql has been
   applied. The News UI still has a local preview fallback so the shell can be
   opened before the schema is deployed.
   ========================================================================== */

import { avatarUrl, type Session } from "../lib/auth";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { NEWS_IMAGES } from "./news-data";
import {
  NEWS_CATEGORIES,
  categoryAccent,
  slugifyHandle,
  type ArticleBlock,
  type CreateChannelInput,
  type NewsArticle,
  type NewsCategory,
  type NewsChannel,
  type FeedScope,
  type NewsFlash,
  type NewsPrefs,
  type NewsShort,
} from "./news-types";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface NewsSnapshot {
  channels: NewsChannel[];
  articles: NewsArticle[];
  flashes: NewsFlash[];
  shorts: NewsShort[];
  followed: string[];
  prefs: Partial<NewsPrefs> | null;
}

export interface ArticleCursor {
  publishedAt: string;
  id: string;
}

export interface ArticlePage {
  articles: NewsArticle[];
  channels: NewsChannel[];
  /** Pass this back to load the next page. Null means the edition is complete. */
  next: ArticleCursor | null;
}

export interface ArticleFeedOptions {
  scope: FeedScope;
  category?: NewsCategory | null;
  categories?: NewsCategory[] | null;
  region?: string | null;
  since?: string | null;
  urgentOnly?: boolean;
  cursor?: ArticleCursor | null;
  limit?: number;
}

export interface NewsTransfer {
  id: string;
  channelId: string;
  channelName?: string;
  channelHandle?: string;
  fromOwner: string;
  toUser: string;
  status: string;
  note: string;
  requestedAt: string;
  expiresAt: string;
}

export interface VerificationStatus {
  id: string;
  level: "verified" | "trusted";
  status: "pending" | "approved" | "rejected" | "revoked";
  note: string | null;
  createdAt: string;
}

export interface TransferRecipient {
  id: string;
  nickname: string;
  name: string;
  avatar: string | null;
}

interface ChannelRow {
  id: string;
  owner_id: string;
  name: string;
  handle: string;
  description: string;
  category: string;
  avatar_url: string | null;
  cover_url: string | null;
  verified: boolean;
  subscriber_count: number;
  created_at: string;
}

interface OwnerRow {
  channel_id: string;
  owner_id: string;
  nickname: string;
  first_name: string;
  last_name: string;
  avatar_path: string | null;
}

interface ArticleRow {
  id: string;
  channel_id: string;
  title: string;
  summary: string;
  category: string;
  region: string | null;
  tags: string[] | null;
  cover_url: string | null;
  urgent: boolean;
  read_minutes: number | null;
  published_at: string | null;
}

interface ArticleBlockRow {
  article_id: string;
  position: number;
  type: string;
  text: string | null;
  media_id: string | null;
  media_url: string | null;
  poster_url: string | null;
  caption: string | null;
  duration_seconds: number | null;
}

interface FlashRow {
  id: string;
  channel_id: string;
  title: string;
  category: string;
  video_media_id: string | null;
  video_url: string | null;
  poster_url: string | null;
  duration_seconds: number;
  views: number;
  published_at: string | null;
  expires_at: string | null;
}

interface ShortRow {
  id: string;
  channel_id: string;
  caption: string;
  video_media_id: string | null;
  video_url: string | null;
  poster_url: string | null;
  duration_seconds: number;
  like_count: number;
  comment_count: number;
  published_at: string | null;
}

interface MediaRow {
  id: string;
  bucket: string;
  storage_path: string | null;
  public_url: string | null;
  poster_url: string | null;
}

interface PreferenceRow {
  weather_label: string;
  weather_region: string;
  weather_units: string;
  weather_alerts: boolean;
  breaking_alerts: boolean;
  autoplay_video: boolean;
  categories: string[] | null;
}

interface MembershipRow {
  channel_id: string;
  role: string;
}

interface TransferRow {
  id: string;
  channel_id: string;
  from_owner: string;
  to_user: string;
  status: string;
  note: string;
  requested_at: string;
  expires_at: string;
  channel?: { name: string; handle: string } | { name: string; handle: string }[] | null;
}

interface VerificationRow {
  id: string;
  level: string;
  status: string;
  note: string | null;
  created_at: string;
}

interface ProfileSearchRow {
  id: string;
  nickname: string;
  first_name: string;
  last_name: string;
  avatar_path: string | null;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function asCategory(value: string | null | undefined): NewsCategory {
  return NEWS_CATEGORIES.includes(value as NewsCategory)
    ? (value as NewsCategory)
    : "Top";
}

function minutesSince(value: string | null | undefined, now = Date.now()): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.floor((now - timestamp) / 60_000));
}

function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds ?? 0)));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function wordsIn(blocks: ArticleBlock[]): number {
  return blocks.reduce((total, block) => {
    if (block.type === "text" || block.type === "quote") {
      return total + block.text.trim().split(/\s+/).filter(Boolean).length;
    }
    return total + 8;
  }, 0);
}

function mediaUrl(media: MediaRow | undefined): string | null {
  if (!media) return null;
  if (media.public_url) return media.public_url;
  if (media.storage_path) {
    return supabase.storage
      .from(media.bucket || "news-media")
      .getPublicUrl(media.storage_path).data.publicUrl;
  }
  return null;
}

function mediaPoster(media: MediaRow | undefined): string | null {
  return media?.poster_url ?? null;
}

function mapBlock(
  row: ArticleBlockRow,
  media: MediaRow | undefined,
  fallbackPoster: string,
): ArticleBlock | null {
  if (row.type === "text" && row.text) {
    return { type: "text", text: row.text };
  }
  if (row.type === "quote" && row.text) {
    return { type: "quote", text: row.text };
  }
  if (row.type === "image") {
    const src = row.media_url ?? mediaUrl(media);
    return src
      ? { type: "image", src, caption: row.caption ?? row.text ?? "" }
      : null;
  }
  if (row.type === "video") {
    const src = row.media_url ?? mediaUrl(media) ?? undefined;
    return {
      type: "video",
      poster: row.poster_url ?? mediaPoster(media) ?? fallbackPoster,
      caption: row.caption ?? row.text ?? "Video report",
      duration: formatDuration(row.duration_seconds),
      ...(src ? { src } : {}),
    };
  }
  if (row.type === "embed" && (row.media_url || row.text)) {
    return { type: "text", text: row.text ?? "Embedded report" };
  }
  return null;
}

function mapOwnerName(owner: OwnerRow | undefined, handle: string): string {
  if (!owner) return handle;
  const full = `${owner.first_name ?? ""} ${owner.last_name ?? ""}`.trim();
  return full || owner.nickname || handle;
}

/* -------------------------------------------------------------------------- */
/* Mapping                                                                     */
/* -------------------------------------------------------------------------- */

const CHANNEL_COLUMNS =
  "id, owner_id, name, handle, description, category, avatar_url, cover_url, verified, subscriber_count, created_at";

const ARTICLE_COLUMNS =
  "id, channel_id, title, summary, category, region, tags, cover_url, urgent, read_minutes, published_at";

const ARTICLE_BLOCK_COLUMNS =
  "article_id, position, type, text, media_id, media_url, poster_url, caption, duration_seconds";

function mapChannel(
  row: ChannelRow,
  owner: OwnerRow | undefined,
  session: Session,
  member = false,
): NewsChannel {
  const category = asCategory(row.category);
  const ownerName =
    row.owner_id === session.id
      ? `${session.firstName} ${session.lastName}`.trim() || session.nickname
      : mapOwnerName(owner, row.handle);

  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    description: row.description,
    category,
    ownerName,
    ownerNickname:
      row.owner_id === session.id ? session.nickname : owner?.nickname ?? row.handle,
    verified: row.verified,
    subscribers: Number(row.subscriber_count ?? 0),
    avatar: row.avatar_url,
    cover: row.cover_url,
    tone: categoryAccent(category),
    joined: String(new Date(row.created_at).getFullYear()),
    isMine: row.owner_id === session.id || member,
    isOwner: row.owner_id === session.id,
  };
}

function mapArticle(
  row: ArticleRow,
  blocks: ArticleBlockRow[],
  mediaById: Map<string, MediaRow>,
): NewsArticle {
  const fallbackPoster = row.cover_url ?? NEWS_IMAGES.press;
  const body = blocks
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((block) => mapBlock(block, block.media_id ? mediaById.get(block.media_id) : undefined, fallbackPoster))
    .filter((block): block is ArticleBlock => block !== null);

  const firstText = body.find(
    (block): block is Extract<ArticleBlock, { type: "text" }> => block.type === "text",
  );
  const summary = row.summary?.trim() || firstText?.text.slice(0, 160) || "";

  return {
    id: row.id,
    channelId: row.channel_id,
    category: asCategory(row.category),
    title: row.title,
    summary,
    body,
    cover: row.cover_url ?? fallbackPoster,
    ...(row.region ? { region: row.region } : {}),
    minutesAgo: minutesSince(row.published_at),
    readMinutes: row.read_minutes ?? Math.max(1, Math.round(wordsIn(body) / 200)),
    urgent: row.urgent,
    tags: row.tags ?? [],
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
  };
}

function mapFlash(row: FlashRow, mediaById: Map<string, MediaRow>): NewsFlash {
  const media = row.video_media_id ? mediaById.get(row.video_media_id) : undefined;
  return {
    id: row.id,
    channelId: row.channel_id,
    title: row.title,
    poster: row.poster_url ?? mediaPoster(media) ?? NEWS_IMAGES.city,
    minutesAgo: minutesSince(row.published_at),
    duration: formatDuration(row.duration_seconds),
    views: Number(row.views ?? 0),
    category: asCategory(row.category),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(row.video_url ? { videoUrl: row.video_url } : {}),
  };
}

function mapShort(row: ShortRow, mediaById: Map<string, MediaRow>): NewsShort {
  const media = row.video_media_id ? mediaById.get(row.video_media_id) : undefined;
  return {
    id: row.id,
    channelId: row.channel_id,
    caption: row.caption,
    poster: row.poster_url ?? mediaPoster(media) ?? NEWS_IMAGES.technology,
    minutesAgo: minutesSince(row.published_at),
    likes: Number(row.like_count ?? 0),
    comments: Number(row.comment_count ?? 0),
    duration: formatDuration(row.duration_seconds),
    ...(row.video_url ? { videoUrl: row.video_url } : {}),
  };
}

function mapPreferences(row: PreferenceRow): Partial<NewsPrefs> {
  const categories = (row.categories ?? []).filter((value): value is NewsCategory =>
    NEWS_CATEGORIES.includes(value as NewsCategory),
  );

  return {
    placeName: row.weather_label,
    placeRegion: row.weather_region,
    units: row.weather_units === "F" ? "f" : "c",
    severeAlerts: row.weather_alerts,
    breakingAlerts: row.breaking_alerts,
    autoplay: row.autoplay_video,
    ...(categories.length ? { categories } : {}),
  };
}

function mapTransfer(row: TransferRow): NewsTransfer {
  const channel = Array.isArray(row.channel) ? row.channel[0] : row.channel;
  return {
    id: row.id,
    channelId: row.channel_id,
    channelName: channel?.name,
    channelHandle: channel?.handle,
    fromOwner: row.from_owner,
    toUser: row.to_user,
    status: row.status,
    note: row.note,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
  };
}

function mapVerification(row: VerificationRow): VerificationStatus {
  return {
    id: row.id,
    level: row.level === "trusted" ? "trusted" : "verified",
    status:
      row.status === "approved" ||
      row.status === "rejected" ||
      row.status === "revoked"
        ? row.status
        : "pending",
    note: row.note,
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

function errorText(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function newsErrorMessage(error: unknown, fallback: string): string {
  const message = errorText(error, fallback);
  if (/duplicate key|already exists/i.test(message)) {
    return "That handle is already in use. Choose another one.";
  }
  if (/row-level security/i.test(message)) {
    return "You do not have permission to do that in this newsroom.";
  }
  return message;
}

export async function loadNewsSnapshot(session: Session): Promise<NewsSnapshot> {
  if (!supabaseConfigured) throw new Error("Supabase is not configured.");

  const [
    channelsResult,
    articlesResult,
    flashesResult,
    shortsResult,
    followsResult,
    prefsResult,
    membershipsResult,
  ] = await Promise.all([
    supabase
      .from("news_channels")
      .select(CHANNEL_COLUMNS)
      .is("archived_at", null)
      .order("subscriber_count", { ascending: false })
      .limit(80),
    supabase
      .from("news_articles")
      .select(ARTICLE_COLUMNS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(80),
    supabase
      .from("news_flashes")
      .select(
        "id, channel_id, title, category, video_media_id, video_url, poster_url, duration_seconds, views, published_at, expires_at",
      )
      .in("status", ["published", "archived"])
      .order("published_at", { ascending: false })
      .limit(60),
    supabase
      .from("news_shorts")
      .select(
        "id, channel_id, caption, video_media_id, video_url, poster_url, duration_seconds, like_count, comment_count, published_at",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(30),
    supabase
      .from("news_subscriptions")
      .select("channel_id")
      .eq("subscriber_id", session.id),
    supabase
      .from("news_preferences")
      .select(
        "weather_label, weather_region, weather_units, weather_alerts, breaking_alerts, autoplay_video, categories",
      )
      .eq("user_id", session.id)
      .maybeSingle<PreferenceRow>(),
    supabase
      .from("news_channel_members")
      .select("channel_id, role")
      .eq("user_id", session.id),
  ]);

  const firstError =
    channelsResult.error ??
    articlesResult.error ??
    flashesResult.error ??
    shortsResult.error ??
    followsResult.error ??
    prefsResult.error ??
    membershipsResult.error;
  if (firstError) throw new Error(firstError.message);

  const channelRows = (channelsResult.data ?? []) as ChannelRow[];
  const articleRows = (articlesResult.data ?? []) as ArticleRow[];
  const flashRows = (flashesResult.data ?? []) as FlashRow[];
  const shortRows = (shortsResult.data ?? []) as ShortRow[];
  const membershipRows = (membershipsResult.data ?? []) as MembershipRow[];
  const memberIds = new Set(membershipRows.map((row) => row.channel_id));

  // The public directory is ordered by reach. A new or small channel can fall
  // outside that top slice, so always append the channels this account can edit.
  const missingChannelIds = [...memberIds].filter(
    (id) => !channelRows.some((row) => row.id === id),
  );
  if (missingChannelIds.length) {
    const { data, error } = await supabase
      .from("news_channels")
      .select(CHANNEL_COLUMNS)
      .in("id", missingChannelIds)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
    channelRows.push(...((data ?? []) as ChannelRow[]));
  }

  const ownerByChannel = new Map<string, OwnerRow>();
  const channelIds = channelRows.map((row) => row.id);
  if (channelIds.length) {
    const { data: owners, error: ownerError } = await supabase.rpc("news_channel_owners", {
      p_channel_ids: channelIds,
    });
    if (!ownerError && Array.isArray(owners)) {
      for (const owner of owners as OwnerRow[]) {
        ownerByChannel.set(owner.channel_id, owner);
      }
    }
  }

  const articleIds = articleRows.map((row) => row.id);
  let blockRows: ArticleBlockRow[] = [];
  if (articleIds.length) {
    const { data, error } = await supabase
      .from("news_article_blocks")
      .select(
        "article_id, position, type, text, media_id, media_url, poster_url, caption, duration_seconds",
      )
      .in("article_id", articleIds)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    blockRows = (data ?? []) as ArticleBlockRow[];
  }

  const mediaIds = new Set<string>();
  for (const block of blockRows) if (block.media_id) mediaIds.add(block.media_id);
  for (const flash of flashRows) if (flash.video_media_id) mediaIds.add(flash.video_media_id);
  for (const short of shortRows) if (short.video_media_id) mediaIds.add(short.video_media_id);

  const mediaById = new Map<string, MediaRow>();
  if (mediaIds.size) {
    const { data, error } = await supabase
      .from("news_media")
      .select("id, bucket, storage_path, public_url, poster_url")
      .in("id", [...mediaIds]);
    if (error) throw new Error(error.message);
    for (const media of (data ?? []) as MediaRow[]) {
      mediaById.set(media.id, media);
    }
  }

  const channels = channelRows.map((row) =>
    mapChannel(row, ownerByChannel.get(row.id), session, memberIds.has(row.id)),
  );
  const channelIdSet = new Set(channels.map((channel) => channel.id));
  const blocksByArticle = new Map<string, ArticleBlockRow[]>();
  for (const block of blockRows) {
    const list = blocksByArticle.get(block.article_id) ?? [];
    list.push(block);
    blocksByArticle.set(block.article_id, list);
  }

  const articles = articleRows
    .filter((row) => channelIdSet.has(row.channel_id))
    .map((row) => mapArticle(row, blocksByArticle.get(row.id) ?? [], mediaById));

  const flashes = flashRows
    .filter((row) => channelIdSet.has(row.channel_id))
    .map((row) => mapFlash(row, mediaById));

  const shorts = shortRows
    .filter((row) => channelIdSet.has(row.channel_id))
    .map((row) => mapShort(row, mediaById));

  const followed = (followsResult.data ?? [])
    .map((row) => row.channel_id as string)
    .filter((id) => channelIdSet.has(id));

  return {
    channels,
    articles,
    flashes,
    shorts,
    followed,
    prefs: prefsResult.data ? mapPreferences(prefsResult.data) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Paginated feed and search                                                  */
/* -------------------------------------------------------------------------- */

async function loadOwnerMap(channelIds: string[]): Promise<Map<string, OwnerRow>> {
  const ownerByChannel = new Map<string, OwnerRow>();
  if (!channelIds.length) return ownerByChannel;

  const { data, error } = await supabase.rpc("news_channel_owners", {
    p_channel_ids: channelIds,
  });
  if (!error && Array.isArray(data)) {
    for (const owner of data as OwnerRow[]) {
      ownerByChannel.set(owner.channel_id, owner);
    }
  }
  return ownerByChannel;
}

async function hydrateChannels(rows: ChannelRow[], session: Session): Promise<NewsChannel[]> {
  const channelIds = rows.map((row) => row.id);
  if (!channelIds.length) return [];

  const [ownerByChannel, memberships] = await Promise.all([
    loadOwnerMap(channelIds),
    supabase
      .from("news_channel_members")
      .select("channel_id")
      .eq("user_id", session.id)
      .in("channel_id", channelIds),
  ]);

  const memberIds = new Set(
    ((memberships.data ?? []) as Array<{ channel_id: string }>).map((row) => row.channel_id),
  );

  return rows.map((row) =>
    mapChannel(row, ownerByChannel.get(row.id), session, memberIds.has(row.id)),
  );
}

async function hydrateArticlePage(
  rows: ArticleRow[],
  session: Session,
  limit: number,
): Promise<ArticlePage> {
  if (!rows.length) return { articles: [], channels: [], next: null };

  const articleIds = rows.map((row) => row.id);
  const channelIds = [...new Set(rows.map((row) => row.channel_id))];

  const [blocksResult, channelsResult] = await Promise.all([
    supabase
      .from("news_article_blocks")
      .select(ARTICLE_BLOCK_COLUMNS)
      .in("article_id", articleIds)
      .order("position", { ascending: true }),
    supabase
      .from("news_channels")
      .select(CHANNEL_COLUMNS)
      .in("id", channelIds)
      .is("archived_at", null),
  ]);

  if (blocksResult.error) throw new Error(blocksResult.error.message);
  if (channelsResult.error) throw new Error(channelsResult.error.message);

  const blockRows = (blocksResult.data ?? []) as ArticleBlockRow[];
  const channelRows = (channelsResult.data ?? []) as ChannelRow[];

  const mediaIds = new Set<string>();
  for (const block of blockRows) if (block.media_id) mediaIds.add(block.media_id);

  let mediaRows: MediaRow[] = [];
  if (mediaIds.size) {
    const { data, error } = await supabase
      .from("news_media")
      .select("id, bucket, storage_path, public_url, poster_url")
      .in("id", [...mediaIds]);
    if (error) throw new Error(error.message);
    mediaRows = (data ?? []) as MediaRow[];
  }

  const mediaById = new Map(mediaRows.map((media) => [media.id, media]));
  const blocksByArticle = new Map<string, ArticleBlockRow[]>();
  for (const block of blockRows) {
    const list = blocksByArticle.get(block.article_id) ?? [];
    list.push(block);
    blocksByArticle.set(block.article_id, list);
  }

  const channels = await hydrateChannels(channelRows, session);
  const channelIdSet = new Set(channels.map((channel) => channel.id));
  const articles = rows
    .filter((row) => channelIdSet.has(row.channel_id))
    .map((row) => mapArticle(row, blocksByArticle.get(row.id) ?? [], mediaById));

  const last = rows[rows.length - 1];
  const next =
    rows.length >= limit && last?.published_at
      ? { publishedAt: last.published_at, id: last.id }
      : null;

  return { articles, channels, next };
}

/**
 * Keyset-paginated article edition. The final row becomes the cursor, and the
 * next RPC call starts strictly after it, so pages never overlap.
 */
export async function loadArticleFeedPage(
  session: Session,
  options: ArticleFeedOptions,
): Promise<ArticlePage> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const { data, error } = await supabase.rpc("news_article_feed", {
    p_scope: options.scope,
    p_category: options.category ?? null,
    p_categories: options.categories?.length ? options.categories : null,
    p_region: options.scope === "local" ? options.region?.trim() || null : null,
    p_since: options.since ?? null,
    p_urgent_only: options.urgentOnly ?? false,
    p_before: options.cursor?.publishedAt ?? null,
    p_before_id: options.cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  return hydrateArticlePage((data ?? []) as ArticleRow[], session, limit);
}

export async function loadArticleSearchPage(
  session: Session,
  query: string,
  options: { cursor?: ArticleCursor | null; limit?: number; category?: NewsCategory | null } = {},
): Promise<ArticlePage> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const { data, error } = await supabase.rpc("news_search_articles", {
    p_query: query,
    p_category: options.category ?? null,
    p_before: options.cursor?.publishedAt ?? null,
    p_before_id: options.cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);

  return hydrateArticlePage((data ?? []) as ArticleRow[], session, limit);
}

export async function loadNewsChannelSearch(
  session: Session,
  query: string,
  limit = 20,
): Promise<NewsChannel[]> {
  const { data, error } = await supabase.rpc("news_search_channels", {
    p_query: query,
    p_limit: Math.max(1, Math.min(limit, 60)),
  });
  if (error) throw new Error(error.message);

  return hydrateChannels((data ?? []) as ChannelRow[], session);
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export async function setNewsSubscription(
  channelId: string,
  subscriberId: string,
  follow: boolean,
): Promise<void> {
  if (follow) {
    const { error } = await supabase.from("news_subscriptions").upsert(
      { channel_id: channelId, subscriber_id: subscriberId },
      { onConflict: "channel_id,subscriber_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("news_subscriptions")
    .delete()
    .eq("channel_id", channelId)
    .eq("subscriber_id", subscriberId);
  if (error) throw new Error(error.message);
}

export async function saveNewsPreferences(
  userId: string,
  prefs: NewsPrefs,
): Promise<void> {
  const { error } = await supabase.from("news_preferences").upsert(
    {
      user_id: userId,
      categories: prefs.categories,
      weather_place_id: slugifyHandle(prefs.placeName) || "toshkent",
      weather_label: prefs.placeName,
      weather_region: prefs.placeRegion,
      weather_units: prefs.units === "f" ? "F" : "C",
      weather_alerts: prefs.severeAlerts,
      breaking_alerts: prefs.breakingAlerts,
      autoplay_video: prefs.autoplay,
      language: "uz",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function createLiveChannel(
  input: CreateChannelInput,
  session: Session,
): Promise<NewsChannel> {
  const handle = slugifyHandle(input.handle);
  const category = asCategory(input.category);

  const { data, error } = await supabase
    .from("news_channels")
    .insert({
      owner_id: session.id,
      name: input.name.trim(),
      handle,
      description: input.description.trim() || "A new F News channel.",
      category,
    })
    .select(CHANNEL_COLUMNS)
    .single<ChannelRow>();

  if (error) throw new Error(error.message);

  // Following your own channel is optional; a failure must not undo creation.
  await supabase
    .from("news_subscriptions")
    .upsert(
      { channel_id: data.id, subscriber_id: session.id },
      { onConflict: "channel_id,subscriber_id", ignoreDuplicates: true },
    );

  return mapChannel(data, undefined, session, true);
}

export async function updateLiveChannel(
  channelId: string,
  input: {
    name: string;
    description: string;
    category: NewsCategory;
    avatarUrl?: string | null;
    coverUrl?: string | null;
  },
): Promise<void> {
  const payload: Record<string, string | null> = {
    name: input.name.trim(),
    description: input.description.trim() || "An F News channel.",
    category: input.category,
  };
  if (input.avatarUrl !== undefined) payload.avatar_url = input.avatarUrl;
  if (input.coverUrl !== undefined) payload.cover_url = input.coverUrl;

  const { error } = await supabase
    .from("news_channels")
    .update(payload)
    .eq("id", channelId);
  if (error) throw new Error(error.message);
}

export async function loadChannelVerification(
  channelId: string,
): Promise<VerificationStatus | null> {
  const { data, error } = await supabase
    .from("news_channel_verifications")
    .select("id, level, status, note, created_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as VerificationRow | undefined;
  return row ? mapVerification(row) : null;
}

export async function requestChannelVerification(
  channelId: string,
  userId: string,
  level: "verified" | "trusted",
  evidence: string,
): Promise<void> {
  const { error } = await supabase.from("news_channel_verifications").insert({
    channel_id: channelId,
    requested_by: userId,
    level,
    status: "pending",
    evidence: evidence.trim().slice(0, 1200),
  });
  if (error) throw new Error(error.message);
}

export async function loadIncomingTransfers(userId: string): Promise<NewsTransfer[]> {
  const { data, error } = await supabase
    .from("news_channel_transfers")
    .select(
      "id, channel_id, from_owner, to_user, status, note, requested_at, expires_at, channel:news_channels(name, handle)",
    )
    .eq("to_user", userId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TransferRow[]).map(mapTransfer);
}

export async function loadPendingTransfer(
  channelId: string,
): Promise<NewsTransfer | null> {
  const { data, error } = await supabase
    .from("news_channel_transfers")
    .select(
      "id, channel_id, from_owner, to_user, status, note, requested_at, expires_at, channel:news_channels(name, handle)",
    )
    .eq("channel_id", channelId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as TransferRow | undefined;
  return row ? mapTransfer(row) : null;
}

export async function searchTransferRecipients(
  query: string,
  excludeUserId: string,
): Promise<TransferRecipient[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const { data, error } = await supabase.rpc("search_profiles", { p_query: term });
  if (error) throw new Error(error.message);

  return ((data ?? []) as ProfileSearchRow[])
    .filter((row) => row.id !== excludeUserId)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      nickname: row.nickname,
      name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || row.nickname,
      avatar: avatarUrl(row.avatar_path),
    }));
}

export async function requestChannelTransfer(
  channelId: string,
  toUser: string,
  note: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("news_request_channel_transfer", {
    p_channel_id: channelId,
    p_to_user: toUser,
    p_note: note.trim().slice(0, 500),
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function acceptChannelTransfer(transferId: string): Promise<void> {
  const { error } = await supabase.rpc("news_accept_channel_transfer", {
    p_transfer_id: transferId,
  });
  if (error) throw new Error(error.message);
}

export async function declineChannelTransfer(transferId: string): Promise<void> {
  const { error } = await supabase.rpc("news_decline_channel_transfer", {
    p_transfer_id: transferId,
  });
  if (error) throw new Error(error.message);
}
