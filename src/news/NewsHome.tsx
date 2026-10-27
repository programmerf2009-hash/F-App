import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  CloudSun,
  LoaderCircle,
  MapPin,
  Newspaper,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from "lucide-react";
import { Sheet } from "../components/Sheet";
import { describeWeather, type WeatherNow } from "../lib/weather";
import type { Session } from "../lib/auth";
import {
  loadArticleFeedPage,
  newsErrorMessage,
  type ArticleCursor,
} from "./news-api";
import { ArticleCard, ChannelAvatar, FlashRow, FollowButton, WeatherGlyph } from "./NewsChrome";
import {
  DEFAULT_FEED_FILTERS,
  FEED_CATEGORIES,
  NEWS_CATEGORIES,
  formatCount,
  temperature,
  temperatureUnit,
  timeAgo,
  type FeedFilters,
  type FeedScope,
  type NewsArticle,
  type NewsCategory,
  type NewsChannel,
  type NewsFlash,
  type NewsPrefs,
} from "./news-types";

interface Props {
  session: Session;
  channels: NewsChannel[];
  articles: NewsArticle[];
  flashes: NewsFlash[];
  followed: string[];
  prefs: NewsPrefs;
  weather: WeatherNow | null;
  weatherStatus: "loading" | "ready" | "error";
  live: boolean;
  loading: boolean;
  /** Bumped after publishing so the live edition fetches a fresh first page. */
  refreshKey: number;
  onArticlesLoaded: (articles: NewsArticle[], channels: NewsChannel[]) => void;
  onOpenArticle: (articleId: string) => void;
  onOpenFlash: (flashId: string) => void;
  onOpenChannel: (channelId: string) => void;
  onToggleFollow: (channelId: string) => void;
  onOpenWeather: () => void;
  onOpenSearch: () => void;
  onOpenStudio: () => void;
}

const SCOPES: Array<{ id: FeedScope; label: string }> = [
  { id: "foryou", label: "For you" },
  { id: "following", label: "Following" },
  { id: "local", label: "Local" },
];

