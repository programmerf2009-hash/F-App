import { useEffect, useMemo, useState } from "react";
import { BellRing, Eye, LoaderCircle, TrendingUp, Users } from "lucide-react";
import type { NewsChannel } from "./news-types";
import { formatCount, timeAgo } from "./news-types";
import { NewsSectionHead } from "./NewsChrome";
import {
  ANALYTICS_RANGES,
  loadChannelAnalytics,
  type AnalyticsRange,
  type ChannelAnalytics,
} from "./news-analytics";

function deltaLabel(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return "flat";
  return `${change > 0 ? "+" : ""}${change}%`;
}

export function NewsAnalyticsPanel({ channels }: { channels: NewsChannel[] }) {
  const [channelId, setChannelId] = useState<string>(channels[0]?.id ?? "");
  const [range, setRange] = useState<AnalyticsRange>(30);
  const [data, setData] = useState<ChannelAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the selection valid when the managed channel list changes.
  useEffect(() => {
    if (!channels.some((channel) => channel.id === channelId)) {
      setChannelId(channels[0]?.id ?? "");
    }
  }, [channels, channelId]);

  useEffect(() => {
    if (!channelId) return;
    let active = true;
    setLoading(true);
    setError(null);
    loadChannelAnalytics(channelId, range)
      .then((next) => {
        if (!active) return;
        setData(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Analytics could not load.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [channelId, range]);

  const series = useMemo(() => {
    if (!data?.since) return [] as { day: string; views: number }[];
    const byDay = new Map(data.views_by_day.map((point) => [point.day, point.views]));
    const start = new Date(`${data.since}T00:00:00Z`).getTime();
    return Array.from({ length: data.days }, (_, index) => {
      const day = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
      return { day, views: byDay.get(day) ?? 0 };
    });
  }, [data]);

  const peak = Math.max(1, ...series.map((point) => point.views));
  const delta = data ? deltaLabel(data.views_total, data.views_previous) : null;

  return (
    <section className="news-block news-analytics" aria-label="Channel performance">
      <NewsSectionHead
        eyebrow="Studio analytics"
        title="Performance"
        action={
          <div className="news-analytics__ranges" role="group" aria-label="Time range">
            {ANALYTICS_RANGES.map((value) => (
              <button
                key={value}
                type="button"
                className={`news-analytics__range${range === value ? " is-active" : ""}`}
                aria-pressed={range === value}
                onClick={() => setRange(value)}
              >
                {value}d
              </button>
            ))}
          </div>
        }
      />

      {channels.length > 1 ? (
        <div className="news-analytics__channels" role="group" aria-label="Channel">
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={`news-analytics__channel${
                channel.id === channelId ? " is-active" : ""
              }`}
              aria-pressed={channel.id === channelId}
              onClick={() => setChannelId(channel.id)}
            >
              {channel.name}
            </button>
          ))}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="news-analytics__state">
          <LoaderCircle size={15} strokeWidth={2.2} className="news-spin" />
          Loading the last {range} days
        </p>
      ) : error ? (
        <p className="news-analytics__state is-error" role="alert">
          {error}
        </p>
      ) : data ? (
        <>
          <div className="news-analytics__stats">
            <div className="news-analytics__stat">
              <span className="news-analytics__stat-icon">
                <Eye size={16} strokeWidth={2.1} />
              </span>
              <strong>{formatCount(data.views_total)}</strong>
              <span>Reads</span>
              {delta ? (
                <em className={data.views_total >= data.views_previous ? "is-up" : "is-down"}>
                  <TrendingUp size={11} strokeWidth={2.4} />
                  {delta} vs previous {data.days}d
                </em>
              ) : null}
            </div>

            <div className="news-analytics__stat">
              <span className="news-analytics__stat-icon">
                <Users size={16} strokeWidth={2.1} />
              </span>
              <strong>{formatCount(data.readers)}</strong>
              <span>Readers</span>
              <em>People who opened a story</em>
            </div>

            <div className="news-analytics__stat">
              <span className="news-analytics__stat-icon">
                <Users size={16} strokeWidth={2.1} />
              </span>
              <strong>{formatCount(data.followers)}</strong>
              <span>Subscribers</span>
              <em>{data.new_followers > 0 ? `+${data.new_followers} new` : "No change"}</em>
            </div>

            <div className="news-analytics__stat">
              <span className="news-analytics__stat-icon">
                <BellRing size={16} strokeWidth={2.1} />
              </span>
              <strong>{formatCount(data.push_delivered)}</strong>
              <span>Alerts delivered</span>
              <em>
                {data.push_deliveries === 0
                  ? "No breaking alerts yet"
                  : `${data.push_deliveries} alert${data.push_deliveries === 1 ? "" : "s"}`}
              </em>
            </div>
          </div>

          <div className="news-analytics__chart" role="img" aria-label="Daily reads">
            {series.map((point) => (
              <span
                key={point.day}
                className="news-analytics__bar"
                style={{ height: `${Math.max(4, Math.round((point.views / peak) * 100))}%` }}
                title={`${point.day}: ${point.views} reads`}
              />
            ))}
          </div>
          <p className="news-analytics__chart-note">
            <span>{series[0]?.day ?? ""}</span>
            <span>Daily reads</span>
            <span>{series[series.length - 1]?.day ?? ""}</span>
          </p>

          <div className="news-analytics__lists">
            <div className="news-analytics__list">
              <h3>Top articles</h3>
              {data.top_articles.length === 0 ? (
                <p className="news-analytics__empty">No reads in this window.</p>
              ) : (
                data.top_articles.map((item) => (
                  <div className="news-analytics__row" key={item.id}>
                    <span>{item.title}</span>
                    <strong>{formatCount(item.views)}</strong>
                  </div>
                ))
              )}
            </div>

            <div className="news-analytics__list">
              <h3>Breaking alerts</h3>
              {data.recent_push.length === 0 ? (
                <p className="news-analytics__empty">Alerts sent from Studio appear here.</p>
              ) : (
                data.recent_push.map((item) => (
                  <div className="news-analytics__row" key={item.id}>
                    <span>
                      {item.title || "Breaking alert"}
                      <em>
                        {timeAgo(
                          Math.max(
                            0,
                            Math.round((Date.now() - new Date(item.created_at).getTime()) / 60_000),
                          ),
                        )}
                      </em>
                    </span>
                    <strong>
                      {formatCount(item.delivered)}/{formatCount(item.recipients)}
                    </strong>
                  </div>
                ))
              )}
            </div>

            <div className="news-analytics__list">
              <h3>Top Shorts</h3>
              {data.top_shorts.length === 0 ? (
                <p className="news-analytics__empty">No Shorts reads in this window.</p>
              ) : (
                data.top_shorts.map((item) => (
                  <div className="news-analytics__row" key={item.id}>
                    <span>{item.title}</span>
                    <strong>{formatCount(item.views)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
