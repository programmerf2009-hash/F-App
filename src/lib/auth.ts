/* ==========================================================================
   Akkount qatlami — Supabase Auth + profiles
   --------------------------------------------------------------------------
   Foydalanuvchi uchun kirish oynasi o'zgarmaydi: nickname + parol.
   Ichkarida Supabase email sifatida `<nickname>@fapp.app` ishlatiladi
   (email tasdiqlash o'chirilgan bo'lishi kerak).
   ========================================================================== */

import { fileToAvatar } from "./image";
import { MAX_SONG_BYTES } from "./song-store";
import { supabase, supabaseConfigured } from "./supabase";
import { normalizeNickname } from "./validation";

export type Gender = "male" | "female" | "other";

/** Bitta sevimli musiqa haqidagi ma'lumot (fayl Supabase Storage'da). */
export interface SongMeta {
  name: string;
  type: string;
  size: number;
  /** Soniyalarda. */
  duration: number;
  /** Storage'dagi to'liq yo'l: songs/<userId>/<file>. */
  path: string;
}

/** Ilova bo'ylab ishlatiladigan profil snapshot'i. */
export interface Session {
  id: string;
  nickname: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: Gender;
  /** Public avatar URL yoki null. */
  photo: string | null;
  bio: string;
  profession: string;
  song: SongMeta | null;
  createdAt: string;
}

/** Settings'dan yangilanadigan matn maydonlari. */
export interface ProfilePatch {
  firstName: string;
  lastName: string;
  age: number;
  gender: Gender;
  bio: string;
  profession: string;
}

export interface SignUpInput {
  firstName: string;
  lastName: string;
  age: number;
  gender: Gender;
  nickname: string;
  password: string;
}

export type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; error: string; field?: "nickname" | "password" };

interface ProfileRow {
  id: string;
  nickname: string;
  first_name: string;
  last_name: string;
  age: number;
  gender: Gender;
  avatar_path: string | null;
  bio: string;
  profession: string;
  song_path: string | null;
  song_name: string | null;
  song_type: string | null;
  song_size: number | null;
  song_duration: number | null;
  created_at: string;
}

const EMAIL_DOMAIN = "fapp.app";
const AVATAR_BUCKET = "avatars";
const MEDIA_BUCKET = "media";
const SIGNED_URL_TTL = 60 * 60;

function emailFor(nickname: string): string {
  return `${nickname}@${EMAIL_DOMAIN}`;
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function mapAuthError(message: string): { error: string; field?: "nickname" | "password" } {
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return { error: "Nickname or password is incorrect." };
  }
  if (lower.includes("email not confirmed")) {
    return {
      error:
        "Email confirmation is still enabled in Supabase. Turn it off in Authentication → Sign In / Providers → Email.",
    };
  }
  if (lower.includes("already registered") || lower.includes("database error saving new user")) {
    return { error: "This nickname is already taken.", field: "nickname" };
  }
  if (lower.includes("signups not allowed")) {
    return { error: "Sign-ups are disabled in Supabase Auth settings." };
  }
  if (lower.includes("password")) {
    return { error: message, field: "password" };
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return { error: "Could not connect to the server. Check your connection and try again." };
  }
  return { error: "Something went wrong. Try again." };
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

function toSession(row: ProfileRow): Session {
  return {
    id: row.id,
    nickname: row.nickname,
    firstName: row.first_name,
    lastName: row.last_name,
    age: row.age,
    gender: row.gender,
    photo: avatarUrl(row.avatar_path),
    bio: row.bio ?? "",
    profession: row.profession ?? "",
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
  };
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (error) throw new Error(error.message);
  return data ?? null;
}

async function currentUser(): Promise<{ id: string }> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You are not signed in.");
  return data.user;
}

/** Saqlangan Supabase sessiyasini profil bilan birga tiklaydi. */
export async function getSession(): Promise<Session | null> {
  if (!supabaseConfigured) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;

  const profile = await fetchProfile(data.session.user.id);
  return profile ? toSession(profile) : null;
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  if (!supabaseConfigured) {
    return { ok: false, error: "Backend is not configured. Add VITE_SUPABASE_URL and the anon key." };
  }

  const nickname = normalizeNickname(input.nickname);

  try {
    const { data: available, error: checkError } = await supabase.rpc("nickname_available", {
      p_nickname: nickname,
    });

    if (checkError) {
      return { ok: false, error: errorText(checkError, "Could not check this nickname.") };
    }
    if (available === false) {
      return { ok: false, error: "This nickname is already taken.", field: "nickname" };
    }

    const { data, error } = await supabase.auth.signUp({
      email: emailFor(nickname),
      password: input.password,
      options: {
        data: {
          nickname,
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          age: input.age,
          gender: input.gender,
        },
      },
    });

    if (error) return { ok: false, ...mapAuthError(error.message) };

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { ok: false, error: "This nickname is already taken.", field: "nickname" };
    }

    if (!data.session || !data.user) {
      return {
        ok: false,
        error:
          "Email confirmation is enabled for this project. Turn it off in Authentication → Sign In / Providers → Email.",
      };
    }

    const profile = await fetchProfile(data.user.id);
    if (!profile) {
      return { ok: false, error: "Account created, but its profile is missing. Try logging in." };
    }

    return { ok: true, session: toSession(profile) };
  } catch (error) {
    return { ok: false, error: errorText(error, "Could not create the account.") };
  }
}

