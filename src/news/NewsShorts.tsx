import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  ChevronUp,
  Clock3,
  Eye,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ChannelAvatar, VerifiedBadge } from "./NewsChrome";
import { registerNewsView } from "./news-api";
import { formatCount, timeAgo, type NewsChannel, type NewsPrefs, type NewsShort } from "./news-types";

interface Props {
  channels: NewsChannel[];
  shorts: NewsShort[];
  prefs: NewsPrefs;
  liked: string[];
  saved: string[];
  onToggleReaction: (shortId: string, kind: "like" | "save") => Promise<boolean>;
  onOpenChannel: (channelId: string) => void;
  onOpenComments: (shortId: string) => void;
}

export function NewsShorts({
  channels,
  shorts,
  prefs,
  liked,
  saved,
  onToggleReaction,
  onOpenChannel,
  onOpenComments,
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(
    prefs.autoplay ? (shorts[0]?.id ?? null) : null,
  );
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());

  useEffect(() => {
    shorts.forEach((short) => {
      const video = videoRefs.current.get(short.id);
      if (!video) return;

      video.muted = muted;

      if (short.id === playingId) {
        void video.play().catch(() => setPlayingId(null));
      } else {
        video.pause();
      }
    });
  }, [playingId, shorts, muted]);

  const channelById = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel])),
    [channels],
  );

  useEffect(() => {
    if (!playingId) return;
    let active = true;
    void registerNewsView("short", playingId).then((count) => {
      if (active && count !== null) {
        setViewCounts((previous) => ({ ...previous, [playingId]: count }));
      }
    });
    return () => {
      active = false;
    };
  }, [playingId]);

  const react = (short: NewsShort, kind: "like" | "save") => {
    const wasActive =
      kind === "like" ? liked.includes(short.id) : saved.includes(short.id);
    const next = !wasActive;

    if (kind === "like") {
      const current = likeCounts[short.id] ?? short.likes;
      setLikeCounts((previous) => ({
        ...previous,
        [short.id]: Math.max(0, current + (next ? 1 : -1)),
      }));
    }

    void onToggleReaction(short.id, kind)
      .then((active) => {
        // Another device may have changed the reaction first; re-align the
        // optimistic counter with the state the server actually stored.
        if (kind !== "like" || active === next) return;
        setLikeCounts((previous) => ({
          ...previous,
          [short.id]: Math.max(0, (previous[short.id] ?? short.likes) + (active ? 1 : -1)),
        }));
      })
      .catch(() => {
        if (kind !== "like") return;
        setLikeCounts((previous) => ({
          ...previous,
          [short.id]: Math.max(0, (previous[short.id] ?? short.likes) + (next ? -1 : 1)),
        }));
      });
  };

  return (
    <main className="news-main news-shorts">
      <div className="news-shorts__feed">
        {shorts.map((short, index) => {
          const channel = channelById.get(short.channelId);
          if (!channel) return null;
          const isPlaying = playingId === short.id;
          const isLiked = liked.includes(short.id);
          const isSaved = saved.includes(short.id);
          const views = viewCounts[short.id] ?? short.views;
          const likes = likeCounts[short.id] ?? short.likes;

          /**
           * The same action set is rendered twice: once as the compact
           * rail that floats over the video on phones and once as pill
           * buttons inside the desktop side panel. CSS exposes exactly one
           * of them per breakpoint, so interaction duplicates never show.
           */
          const actions = (variant: "rail" | "panel") => {
            const base = variant === "panel" ? "news-short__pill" : "news-short__action";
            const cls = (extra = "", disabled = false) =>
              `${base}${extra}${disabled ? " is-disabled" : ""}`;

            return (
              <>
                <button
                  type="button"
                  className={cls(isLiked ? " is-active" : "")}
                  onClick={() => react(short, "like")}
                  aria-pressed={isLiked}
                  aria-label={isLiked ? "Remove reaction" : "React to this short"}
                >
                  <span>
                    <Heart
                      size={21}
                      strokeWidth={2}
                      fill={isLiked ? "currentColor" : "none"}
                    />
                  </span>
                  <small>{formatCount(likes)}</small>
                </button>

                <button
                  type="button"
                  className={cls(isSaved ? " is-active" : "")}
                  onClick={() => react(short, "save")}
                  aria-pressed={isSaved}
                  aria-label={isSaved ? "Remove from saved" : "Save this short"}
                >
                  <span>
                    <Bookmark
                      size={21}
                      strokeWidth={2}
                      fill={isSaved ? "currentColor" : "none"}
                    />
                  </span>
                  <small>Save</small>
                </button>

                <button
                  type="button"
                  className={cls()}
                  onClick={() => {
                    setPlayingId(null);
                    onOpenComments(short.id);
                  }}
                  aria-label="Read this short's comments"
                >
                  <span>
                    <MessageCircle size={21} strokeWidth={2} />
                  </span>
                  <small>Comments</small>
                </button>

                <button
                  type="button"
                  className={cls("", true)}
                  disabled
                  aria-label="Sharing will be available with F Chat"
                  title="Sharing arrives with F Chat"
                >
                  <span>
                    <Share2 size={21} strokeWidth={2} />
                  </span>
                  <small>Share</small>
                </button>

                {short.videoUrl ? (
                  <button
                    type="button"
                    className={cls(muted ? "" : " is-active")}
                    onClick={() => setMuted((value) => !value)}
                    aria-label={muted ? "Turn sound on" : "Mute short"}
                    title={muted ? "Turn sound on" : "Mute"}
                  >
                    <span>
                      {muted ? (
                        <VolumeX size={20} strokeWidth={2} />
                      ) : (
                        <Volume2 size={20} strokeWidth={2} />
                      )}
                    </span>
                    <small>{muted ? "Sound" : "On"}</small>
                  </button>
                ) : (
                  <span className={cls("", false) + " is-disabled"} aria-hidden="true">
                    <span>
                      <Volume2 size={20} strokeWidth={2} />
                    </span>
                    <small>Preview</small>
                  </span>
                )}
              </>
            );
          };

          return (
            <article className="news-short" key={short.id} aria-label={`News short: ${short.caption}`}>
              <div className="news-short__stage">
                <div className={`news-short__media${isPlaying ? " is-playing" : ""}`}>
                  {short.videoUrl ? (
                    <video
                      ref={(element) => {
                        if (element) videoRefs.current.set(short.id, element);
                        else videoRefs.current.delete(short.id);
                      }}
                      src={short.videoUrl}
                      poster={short.poster}
                      muted={muted}
                      loop
                      playsInline
                      preload={index === 0 ? "metadata" : "none"}
                      onTimeUpdate={(event) => {
                        const video = event.currentTarget;
                        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
                        setProgress((previous) => ({
                          ...previous,
                          [short.id]: (video.currentTime / video.duration) * 100,
                        }));
                      }}
                    />
                  ) : (
                    <img src={short.poster} alt="" loading={index === 0 ? "eager" : "lazy"} />
                  )}
                </div>
                <span className="news-short__shade" aria-hidden="true" />

                <header className="news-short__top">
                  <span className="news-short__flag">
                    <span className="news-live-dot" aria-hidden="true" />
                    News short
                  </span>
                  <span className="news-short__duration">{short.duration}</span>
                </header>

                <button
                  type="button"
                  className={`news-short__play${isPlaying ? " is-playing" : ""}`}
                  onClick={() => setPlayingId(isPlaying ? null : short.id)}
                  aria-label={isPlaying ? "Pause short" : "Play short"}
                >
                  {isPlaying ? (
                    <Pause size={25} strokeWidth={1.9} />
                  ) : (
                    <Play size={25} strokeWidth={1.9} fill="currentColor" />
                  )}
                </button>

                <div className="news-short__bottom">
                  <button
                    type="button"
                    className="news-short__channel"
                    onClick={() => onOpenChannel(channel.id)}
                  >
                    <ChannelAvatar channel={channel} size={36} />
                    <span>
                      <span className="news-short__channel-name">
                        {channel.name}
                        {channel.verified ? <VerifiedBadge size={12} /> : null}
                      </span>
                      <span className="news-short__channel-meta">{timeAgo(short.minutesAgo)}</span>
                    </span>
                  </button>

                  <p>{short.caption}</p>

                  <div className="news-short__foot">
                    <span>Sharing is reserved for F Chat</span>
                    {index < shorts.length - 1 ? (
                      <span className="news-short__swipe">
                        <ChevronUp size={13} strokeWidth={2.2} />
                        Next
                      </span>
                    ) : null}
                  </div>
                </div>

                <span
                  className={`news-short__progress${
                    short.videoUrl ? " is-recorded" : isPlaying ? " is-playing" : ""
                  }`}
                >
                  <span style={short.videoUrl ? { width: `${progress[short.id] ?? 0}%` } : undefined} />
                </span>
              </div>

              {/* Phone-only floating rail over the video */}
              <div className="news-short__rail">{actions("rail")}</div>

              {/* Desktop-only side panel, kept clear of the video */}
              <aside className="news-short__panel" aria-label="Short details and actions">
                <button
                  type="button"
                  className="news-short__panel-channel"
                  onClick={() => onOpenChannel(channel.id)}
                >
                  <ChannelAvatar channel={channel} size={44} />
                  <span>
                    <span className="news-short__panel-name">
                      {channel.name}
                      {channel.verified ? <VerifiedBadge size={13} /> : null}
                    </span>
                    <span className="news-short__panel-handle">
                      <Clock3 size={11} strokeWidth={2.1} />
                      Published {timeAgo(short.minutesAgo)}
                    </span>
                  </span>
                </button>

                <p className="news-short__panel-caption">{short.caption}</p>

                <div className="news-short__panel-stats">
                  <span>
                    <Eye size={13} strokeWidth={2.1} />
                    {formatCount(views)} views
                  </span>
                  <span>
                    <Heart size={13} strokeWidth={2.1} />
                    {formatCount(likes)} likes
                  </span>
                  <span>
                    <MessageCircle size={13} strokeWidth={2.1} />
                    {formatCount(short.comments)} comments
                  </span>
                </div>

                <div className="news-short__panel-actions">{actions("panel")}</div>

                <footer className="news-short__panel-foot">
                  <span>Sharing is reserved for F Chat</span>
                  {index < shorts.length - 1 ? (
                    <span className="news-short__swipe">
                      <ChevronUp size={13} strokeWidth={2.2} />
                      Next
                    </span>
                  ) : null}
                </footer>
              </aside>
            </article>
          );
        })}
      </div>
    </main>
  );
}
