import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronRight,
  Clock3,
  Images,
  LoaderCircle,
  Lock,
  Music2,
  Pause,
  Pencil,
  Play,
  Search as SearchIcon,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { BottomNav, type Tab } from "../components/BottomNav";
import { PersonAvatar } from "../components/PersonAvatar";
import { SocialHeader } from "../components/SocialHeader";
import { Toast } from "../components/Toast";
import { getSongSignedUrl, type Session, type SongMeta } from "../lib/auth";
import { setPendingCount } from "../lib/pending";
import {
  acceptFriendRequest,
  friendCountLabel,
  getProfile,
  listFriendRequests,
  listFriends,
  refreshPendingBadge,
  removeFriendship,
  sendFriendRequest,
  socialErrorMessage,
  subscribeFriendships,
  type FriendPerson,
  type FriendRequest,
  type PublicProfile,
} from "../lib/social";
import { formatDuration } from "../lib/song-store";
import type { Theme } from "../lib/theme";
import "./social.css";

type ProfileTab = "posts" | "friends" | "requests";

interface PageProps {
  session: Session;
  theme: Theme;
  target: string | null;
  onOpenProfile: (nickname: string) => void;
  onCloseTarget: () => void;
  onNavigate: (tab: Tab) => void;
}

export function Profile({
  session,
  theme,
  target,
  onOpenProfile,
  onCloseTarget,
  onNavigate,
}: PageProps) {
  return (
    <div className="profile" data-theme={theme}>
      <SocialHeader badge="Profile" />

      <main className="social__main">
        {target ? null : (
          <div className="social__head">
            <p className="social__eyebrow">Account</p>
            <h1 className="social__title">Profile</h1>
            <p className="social__sub">Your card, your friends and incoming requests.</p>
          </div>
        )}

        <ProfileView
          nickname={target ?? session.nickname}
          onBack={target ? onCloseTarget : undefined}
          onOpenProfile={onOpenProfile}
          onEditProfile={() => onNavigate("settings")}
          onGoSearch={() => onNavigate("search")}
        />
      </main>

      <BottomNav active="profile" onNavigate={onNavigate} />
    </div>
  );
}

interface ViewProps {
  nickname: string;
  onBack?: () => void;
  onOpenProfile: (nickname: string) => void;
  onEditProfile?: () => void;
  onGoSearch?: () => void;
}

