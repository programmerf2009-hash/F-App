import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  LoaderCircle,
  MapPin,
  Play,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { Session } from "../lib/auth";
import {
  loadArticleSearchPage,
  loadNewsChannelSearch,
  newsErrorMessage,
  type ArticleCursor,
} from "./news-api";
import {
  ArticleCard,
  CategoryLabel,
  ChannelAvatar,
  FlashRow,
  FollowButton,
  NewsLogo,
  NewsTopBar,
  SaveButton,
  ShareDisabled,
  VerifiedBadge,
} from "./NewsChrome";
import {
  flashHoursLeft,
  formatCount,
  isFlashLive,
  timeAgo,
  type NewsArticle,
  type NewsChannel,
  type NewsFlash,
} from "./news-types";
import { TRENDING_SEARCHES, articlesForChannel } from "./news-data";

/* ========================================================================== */
/* Article reader                                                             */
/* ========================================================================== */

interface ArticleViewProps {
  article: NewsArticle;
  channel: NewsChannel;
  related: NewsArticle[];
  followed: boolean;
  isOwn: boolean;
  onBack: () => void;
  onOpenChannel: (channelId: string) => void;
  onOpenArticle: (articleId: string) => void;
  onToggleFollow: (channelId: string) => void;
  notify: (message: string) => void;
}

export function NewsArticleView({
  article,
  channel,
  related,
  followed,
  isOwn,
  onBack,
  onOpenChannel,
  onOpenArticle,
  onToggleFollow,
  notify,
}: ArticleViewProps) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="news-overlay news-reader">
      <NewsTopBar
        onBack={onBack}
        backLabel="Back to news feed"
        right={
          <div className="news-reader__actions">
            <SaveButton
              saved={saved}
              compact
              onToggle={() => {
                setSaved((value) => !value);
                notify(saved ? "Removed from saved" : "Story saved");
              }}
            />
            <ShareDisabled compact />
          </div>
        }
      />

      <main className="news-reader__scroll">
        <article className="news-reader__article">
          <header className="news-reader__head">
            <div className="news-reader__meta">
              <CategoryLabel category={article.category} />
              {article.urgent ? <span className="news-urgent-label">Urgent</span> : null}
              <span>{timeAgo(article.minutesAgo)}</span>
              <span>{article.readMinutes} min read</span>
            </div>

            <h1>{article.title}</h1>
            <p className="news-reader__deck">{article.summary}</p>

            <div className="news-reader__byline">
              <button
                type="button"
                className="news-reader__channel"
                onClick={() => onOpenChannel(channel.id)}
              >
                <ChannelAvatar channel={channel} size={40} />
                <span>
                  <span className="news-reader__channel-name">
                    {channel.name}
                    {channel.verified ? <VerifiedBadge size={13} /> : null}
                  </span>
                  <span className="news-reader__channel-meta">
                    {article.region ? `${article.region} · ` : ""}
                    {formatCount(channel.subscribers)} subscribers
                  </span>
                </span>
              </button>

              {isOwn ? (
                <span className="news-reader__own">Your channel</span>
              ) : (
                <FollowButton
                  following={followed}
                  onToggle={() => onToggleFollow(channel.id)}
                  compact
                />
              )}
            </div>
          </header>

          <figure className="news-reader__cover">
            <img src={article.cover} alt="" />
            <figcaption>
              {article.region ? `${article.region} · ` : ""}
              F News / {channel.name}
            </figcaption>
          </figure>

          <div className="news-reader__body">
            {article.body.map((block, index) => {
              if (block.type === "text") {
                return (
                  <p
                    key={`${article.id}-p-${index}`}
                    className={index === 0 ? "news-reader__lead" : undefined}
                  >
                    {block.text}
                  </p>
                );
              }

              if (block.type === "quote") {
                return (
                  <blockquote key={`${article.id}-q-${index}`}>
                    <span aria-hidden="true">“</span>
                    {block.text}
                  </blockquote>
                );
              }

              if (block.type === "image") {
                return (
                  <figure className="news-reader__inline-figure" key={`${article.id}-i-${index}`}>
                    <img src={block.src} alt="" loading="lazy" />
                    <figcaption>{block.caption}</figcaption>
                  </figure>
                );
              }

              if (block.type === "video" && block.src) {
                return (
                  <figure className="news-reader__video-block" key={`${article.id}-v-${index}`}>
                    <video
                      className="news-reader__video"
                      src={block.src}
                      poster={block.poster}
                      controls
                      playsInline
                      preload="metadata"
                    />
                    <figcaption>
                      <span>{block.duration}</span>
                      {block.caption}
                    </figcaption>
                  </figure>
                );
              }

              return (
                <div className="news-reader__video" key={`${article.id}-v-${index}`}>
                  <img src={block.poster} alt="" loading="lazy" />
                  <span className="news-reader__video-shade" aria-hidden="true" />
                  <span className="news-reader__video-meta">
                    <span>{block.duration}</span>
                    {block.caption}
                  </span>
                </div>
              );
            })}
          </div>

          <footer className="news-reader__foot">
            <div className="news-reader__tags">
              {article.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>

            <div className="news-reader__share-row">
              <div>
                <strong>Share when F Chat arrives.</strong>
                <span>Sending and sharing stay inside F App. This button is reserved.</span>
              </div>
              <ShareDisabled />
            </div>

            <button
              type="button"
              className="news-reader__save-wide"
              onClick={() => {
                setSaved((value) => !value);
                notify(saved ? "Removed from saved" : "Story saved");
              }}
            >
              <Bookmark size={17} strokeWidth={2} fill={saved ? "currentColor" : "none"} />
              {saved ? "Saved to your reading list" : "Save for later"}
            </button>
          </footer>

          <section className="news-reader__more" aria-labelledby="more-from-channel">
            <div className="news-section-head">
              <div>
                <p className="news-section-head__eyebrow">Keep reading</p>
                <h2 className="news-section-head__title" id="more-from-channel">
                  More from {channel.name}
                </h2>
              </div>
              <button
                type="button"
                className="news-text-link"
                onClick={() => onOpenChannel(channel.id)}
              >
                Channel
                <ChevronRight size={14} strokeWidth={2.2} />
              </button>
            </div>

            <div className="news-reader__more-list">
              {related.length > 0 ? (
                related.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="news-reader__more-item"
                    onClick={() => onOpenArticle(item.id)}
                  >
                    <img src={item.cover} alt="" loading="lazy" />
                    <span>
                      <span className="news-reader__more-meta">
                        {item.category} · {timeAgo(item.minutesAgo)}
                      </span>
                      <strong>{item.title}</strong>
                    </span>
                    <ArrowRight size={16} strokeWidth={2.1} />
                  </button>
                ))
              ) : (
                <div className="news-empty">
                  <FileText size={20} strokeWidth={1.8} />
                  <p>This is the first story from this channel.</p>
                </div>
              )}
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}

