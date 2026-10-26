/* ==========================================================================
   F News composer writes
   --------------------------------------------------------------------------
   Uploads editorial media to the public news-media bucket, registers it in
   news_media and publishes Flash or article rows. All access rules are in the
   Supabase schema; this module only prepares the payload.
   ========================================================================== */

import type { Session } from "../lib/auth";
import { fileToPostPhoto } from "../lib/image";
import { supabase } from "../lib/supabase";
import { isVideoFile, MAX_VIDEO_BYTES, readVideoMeta } from "../lib/video";
import type { NewsCategory } from "./news-types";

const BUCKET = "news-media";
const MAX_FLASH_SECONDS = 60;
const MAX_ARTICLE_VIDEO_SECONDS = 120;
const FLASH_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface FlashComposerInput {
  channelId: string;
  title: string;
  category: NewsCategory;
  video: File;
  poster: File | null;
}

export interface ShortComposerInput {
  channelId: string;
  caption: string;
  category: NewsCategory;
  video: File;
  poster: File | null;
}

export interface ArticleComposerInput {
  channelId: string;
  title: string;
  summary: string;
  category: NewsCategory;
  region: string;
  tags: string[];
  urgent: boolean;
  cover: File;
  body: string;
  images: File[];
  video: File | null;
  videoCaption: string;
}

interface RegisteredMedia {
  id: string;
  url: string;
  path: string;
}

interface RawUpload {
  url: string;
  path: string;
}

interface ArticleBlockPayload {
  article_id: string;
  position: number;
  type: "text" | "image" | "video";
  text: string | null;
  media_id: string | null;
  media_url: string | null;
  poster_url: string | null;
  caption: string | null;
  duration_seconds: number | null;
}

function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeExtension(file: File, fallback: string): string {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return extension || fallback;
}

function captionFor(file: File): string {
  const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return name.slice(0, 120);
}

function paragraphCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function uploadRaw(
  channelId: string,
  blob: Blob,
  extension: string,
  contentType: string,
): Promise<RawUpload> {
  const path = `news/${channelId}/${newId()}.${safeExtension(
    new File([blob], `asset.${extension}`, { type: contentType }),
    extension,
  )}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { url, path };
}

export async function uploadChannelArt(
  channelId: string,
  file: File,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a JPG, PNG or WebP image for the channel.");
  }
  const prepared = await fileToPostPhoto(file);
  const raw = await uploadRaw(channelId, prepared.blob, "jpg", "image/jpeg");
  return raw.url;
}

async function uploadRegistered(
  session: Session,
  channelId: string,
  blob: Blob,
  extension: string,
  contentType: string,
  kind: "image" | "video",
  meta: {
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    posterUrl?: string | null;
  } = {},
): Promise<RegisteredMedia> {
  const raw = await uploadRaw(channelId, blob, extension, contentType);
  const id = newId();

  const { error } = await supabase.from("news_media").insert({
    id,
    channel_id: channelId,
    owner_id: session.id,
    kind,
    bucket: BUCKET,
    storage_path: raw.path,
    public_url: raw.url,
    poster_url: meta.posterUrl ?? null,
    width: meta.width ?? null,
    height: meta.height ?? null,
    duration_seconds: meta.duration ?? null,
    size_bytes: blob.size,
    status: "ready",
  });

  if (error) {
    await supabase.storage.from(BUCKET).remove([raw.path]);
    throw new Error(error.message);
  }

  return { id, url: raw.url, path: raw.path };
}

async function cleanup(media: RegisteredMedia[], rawPaths: string[] = []): Promise<void> {
  const paths = [...media.map((item) => item.path), ...rawPaths].filter(Boolean);
  if (paths.length) {
    await supabase.storage.from(BUCKET).remove(paths);
  }
  if (media.length) {
    await supabase.from("news_media").delete().in(
      "id",
      media.map((item) => item.id),
    );
  }
}

/** Grab a representative frame so recorded Flash still has a proper poster. */
async function captureVideoPoster(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("Video poster could not be read."));
      }),
      new Promise<void>((_, reject) => {
        window.setTimeout(() => reject(new Error("Video poster timed out.")), 5000);
      }),
    ]);

    const target = Math.min(1, Math.max(0, (video.duration || 0) * 0.2));
    if (target > 0.05) {
      video.currentTime = target;
      await Promise.race([
        new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        }),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2500);
        }),
      ]);
    }

    const scale = Math.min(1, 1280 / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((video.videoWidth || 1280) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 720) * scale));

    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

function validateVideo(file: File, maxSeconds: number, label: string): Promise<number> {
  if (!isVideoFile(file)) {
    return Promise.reject(new Error(`${label} must be an MP4, MOV or WebM video.`));
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return Promise.reject(new Error(`${label} is larger than 40 MB.`));
  }

  return readVideoMeta(file).then((meta) => {
    if (meta.duration > maxSeconds + 1) {
      const minutes = Math.max(1, Math.round(maxSeconds / 60));
      return Promise.reject(
        new Error(
          `${label} is too long. Keep it under ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        ),
      );
    }
    return meta.duration;
  });
}