export function ProfileView({
  nickname,
  onBack,
  onOpenProfile,
  onEditProfile,
  onGoSearch,
}: ViewProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [friends, setFriends] = useState<FriendPerson[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const load = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setStatus("loading");
        setLoadError(null);
      }

      try {
        const next = await getProfile(nickname);
        if (!next) {
          setProfile(null);
          setStatus("missing");
          setFriends([]);
          setRequests([]);
          return;
        }

        setProfile(next);
        setStatus("ready");

        if (next.relation === "self") {
          try {
            const [nextFriends, nextRequests] = await Promise.all([
              listFriends(next.id),
              listFriendRequests(),
            ]);
            setFriends(nextFriends);
            setRequests(nextRequests);
            setPendingCount(nextRequests.length);
          } catch {
            /* card still renders; lists can retry */
          }
        } else if (next.relation === "friends") {
          try {
            setFriends(await listFriends(next.id));
          } catch {
            setFriends([]);
          }
          setRequests([]);
        } else {
          setFriends([]);
          setRequests([]);
        }
      } catch (caught) {
        setLoadError(socialErrorMessage(caught, "Could not load this profile."));
        setStatus("error");
      }
    },
    [nickname],
  );

  useEffect(() => {
    setTab("posts");
    setProfile(null);
    setFriends([]);
    setRequests([]);
    setConfirmRemove(false);
    void load(true);
  }, [load]);

  useEffect(() => {
    return subscribeFriendships(() => {
      void load(false);
    });
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    if (tab === "friends" && !profile.privateVisible) setTab("posts");
    if (tab === "requests" && profile.relation !== "self") setTab("posts");
  }, [profile, tab]);

  const runAction = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    try {
      await action();
      showToast(success);
      await load(false);
    } catch (caught) {
      showToast(socialErrorMessage(caught, "Could not complete this action."));
    } finally {
      setBusy(null);
    }
  };

  const addFriend = () => {
    if (!profile) return;
    void runAction("send", () => sendFriendRequest(profile.id).then(() => undefined), "Friend request sent");
  };

  const acceptCurrent = () => {
    if (!profile?.friendshipId) return;
    const requestId = profile.friendshipId;
    void runAction(
      "accept",
      async () => {
        await acceptFriendRequest(requestId);
        await refreshPendingBadge();
      },
      "You are now friends",
    );
  };

  const declineCurrent = () => {
    if (!profile?.friendshipId) return;
    const requestId = profile.friendshipId;
    void runAction("decline", () => removeFriendship(requestId), "Request declined");
  };

  const cancelCurrent = () => {
    if (!profile?.friendshipId) return;
    const requestId = profile.friendshipId;
    void runAction("cancel", () => removeFriendship(requestId), "Request cancelled");
  };

  const removeCurrent = async () => {
    if (!profile?.friendshipId) return;
    setBusy("remove");
    try {
      await removeFriendship(profile.friendshipId);
      setConfirmRemove(false);
      showToast("Friend removed");
      await load(false);
    } catch (caught) {
      showToast(socialErrorMessage(caught, "Could not remove this friend."));
    } finally {
      setBusy(null);
    }
  };

  const acceptRequest = async (request: FriendRequest) => {
    const key = `req-accept-${request.friendshipId}`;
    setBusy(key);
    try {
      await acceptFriendRequest(request.friendshipId);
      await refreshPendingBadge();
      showToast("You are now friends");
      await load(false);
    } catch (caught) {
      showToast(socialErrorMessage(caught, "Could not accept the request."));
    } finally {
      setBusy(null);
    }
  };

  const declineRequest = async (request: FriendRequest) => {
    const key = `req-decline-${request.friendshipId}`;
    setBusy(key);
    try {
      await removeFriendship(request.friendshipId);
      await refreshPendingBadge();
      showToast("Request declined");
      await load(false);
    } catch (caught) {
      showToast(socialErrorMessage(caught, "Could not decline the request."));
    } finally {
      setBusy(null);
    }
  };

  if (status === "loading") {
    return (
      <div className="profile-view">
        {onBack ? (
          <button type="button" className="profile__back" onClick={onBack}>
            <ArrowLeft size={15} strokeWidth={2.2} />
            <span>Back</span>
          </button>
        ) : null}
        <div className="social__state">
          <LoaderCircle size={26} className="spin" />
          <p>Loading profile…</p>
        </div>
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="profile-view">
        {onBack ? (
          <button type="button" className="profile__back" onClick={onBack}>
            <ArrowLeft size={15} strokeWidth={2.2} />
            <span>Back</span>
          </button>
        ) : null}
        <div className="social__state social__state--soft">
          <Users size={26} strokeWidth={1.8} />
          <h2>Account not found</h2>
          <p>This nickname does not exist or the account was deleted.</p>
        </div>
      </div>
    );
  }

  if (status === "error" || !profile) {
    return (
      <div className="profile-view">
        {onBack ? (
          <button type="button" className="profile__back" onClick={onBack}>
            <ArrowLeft size={15} strokeWidth={2.2} />
            <span>Back</span>
          </button>
        ) : null}
        <div className="social__state social__state--soft">
          <Users size={26} strokeWidth={1.8} />
          <h2>Could not load profile</h2>
          <p>{loadError ?? "Try again in a moment."}</p>
          <button type="button" className="pbtn pbtn--ghost" onClick={() => void load(true)}>
            Try again
          </button>
        </div>
        <Toast message={toast} />
      </div>
    );
  }

  const isSelf = profile.relation === "self";
  const privateVisible = profile.privateVisible;
  const disabled = busy !== null;

  return (
    <div className="profile-view">
      {onBack ? (
        <button type="button" className="profile__back" onClick={onBack}>
          <ArrowLeft size={15} strokeWidth={2.2} />
          <span>Back</span>
        </button>
      ) : null}

      <section className="profile__hero" aria-label="Profile card">
        <div className="profile__top">
          <PersonAvatar url={profile.avatar} name={profile.firstName} size="lg" />

          <div className="profile__id">
            <h2 className="profile__name">
              {profile.firstName} {profile.lastName}
            </h2>
            <p className="profile__nick">@{profile.nickname}</p>
            <p className="profile__count">
              <Users size={13} strokeWidth={2} />
              <span>{friendCountLabel(profile.friendCount)}</span>
            </p>
          </div>
        </div>

        <div className="profile__actions">
          {isSelf ? (
            onEditProfile ? (
              <button type="button" className="pbtn pbtn--primary" onClick={onEditProfile}>
                <Pencil size={15} strokeWidth={2.2} />
                Edit profile
              </button>
            ) : null
          ) : profile.relation === "friends" ? (
            <>
              <span className="pchip">
                <UserCheck size={14} strokeWidth={2.3} />
                Friends
              </span>
              <button
                type="button"
                className="pbtn pbtn--ghost pbtn--danger"
                onClick={() => setConfirmRemove(true)}
                disabled={disabled}
              >
                <UserMinus size={15} strokeWidth={2.2} />
                Remove
              </button>
            </>
          ) : profile.relation === "requested" ? (
            <>
              <span className="pchip pchip--muted">
                <Clock3 size={14} strokeWidth={2.2} />
                Request sent
              </span>
              <button
                type="button"
                className="pbtn pbtn--ghost"
                onClick={cancelCurrent}
                disabled={disabled}
              >
                {busy === "cancel" ? <LoaderCircle size={15} className="spin" /> : <X size={15} />}
                Cancel
              </button>
            </>
          ) : profile.relation === "incoming" ? (
            <>
              <button
                type="button"
                className="pbtn pbtn--primary"
                onClick={acceptCurrent}
                disabled={disabled}
              >
                {busy === "accept" ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Check size={16} strokeWidth={2.4} />
                )}
                Accept request
              </button>
              <button
                type="button"
                className="pbtn pbtn--ghost"
                onClick={declineCurrent}
                disabled={disabled}
              >
                {busy === "decline" ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <X size={15} />
                )}
                Decline
              </button>
            </>
          ) : (
            <button type="button" className="pbtn pbtn--primary" onClick={addFriend} disabled={disabled}>
              {busy === "send" ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <UserPlus size={16} strokeWidth={2.3} />
              )}
              Add friend
            </button>
          )}
        </div>

        {privateVisible ? (
          <>
            {profile.bio ? <p className="profile__bio">{profile.bio}</p> : null}

            {profile.profession ? (
              <p className="profile__meta-row">
                <Briefcase size={14} strokeWidth={2} />
                <span>{profile.profession}</span>
              </p>
            ) : null}

            {profile.song ? <ProfileSong song={profile.song} /> : null}
          </>
        ) : (
          <div className="profile__notice">
            <Lock size={14} strokeWidth={2.1} />
            <span>
              {profile.relation === "requested"
                ? `Request sent to ${profile.firstName}. Bio, profession, favorite song and friends appear once it is accepted.`
                : profile.relation === "incoming"
                  ? `${profile.firstName} sent you a request. Accept it to see bio, profession, favorite song and friends.`
                  : `Add ${profile.firstName} as a friend to see bio, profession, favorite song and friends.`}
            </span>
          </div>
        )}
      </section>

      <div className="profile__tabs" role="tablist" aria-label="Profile sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "posts"}
          className={`profile__tab${tab === "posts" ? " is-active" : ""}`}
          onClick={() => setTab("posts")}
        >
          Posts
        </button>

        {privateVisible ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "friends"}
            className={`profile__tab${tab === "friends" ? " is-active" : ""}`}
            onClick={() => setTab("friends")}
          >
            Friends
          </button>
        ) : null}

        {isSelf ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "requests"}
            className={`profile__tab${tab === "requests" ? " is-active" : ""}`}
            onClick={() => setTab("requests")}
          >
            Requests
            {requests.length > 0 ? (
              <span className="profile__tab-badge">{requests.length > 9 ? "9+" : requests.length}</span>
            ) : null}
          </button>
        ) : null}
      </div>

      {tab === "posts" ? (
        <div className="profile__panel">
          <div className="social__state social__state--soft">
            <Images size={26} strokeWidth={1.8} />
            <h2>{privateVisible ? "No posts yet" : "No public posts yet"}</h2>
            <p>
              {privateVisible
                ? "Photos and videos will appear here."
                : "This account has no public photos or videos."}
            </p>
          </div>
        </div>
      ) : null}

      {tab === "friends" ? (
        <div className="profile__panel">
          {friends.length === 0 ? (
            <div className="social__state social__state--soft">
              <Users size={26} strokeWidth={1.8} />
              <h2>No friends yet</h2>
              {isSelf && onGoSearch ? (
                <>
                  <p>Find people by nickname, name or surname.</p>
                  <button type="button" className="pbtn pbtn--ghost" onClick={onGoSearch}>
                    <SearchIcon size={15} strokeWidth={2.2} />
                    Find people
                  </button>
                </>
              ) : (
                <p>Friends will appear here.</p>
              )}
            </div>
          ) : (
            <div className="plist">
              {friends.map((friend) => (
                <button
                  type="button"
                  className="prow"
                  key={friend.id}
                  onClick={() => onOpenProfile(friend.nickname)}
                >
                  <PersonAvatar url={friend.avatar} name={friend.firstName} size="sm" />
                  <span className="prow__body">
                    <span className="prow__name">
                      {friend.firstName} {friend.lastName}
                    </span>
                    <span className="prow__nick">@{friend.nickname}</span>
                  </span>
                  <ChevronRight size={15} strokeWidth={2} className="prow__chev" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "requests" ? (
        <div className="profile__panel">
          {requests.length === 0 ? (
            <div className="social__state social__state--soft">
              <UserCheck size={26} strokeWidth={1.8} />
              <h2>No pending requests</h2>
              <p>When someone adds you, their request appears here.</p>
            </div>
          ) : (
            <div className="plist">
              {requests.map((request) => {
                const accepting = busy === `req-accept-${request.friendshipId}`;
                const declining = busy === `req-decline-${request.friendshipId}`;

                return (
                  <div className="prow prow--request" key={request.friendshipId}>
                    <PersonAvatar url={request.avatar} name={request.firstName} size="sm" />
                    <button
                      type="button"
                      className="prow__body prow__body--button"
                      onClick={() => onOpenProfile(request.nickname)}
                    >
                      <span className="prow__name">
                        {request.firstName} {request.lastName}
                      </span>
                      <span className="prow__nick">@{request.nickname}</span>
                    </button>
                    <span className="prow__actions">
                      <button
                        type="button"
                        className="pbtn pbtn--primary pbtn--sm"
                        onClick={() => void acceptRequest(request)}
                        disabled={disabled}
                      >
                        {accepting ? <LoaderCircle size={13} className="spin" /> : null}
                        Accept
                      </button>
                      <button
                        type="button"
                        className="pbtn pbtn--ghost pbtn--sm"
                        onClick={() => void declineRequest(request)}
                        disabled={disabled}
                      >
                        {declining ? <LoaderCircle size={13} className="spin" /> : null}
                        Decline
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <Toast message={toast} />

      {confirmRemove ? (
        <div className="confirm" role="dialog" aria-modal="true" aria-label="Remove friend">
          <button
            type="button"
            className="confirm__scrim"
            onClick={() => setConfirmRemove(false)}
            aria-label="Close"
          />
          <div className="confirm__box">
            <h2 className="confirm__title">Remove friend?</h2>
            <p className="confirm__text">
              {profile.firstName} will be removed from your friends. You can send a new request
              later.
            </p>
            <div className="confirm__actions">
              <button
                type="button"
                className="pbtn pbtn--ghost"
                onClick={() => setConfirmRemove(false)}
                disabled={busy === "remove"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pbtn pbtn--danger-solid"
                onClick={() => void removeCurrent()}
                disabled={busy === "remove"}
              >
                {busy === "remove" ? <LoaderCircle size={14} className="spin" /> : null}
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfileSong({ song }: { song: SongMeta }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);

    getSongSignedUrl(song.path)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [song.path]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => setFailed(true));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const duration = song.duration > 0 ? song.duration : 0;
  const max = duration > 0 ? duration : 0.1;

  return (
    <div className="psong">
      <button
        type="button"
        className="psong__play"
        onClick={toggle}
        disabled={!url || failed}
        aria-label={playing ? "Pause favorite song" : "Play favorite song"}
      >
        {!url && !failed ? (
          <LoaderCircle size={16} className="spin" />
        ) : playing ? (
          <Pause size={16} strokeWidth={2.2} />
        ) : (
          <Play size={16} strokeWidth={2.2} />
        )}
      </button>

      <div className="psong__body">
        <p className="psong__name">
          <Music2 size={12} strokeWidth={2.2} />
          <span>{song.name}</span>
        </p>

        {failed ? (
          <p className="psong__note">Song is unavailable right now.</p>
        ) : (
          <>
            <input
              className="psong__seek"
              type="range"
              min={0}
              max={max}
              step={0.1}
              value={Math.min(progress, max)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setProgress(next);
                if (audioRef.current) audioRef.current.currentTime = next;
              }}
              aria-label="Song position"
              disabled={!url}
            />
            <div className="psong__times">
              <span>{formatDuration(progress)}</span>
              <span>{duration > 0 ? formatDuration(duration) : "—"}</span>
            </div>
          </>
        )}
      </div>

      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        hidden
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime ?? 0)}
      />
    </div>
  );
}
