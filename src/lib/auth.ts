/* ==========================================================================
   Akkount qatlami
   --------------------------------------------------------------------------
   Hozircha akkountlar shu qurilmada saqlanadi (localStorage) — Supabase
   ulanmaguncha. Parol ochiq holda saqlanmaydi: har bir akkount uchun alohida
   "salt" + SHA-256 hash ishlatiladi.

   Supabase ulanganda faqat shu fayl ichidagi funksiyalar almashtiriladi —
   ekranlar (AuthScreen) o'zgarmaydi.
   ========================================================================== */

import { normalizeNickname } from "./validation";

export type Gender = "male" | "female" | "other";

/** Bitta sevimli musiqa haqidagi ma'lumot (fayl IndexedDB'da saqlanadi). */
export interface SongMeta {
  name: string;
  type: string;
  size: number;
  /** Soniyalarda. */
  duration: number;
}

export interface Account {
  nickname: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: Gender;
  /** Profil rasmi — 512×512 JPEG data URL. */
  photo?: string | null;
  bio?: string;
  profession?: string;
  song?: SongMeta | null;
  salt: string;
  hash: string;
  /** Shu qurilmada qayta kirish uchun token. */
  token: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Session {
  nickname: string;
  firstName: string;
  photo?: string | null;
  token: string;
  expiresAt: number;
}

/** Profil maydonlari — Settings'dan yangilanadi. */
export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  age?: number;
  gender?: Gender;
  photo?: string | null;
  bio?: string;
  profession?: string;
  song?: SongMeta | null;
}

export interface DeviceAccount {
  nickname: string;
  firstName: string;
  lastUsedAt: number;
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

const ACCOUNTS_KEY = "fapp:accounts:v1";
const DEVICE_KEY = "fapp:device:v1";
const SESSION_KEY = "fapp:session:v1";

const SESSION_DAYS = 30;
const MAX_DEVICE_ACCOUNTS = 3;

/* --------------------------------------------------------------------------
   Storage yordamchilari
   -------------------------------------------------------------------------- */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — jim o'tamiz */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* jim o'tamiz */
  }
}

function readAccounts(): Account[] {
  const list = readJson<Account[]>(ACCOUNTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

function writeAccounts(accounts: Account[]): void {
  writeJson(ACCOUNTS_KEY, accounts);
}

function findAccount(nickname: string): Account | undefined {
  const normalized = normalizeNickname(nickname);
  return readAccounts().find((account) => account.nickname === normalized);
}

/* --------------------------------------------------------------------------
   Parol hashlash
   -------------------------------------------------------------------------- */

async function hashPassword(password: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/* --------------------------------------------------------------------------
   Sessiya va qurilma tarixi
   -------------------------------------------------------------------------- */

function startSession(account: Account): Session {
  const session: Session = {
    nickname: account.nickname,
    firstName: account.firstName,
    photo: account.photo ?? null,
    token: account.token,
    expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };

  writeJson(SESSION_KEY, session);
  rememberDevice(account);

  return session;
}

function rememberDevice(account: Account): void {
  const list = readDeviceList();
  const entry: DeviceAccount = {
    nickname: account.nickname,
    firstName: account.firstName,
    lastUsedAt: Date.now(),
  };

  const next = [entry, ...list.filter((item) => item.nickname !== account.nickname)].slice(
    0,
    MAX_DEVICE_ACCOUNTS,
  );

  writeJson(DEVICE_KEY, next);
}

function readDeviceList(): DeviceAccount[] {
  const list = readJson<DeviceAccount[]>(DEVICE_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Shu qurilmada avval kirilgan akkountlar (eng yangisi birinchi). */
export function listDeviceAccounts(): DeviceAccount[] {
  // Akkount o'chirilgan bo'lsa — ro'yxatdan ham olib tashlaymiz.
  return readDeviceList().filter((entry) => Boolean(findAccount(entry.nickname)));
}

export function getSession(): Session | null {
  const session = readJson<Session | null>(SESSION_KEY, null);
  if (!session) return null;

  const account = findAccount(session.nickname);
  if (!account || account.token !== session.token || session.expiresAt < Date.now()) {
    remove(SESSION_KEY);
    return null;
  }

  // Profil boshqa joyda yangilangan bo'lsa — sessiyani ham yangilaymiz.
  if (session.firstName !== account.firstName || session.photo !== (account.photo ?? null)) {
    const next: Session = {
      ...session,
      firstName: account.firstName,
      photo: account.photo ?? null,
    };
    writeJson(SESSION_KEY, next);
    return next;
  }

  return session;
}

/** Settings ekrani uchun to'liq akkount yozuvi. */
export function getAccount(nickname: string): Account | null {
  return findAccount(nickname) ?? null;
}

/**
 * Profil maydonlarini yangilaydi. Muvaffaqiyatli bo'lsa yangilangan sessiyani
 * qaytaradi (ism va rasm sarlavhada darhol ko'rinadi).
 */
export function updateProfile(nickname: string, patch: ProfilePatch): Session | null {
  const normalized = normalizeNickname(nickname);
  const accounts = readAccounts();
  const index = accounts.findIndex((account) => account.nickname === normalized);
  if (index < 0) return null;

  const account: Account = {
    ...accounts[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  accounts[index] = account;
  writeAccounts(accounts);

  // Qurilma tarixidagi ism ham yangilanadi.
  const deviceList = readDeviceList();
  if (deviceList.some((entry) => entry.nickname === normalized)) {
    writeJson(
      DEVICE_KEY,
      deviceList.map((entry) =>
        entry.nickname === normalized ? { ...entry, firstName: account.firstName } : entry,
      ),
    );
  }

  const session = readJson<Session | null>(SESSION_KEY, null);
  if (!session || session.nickname !== normalized) return null;

  const next: Session = {
    ...session,
    firstName: account.firstName,
    photo: account.photo ?? null,
  };

  writeJson(SESSION_KEY, next);
  return next;
}

export function logOut(): void {
  remove(SESSION_KEY);
}

/* --------------------------------------------------------------------------
   Ro'yxatdan o'tish / kirish
   -------------------------------------------------------------------------- */

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const nickname = normalizeNickname(input.nickname);

  if (findAccount(nickname)) {
    return { ok: false, error: "This nickname is already taken.", field: "nickname" };
  }

  const salt = crypto.randomUUID();
  const hash = await hashPassword(input.password, salt);

  const account: Account = {
    nickname,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    age: input.age,
    gender: input.gender,
    salt,
    hash,
    token: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  writeAccounts([...readAccounts(), account]);

  return { ok: true, session: startSession(account) };
}

export async function logIn(nickname: string, password: string): Promise<AuthResult> {
  const account = findAccount(nickname);

  if (!account) {
    return { ok: false, error: "Nickname or password is incorrect." };
  }

  const hash = await hashPassword(password, account.salt);
  if (hash !== account.hash) {
    return { ok: false, error: "Nickname or password is incorrect." };
  }

  return { ok: true, session: startSession(account) };
}

/** Saqlangan akkountni tanlash — parol kiritilmaydi, token bilan kiradi. */
export function logInWithDevice(nickname: string): AuthResult {
  const account = findAccount(nickname);

  if (!account) {
    return { ok: false, error: "This account is no longer available on this device." };
  }

  return { ok: true, session: startSession(account) };
}
