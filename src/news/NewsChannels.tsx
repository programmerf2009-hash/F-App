import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import type { Session } from "../lib/auth";
import {
  CategoryLabel,
  ChannelAvatar,
  FollowButton,
  NewsSectionHead,
  VerifiedBadge,
} from "./NewsChrome";
import { formatCount, type NewsChannel } from "./news-types";

interface Props {
  session: Session;
  channels: NewsChannel[];
  followed: string[];
  onOpenChannel: (channelId: string) => void;
  onToggleFollow: (channelId: string) => void;
  onOpenStudio: () => void;
  notify: (message: string) => void;
}

type DiscoverFilter = "all" | "verified" | "local";

export function NewsChannels({
  session,
  channels,
  followed,
  onOpenChannel,
  onToggleFollow,
  onOpenStudio,
  notify,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DiscoverFilter>("all");

  const myChannels = useMemo(() => channels.filter((channel) => channel.isMine), [channels]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return channels
      .filter((channel) => {
        if (filter === "verified" && !channel.verified) return false;
        if (filter === "local" && channel.category !== "Local") return false;
        if (!needle) {
          // Owned channels already have a dedicated section above.
          if (channel.isMine) return false;
          return true;
        }

        return (
          channel.name.toLowerCase().includes(needle) ||
          channel.handle.toLowerCase().includes(needle) ||
          channel.description.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
        return b.subscribers - a.subscribers;
      });
  }, [channels, filter, query]);

  return (
    <main className="news-main news-channels">
      <div className="news-shell">
        <header className="news-page-head">
          <div>
            <p className="news-kicker">Newsrooms</p>
            <h1>Find your channel.</h1>
            <p>Independent desks, local voices and verified brands — all in one place.</p>
          </div>
          <button type="button" className="news-button news-button--blue" onClick={onOpenStudio}>
            <Plus size={15} strokeWidth={2.4} />
            Create
          </button>
        </header>

        <div className="news-search-field">
          <Search size={18} strokeWidth={2.1} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search channel name or @handle"
            aria-label="Search channels"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              Clear
            </button>
          ) : null}
        </div>

        <div className="news-filter-chips" role="group" aria-label="Channel filters">
          {(
            [
              ["all", "All channels"],
              ["verified", "Verified"],
              ["local", "Local"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`news-category-chip${filter === value ? " is-active" : ""}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {!query ? (
          <section className="news-block" aria-labelledby="your-channels">
            <NewsSectionHead
              eyebrow="Owned by you"
              title={myChannels.length > 0 ? "Your channels" : "Your newsroom starts here"}
              action={
                myChannels.length > 0 ? (
                  <button type="button" className="news-text-link" onClick={onOpenStudio}>
                    Manage
                    <ChevronRight size={14} strokeWidth={2.2} />
                  </button>
                ) : null
              }
            />

            {myChannels.length > 0 ? (
              <div className="news-own-channel-list">
                {myChannels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    className="news-own-channel"
                    onClick={() => onOpenChannel(channel.id)}
                  >
                    <ChannelAvatar channel={channel} size={44} />
                    <span className="news-own-channel__copy">
                      <span className="news-own-channel__name">{channel.name}</span>
                      <span className="news-own-channel__handle">@{channel.handle}</span>
                    </span>
                    <span className="news-own-channel__stat">
                      <Users size={13} strokeWidth={2.1} />
                      {formatCount(channel.subscribers)}
                    </span>
                    <ChevronRight size={16} strokeWidth={2.2} />
                  </button>
                ))}
              </div>
            ) : (
              <button type="button" className="news-studio-invite" onClick={onOpenStudio}>
                <span className="news-studio-invite__mark">
                  <Building2 size={24} strokeWidth={1.7} />
                </span>
                <span>
                  <span className="news-studio-invite__title">
                    Anyone can open a news channel
                  </span>
                  <span className="news-studio-invite__text">
                    Build a local desk, a niche brief or your own media brand. Ownership stays visible
                    on every profile.
                  </span>
                </span>
                <ArrowUpRight size={18} strokeWidth={2.1} />
              </button>
            )}
          </section>
        ) : null}

        <section className="news-block" aria-labelledby="discover-channels">
          <NewsSectionHead
            eyebrow={query ? `${results.length} matches` : "Explore the network"}
            title={query ? "Search results" : "Newsrooms to know"}
            action={
              filter === "verified" ? (
                <span className="news-section-head__note">
                  <BadgeCheck size={13} strokeWidth={2.3} /> Trusted
                </span>
              ) : null
            }
          />

          {results.length > 0 ? (
            <div className="news-channel-grid">
              {results.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  following={followed.includes(channel.id)}
                  onOpen={() => onOpenChannel(channel.id)}
                  onToggleFollow={() => onToggleFollow(channel.id)}
                />
              ))}
            </div>
          ) : (
            <div className="news-empty">
              <Search size={22} strokeWidth={1.8} />
              <p>No channel matches “{query}”. Try a name, handle or category.</p>
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </section>

        <section className="news-trust-note">
          <span className="news-trust-note__icon">
            <Sparkles size={19} strokeWidth={1.8} />
          </span>
          <div>
            <h2>Open to everyone. Verified for trust.</h2>
            <p>
              Every account can create a channel. Larger brands can receive a Verified newsroom
              certificate after review; posting and subscriber tools stay the same.
            </p>
          </div>
          <button
            type="button"
            onClick={() => notify("Verification applications open in the next release.")}
          >
            Learn more
            <ChevronRight size={14} strokeWidth={2.2} />
          </button>
        </section>

        <p className="news-signed-note">
          Signed in as @{session.nickname}. Channels are separate from your personal profile.
        </p>
      </div>
    </main>
  );
}

function ChannelCard({
  channel,
  following,
  onOpen,
  onToggleFollow,
}: {
  channel: NewsChannel;
  following: boolean;
  onOpen: () => void;
  onToggleFollow: () => void;
}) {
  return (
    <article className={`news-channel-card${channel.isMine ? " is-mine" : ""}`}>
      <button
        type="button"
        className="news-channel-card__cover"
        onClick={onOpen}
        aria-label={`Open ${channel.name}`}
        style={{
          background: channel.cover
            ? undefined
            : `linear-gradient(135deg, ${channel.tone}, #101828)`,
        }}
      >
        {channel.cover ? <img src={channel.cover} alt="" loading="lazy" /> : null}
        <span className="news-channel-card__category">
          <CategoryLabel category={channel.category} />
        </span>
        {channel.isMine ? <span className="news-channel-card__mine">Your channel</span> : null}
      </button>

      <div className="news-channel-card__body">
        <div className="news-channel-card__head">
          <ChannelAvatar channel={channel} size={42} />
          <button type="button" className="news-channel-card__name" onClick={onOpen}>
            <span>
              {channel.name}
              {channel.verified ? <VerifiedBadge size={13} /> : null}
            </span>
            <span>@{channel.handle}</span>
          </button>
          <FollowButton following={following} onToggle={onToggleFollow} compact />
        </div>

        <p className="news-channel-card__desc">{channel.description}</p>

        <div className="news-channel-card__foot">
          <span>
            {formatCount(channel.subscribers)} subscribers
            <span>·</span>
            {channel.category}
          </span>
          <span className="news-channel-card__owner">By {channel.ownerName}</span>
        </div>
      </div>
    </article>
  );
}
