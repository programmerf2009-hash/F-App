/* ==========================================================================
   News push notifications
   --------------------------------------------------------------------------
   Web Push for breaking alerts and follows. The service worker lives in
   public/sw.js; the sending side is the `news-push` Supabase Edge Function.
   ========================================================================== */

import type { Session } from "../lib/auth";
import { supabase, supabaseConfigured } from "../lib/supabase";

/** Public application server key. The matching private key stays a server secret. */
const VAPID_PUBLIC_KEY =
  "BOweLJkvpr9lNgu3f_9QZCSx08n38CVEFknzJvSjI556BQK1TsqPtJU_p6YmmFFxEGfIDWK4-F_2mDTQMJF73eY";

const SW_PATH = `${import.meta.env.BASE_URL}sw.js`;

export type PushStatus = "unsupported" | "denied" | "off" | "on";

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Registers the service worker once per browsing session. */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    return null;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (!registration) return null;
    return (await registration.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

function statusFromPermission(permission: NotificationPermission): PushStatus {
  if (permission === "denied") return "denied";
  if (permission === "granted") return "on";
  return "off";
}

/**
 * Best-effort current state for the Settings card. Never throws: an
 * unregistered worker or a missing database row is not a fatal state.
 */
export async function newsPushStatus(): Promise<{ status: PushStatus; subscribed: boolean }> {
  if (!pushSupported() || !supabaseConfigured) {
    return { status: "unsupported", subscribed: false };
  }
  const permission = Notification.permission;
  const subscription = await currentSubscription();
  return {
    status: subscription ? "on" : statusFromPermission(permission),
    subscribed: Boolean(subscription),
  };
}

/** Asks the reader for permission, subscribes and stores the endpoint. */
export async function enableNewsPush(session: Session): Promise<
  { ok: true; status: PushStatus } | { ok: false; error: string }
> {
  if (!pushSupported()) {
    return { ok: false, error: "This browser cannot receive push notifications." };
  }
  if (!supabaseConfigured) {
    return { ok: false, error: "Push works only in the live edition." };
  }

  // Ask for permission first: browsers require a live user gesture, and the
  // service-worker registration await below would consume it.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notification permission was not granted." };
  }

  const registration = await ensureServiceWorker();
  if (!registration) {
    return { ok: false, error: "The notification service could not start." };
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    }));

  const keys = subscription.toJSON().keys as Record<string, string> | undefined;
  if (!keys?.p256dh || !keys.auth) {
    return { ok: false, error: "The browser returned an incomplete subscription." };
  }

  const { error } = await supabase.from("news_push_subscriptions").upsert(
    {
      endpoint: subscription.endpoint,
      user_id: session.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return { ok: false, error: "Push could not be saved on the server." };
  }

  return { ok: true, status: "on" };
}

/** Removes the endpoint from the browser and the database. */
export async function disableNewsPush(): Promise<
  { ok: true; status: PushStatus } | { ok: false; error: string }
> {
  const subscription = await currentSubscription();
  if (subscription) {
    if (supabaseConfigured) {
      await supabase.from("news_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    }
    await subscription.unsubscribe().catch(() => undefined);
  }
  return { ok: true, status: "off" };
}

/**
 * Asks the `news-push` Edge Function to deliver a breaking alert for one
 * channel. Publishing must never fail because push delivery failed, so this
 * helper swallows transport errors and simply reports success/failure.
 */
export async function sendBreakingPush(input: {
  channelId: string;
  title: string;
  body?: string;
  url?: string;
}): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    const { error } = await supabase.functions.invoke("news-push", { body: input });
    return !error;
  } catch {
    return false;
  }
}
