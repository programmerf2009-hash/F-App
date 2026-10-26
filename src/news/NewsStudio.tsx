import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BadgeCheck,
  Check,
  ChevronRight,
  Clapperboard,
  FileText,
  PenLine,
  Plus,
  Radio,
  Settings2,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import type { Session } from "../lib/auth";
import { ChannelAvatar, NewsSectionHead, VerifiedBadge } from "./NewsChrome";
import {
  acceptChannelTransfer,
  declineChannelTransfer,
  loadIncomingTransfers,
  newsErrorMessage,
  type NewsTransfer,
} from "./news-api";
import {
  formatCount,
  isFlashLive,
  type NewsArticle,
  type NewsChannel,
  type NewsFlash,
} from "./news-types";

type ManageTab = "profile" | "trust" | "ownership";

interface Props {
  session: Session;
  channels: NewsChannel[];
  myChannels: NewsChannel[];
  articles: NewsArticle[];
  flashes: NewsFlash[];
  onOpenChannel: (channelId: string) => void;
  onOpenCreate: () => void;
  onManageChannel: (channelId: string, tab?: ManageTab) => void;
  onComposeFlash: (channelId: string) => void;
  onComposeArticle: (channelId: string) => void;
  onComposeShort: (channelId: string) => void;
  onRefresh: () => void;
  notify: (message: string) => void;
}

