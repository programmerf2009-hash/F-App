/* ==========================================================================
   Sevimli musiqa fayli — localStorage'ga sig'maydi, shuning uchun IndexedDB.
   Akkountda faqat meta (nom, tur, hajm, davomiylik) saqlanadi.
   ========================================================================== */

export const MAX_SONG_BYTES = 12 * 1024 * 1024;

const DB_NAME = "fapp-media";
const DB_VERSION = 1;
const STORE = "songs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Storage is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open storage."));
  });
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Storage error."));
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Storage error."));
        };
      }),
  );
}

export function saveSong(nickname: string, blob: Blob): Promise<void> {
  return run("readwrite", (store) => store.put(blob, nickname)).then(() => undefined);
}

export function loadSong(nickname: string): Promise<Blob | null> {
  return run<Blob | undefined>("readonly", (store) => store.get(nickname)).then(
    (blob) => blob ?? null,
  );
}

export function removeSong(nickname: string): Promise<void> {
  return run("readwrite", (store) => store.delete(nickname)).then(() => undefined);
}

/** Audio davomiyligini o'qiydi (soniyalarda); o'qib bo'lmasa 0. */
export function readAudioDuration(url: string): Promise<number> {
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
      // Ba'zi brauzerlar cheksizlik qaytaradi — qayta urinamiz.
      if (Number.isFinite(audio.duration)) {
        finish(audio.duration);
      }
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish(0);
    };

    audio.src = url;
  });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}
