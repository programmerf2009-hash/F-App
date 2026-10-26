import type { CSSProperties, ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Bookmark,
  Check,
  Clapperboard,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  House,
  Moon,
  PenLine,
  Plus,
  RadioTower,
  Share2,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { describeWeather } from "../lib/weather";
import {
  categoryAccent,
  formatCount,
  timeAgo,
  type NewsArticle,
  type NewsChannel,
  type NewsTab,
} from "./news-types";

const LOGO_SRC = `${import.meta.env.BASE_URL}brand/fapplogo2.png`;

/* -------------------------------------------------------------------------- */
/* Brand and chrome                                                           */
/* -------------------------------------------------------------------------- */

export function NewsLogo() {
  return (
    <span className="news-logo" aria-hidden="true">
      <img src={LOGO_SRC} alt="" draggable={false} />
    </span>
  );
}

interface TopBarProps {
  onBack: () => void;
  backLabel: string;
  dark?: boolean;
  right?: ReactNode;
  title?: string;
}

export function NewsTopBar({
  onBack,
  backLabel,
  dark = false,
  right,
  title = "F News",
}: TopBarProps) {
  return (
    <header className={`news-top${dark ? " news-top--dark" : ""}`}>
      <div className="news-top__left">
        <button
          type="button"
          className="news-top__back"
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft size={18} strokeWidth={2.25} />
        </button>

        <div className="news-top__brand">
          <NewsLogo />
          <span className="news-top__wordmark">
            <span>{title}</span>
            <span className="news-top__sub">News &amp; Weather</span>
          </span>
        </div>
      </div>

      {right ? <div className="news-top__right">{right}</div> : null}
    </header>
  );
}

const NAV_ITEMS: Array<{ tab: NewsTab; label: string; Icon: typeof House }> = [
  { tab: "home", label: "Home", Icon: House },
  { tab: "channels", label: "Channels", Icon: RadioTower },
  { tab: "shorts", label: "Shorts", Icon: Clapperboard },
  { tab: "settings", label: "Settings", Icon: SlidersHorizontal },
  { tab: "studio", label: "Studio", Icon: PenLine },
];

export function NewsNav({
  active,
  onNavigate,
  dark = false,
}: {
  active: NewsTab;
  onNavigate: (tab: NewsTab) => void;
  dark?: boolean;
}) {
  return (
    <nav className={`news-nav${dark ? " news-nav--dark" : ""}`} aria-label="F News navigation">
      <div className="news-nav__inner">
        {NAV_ITEMS.map(({ tab, label, Icon }) => (
          <button
            key={tab}
            type="button"
            className={`news-nav__item${active === tab ? " is-active" : ""}`}
            aria-current={active === tab ? "page" : undefined}
            onClick={() => onNavigate(tab)}
          >
            <span className="news-nav__icon">
              <Icon size={20} strokeWidth={active === tab ? 2.2 : 1.9} />
            </span>
            <span className="news-nav__label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Small identity pieces                                                      */
/* -------------------------------------------------------------------------- */

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <span className="news-verified" title="Verified newsroom" aria-label="Verified newsroom">
      <BadgeCheck size={size} strokeWidth={2.4} />
    </span>
  );
}

export function ChannelAvatar({
  channel,
  size = 42,
}: {
  channel: NewsChannel;
  size?: number;
}) {
  const initial = channel.name.trim().slice(0, 1).toUpperCase() || "F";

  return (
    <span
      className="news-avatar"
      style={{ "--avatar-size": `${size}px`, "--avatar-tone": channel.tone } as CSSProperties}
      aria-hidden="true"
    >
      {channel.avatar || channel.cover ? (
        <img src={channel.avatar ?? channel.cover ?? ""} alt="" loading="lazy" />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}

export function FollowButton({
  following,
  onToggle,
  compact = false,
  dark = false,
}: {
  following: boolean;
  onToggle: () => void;
  compact?: boolean;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        "news-follow",
        following ? "is-following" : "",
        compact ? "is-compact" : "",
        dark ? "is-dark" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={following}
      onClick={onToggle}
    >
      {following ? <Check size={13} strokeWidth={2.6} /> : <Plus size={13} strokeWidth={2.6} />}
      {following ? "Following" : "Follow"}
    </button>
  );
}

export function CategoryLabel({
  category,
  muted = false,
}: {
  category: NewsArticle["category"];
  muted?: boolean;
}) {
  return (
    <span
      className={`news-category${muted ? " is-muted" : ""}`}
      style={{ "--category": categoryAccent(category) } as CSSProperties}
    >
      {category}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Weather icon                                                               */
/* -------------------------------------------------------------------------- */

export function WeatherGlyph({
  code,
  isDay,
  size = 20,
}: {
  code?: number;
  isDay?: boolean;
  size?: number;
}) {
  const kind = typeof code === "number" ? describeWeather(code).kind : "partly";
  const Icon = iconForKind(kind, isDay ?? true);
  return <Icon size={size} strokeWidth={1.8} />;
}

function iconForKind(
  kind: ReturnType<typeof describeWeather>["kind"],
  isDay: boolean,
): typeof Sun {
  switch (kind) {
    case "clear":
    case "mostly-clear":
      return isDay ? Sun : Moon;
    case "partly":
      return isDay ? CloudSun : Moon;
    case "overcast":
      return Cloud;
    case "fog":
      return CloudFog;
    case "drizzle":
      return CloudDrizzle;
    case "rain":
    case "showers":
      return CloudRain;
    case "freezing":
    case "snow":
      return CloudSnow;
    case "thunder":
      return CloudLightning;
    default:
      return Cloud;
  }
}

/* -------------------------------------------------------------------------- */
/* Story cards                                                                */
/* -------------------------------------------------------------------------- */

export function ArticleCard({
  article,
  channel,
  variant = "row",
  onOpen,
}: {
  article: NewsArticle;
  channel: NewsChannel;
  variant?: "lead" | "row" | "compact";
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`news-story news-story--${variant}${article.urgent ? " is-urgent" : ""}`}
      onClick={onOpen}
      aria-label={`Read: ${article.title}`}
    >
      <span className="news-story__media">
        <img src={article.cover} alt="" loading="lazy" />
        {variant === "lead" ? (
          <span className="news-story__media-label">
            {article.urgent ? "Urgent" : "Latest"}
          </span>
        ) : null}
      </span>

      <span className="news-story__body">
        <span className="news-story__meta">
          <CategoryLabel category={article.category} />
          <span className="news-story__dot" aria-hidden="true" />
          <span>{timeAgo(article.minutesAgo)}</span>
        </span>

        <span className="news-story__title">{article.title}</span>

        {variant === "lead" ? (
          <span className="news-story__summary">{article.summary}</span>
        ) : null}

        <span className="news-story__byline">
          <ChannelAvatar channel={channel} size={20} />
          <span className="news-story__channel">{channel.name}</span>
          {channel.verified ? <VerifiedBadge size={12} /> : null}
          <span className="news-story__read">{article.readMinutes} min read</span>
        </span>
      </span>
    </button>
  );
}

export function FlashRow({
  title,
  poster,
  channel,
  minutesAgo,
  duration,
  onOpen,
}: {
  title: string;
  poster: string;
  channel: NewsChannel;
  minutesAgo: number;
  duration: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="news-flash-row" onClick={onOpen}>
      <span className="news-flash-row__thumb">
        <img src={poster} alt="" loading="lazy" />
        <span className="news-flash-row__play" aria-hidden="true">
          <span />
        </span>
        <span className="news-flash-row__duration">{duration}</span>
      </span>

      <span className="news-flash-row__body">
        <span className="news-flash-row__eyebrow">Flash · {timeAgo(minutesAgo)}</span>
        <span className="news-flash-row__title">{title}</span>
        <span className="news-flash-row__channel">
          {channel.name}
          {channel.verified ? <VerifiedBadge size={11} /> : null}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared controls                                                            */
/* -------------------------------------------------------------------------- */

export function NewsSectionHead({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="news-section-head">
      <div>
        {eyebrow ? <p className="news-section-head__eyebrow">{eyebrow}</p> : null}
        <h2 className="news-section-head__title">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function ShareDisabled({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      className={`news-share${compact ? " is-compact" : ""}`}
      disabled
      aria-label="Sharing will be available with F Chat"
      title="Sharing will be available with F Chat"
    >
      <Share2 size={compact ? 18 : 20} strokeWidth={2} />
      {compact ? null : <span>Share with F Chat</span>}
    </button>
  );
}

export function SaveButton({
  saved,
  onToggle,
  compact = false,
}: {
  saved: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`news-save${saved ? " is-saved" : ""}${compact ? " is-compact" : ""}`}
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save story"}
    >
      <Bookmark size={compact ? 18 : 20} strokeWidth={2} fill={saved ? "currentColor" : "none"} />
      {compact ? null : <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}

export function SubscriberLine({ channel }: { channel: NewsChannel }) {
  return (
    <span className="news-subs">
      {formatCount(channel.subscribers)} subscribers
    </span>
  );
}
