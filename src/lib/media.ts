/* ==========================================================================
   Post va story qatlami — Supabase jadval + private media bucket
   --------------------------------------------------------------------------
   Ko'rinish qoidalari serverda (RLS) tekshiriladi. Bu fayl faqat
   yuklash, ro'yxatlash va o'chirishni qulay interfeysga o'raydi.
   ========================================================================== */

import { supabase } from "./supabase";

export type MediaKind = "photo" | "video";
export type PostVisibility = "public" | "friends";

export interface PostItem {
  id: string;
  ownerId: string;
  kind: MediaKind;
  mediaPath: string;
  caption: string;
  visibility: PostVisibility;
  createdAt: string;
  mediaUrl: string | null;
}

export interface StoryItem {
  id: string;
  ownerId: string;
  kind: MediaKind;
  mediaPath: string;
  createdAt: string;
  expiresAt: string;
  mediaUrl: string | null;
}

interface PostRow {
  id: string;
  owner_id: string;
  kind: MediaKind;
  media_path: string;
  caption: string;
  visibility: PostVisibility;
  created_at: string;
}

interface StoryRow {
  id: string;
  owner_id: string;
  kind: MediaKind;
  media_path: string;
  created_at: string;
  expires_at: string;
}

interface CreateMediaInput {
  blob: Blob;
  kind: MediaKind;
  contentType: string;
  extension: string;
}

export interface CreatePostInput extends CreateMediaInput {
  caption: string;
  visibility: PostVisibility;
}

export type CreateStoryInput = CreateMediaInput;

const MEDIA_BUCKET = "media";
const SIGNED_URL_TTL = 60 * 60;

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

async function signedMediaUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL);

  if (error) throw new Error(error.message);

  const urls = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

export async function listPosts(ownerId: string): Promise<PostItem[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("id, owner_id, kind, media_path, caption, visibility, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as PostRow[];
  const urls = await signedMediaUrls(rows.map((row) => row.media_path));

  return rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    mediaPath: row.media_path,
    caption: row.caption,
    visibility: row.visibility,
    createdAt: row.created_at,
    mediaUrl: urls.get(row.media_path) ?? null,
  }));
}

export async function listStories(ownerId: string): Promise<StoryItem[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("id, owner_id, kind, media_path, created_at, expires_at")
    .eq("owner_id", ownerId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as StoryRow[];
  const urls = await signedMediaUrls(rows.map((row) => row.media_path));

  return rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    mediaPath: row.media_path,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    mediaUrl: urls.get(row.media_path) ?? null,
  }));
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Your session has expired. Sign in again.");
  return data.user.id;
}

function safeExtension(extension: string, kind: MediaKind): string {
  const cleaned = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (cleaned) return cleaned;
  return kind === "photo" ? "jpg" : "mp4";
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

async function uploadMedia(userId: string, id: string, folder: "posts" | "stories", input: CreateMediaInput) {
  const extension = safeExtension(input.extension, input.kind);
  const path = `${folder}/${userId}/${id}/media.${extension}`;
  const contentType =
    input.contentType || (input.kind === "photo" ? "image/jpeg" : "video/mp4");

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, input.blob, {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  });

  if (error) throw new Error(error.message);
  return path;
}

export async function createPost(input: CreatePostInput): Promise<string> {
  const userId = await currentUserId();
  const id = newId();
  const path = await uploadMedia(userId, id, "posts", input);

  const { error } = await supabase.from("posts").insert({
    id,
    owner_id: userId,
    kind: input.kind,
    media_path: path,
    caption: input.caption.trim().slice(0, 140),
    visibility: input.visibility,
  });

  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    throw new Error(error.message);
  }

  return id;
}

export async function createStory(input: CreateStoryInput): Promise<string> {
  const userId = await currentUserId();
  const id = newId();
  const path = await uploadMedia(userId, id, "stories", input);

  const { error } = await supabase.from("stories").insert({
    id,
    owner_id: userId,
    kind: input.kind,
    media_path: path,
  });

  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    throw new Error(error.message);
  }

  return id;
}

export async function deletePost(post: PostItem): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", post.id);
  if (error) throw new Error(errorText(error, "Could not delete this post."));

  // DB yozuvi o'chgach faylni tozalash — best effort, post allaqachon yo'q.
  const { error: storageError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .remove([post.mediaPath]);

  if (storageError) {
    // Orphan fayl qolishi mumkin, lekin foydalanuvchi uchun post o'chgan.
  }
}

export async function deleteStory(story: StoryItem): Promise<void> {
  const { error } = await supabase.from("stories").delete().eq("id", story.id);
  if (error) throw new Error(errorText(error, "Could not delete this story."));

  const { error: storageError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .remove([story.mediaPath]);

  if (storageError) {
    // Orphan fayl qolishi mumkin, lekin story o'chgan.
  }
}
