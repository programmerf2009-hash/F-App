/* ==========================================================================
   Ijtimoiy qatlam — qidiruv, ommaviy profil, do'stlar, so'rovlar
   --------------------------------------------------------------------------
   Barcha maxfiylik qoidalari Supabase RLS va RPC funksiyalarida.
   Bu fayl faqat natijalarni ilova tipiga aylantiradi.
   ========================================================================== */

import { avatarUrl, type SongMeta } from "./auth";
import { setPendingCount } from "./pending";
import { supabase } from "./supabase";

export type Relation = "self" | "friends" | "requested" | "incoming" | "none";

export interface SearchPerson {
  id: string;
  nickname: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  friendCount: number;
  relation: Relation;
  friendshipId: string | null;
}

export interface PublicProfile extends SearchPerson {
  bio: string | null;
  profession: string | null;
  song: SongMeta | null;
  createdAt: string | null;
  privateVisible: boolean;
}

export interface FriendPerson {
  id: string;
  nickname: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
}

export interface FriendRequest {
  friendshipId: string;
  profileId: string;
  nickname: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  createdAt: string;
}

interface SearchRow {
  id: string;
  nickname: string;
  first_name: string;
  last_name: string;
  avatar_path: string | null;
  friend_count: number | string;
  relation: Relation;
  friendship_id: string | null;
}

interface ProfileRow extends SearchRow {
  bio: string | null;
  profession: string | null;
  song_path: string | null;
  song_name: string | null;
  song_type: string | null;
  song_size: number | string | null;
  song_duration: number | string | null;
  created_at: string | null;
  private_visible: boolean;
}

interface FriendRow {
  id: string;
  nickname: string;
  first_name: string;
  last_name: string;
  avatar_path: string | null;
}

interface RequestRow {
  friendship_id: string;
  profile_id: string;
  nickname: string;
  first_name: string;
  last_name: string;
  avatar_path: string | null;
  created_at: string;
}

export function socialErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function friendCountLabel(count: number): string {
  if (count <= 0) return "No friends yet";
  if (count === 1) return "1 friend";
  return `${count} friends`;
}

function toSearchPerson(row: SearchRow): SearchPerson {
  return {
    id: row.id,
    nickname: row.nickname,
    firstName: row.first_name,
    lastName: row.last_name,
    avatar: avatarUrl(row.avatar_path),
    friendCount: Number(row.friend_count ?? 0),
    relation: row.relation,
    friendshipId: row.friendship_id,
  };
}

export async function searchPeople(query: string): Promise<SearchPerson[]> {
  const { data, error } = await supabase.rpc("search_profiles", { p_query: query });
  if (error) throw new Error(error.message);

  return ((data ?? []) as SearchRow[]).map(toSearchPerson);
}

export async function getProfile(nickname: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc("get_profile", { p_nickname: nickname });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? (data[0] as ProfileRow | undefined) : (data as ProfileRow | null);
  if (!row) return null;

  const base = toSearchPerson(row);

  return {
    ...base,
    bio: row.bio,
    profession: row.profession,
    song: row.song_path
      ? {
          path: row.song_path,
          name: row.song_name ?? "Favorite song",
          type: row.song_type ?? "audio/mpeg",
          size: Number(row.song_size ?? 0),
          duration: Number(row.song_duration ?? 0),
        }
      : null,
    createdAt: row.created_at,
    privateVisible: Boolean(row.private_visible),
  };
}

export async function listFriends(userId: string): Promise<FriendPerson[]> {
  const { data, error } = await supabase.rpc("list_friends", { p_user_id: userId });
  if (error) throw new Error(error.message);

  return ((data ?? []) as FriendRow[]).map((row) => ({
    id: row.id,
    nickname: row.nickname,
    firstName: row.first_name,
    lastName: row.last_name,
    avatar: avatarUrl(row.avatar_path),
  }));
}

export async function listFriendRequests(): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc("list_friend_requests");
  if (error) throw new Error(error.message);

  return ((data ?? []) as RequestRow[]).map((row) => ({
    friendshipId: row.friendship_id,
    profileId: row.profile_id,
    nickname: row.nickname,
    firstName: row.first_name,
    lastName: row.last_name,
    avatar: avatarUrl(row.avatar_path),
    createdAt: row.created_at,
  }));
}

export async function sendFriendRequest(targetId: string): Promise<string> {
  const { data, error } = await supabase.rpc("send_friend_request", { p_target: targetId });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase.rpc("accept_friend_request", { p_request: friendshipId });
  if (error) throw new Error(error.message);
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
  if (error) throw new Error(error.message);
}

export async function getPendingCount(): Promise<number> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return 0;

  const { count, error: countError } = await supabase
    .from("friendships")
    .select("id", { count: "exact", head: true })
    .eq("addressee_id", data.user.id)
    .eq("status", "pending");

  if (countError) throw new Error(countError.message);
  return count ?? 0;
}

export async function refreshPendingBadge(): Promise<void> {
  try {
    setPendingCount(await getPendingCount());
  } catch {
    /* badge — best effort */
  }
}

/** Do'stlik o'zgarganda (boshqa qurilmada ham) callback chaqiriladi. */
export function subscribeFriendships(onChange: () => void): () => void {
  const channel = supabase
    .channel(`friendships-live-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friendships" },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