export async function logIn(nickname: string, password: string): Promise<AuthResult> {
  if (!supabaseConfigured) {
    return { ok: false, error: "Backend is not configured. Add VITE_SUPABASE_URL and the anon key." };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailFor(normalizeNickname(nickname)),
      password,
    });

    if (error) return { ok: false, ...mapAuthError(error.message) };

    const profile = await fetchProfile(data.user.id);
    if (!profile) {
      return { ok: false, error: "This account has no profile. Contact the app owner." };
    }

    return { ok: true, session: toSession(profile) };
  } catch (error) {
    return { ok: false, error: errorText(error, "Could not sign in.") };
  }
}

export async function logOut(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* lokal sessiya baribir tozalanadi */
  }
}

export async function updateProfile(patch: ProfilePatch): Promise<Session> {
  const user = await currentUser();

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: patch.firstName.trim(),
      last_name: patch.lastName.trim(),
      age: patch.age,
      gender: patch.gender,
      bio: patch.bio.trim(),
      profession: patch.profession.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  const profile = await fetchProfile(user.id);
  if (!profile) throw new Error("Profile not found.");
  return toSession(profile);
}

/** Rasmni 512×512 JPEG qilib yuklaydi va profilni yangilaydi. */
export async function uploadAvatar(file: File): Promise<Session> {
  const dataUrl = await fileToAvatar(file);
  const blob = await (await fetch(dataUrl)).blob();
  const user = await currentUser();
  const old = await fetchProfile(user.id);

  const path = `${user.id}/avatar-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });

  if (uploadError) throw new Error(uploadError.message);

  const { error: dbError } = await supabase
    .from("profiles")
    .update({ avatar_path: path, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (dbError) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    throw new Error(dbError.message);
  }

  if (old?.avatar_path && old.avatar_path !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([old.avatar_path]);
  }

  const profile = await fetchProfile(user.id);
  if (!profile) throw new Error("Profile not found.");
  return toSession(profile);
}

function fileExtension(file: File): string {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext.slice(0, 5) || "mp3";
}

/** Bitta sevimli qo'shiqni yuklaydi va profilni yangilaydi. */
export async function uploadSong(file: File): Promise<Session> {
  if (!file.type.startsWith("audio/")) {
    throw new Error("Choose an audio file (MP3, M4A, WAV).");
  }
  if (file.size > MAX_SONG_BYTES) {
    throw new Error("Audio is larger than 12 MB.");
  }

  const user = await currentUser();
  const old = await fetchProfile(user.id);

  const name = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "Favorite song";
  const path = `songs/${user.id}/song-${Date.now()}.${fileExtension(file)}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type || "audio/mpeg",
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadError) throw new Error(uploadError.message);

  // Davomiylikni yuklashdan oldin o'qiymiz — fayl hajmi katta bo'lsa ham
  // brauzer metadata'ni tez beradi.
  const objectUrl = URL.createObjectURL(file);
  const duration = await readAudioDuration(objectUrl);
  URL.revokeObjectURL(objectUrl);

  const { error: dbError } = await supabase
    .from("profiles")
    .update({
      song_path: path,
      song_name: name,
      song_type: file.type || "audio/mpeg",
      song_size: file.size,
      song_duration: duration,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (dbError) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    throw new Error(dbError.message);
  }

  if (old?.song_path && old.song_path !== path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([old.song_path]);
  }

  const profile = await fetchProfile(user.id);
  if (!profile) throw new Error("Profile not found.");
  return toSession(profile);
}

export async function removeFavoriteSong(): Promise<Session> {
  const user = await currentUser();
  const old = await fetchProfile(user.id);

  const { error } = await supabase
    .from("profiles")
    .update({
      song_path: null,
      song_name: null,
      song_type: null,
      song_size: null,
      song_duration: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  // Faylni DB yangilangandan keyin o'chiramiz: DB xato bersa profil
  // mavjud bo'lmagan faylga ishora qilib qolmasin.
  if (old?.song_path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([old.song_path]);
  }

  const profile = await fetchProfile(user.id);
  if (!profile) throw new Error("Profile not found.");
  return toSession(profile);
}

export async function getSongSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Audio davomiyligini o'qiydi (soniyalarda); o'qib bo'lmasa 0. */
function readAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    let settled = false;

    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute("src");
      audio.load();
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };

    const timer = window.setTimeout(() => finish(0), 8000);
    audio.preload = "metadata";

    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      if (Number.isFinite(audio.duration)) finish(audio.duration);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish(0);
    };

    audio.src = url;
  });
}
