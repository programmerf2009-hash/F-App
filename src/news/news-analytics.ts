/* ==========================================================================
   News analytics
   --------------------------------------------------------------------------
   Studio performance numbers are aggregated by the `news_channel_analytics`
   security-definer RPC, so the browser never downloads raw view rows. The
   `news_log_push_delivery` RPC records what each breaking alert delivered.
   ========================================================================== */

import { supabase, supabaseConfigured } from "../lib/supabase";

export interface AnalyticsDay {
  day: string;
  views: number;
}

export interface AnalyticsTopItem {
  id: string;
  title: string;
  views: number;
  published_at: string | null;
}

export interface AnalyticsPushRow {
  id: string;
  title: string | null;
  recipients: number;
  delivered: number;
  removed: number;
  created_at: string;
}

export interface ChannelAnalytics {
  days: number;
  since: string;
  views_total: number;
  views_previous: number;
  readers: number;
  followers: number;
  new_followers: number;
  views_by_day: AnalyticsDay[];
  top_articles: AnalyticsTopItem[];
  top_shorts: AnalyticsTopItem[];
  push_deliveries: number;
  push_delivered: number;
  recent_push: AnalyticsPushRow[];
}

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Loads aggregated performance for one channel over the chosen window. */
export async function loadChannelAnalytics(
  channelId: string,
  days: AnalyticsRange,
): Promise<ChannelAnalytics> {
  if (!supabaseConfigured) {
    throw new Error("Analytics is available in the live edition.");
  }

  const { data, error } = await supabase.rpc("news_channel_analytics", {
    p_channel_id: channelId,
    p_days: days,
  });
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as Partial<ChannelAnalytics>;
  return {
    days: Number(payload.days ?? days),
    since: String(payload.since ?? ""),
    views_total: Number(payload.views_total ?? 0),
    views_previous: Number(payload.views_previous ?? 0),
    readers: Number(payload.readers ?? 0),
    followers: Number(payload.followers ?? 0),
    new_followers: Number(payload.new_followers ?? 0),
    views_by_day: Array.isArray(payload.views_by_day) ? payload.views_by_day : [],
    top_articles: Array.isArray(payload.top_articles) ? payload.top_articles : [],
    top_shorts: Array.isArray(payload.top_shorts) ? payload.top_shorts : [],
    push_deliveries: Number(payload.push_deliveries ?? 0),
    push_delivered: Number(payload.push_delivered ?? 0),
    recent_push: Array.isArray(payload.recent_push) ? payload.recent_push : [],
  };
}

/**
 * Records the outcome of one breaking alert. Best-effort: the alert has
 * already been delivered, so a logging failure must stay silent.
 */
export async function logPushDelivery(input: {
  channelId: string;
  title: string;
  recipients: number;
  delivered: number;
  removed: number;
}): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    await supabase.rpc("news_log_push_delivery", {
      p_channel_id: input.channelId,
      p_title: input.title,
      p_recipients: Math.max(0, Math.round(input.recipients)),
      p_delivered: Math.max(0, Math.round(input.delivered)),
      p_removed: Math.max(0, Math.round(input.removed)),
    });
  } catch {
    // The delivery log is telemetry, never a publishing dependency.
  }
}