function transferDeadline(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NewsStudio({
  session,
  channels,
  myChannels,
  articles,
  flashes,
  onOpenChannel,
  onOpenCreate,
  onManageChannel,
  onComposeFlash,
  onComposeArticle,
  onComposeShort,
  onRefresh,
  notify,
}: Props) {
  const [transfers, setTransfers] = useState<NewsTransfer[]>([]);
  const [transferBusy, setTransferBusy] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  const totalSubscribers = myChannels.reduce((sum, channel) => sum + channel.subscribers, 0);
  const channelIds = new Set(myChannels.map((channel) => channel.id));
  const postCount = articles.filter((article) => channelIds.has(article.channelId)).length;
  const liveFlashCount = flashes.filter(
    (flash) => channelIds.has(flash.channelId) && isFlashLive(flash),
  ).length;
  const ownedChannel = myChannels.find((channel) => channel.isOwner);

  useEffect(() => {
    let active = true;
    void loadIncomingTransfers(session.id)
      .then((next) => {
        if (active) setTransfers(next);
      })
      .catch(() => {
        /* Preview mode has no transfer table. */
      });
    return () => {
      active = false;
    };
  }, [session.id]);

  const answerTransfer = async (transfer: NewsTransfer, accept: boolean) => {
    if (transferBusy) return;
    setTransferBusy(transfer.id);
    setTransferError(null);
    try {
      if (accept) {
        await acceptChannelTransfer(transfer.id);
        notify("Channel transfer accepted. The newsroom is now in your Studio.");
        onRefresh();
      } else {
        await declineChannelTransfer(transfer.id);
        notify("Transfer declined. The channel stays with its current owner.");
      }
      setTransfers((previous) => previous.filter((item) => item.id !== transfer.id));
    } catch (error) {
      setTransferError(newsErrorMessage(error, "Could not answer this transfer."));
    } finally {
      setTransferBusy(null);
    }
  };

  return (
    <main className="news-main news-studio">
      <div className="news-shell">
        <header className="news-page-head">
          <div>
            <p className="news-kicker">Creator desk</p>
            <h1>Studio</h1>
            <p>Open a channel, publish video flashes, news Shorts and articles, and build a newsroom of your own.</p>
          </div>
          <button type="button" className="news-button news-button--blue" onClick={onOpenCreate}>
            <Plus size={15} strokeWidth={2.4} />
            New channel
          </button>
        </header>

        {transfers.length ? (
          <section className="news-block news-studio-transfers" aria-label="Ownership transfer requests">
            <NewsSectionHead
              eyebrow="Waiting for you"
              title="Ownership transfer requests"
            />
            <div className="news-studio-transfer-list">
              {transfers.map((transfer) => {
                const source = channels.find((item) => item.id === transfer.channelId);
                const channelName = source?.name ?? transfer.channelName ?? "A news channel";
                const channelHandle = source?.handle ?? transfer.channelHandle;
                const busy = transferBusy === transfer.id;
                return (
                  <article className="news-studio-transfer" key={transfer.id}>
                    <div className="news-studio-transfer__copy">
                      <strong>{channelName}</strong>
                      <p>
                        {channelHandle ? `@${channelHandle} · ` : ""}
                        The current owner wants to hand this channel to you. Accepting keeps
                        every post, subscriber and the handle.
                      </p>
                      {transfer.note ? <small>“{transfer.note}”</small> : null}
                      <span>Respond by {transferDeadline(transfer.expiresAt)}</span>
                    </div>
                    <div className="news-studio-transfer__actions">
                      <button
                        type="button"
                        className="news-button news-button--ghost"
                        disabled={busy}
                        onClick={() => void answerTransfer(transfer, false)}
                      >
                        <X size={14} strokeWidth={2.3} />
                        Decline
                      </button>
                      <button
                        type="button"
                        className="news-button news-button--blue"
                        disabled={busy}
                        onClick={() => void answerTransfer(transfer, true)}
                      >
                        <Check size={14} strokeWidth={2.3} />
                        {busy ? "Working..." : "Accept channel"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {transferError ? (
              <p className="news-form-error" role="alert">
                {transferError}
              </p>
            ) : null}
          </section>
        ) : null}

        {myChannels.length > 0 ? (
          <>
            <section className="news-studio-overview" aria-label="Studio overview">
              <div>
                <span>Channels</span>
                <strong>{myChannels.length}</strong>
              </div>
              <div>
                <span>Subscribers</span>
                <strong>{formatCount(totalSubscribers)}</strong>
              </div>
              <div>
                <span>Posts</span>
                <strong>{postCount}</strong>
              </div>
              <div>
                <span>Flash live</span>
                <strong>{liveFlashCount}</strong>
              </div>
            </section>

            <section className="news-block" aria-labelledby="studio-channels">
              <NewsSectionHead
                eyebrow="Owned by you"
                title="Your channels"
                action={
                  <button type="button" className="news-text-link" onClick={onOpenCreate}>
                    <Plus size={13} strokeWidth={2.4} />
                    Add
                  </button>
                }
              />

              <div className="news-studio-channel-list">
                {myChannels.map((channel) => (
                  <article className="news-studio-channel" key={channel.id}>
                    <button
                      type="button"
                      className="news-studio-channel__head"
                      onClick={() => onOpenChannel(channel.id)}
                    >
                      <ChannelAvatar channel={channel} size={46} />
                      <span>
                        <span className="news-studio-channel__name">
                          {channel.name}
                          {channel.verified ? <VerifiedBadge size={13} /> : null}
                        </span>
                        <span className="news-studio-channel__handle">@{channel.handle}</span>
                      </span>
                      <ChevronRight size={17} strokeWidth={2.2} />
                    </button>

                    <div className="news-studio-channel__stats">
                      <span>
                        <Users size={14} strokeWidth={2.1} />
                        {formatCount(channel.subscribers)} subscribers
                      </span>
                      <span>
                        <Radio size={14} strokeWidth={2.1} />
                        {channel.category}
                      </span>
                      <span>
                        <BadgeCheck size={14} strokeWidth={2.1} />
                        {channel.verified ? "Verified" : "Not verified"}
                      </span>
                    </div>

                    <div className="news-studio-channel__actions">
                      <button
                        type="button"
                        className="news-button news-button--ink"
                        onClick={() => onComposeFlash(channel.id)}
                      >
                        <Video size={15} strokeWidth={2.2} />
                        New flash
                      </button>
                      <button
                        type="button"
                        className="news-button news-button--ghost"
                        onClick={() => onComposeShort(channel.id)}
                      >
                        <Clapperboard size={15} strokeWidth={2.2} />
                        New short
                      </button>
                      <button
                        type="button"
                        className="news-button news-button--ghost"
                        onClick={() => onComposeArticle(channel.id)}
                      >
                        <FileText size={15} strokeWidth={2.2} />
                        Write article
                      </button>
                      <button
                        type="button"
                        className="news-button news-button--ghost"
                        onClick={() => onManageChannel(channel.id)}
                      >
                        <Settings2 size={15} strokeWidth={2.2} />
                        Manage
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="news-studio-hero" aria-labelledby="studio-empty-title">
            <span className="news-studio-hero__glow" aria-hidden="true" />
            <span className="news-studio-hero__mark">
              <PenLine size={28} strokeWidth={1.7} />
            </span>
            <p className="news-studio-hero__eyebrow">Your newsroom, your rules</p>
            <h2 id="studio-empty-title">Start with a name. Build the rest as you go.</h2>
            <p>
              Anyone can create a news channel. Publish recorded video flashes, news Shorts and
              articles, and grow a subscriber base without leaving F App.
            </p>
            <button type="button" className="news-button news-button--paper" onClick={onOpenCreate}>
              Create your first channel
              <ArrowUpRight size={16} strokeWidth={2.2} />
            </button>
            <div className="news-studio-hero__facts">
              <span>
                <Video size={15} strokeWidth={2} />
                Video-first Flash
              </span>
              <span>
                <FileText size={15} strokeWidth={2} />
                Long-form articles
              </span>
              <span>
                <BarChart3 size={15} strokeWidth={2} />
                Audience insight
              </span>
            </div>
          </section>
        )}

        <section className="news-block" aria-labelledby="studio-trust">
          <NewsSectionHead eyebrow="Built for real newsrooms" title="Trust and ownership" />

          <div className="news-studio-grid">
            <button
              type="button"
              className="news-studio-tile"
              onClick={() => {
                if (ownedChannel) {
                  onManageChannel(ownedChannel.id, "trust");
                } else if (myChannels.length) {
                  notify("Only the channel owner can request a certificate.");
                } else {
                  onOpenCreate();
                }
              }}
            >
              <span className="news-studio-tile__icon">
                <BadgeCheck size={20} strokeWidth={1.9} />
              </span>
              <span>
                <strong>Verified certificate</strong>
                <small>For established brands after a review. Same tools, visible trust.</small>
              </span>
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>

            <button
              type="button"
              className="news-studio-tile"
              onClick={() => {
                if (ownedChannel) {
                  onManageChannel(ownedChannel.id, "ownership");
                } else if (myChannels.length) {
                  notify("Only the channel owner can transfer this channel.");
                } else {
                  onOpenCreate();
                }
              }}
            >
              <span className="news-studio-tile__icon">
                <Users size={20} strokeWidth={1.9} />
              </span>
              <span>
                <strong>Transfer a channel</strong>
                <small>Owner stays visible. Name, handle, posts and subscribers stay with the channel.</small>
              </span>
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </div>
        </section>

        <section className="news-studio-note">
          <Sparkles size={18} strokeWidth={1.9} />
          <p>
            Signed in as <b>@{session.nickname}</b>. Channels are separate from your personal
            profile, so your friends and your newsroom can live side by side.
          </p>
        </section>
      </div>
    </main>
  );
}