/* -------------------------------------------------------------------------- */
/* Flash                                                                      */
/* -------------------------------------------------------------------------- */

export async function publishFlash(
  input: FlashComposerInput,
  session: Session,
): Promise<void> {
  const title = input.title.trim();
  if (title.length < 4) throw new Error("Give this Flash a title of at least 4 characters.");
  if (title.length > 160) throw new Error("Flash titles are limited to 160 characters.");

  const duration = await validateVideo(input.video, MAX_FLASH_SECONDS, "Flash video");

  const created: RegisteredMedia[] = [];
  const rawPaths: string[] = [];
  let posterUrl: string | null = null;

  try {
    if (input.poster) {
      const prepared = await fileToPostPhoto(input.poster);
      const poster = await uploadRaw(
        input.channelId,
        prepared.blob,
        "jpg",
        "image/jpeg",
      );
      posterUrl = poster.url;
      rawPaths.push(poster.path);
    } else {
      const posterBlob = await captureVideoPoster(input.video);
      if (posterBlob) {
        const poster = await uploadRaw(
          input.channelId,
          posterBlob,
          "jpg",
          "image/jpeg",
        );
        posterUrl = poster.url;
        rawPaths.push(poster.path);
      }
    }

    const video = await uploadRegistered(
      session,
      input.channelId,
      input.video,
      safeExtension(input.video, "mp4"),
      input.video.type || "video/mp4",
      "video",
      { duration, posterUrl },
    );
    created.push(video);

    const now = new Date();
    const { error } = await supabase.from("news_flashes").insert({
      channel_id: input.channelId,
      author_id: session.id,
      title,
      category: input.category,
      video_media_id: video.id,
      video_url: video.url,
      poster_url: posterUrl,
      duration_seconds: Math.max(1, Math.ceil(duration)),
      broadcast_type: "recorded",
      status: "published",
      published_at: now.toISOString(),
      expires_at: new Date(now.getTime() + FLASH_LIFETIME_MS).toISOString(),
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    await cleanup(created, rawPaths);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Short                                                                      */
/* -------------------------------------------------------------------------- */

export async function publishShort(
  input: ShortComposerInput,
  session: Session,
): Promise<void> {
  const caption = input.caption.trim();
  if (caption.length < 4) throw new Error("Give this Short a caption of at least 4 characters.");
  if (caption.length > 280) throw new Error("Short captions are limited to 280 characters.");

  const duration = await validateVideo(input.video, MAX_FLASH_SECONDS, "Short video");

  const created: RegisteredMedia[] = [];
  const rawPaths: string[] = [];
  let posterUrl: string | null = null;

  try {
    if (input.poster) {
      const prepared = await fileToPostPhoto(input.poster);
      const poster = await uploadRaw(input.channelId, prepared.blob, "jpg", "image/jpeg");
      posterUrl = poster.url;
      rawPaths.push(poster.path);
    } else {
      const posterBlob = await captureVideoPoster(input.video);
      if (posterBlob) {
        const poster = await uploadRaw(input.channelId, posterBlob, "jpg", "image/jpeg");
        posterUrl = poster.url;
        rawPaths.push(poster.path);
      }
    }

    const video = await uploadRegistered(
      session,
      input.channelId,
      input.video,
      safeExtension(input.video, "mp4"),
      input.video.type || "video/mp4",
      "video",
      { duration, posterUrl },
    );
    created.push(video);

    const { error } = await supabase.from("news_shorts").insert({
      channel_id: input.channelId,
      author_id: session.id,
      caption,
      category: input.category,
      video_media_id: video.id,
      video_url: video.url,
      poster_url: posterUrl,
      duration_seconds: Math.max(1, Math.ceil(duration)),
      status: "published",
      published_at: new Date().toISOString(),
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    await cleanup(created, rawPaths);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Article                                                                    */
/* -------------------------------------------------------------------------- */

export async function publishArticle(
  input: ArticleComposerInput,
  session: Session,
): Promise<void> {
  const title = input.title.trim();
  const body = input.body.trim();
  const summary = input.summary.trim();

  if (title.length < 6) throw new Error("Article titles need at least 6 characters.");
  if (title.length > 200) throw new Error("Article titles are limited to 200 characters.");
  if (body.length < 20) throw new Error("Write at least a short paragraph for this article.");
  if (summary.length > 400) throw new Error("The summary is limited to 400 characters.");

  const created: RegisteredMedia[] = [];
  const rawPaths: string[] = [];
  let articleId: string | null = null;

  try {
    const preparedCover = await fileToPostPhoto(input.cover);
    const cover = await uploadRegistered(
      session,
      input.channelId,
      preparedCover.blob,
      "jpg",
      "image/jpeg",
      "image",
      { width: preparedCover.width, height: preparedCover.height },
    );
    created.push(cover);

    const blocks: ArticleBlockPayload[] = [];
    let position = 0;

    for (const paragraph of body.split(/\n{2,}|\n/).map((item) => item.trim()).filter(Boolean)) {
      blocks.push({
        article_id: "",
        position: position++,
        type: "text",
        text: paragraph,
        media_id: null,
        media_url: null,
        poster_url: null,
        caption: null,
        duration_seconds: null,
      });
    }

    for (const image of input.images) {
      const prepared = await fileToPostPhoto(image);
      const media = await uploadRegistered(
        session,
        input.channelId,
        prepared.blob,
        "jpg",
        "image/jpeg",
        "image",
        { width: prepared.width, height: prepared.height },
      );
      created.push(media);
      blocks.push({
        article_id: "",
        position: position++,
        type: "image",
        text: null,
        media_id: media.id,
        media_url: media.url,
        poster_url: null,
        caption: captionFor(image),
        duration_seconds: null,
      });
    }

    if (input.video) {
      const duration = await validateVideo(input.video, MAX_ARTICLE_VIDEO_SECONDS, "Article video");
      const posterBlob = await captureVideoPoster(input.video);
      let videoPoster = cover.url;
      if (posterBlob) {
        const poster = await uploadRaw(input.channelId, posterBlob, "jpg", "image/jpeg");
        videoPoster = poster.url;
        rawPaths.push(poster.path);
      }

      const video = await uploadRegistered(
        session,
        input.channelId,
        input.video,
        safeExtension(input.video, "mp4"),
        input.video.type || "video/mp4",
        "video",
        { duration, posterUrl: videoPoster },
      );
      created.push(video);
      blocks.push({
        article_id: "",
        position: position++,
        type: "video",
        text: null,
        media_id: video.id,
        media_url: video.url,
        poster_url: videoPoster,
        caption: input.videoCaption.trim() || "Video report",
        duration_seconds: Math.max(1, Math.ceil(duration)),
      });
    }

    const readMinutes = Math.max(1, Math.round(paragraphCount(body) / 200));
    const { data, error } = await supabase
      .from("news_articles")
      .insert({
        channel_id: input.channelId,
        author_id: session.id,
        title,
        summary: summary || body.slice(0, 160),
        category: input.category,
        region: input.region.trim() || null,
        tags: input.tags,
        cover_url: cover.url,
        urgent: input.urgent,
        status: "draft",
        read_minutes: readMinutes,
      })
      .select("id")
      .single<{ id: string }>();

    if (error) throw new Error(error.message);
    articleId = data.id;

    const { error: blockError } = await supabase.from("news_article_blocks").insert(
      blocks.map((block) => ({ ...block, article_id: data.id })),
    );
    if (blockError) throw new Error(blockError.message);

    const { error: publishError } = await supabase
      .from("news_articles")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", data.id);
    if (publishError) throw new Error(publishError.message);
  } catch (error) {
    if (articleId) {
      await supabase.from("news_articles").delete().eq("id", articleId);
    }
    await cleanup(created, rawPaths);
    throw error;
  }
}