export function NewsHome({
  session,
  channels,
  articles,
  flashes,
  followed,
  prefs,
  weather,
  weatherStatus,
  live,
  loading,
  refreshKey,
  onArticlesLoaded,
  onOpenArticle,
  onOpenFlash,
  onOpenChannel,
  onToggleFollow,
  onOpenWeather,
  onOpenSearch,
  onOpenStudio,
}: Props) {
  const [scope, setScope] = useState<FeedScope>("foryou");
  const [activeCategory, setActiveCategory] = useState<NewsCategory | "All">("All");
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FEED_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [serverArticles, setServerArticles] = useState<NewsArticle[] | null>(null);
  const [serverNext, setServerNext] = useState<ArticleCursor | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverLoadingMore, setServerLoadingMore] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const feedRequest = useRef(0);

  const channelById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel])),
    [channels],
  );

  const localArticles = useMemo(() => {
    return articles
      .filter((article) => {
        if (scope === "following" && !followed.includes(article.channelId)) return false;
        if (
          scope === "local" &&
          article.region !== prefs.placeName &&
          article.category !== "Local"
        ) {
          return false;
        }

        if (activeCategory !== "All" && article.category !== activeCategory) return false;
        if (filters.categories.length > 0 && !filters.categories.includes(article.category)) {
          return false;
        }
        if (filters.time === "24h" && article.minutesAgo > 60 * 24) return false;
        if (filters.time === "week" && article.minutesAgo > 60 * 24 * 7) return false;

        return true;
      })
      .sort((a, b) => a.minutesAgo - b.minutesAgo);
  }, [activeCategory, articles, filters, followed, prefs.placeName, scope]);

  const visibleFlashes = useMemo(() => {
    return flashes
      .filter((flash) => {
        if (scope === "following" && !followed.includes(flash.channelId)) return false;
        if (scope === "local" && flash.category !== "Local") return false;
        if (activeCategory !== "All" && flash.category !== activeCategory) return false;
        if (filters.categories.length > 0 && !filters.categories.includes(flash.category)) {
          return false;
        }
        if (filters.time === "24h" && flash.minutesAgo > 60 * 24) return false;
        return true;
      })
      .sort((a, b) => a.minutesAgo - b.minutesAgo);
  }, [activeCategory, filters, flashes, followed, scope]);

  const categoryKey = filters.categories.join("|");

  const feedOptions = (cursor: ArticleCursor | null = null) => ({
    scope,
    category: activeCategory === "All" ? null : activeCategory,
    categories: filters.categories.length ? filters.categories : null,
    region: prefs.placeName,
    since:
      filters.time === "24h"
        ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        : filters.time === "week"
          ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          : null,
    cursor,
    limit: 20,
  });

  useEffect(() => {
    if (!live) {
      setServerArticles(null);
      setServerNext(null);
      setServerError(null);
      setServerLoading(false);
      return;
    }

    if (filters.content === "flashes") {
      setServerArticles(null);
      setServerNext(null);
      setServerError(null);
      setServerLoading(false);
      return;
    }

    const requestId = ++feedRequest.current;
    setServerLoading(true);
    setServerError(null);
    setServerArticles(null);
    setServerNext(null);

    loadArticleFeedPage(session, feedOptions())
      .then((page) => {
        if (feedRequest.current !== requestId) return;
        setServerArticles(page.articles);
        setServerNext(page.next);
        onArticlesLoaded(page.articles, page.channels);
      })
      .catch((error: unknown) => {
        if (feedRequest.current !== requestId) return;
        setServerError(newsErrorMessage(error, "Could not load the live edition."));
      })
      .finally(() => {
        if (feedRequest.current !== requestId) return;
        setServerLoading(false);
      });
    // feedOptions is intentionally derived from the dependencies below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeCategory,
    categoryKey,
    filters.content,
    filters.time,
    live,
    onArticlesLoaded,
    prefs.placeName,
    refreshKey,
    retryCount,
    scope,
    session.id,
  ]);

  const loadMoreArticles = async () => {
    if (!live || !serverNext || serverLoadingMore) return;

    const requestId = feedRequest.current;
    setServerLoadingMore(true);
    setServerError(null);

    try {
      const page = await loadArticleFeedPage(session, feedOptions(serverNext));
      if (feedRequest.current !== requestId) return;

      setServerArticles((previous) => {
        const seen = new Set((previous ?? []).map((article) => article.id));
        return [...(previous ?? []), ...page.articles.filter((article) => !seen.has(article.id))];
      });
      setServerNext(page.next);
      onArticlesLoaded(page.articles, page.channels);
    } catch (error) {
      if (feedRequest.current !== requestId) return;
      setServerError(newsErrorMessage(error, "Could not load more stories."));
    } finally {
      setServerLoadingMore(false);
    }
  };

  const serverMode = live && filters.content !== "flashes";
  const visibleArticles = serverMode ? (serverArticles ?? []) : localArticles;

  const featuredFlash = visibleFlashes[0] ?? null;
  const lead = visibleArticles[0] ?? null;
  const rest = visibleArticles.slice(1);

  const followedChannels = useMemo(
    () => channels.filter((channel) => followed.includes(channel.id)),
    [channels, followed],
  );

  const discoverChannels = useMemo(
    () =>
      channels
        .filter((channel) => !followed.includes(channel.id))
        .sort((a, b) => b.subscribers - a.subscribers)
        .slice(0, 8),
    [channels, followed],
  );

  const activeFilterCount =
    filters.categories.length + (filters.content !== "all" ? 1 : 0) + (filters.time !== "any" ? 1 : 0);

  const condition = weather ? describeWeather(weather.code).label : "Weather";
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <main className="news-main news-home">
      <div className="news-shell">
        <section className="news-home__intro" aria-labelledby="news-greeting">
          <div className="news-home__greeting">
            <p className="news-kicker">
              {dateLabel} · {loading ? "Loading edition" : live ? "Live edition" : "Preview edition"}
            </p>
            <h1 id="news-greeting">
              Good morning,
              <br />
              {session.firstName}.
            </h1>
            <p className="news-home__lede">
              A clear read on Uzbekistan and the world, built for the day ahead.
            </p>
          </div>

          <button
            type="button"
            className="news-weather-pill"
            onClick={onOpenWeather}
            aria-label={`Open weather for ${prefs.placeName}`}
          >
            <span className="news-weather-pill__icon">
              {weatherStatus === "ready" && weather ? (
                <WeatherGlyph code={weather.code} isDay={weather.isDay} size={25} />
              ) : (
                <CloudSun size={25} strokeWidth={1.7} />
              )}
            </span>
            <span className="news-weather-pill__copy">
              <span className="news-weather-pill__temp">
                {weatherStatus === "ready" && weather
                  ? temperature(weather.temp, prefs.units)
                  : "—"}
                <small>{temperatureUnit(prefs.units)}</small>
              </span>
              <span className="news-weather-pill__place">
                {prefs.placeName}
                <span>{condition}</span>
              </span>
            </span>
            <ChevronRight size={15} strokeWidth={2.2} className="news-weather-pill__chevron" />
          </button>
        </section>

        <div className="news-scope-row">
          <div className="news-scope-tabs" role="tablist" aria-label="Feed scope">
            {SCOPES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={scope === item.id}
                className={`news-scope${scope === item.id ? " is-active" : ""}`}
                onClick={() => setScope(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`news-filter-trigger${activeFilterCount > 0 ? " is-active" : ""}`}
            onClick={() => setFiltersOpen(true)}
            aria-label="Tune your feed"
          >
            <SlidersHorizontal size={16} strokeWidth={2.2} />
            {activeFilterCount > 0 ? <span>{activeFilterCount}</span> : null}
          </button>
        </div>

        <div className="news-category-scroll" aria-label="News categories">
          <button
            type="button"
            className={`news-category-chip${activeCategory === "All" ? " is-active" : ""}`}
            onClick={() => setActiveCategory("All")}
          >
            All
          </button>
          {NEWS_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`news-category-chip${activeCategory === category ? " is-active" : ""}`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        {featuredFlash && filters.content !== "articles" ? (
          <section className="news-flash-hero-wrap" aria-labelledby="flash-title">
            <div className="news-section-head news-section-head--inline">
              <div>
                <p className="news-section-head__eyebrow">
                  <span className="news-live-dot" aria-hidden="true" />
                  Flash desk
                </p>
                <h2 className="news-section-head__title" id="flash-title">
                  The story, in motion
                </h2>
              </div>
              <span className="news-section-head__note">24h · video first</span>
            </div>

            <button
              type="button"
              className="news-flash-hero"
              onClick={() => onOpenFlash(featuredFlash.id)}
              aria-label={`Play flash: ${featuredFlash.title}`}
            >
              <img src={featuredFlash.poster} alt="" />
              <span className="news-flash-hero__shade" aria-hidden="true" />
              <span className="news-flash-hero__top">
                <span className="news-flash-hero__badge">
                  <span className="news-live-dot" aria-hidden="true" />
                  Video flash
                </span>
                <span className="news-flash-hero__duration">{featuredFlash.duration}</span>
              </span>
              <span className="news-flash-hero__play" aria-hidden="true">
                <span />
              </span>
              <span className="news-flash-hero__bottom">
                <span className="news-flash-hero__title">{featuredFlash.title}</span>
                <span className="news-flash-hero__meta">
                  {channelById.get(featuredFlash.channelId)?.name}
                  <span>·</span>
                  {timeAgo(featuredFlash.minutesAgo)}
                  <span>·</span>
                  {formatCount(featuredFlash.views)} views
                </span>
              </span>
            </button>
          </section>
        ) : null}

        {filters.content === "flashes" ? (
          <section className="news-block" aria-labelledby="all-flashes">
            <div className="news-section-head">
              <div>
                <p className="news-section-head__eyebrow">Video-only updates</p>
                <h2 className="news-section-head__title" id="all-flashes">
                  Latest flashes
                </h2>
              </div>
              <span className="news-section-head__note">Expire in 24h</span>
            </div>

            <div className="news-flash-list">
              {visibleFlashes.map((flash) => {
                const channel = channelById.get(flash.channelId);
                if (!channel) return null;
                return (
                  <FlashRow
                    key={flash.id}
                    title={flash.title}
                    poster={flash.poster}
                    channel={channel}
                    minutesAgo={flash.minutesAgo}
                    duration={flash.duration}
                    onOpen={() => onOpenFlash(flash.id)}
                  />
                );
              })}
            </div>

            {visibleFlashes.length === 0 ? (
              <div className="news-empty">
                <Sparkles size={22} strokeWidth={1.8} />
                <p>No flashes match this filter yet.</p>
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="news-block news-block--following" aria-labelledby="your-newsrooms">
              <div className="news-section-head">
                <div>
                  <p className="news-section-head__eyebrow">Your circle</p>
                  <h2 className="news-section-head__title" id="your-newsrooms">
                    {followedChannels.length > 0 ? "Newsrooms you follow" : "Find your newsroom"}
                  </h2>
                </div>
                <button type="button" className="news-text-link" onClick={() => onOpenSearch()}>
                  Search
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </div>

              <div className="news-channel-strip">
                {(followedChannels.length > 0 ? followedChannels : discoverChannels).map((channel) => (
                  <div className="news-channel-mini" key={channel.id}>
                    <button
                      type="button"
                      className="news-channel-mini__open"
                      onClick={() => onOpenChannel(channel.id)}
                    >
                      <ChannelAvatar channel={channel} size={46} />
                      <span className="news-channel-mini__name">
                        {channel.name}
                        {channel.verified ? <span className="news-verified-dot" /> : null}
                      </span>
                      <span className="news-channel-mini__meta">
                        {formatCount(channel.subscribers)} followers
                      </span>
                    </button>
                    <FollowButton
                      following={followed.includes(channel.id)}
                      onToggle={() => onToggleFollow(channel.id)}
                      compact
                    />
                  </div>
                ))}

                <button
                  type="button"
                  className="news-channel-mini news-channel-mini--create"
                  onClick={onOpenStudio}
                >
                  <span className="news-channel-mini__plus">
                    <Sparkles size={20} strokeWidth={1.8} />
                  </span>
                  <span className="news-channel-mini__name">Create a channel</span>
                  <span className="news-channel-mini__meta">Open Studio</span>
                </button>
              </div>
            </section>

            <section className="news-block" aria-labelledby="latest-stories">
              <div className="news-section-head">
                <div>
                  <p className="news-section-head__eyebrow">Curated for you</p>
                  <h2 className="news-section-head__title" id="latest-stories">
                    Latest stories
                  </h2>
                </div>
                <span className="news-section-head__note">
                  {visibleArticles.length}
                  {serverNext ? "+" : ""} stories
                </span>
              </div>

              {serverMode && serverLoading ? (
                <div className="news-feed-status" role="status">
                  <LoaderCircle size={18} strokeWidth={2} className="news-spin" />
                  <p>Loading the latest stories…</p>
                </div>
              ) : null}

              {serverError ? (
                <div className="news-feed-status news-feed-status--error" role="alert">
                  <p>{serverError}</p>
                  <button
                    type="button"
                    onClick={() =>
                      serverArticles && serverNext
                        ? void loadMoreArticles()
                        : setRetryCount((value) => value + 1)
                    }
                  >
                    <RefreshCw size={14} strokeWidth={2.2} />
                    Try again
                  </button>
                </div>
              ) : null}

              {lead ? (
                <ArticleCard
                  article={lead}
                  channel={channelById.get(lead.channelId) ?? channels[0]}
                  variant="lead"
                  onOpen={() => onOpenArticle(lead.id)}
                />
              ) : null}

              {rest.length > 0 ? (
                <div className="news-story-list">
                  {rest.map((article) => {
                    const channel = channelById.get(article.channelId);
                    if (!channel) return null;
                    return (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        channel={channel}
                        onOpen={() => onOpenArticle(article.id)}
                      />
                    );
                  })}
                </div>
              ) : null}

              {visibleArticles.length > 0 && serverMode && serverNext ? (
                <button
                  type="button"
                  className="news-load-more"
                  onClick={() => void loadMoreArticles()}
                  disabled={serverLoadingMore}
                >
                  {serverLoadingMore ? (
                    <LoaderCircle size={16} strokeWidth={2} className="news-spin" />
                  ) : (
                    <RefreshCw size={15} strokeWidth={2.1} />
                  )}
                  {serverLoadingMore ? "Loading more stories" : "Load more stories"}
                </button>
              ) : null}

              {visibleArticles.length === 0 && !serverLoading && !serverError ? (
                <div className="news-empty">
                  <Newspaper size={22} strokeWidth={1.8} />
                  <p>No stories match this combination yet. Try a broader filter.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory("All");
                      setFilters(DEFAULT_FEED_FILTERS);
                    }}
                  >
                    Reset feed
                  </button>
                </div>
              ) : null}
            </section>

            <section className="news-brief-card" aria-labelledby="weather-brief">
              <span className="news-brief-card__icon">
                <Sun size={21} strokeWidth={1.8} />
              </span>
              <div>
                <p className="news-section-head__eyebrow">Weather brief</p>
                <h2 id="weather-brief">
                  {weatherStatus === "ready" && weather
                    ? `${condition} in ${prefs.placeName}, high ${temperature(weather.high, prefs.units)}.`
                    : `Planning around ${prefs.placeName} today?`}
                </h2>
                <p>
                  {weatherStatus === "ready" && weather
                    ? `Feels like ${temperature(weather.feels, prefs.units)} · Humidity ${weather.humidity}% · Wind ${weather.wind} km/h`
                    : "Open the weather desk for current conditions and the day's high and low."}
                </p>
              </div>
              <button type="button" onClick={onOpenWeather} aria-label="Open weather details">
                <ChevronRight size={17} strokeWidth={2.2} />
              </button>
            </section>

            <section className="news-place-line">
              <MapPin size={14} strokeWidth={2.1} />
              Local stories are tuned to <b>{prefs.placeName}</b>
              <span>·</span>
              <button type="button" onClick={onOpenWeather}>
                Change
              </button>
            </section>
          </>
        )}
      </div>

      {filtersOpen ? (
        <FilterSheet
          current={filters}
          onApply={(next) => {
            setFilters(next);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      ) : null}
    </main>
  );
}

function FilterSheet({
  current,
  onApply,
  onClose,
}: {
  current: FeedFilters;
  onApply: (filters: FeedFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FeedFilters>(current);

  const toggleCategory = (category: NewsCategory) => {
    setDraft((previous) => ({
      ...previous,
      categories: previous.categories.includes(category)
        ? previous.categories.filter((item) => item !== category)
        : [...previous.categories, category],
    }));
  };

  return (
    <Sheet
      title="Tune your feed"
      subtitle="Filters apply to the stories on Home. Your choices stay on this device."
      onClose={onClose}
    >
      <div className="news-sheet">
        <div className="news-sheet__group">
          <p className="news-sheet__label">Categories</p>
          <div className="news-sheet__chips">
            {FEED_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={`news-sheet-chip${
                  draft.categories.includes(category) ? " is-active" : ""
                }`}
                aria-pressed={draft.categories.includes(category)}
                onClick={() => toggleCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="news-sheet__group">
          <p className="news-sheet__label">Content</p>
          <div className="news-segment">
            {(
              [
                ["all", "Everything"],
                ["articles", "Articles"],
                ["flashes", "Flashes"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={draft.content === value ? "is-active" : ""}
                onClick={() => setDraft((previous) => ({ ...previous, content: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="news-sheet__group">
          <p className="news-sheet__label">Published</p>
          <div className="news-segment">
            {(
              [
                ["any", "Any time"],
                ["24h", "Last 24h"],
                ["week", "This week"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={draft.time === value ? "is-active" : ""}
                onClick={() => setDraft((previous) => ({ ...previous, time: value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="news-sheet__actions">
          <button
            type="button"
            className="news-button news-button--ghost"
            onClick={() => setDraft(DEFAULT_FEED_FILTERS)}
          >
            Reset
          </button>
          <button
            type="button"
            className="news-button news-button--blue"
            onClick={() => onApply(draft)}
          >
            Apply filters
          </button>
        </div>
      </div>
    </Sheet>
  );
}