/* ========================================================================== */
/* Channel profile                                                            */
/* ========================================================================== */

interface ChannelViewProps {
  channel: NewsChannel;
  articles: NewsArticle[];
  flashes: NewsFlash[];
  followed: boolean;
  isOwn: boolean;
  onBack: () => void;
  onOpenArticle: (articleId: string) => void;
  onOpenFlash: (flashId: string) => void;
  onToggleFollow: (channelId: string) => void;
  notify: (message: string) => void;
}

type ChannelTab = "latest" | "flashes" | "about";

export function NewsChannelView({
  channel,
  articles,
  flashes,
  followed,
  isOwn,
  onBack,
  onOpenArticle,
  onOpenFlash,
  onToggleFollow,
  notify,
}: ChannelViewProps) {
  const [tab, setTab] = useState<ChannelTab>("latest");
  const channelArticles = useMemo(
    () => articlesForChannel(articles, channel.id).sort((a, b) => a.minutesAgo - b.minutesAgo),
    [articles, channel.id],
  );
  const channelFlashes = useMemo(
    () =>
      flashes
        .filter((flash) => flash.channelId === channel.id)
        .sort((a, b) => a.minutesAgo - b.minutesAgo),
    [channel.id, flashes],
  );
  const liveFlashes = useMemo(() => channelFlashes.filter((flash) => isFlashLive(flash)), [channelFlashes]);
  const archivedFlashes = useMemo(
    () => channelFlashes.filter((flash) => !isFlashLive(flash)),
    [channelFlashes],
  );

  return (
    <div className="news-overlay news-channel-view">
      <NewsTopBar onBack={onBack} backLabel="Back to news" />

      <main className="news-channel-view__scroll">
        <div
          className="news-channel-view__cover"
          style={{
            background: channel.cover
              ? undefined
              : `linear-gradient(135deg, ${channel.tone}, #101828)`,
          }}
        >
          {channel.cover ? <img src={channel.cover} alt="" /> : null}
          <span className="news-channel-view__cover-shade" aria-hidden="true" />
        </div>

        <div className="news-shell news-channel-view__shell">
          <header className="news-channel-view__head">
            <ChannelAvatar channel={channel} size={82} />

            <div className="news-channel-view__identity">
              <div className="news-channel-view__name-row">
                <h1>
                  {channel.name}
                  {channel.verified ? <VerifiedBadge size={17} /> : null}
                </h1>
                {isOwn ? <span className="news-channel-card__mine">Your channel</span> : null}
              </div>
              <p className="news-channel-view__handle">
                @{channel.handle} · {channel.category}
              </p>
              <p className="news-channel-view__owner">
                Owned by <b>{channel.ownerName}</b>
              </p>
            </div>

            <div className="news-channel-view__actions">
              {!isOwn ? (
                <FollowButton
                  following={followed}
                  onToggle={() => onToggleFollow(channel.id)}
                />
              ) : (
                <button
                  type="button"
                  className="news-button news-button--ghost"
                  onClick={() => notify("Channel management lives in Studio.")}
                >
                  Manage
                </button>
              )}
            </div>
          </header>

          <p className="news-channel-view__description">{channel.description}</p>

          <div className="news-channel-view__stats">
            <span>
              <b>{formatCount(channel.subscribers)}</b> subscribers
            </span>
            <span>
              <b>{channelArticles.length}</b> stories
            </span>
            <span>
              <b>{liveFlashes.length}</b> live {liveFlashes.length === 1 ? "flash" : "flashes"}
            </span>
            <span>
              <CalendarDays size={14} strokeWidth={2.1} />
              Joined {channel.joined}
            </span>
          </div>

          <div className="news-channel-tabs" role="tablist" aria-label={`${channel.name} sections`}>
            {(
              [
                ["latest", "Latest"],
                ["flashes", "Flashes"],
                ["about", "About"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={tab === value ? "is-active" : ""}
                onClick={() => setTab(value)}
              >
                {label}
                <span>
                  {value === "latest"
                    ? channelArticles.length
                    : value === "flashes"
                      ? channelFlashes.length
                      : ""}
                </span>
              </button>
            ))}
          </div>

          {tab === "latest" ? (
            <section className="news-channel-view__posts" aria-label="Latest stories">
              {channelArticles.length > 0 ? (
                <div className="news-story-list">
                  {channelArticles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      channel={channel}
                      onOpen={() => onOpenArticle(article.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="news-empty">
                  <FileText size={22} strokeWidth={1.8} />
                  <p>No published stories yet. This newsroom is just getting started.</p>
                </div>
              )}
            </section>
          ) : null}

          {tab === "flashes" ? (
            <section className="news-channel-view__posts" aria-label="Channel flashes">
              {channelFlashes.length > 0 ? (
                <>
                  {liveFlashes.length > 0 ? (
                    <div className="news-channel-view__group">
                      {archivedFlashes.length > 0 ? (
                        <p className="news-channel-view__group-label">Live now</p>
                      ) : null}
                      <div className="news-flash-list">
                        {liveFlashes.map((flash) => (
                          <FlashRow
                            key={flash.id}
                            title={flash.title}
                            poster={flash.poster}
                            channel={channel}
                            minutesAgo={flash.minutesAgo}
                            duration={flash.duration}
                            onOpen={() => onOpenFlash(flash.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {archivedFlashes.length > 0 ? (
                    <div className="news-channel-view__group news-channel-view__group--archive">
                      <p className="news-channel-view__group-label">Archive</p>
                      <p className="news-channel-view__group-note">
                        Flashes leave the live feed after 24 hours and stay here for the record.
                      </p>
                      <div className="news-flash-list news-flash-list--archive">
                        {archivedFlashes.map((flash) => (
                          <FlashRow
                            key={flash.id}
                            title={flash.title}
                            poster={flash.poster}
                            channel={channel}
                            minutesAgo={flash.minutesAgo}
                            duration={flash.duration}
                            onOpen={() => onOpenFlash(flash.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="news-empty">
                  <Clock3 size={22} strokeWidth={1.8} />
                  <p>No active flashes. Video updates disappear from the feed after 24 hours.</p>
                </div>
              )}
            </section>
          ) : null}

          {tab === "about" ? (
            <section className="news-channel-view__about" aria-label="About this channel">
              <div className="news-about-card">
                <p className="news-section-head__eyebrow">About</p>
                <h2>{channel.name} on F News</h2>
                <p>{channel.description}</p>

                <div className="news-about-card__rows">
                  <div>
                    <span>Owner</span>
                    <b>{channel.ownerName}</b>
                  </div>
                  <div>
                    <span>Handle</span>
                    <b>@{channel.handle}</b>
                  </div>
                  <div>
                    <span>Category</span>
                    <b>{channel.category}</b>
                  </div>
                  <div>
                    <span>Joined</span>
                    <b>{channel.joined}</b>
                  </div>
                </div>

                <p className="news-about-card__note">
                  A channel is separate from a personal profile. If ownership changes, the channel
                  name, handle, posts and subscribers stay with the channel.
                </p>
              </div>

              <div className={`news-certificate${channel.verified ? " is-verified" : ""}`}>
                <span className="news-certificate__icon">
                  {channel.verified ? (
                    <ShieldCheck size={24} strokeWidth={1.8} />
                  ) : (
                    <Sparkles size={24} strokeWidth={1.8} />
                  )}
                </span>
                <div>
                  <p className="news-section-head__eyebrow">
                    {channel.verified ? "Verified newsroom" : "Trust certificate"}
                  </p>
                  <h3>
                    {channel.verified
                      ? "Identity and ownership reviewed"
                      : "Open to every creator"}
                  </h3>
                  <p>
                    {channel.verified
                      ? "This newsroom has passed F News identity and ownership checks. The certificate is re-reviewed if ownership changes."
                      : "This channel publishes with the same tools as verified brands. Verification is a trust signal, not a different feature set."}
                  </p>
                </div>
                {!channel.verified ? (
                  <button
                    type="button"
                    className="news-button news-button--ghost"
                    onClick={() => notify("Verification applications open in the next release.")}
                  >
                    Apply
                  </button>
                ) : (
                  <CheckCircle2 size={22} strokeWidth={1.9} className="news-certificate__check" />
                )}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/* ========================================================================== */
/* Flash player                                                               */
/* ========================================================================== */

interface FlashViewProps {
  flash: NewsFlash;
  channel: NewsChannel;
  relatedArticles: NewsArticle[];
  followed: boolean;
  isOwn: boolean;
  onBack: () => void;
  onOpenChannel: (channelId: string) => void;
  onOpenArticle: (articleId: string) => void;
  onToggleFollow: (channelId: string) => void;
}

export function NewsFlashView({
  flash,
  channel,
  relatedArticles,
  followed,
  isOwn,
  onBack,
  onOpenChannel,
  onOpenArticle,
  onToggleFollow,
}: FlashViewProps) {
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const live = isFlashLive(flash);
  const hoursLeft = flashHoursLeft(flash);
  const followUp = relatedArticles[0] ?? null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playing) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [playing, flash.videoUrl]);

  useEffect(() => {
    // React does not reliably sync the muted property after the first paint.
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted, flash.videoUrl]);

  return (
    <div className="news-overlay news-flash-view">
      <div className="news-flash-view__top">
        <button type="button" className="news-top__back" onClick={onBack} aria-label="Close flash">
          <X size={19} strokeWidth={2.2} />
        </button>
        <div className="news-top__brand">
          <NewsLogo />
          <span className="news-top__wordmark">
            <span className="news-flash-view__wordmark">Flash</span>
            <span className="news-top__sub">24h video desk</span>
          </span>
        </div>
        <button
          type="button"
          className="news-flash-view__share"
          disabled
          aria-label="Sharing will be available with F Chat"
          title="Sharing arrives with F Chat"
        >
          <Share2 size={18} strokeWidth={2} />
        </button>
      </div>

      <div className="news-flash-view__stage">
        <div className={`news-flash-view__poster${playing ? " is-playing" : ""}`}>
          {flash.videoUrl ? (
            <video
              ref={videoRef}
              className="news-flash-view__video"
              src={flash.videoUrl}
              poster={flash.poster}
              muted={muted}
              loop
              playsInline
              preload="metadata"
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                if (!Number.isFinite(video.duration) || video.duration <= 0) return;
                setProgress((video.currentTime / video.duration) * 100);
              }}
            />
          ) : (
            <img src={flash.poster} alt="" />
          )}
          <span className="news-flash-view__shade" aria-hidden="true" />
          <span className={`news-flash-view__live${live ? "" : " is-archived"}`}>
            {live ? (
              <span className="news-live-dot" aria-hidden="true" />
            ) : (
              <Clock3 size={11} strokeWidth={2} aria-hidden="true" />
            )}
            {live ? "Recorded flash" : "Archived flash"}
          </span>
          <span className="news-flash-view__time">{flash.duration}</span>
          <button
            type="button"
            className="news-flash-view__play"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? "Pause flash" : "Play flash"}
          >
            {playing ? (
              <span className="news-flash-view__pause" aria-hidden="true" />
            ) : (
              <Play size={26} strokeWidth={2} fill="currentColor" />
            )}
          </button>
          {flash.videoUrl ? (
            <button
              type="button"
              className="news-flash-view__sound"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? "Turn sound on" : "Mute flash"}
              title={muted ? "Turn sound on" : "Mute"}
            >
              {muted ? (
                <VolumeX size={16} strokeWidth={2.1} />
              ) : (
                <Volume2 size={16} strokeWidth={2.1} />
              )}
            </button>
          ) : null}
          <span
            className={`news-flash-view__progress${
              flash.videoUrl ? " is-recorded" : playing ? " is-playing" : ""
            }`}
          >
            <span style={flash.videoUrl ? { width: `${progress}%` } : undefined} />
          </span>
        </div>

        <div className="news-flash-view__copy">
          <div className="news-flash-view__eyebrow">
            <span>Flash</span>
            <span>{timeAgo(flash.minutesAgo)}</span>
            <span>
              <Eye size={13} strokeWidth={2.1} />
              {formatCount(flash.views)}
            </span>
            <span>{live ? `Expires in ${hoursLeft}h` : "Archive"}</span>
          </div>

          <h1>{flash.title}</h1>

          <div className="news-flash-view__channel-row">
            <button
              type="button"
              className="news-flash-view__channel"
              onClick={() => onOpenChannel(channel.id)}
            >
              <ChannelAvatar channel={channel} size={39} />
              <span>
                <span>
                  {channel.name}
                  {channel.verified ? <VerifiedBadge size={12} /> : null}
                </span>
                <small>@{channel.handle}</small>
              </span>
            </button>
            {isOwn ? (
              <span className="news-flash-view__own">Your channel</span>
            ) : (
              <FollowButton
                following={followed}
                onToggle={() => onToggleFollow(channel.id)}
                compact
                dark
              />
            )}
          </div>

          <p className="news-flash-view__note">
            {live
              ? "A recorded video flash has no article body. It leaves the feed after 24 hours and moves to the channel archive; the owner can publish a full follow-up article later."
              : "This flash has left the live feed. It stays in the channel archive as part of the record, and the owner can still publish a full follow-up article."}
          </p>

          {followUp ? (
            <button
              type="button"
              className="news-flash-view__followup"
              onClick={() => onOpenArticle(followUp.id)}
            >
              <span className="news-flash-view__followup-icon">
                <FileText size={18} strokeWidth={2} />
              </span>
              <span>
                <small>Follow-up article</small>
                <strong>{followUp.title}</strong>
              </span>
              <ArrowRight size={17} strokeWidth={2.2} />
            </button>
          ) : null}

          <button
            type="button"
            className="news-flash-view__channel-link"
            onClick={() => onOpenChannel(channel.id)}
          >
            Open {channel.name}
            <ChevronRight size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <p className="news-flash-view__footer">
        Sharing and sending will be handled by F Chat. This action is intentionally disabled.
      </p>
    </div>
  );
}

/* ========================================================================== */
/* Search                                                                     */
/* ========================================================================== */

interface SearchViewProps {
  session: Session;
  articles: NewsArticle[];
  channels: NewsChannel[];
  followed: string[];
  live: boolean;
  onArticlesLoaded: (articles: NewsArticle[], channels: NewsChannel[]) => void;
  onBack: () => void;
  onOpenArticle: (articleId: string) => void;
  onOpenChannel: (channelId: string) => void;
  onToggleFollow: (channelId: string) => void;
}

export function NewsSearchView({
  session,
  articles,
  channels,
  followed,
  live,
  onArticlesLoaded,
  onBack,
  onOpenArticle,
  onOpenChannel,
  onToggleFollow,
}: SearchViewProps) {
  const [query, setQuery] = useState("");
  const [settledQuery, setSettledQuery] = useState("");
  const [serverArticles, setServerArticles] = useState<NewsArticle[]>([]);
  const [serverChannels, setServerChannels] = useState<NewsChannel[]>([]);
  const [nextCursor, setNextCursor] = useState<ArticleCursor | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const searchRequest = useRef(0);

  const channelById = useMemo(
    () =>
      new Map(
        [...channels, ...serverChannels].map((channel) => [channel.id, channel]),
      ),
    [channels, serverChannels],
  );

  const needle = settledQuery.trim().toLowerCase();
  const typedNeedle = query.trim().toLowerCase();
  const waitingForQuery = typedNeedle !== needle;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettledQuery(query.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!live) return;

    const requestId = ++searchRequest.current;

    if (!needle) {
      setServerArticles([]);
      setServerChannels([]);
      setNextCursor(null);
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setServerArticles([]);
    setServerChannels([]);
    setNextCursor(null);

    Promise.all([
      loadArticleSearchPage(session, settledQuery, { limit: 20 }),
      loadNewsChannelSearch(session, settledQuery, 20),
    ])
      .then(([articlePage, channelResults]) => {
        if (searchRequest.current !== requestId) return;
        setServerArticles(articlePage.articles);
        setServerChannels(channelResults);
        setNextCursor(articlePage.next);
        onArticlesLoaded(articlePage.articles, [...articlePage.channels, ...channelResults]);
      })
      .catch((error: unknown) => {
        if (searchRequest.current !== requestId) return;
        setSearchError(newsErrorMessage(error, "Search is unavailable right now."));
      })
      .finally(() => {
        if (searchRequest.current !== requestId) return;
        setSearching(false);
      });
  }, [live, needle, onArticlesLoaded, retryCount, session, settledQuery]);

  const loadMoreResults = async () => {
    if (!live || !nextCursor || loadingMore) return;

    const requestId = searchRequest.current;
    setLoadingMore(true);
    setSearchError(null);

    try {
      const page = await loadArticleSearchPage(session, settledQuery, {
        cursor: nextCursor,
        limit: 20,
      });
      if (searchRequest.current !== requestId) return;
      setServerArticles((previous) => {
        const seen = new Set(previous.map((article) => article.id));
        return [...previous, ...page.articles.filter((article) => !seen.has(article.id))];
      });
      setNextCursor(page.next);
      onArticlesLoaded(page.articles, page.channels);
    } catch (error) {
      if (searchRequest.current !== requestId) return;
      setSearchError(newsErrorMessage(error, "Could not load more results."));
    } finally {
      setLoadingMore(false);
    }
  };

  const localArticleResults = useMemo(() => {
    if (!needle) return [];
    return articles
      .filter((article) => {
        const channel = channelById.get(article.channelId);
        const body = article.body
          .map((block) =>
            block.type === "text" || block.type === "quote" ? block.text : block.caption,
          )
          .join(" ");
        return (
          article.title.toLowerCase().includes(needle) ||
          article.summary.toLowerCase().includes(needle) ||
          article.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
          body.toLowerCase().includes(needle) ||
          channel?.name.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.minutesAgo - b.minutesAgo);
  }, [articles, channelById, needle]);

  const localChannelResults = useMemo(() => {
    if (!needle) return [];
    return channels.filter(
      (channel) =>
        channel.name.toLowerCase().includes(needle) ||
        channel.handle.toLowerCase().includes(needle) ||
        channel.category.toLowerCase().includes(needle),
    );
  }, [channels, needle]);

  const showSearching = live && Boolean(typedNeedle) && (searching || waitingForQuery);
  const articleResults = live ? (showSearching ? [] : serverArticles) : localArticleResults;
  const channelResults = live ? (showSearching ? [] : serverChannels) : localChannelResults;
  const articleCount = live && nextCursor ? `${articleResults.length}+` : String(articleResults.length);
  const channelCount = String(channelResults.length);

  return (
    <div className="news-overlay news-search-view">
      <NewsTopBar onBack={onBack} backLabel="Close search" />

      <main className="news-search-view__scroll">
        <div className="news-shell">
          <div className="news-search-view__head">
            <p className="news-kicker">Search F News</p>
            <h1>What are you looking for?</h1>
          </div>

          <div className="news-search-field news-search-field--large">
            <Search size={20} strokeWidth={2.1} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search headlines, topics, channels"
              aria-label="Search F News"
              autoFocus
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={17} strokeWidth={2.2} />
              </button>
            ) : null}
          </div>

          {!typedNeedle ? (
            <section className="news-search-view__trending" aria-labelledby="trending-searches">
              <p className="news-section-head__eyebrow" id="trending-searches">
                Trending searches
              </p>
              <div className="news-search-view__trend-list">
                {TRENDING_SEARCHES.map((term) => (
                  <button key={term} type="button" onClick={() => setQuery(term)}>
                    <Search size={14} strokeWidth={2.1} />
                    {term}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
              {showSearching ? (
                <div className="news-search-view__status" role="status">
                  <LoaderCircle size={17} strokeWidth={2} className="news-spin" />
                  Searching the live news index…
                </div>
              ) : null}

              {searchError ? (
                <div className="news-search-view__status news-search-view__status--error" role="alert">
                  <p>{searchError}</p>
                  <button type="button" onClick={() => setRetryCount((value) => value + 1)}>
                    Try again
                  </button>
                </div>
              ) : null}

              <section className="news-search-view__section" aria-labelledby="story-results">
                <div className="news-section-head">
                  <div>
                    <p className="news-section-head__eyebrow">Stories</p>
                    <h2 className="news-section-head__title" id="story-results">
                      {showSearching ? "Searching" : `${articleCount} matches`}
                    </h2>
                  </div>
                </div>

                {articleResults.length > 0 ? (
                  <div className="news-search-view__results">
                    {articleResults.map((article) => {
                      const channel = channelById.get(article.channelId);
                      if (!channel) return null;
                      return (
                        <button
                          key={article.id}
                          type="button"
                          className="news-search-result"
                          onClick={() => onOpenArticle(article.id)}
                        >
                          <img src={article.cover} alt="" loading="lazy" />
                          <span>
                            <span className="news-search-result__meta">
                              {article.category} · {timeAgo(article.minutesAgo)}
                            </span>
                            <strong>{article.title}</strong>
                            <small>
                              {channel.name}
                              {channel.verified ? <VerifiedBadge size={11} /> : null}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : !showSearching && !searchError ? (
                  <div className="news-empty">
                    <Search size={22} strokeWidth={1.8} />
                    <p>No story matches “{query.trim()}”.</p>
                  </div>
                ) : null}

                {live && nextCursor && !searchError ? (
                  <button
                    type="button"
                    className="news-load-more"
                    onClick={() => void loadMoreResults()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <LoaderCircle size={16} strokeWidth={2} className="news-spin" />
                    ) : (
                      <ArrowRight size={15} strokeWidth={2.1} />
                    )}
                    {loadingMore ? "Loading more results" : "Load more stories"}
                  </button>
                ) : null}
              </section>

              <section className="news-search-view__section" aria-labelledby="channel-results">
                <div className="news-section-head">
                  <div>
                    <p className="news-section-head__eyebrow">Channels</p>
                    <h2 className="news-section-head__title" id="channel-results">
                      {showSearching ? "Searching" : `${channelCount} matches`}
                    </h2>
                  </div>
                </div>

                {channelResults.length > 0 ? (
                  <div className="news-search-view__channels">
                    {channelResults.map((channel) => (
                      <div className="news-search-channel" key={channel.id}>
                        <button
                          type="button"
                          className="news-search-channel__open"
                          onClick={() => onOpenChannel(channel.id)}
                        >
                          <ChannelAvatar channel={channel} size={38} />
                          <span>
                            <span>
                              {channel.name}
                              {channel.verified ? <VerifiedBadge size={12} /> : null}
                            </span>
                            <small>
                              @{channel.handle} · {formatCount(channel.subscribers)}
                            </small>
                          </span>
                        </button>
                        {channel.isMine ? (
                          <span className="news-search-channel__own">Your channel</span>
                        ) : (
                          <FollowButton
                            following={followed.includes(channel.id)}
                            onToggle={() => onToggleFollow(channel.id)}
                            compact
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : !showSearching && !searchError ? (
                  <div className="news-empty news-empty--compact">
                    <Search size={20} strokeWidth={1.8} />
                    <p>No channel matches this search.</p>
                  </div>
                ) : null}
              </section>
            </>
          )}

          {!typedNeedle ? (
            <div className="news-search-view__note">
              <MapPin size={17} strokeWidth={2} />
              <p>
                {live
                  ? "Search runs on the live news index: headlines, summaries, tags and channel names, newest first."
                  : "This preview searches the stories bundled with the app. Connect the news schema for live full-text search."}
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
