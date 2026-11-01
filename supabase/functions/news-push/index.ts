/* ==========================================================================
   news-push Edge Function
   --------------------------------------------------------------------------
   Sends a breaking-news Web Push to the followers of one channel.

   POST /functions/v1/news-push
   Authorization: Bearer <user access token>
   Body: { "channelId": "<uuid>", "title": "...", "url": "index.html#..." }

   The caller must be a news admin or the channel owner. VAPID secrets come
   from the function environment:
     VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
   ========================================================================== */

import { createClient } from "jsr:@supabase/supabase-js@2";
// npm:web-push is Deno-compatible and handles VAPID signing and payload
// encryption for both Chrome and Firefox push services.
import webpush from "npm:web-push@3.6.7";

interface SendRequest {
  channelId: string;
  title: string;
  body?: string;
  url?: string;
  broadcast?: boolean;
}

interface PushRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
    const vapid = Deno.env.toObject();
    const privateKey = vapid["VAPID_PRIVATE_KEY"];
    const publicKey = vapid["VAPID_PUBLIC_KEY"];
    const subject = vapid["VAPID_SUBJECT"] || "mailto:admin@fapp.app";

    if (!privateKey || !publicKey) {
      return json({ error: "VAPID secrets are not configured." }, 500);
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Identify the caller.
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      return json({ error: "Missing authorization token." }, 401);
    }
    const { data: userData, error: userError } = await service.auth.getUser(token);
    if (userError || !userData?.user) {
      return json({ error: "Invalid authorization token." }, 401);
    }
    const callerId = userData.user.id;

    const payload: SendRequest = await request.json().catch(() => ({}) as SendRequest);
    if (!payload?.channelId || !payload?.title) {
      return json({ error: "channelId and title are required." }, 400);
    }

    // 2. Authorize: news admin or channel owner.
    const trimmed = (payload.channelId || "").trim();
    // "all" is reserved for admin broadcasts; otherwise channelId is a channel.
    const isFollowersSend = trimmed !== "all";

    const { data: adminRow } = await service
      .from("news_admins")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();

    let channel: { id: string; name: string } | null = null;
    let authorized = Boolean(adminRow);

    if (isFollowersSend) {
      const { data: channelRow, error: channelError } = await service
        .from("news_channels")
        .select("id, name, owner_id")
        .eq("id", trimmed)
        .maybeSingle();
      if (channelError || !channelRow) {
        return json({ error: "Channel not found." }, 404);
      }
      if (channelRow.owner_id === callerId) authorized = true;
      channel = { id: channelRow.id, name: channelRow.name };
    } else if (!authorized) {
      return json({ error: "Only news admins can broadcast." }, 403);
    }

    if (!authorized) {
      return json({ error: "Not authorized to send for this channel." }, 403);
    }

    // 3. Resolve recipients: followers of the channel (or everyone for a broadcast).
    let userIds: string[];

    if (isFollowersSend) {
      const { data, error } = await service
        .from("news_subscriptions")
        .select("subscriber_id")
        .eq("channel_id", trimmed);
      if (error) return json({ error: "Could not load followers." }, 500);
      userIds = (data || []).map((row: { subscriber_id: string }) => row.subscriber_id);
    } else {
      const { data, error } = await service
        .from("news_push_subscriptions")
        .select("user_id");
      if (error) return json({ error: "Could not load subscribers." }, 500);
      userIds = [...new Set((data || []).map((row: { user_id: string }) => row.user_id))];
    }

    // 4. Respect the reader preference: breaking alerts may be opted out.
    const alertState = new Map<string, boolean>();
    if (userIds.length > 0) {
      const { data: prefRows, error: prefError } = await service
        .from("news_preferences")
        .select("user_id, breaking_alerts")
        .in("user_id", userIds);
      if (prefError) return json({ error: "Could not load preferences." }, 500);
      for (const row of prefRows || []) {
        alertState.set(row.user_id, row.breaking_alerts !== false);
      }
    }
    const recipients = userIds.filter((id) => alertState.get(id) !== false);

    if (recipients.length === 0) {
      return json({ ok: true, sent: 0, removed: 0 });
    }

    // 5. Collect push endpoints for those readers.
    const { data: pushRows, error: pushError } = await service
      .from("news_push_subscriptions")
      .select("endpoint, p256dh, auth, user_id")
      .in("user_id", recipients);
    if (pushError) return json({ error: "Could not load push subscriptions." }, 500);

    const notification = {
      title: payload.title,
      body: payload.body || (channel?.name ? `${channel.name} published an urgent update.` : "New news is ready."),
      url: payload.url || "index.html",
      icon: "brand/fapplogo2.png",
      tag: payload.broadcast ? "fapp-broadcast" : "fapp-breaking",
      renotify: true,
    };

    let sent = 0;
    let removed = 0;

    await Promise.allSettled(
      (pushRows || []).map(async (row: PushRow) => {
        const subscription = {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        };
        try {
          await webpush.sendNotification(
            subscription,
            JSON.stringify(notification),
            { TTL: 3600 },
          );
          sent += 1;
        } catch (sendError) {
          const statusCode = sendError?.statusCode ?? 0;
          // Gone/expired endpoints are dropped so we do not retry them forever.
          if (statusCode === 404 || statusCode === 410) {
            removed += 1;
            await service.from("news_push_subscriptions").delete().eq("endpoint", row.endpoint);
          }
        }
      }),
    );

    return json({ ok: true, recipients: recipients.length, sent, removed });
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
