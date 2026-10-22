import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search as SearchIcon,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { BottomNav, type Tab } from "../components/BottomNav";
import { PersonAvatar } from "../components/PersonAvatar";
import { SocialHeader } from "../components/SocialHeader";
import { Toast } from "../components/Toast";
import { ProfileView } from "./Profile";
import {
  acceptFriendRequest,
  friendCountLabel,
  refreshPendingBadge,
  searchPeople,
  sendFriendRequest,
  socialErrorMessage,
  subscribeFriendships,
  type SearchPerson,
} from "../lib/social";
import type { Theme } from "../lib/theme";
import "./social.css";

interface Props {
  theme: Theme;
  onNavigate: (tab: Tab) => void;
}

type Status = "idle" | "loading" | "ready" | "error";

export function SearchPage({ theme, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPerson[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const requestRef = useRef(0);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const runSearch = useCallback(async (value: string) => {
    const term = value.trim();
    if (term.length < 2) {
      setResults([]);
      setStatus("idle");
      setError(null);
      return;
    }

    const requestId = ++requestRef.current;
    setStatus("loading");
    setError(null);

    try {
      const rows = await searchPeople(term);
      if (requestId !== requestRef.current) return;
      setResults(rows);
      setStatus("ready");
    } catch (caught) {
      if (requestId !== requestRef.current) return;
      setError(socialErrorMessage(caught, "Could not search right now."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    return subscribeFriendships(() => {
      if (query.trim().length >= 2) void runSearch(query);
    });
  }, [query, runSearch]);

  useEffect(() => {
    const term = query.trim();

    if (term.length < 2) {
      requestRef.current += 1;
      setResults([]);
      setStatus("idle");
      setError(null);
      return;
    }

    setStatus("loading");
    const timer = window.setTimeout(() => {
      void runSearch(term);
    }, 260);

    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  const handleAdd = async (person: SearchPerson) => {
    setBusyId(person.id);
    try {
      await sendFriendRequest(person.id);
      setResults((previous) =>
        previous.map((item) =>
          item.id === person.id ? { ...item, relation: "requested", friendshipId: null } : item,
        ),
      );
      showToast("Friend request sent");
    } catch (caught) {
      showToast(socialErrorMessage(caught, "Could not send the request."));
    } finally {
      setBusyId(null);
    }
  };

  const handleAccept = async (person: SearchPerson) => {
    if (!person.friendshipId) return;

    setBusyId(person.id);
    try {
      await acceptFriendRequest(person.friendshipId);
      setResults((previous) =>
        previous.map((item) =>
          item.id === person.id
            ? {
                ...item,
                relation: "friends",
                friendshipId: item.friendshipId,
                friendCount: item.friendCount + 1,
              }
            : item,
        ),
      );
      await refreshPendingBadge();
      showToast("You are now friends");
    } catch (caught) {
      showToast(socialErrorMessage(caught, "Could not accept the request."));
    } finally {
      setBusyId(null);
    }
  };

  const closeProfile = () => {
    setSelected(null);
    void runSearch(query);
  };

  if (selected) {
    return (
      <div className="search" data-theme={theme}>
        <SocialHeader badge="Search" />
        <main className="social__main">
          <ProfileView
            nickname={selected}
            onBack={closeProfile}
            onOpenProfile={setSelected}
            onEditProfile={() => onNavigate("settings")}
            onGoSearch={closeProfile}
          />
        </main>
        <BottomNav active="search" onNavigate={onNavigate} />
      </div>
    );
  }

  const term = query.trim();
  const shortQuery = term.length > 0 && term.length < 2;

  return (
    <div className="search" data-theme={theme}>
      <SocialHeader badge="Search" />

      <main className="social__main">
        <div className="social__head">
          <p className="social__eyebrow">People</p>
          <h1 className="social__title">Search</h1>
          <p className="social__sub">Find people by nickname, first name or last name.</p>
        </div>

        <div className="searchbar">
          <SearchIcon size={18} strokeWidth={2} className="searchbar__icon" />
          <input
            className="searchbar__input"
            type="search"
            name="search"
            placeholder="Search people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search people by name or nickname"
          />
          {query ? (
            <button
              type="button"
              className="searchbar__clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X size={15} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>

        {shortQuery ? (
          <p className="search__hint">Type at least 2 characters.</p>
        ) : null}

        {status === "loading" ? (
          <div className="results" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <div className="result result--skeleton" key={item}>
                <span className="psk psk--avatar" />
                <span className="psk__body">
                  <span className="psk psk--line" />
                  <span className="psk psk--short" />
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {status === "idle" && !shortQuery ? (
          <div className="social__state social__state--soft">
            <span className="social__state-icon">
              <SearchIcon size={24} strokeWidth={1.8} />
            </span>
            <h2>Find people</h2>
            <p>Search by nickname, first name or last name. Results show public profile cards only.</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="social__state social__state--soft">
            <span className="social__state-icon">
              <RefreshCw size={24} strokeWidth={1.8} />
            </span>
            <h2>Could not search</h2>
            <p>{error}</p>
            <button type="button" className="pbtn pbtn--ghost" onClick={() => void runSearch(query)}>
              Try again
            </button>
          </div>
        ) : null}

        {status === "ready" && results.length === 0 ? (
          <div className="social__state social__state--soft">
            <span className="social__state-icon">
              <SearchIcon size={24} strokeWidth={1.8} />
            </span>
            <h2>No accounts found</h2>
            <p>No one matches “{term}”. Check the spelling or try a nickname.</p>
          </div>
        ) : null}

        {status === "ready" && results.length > 0 ? (
          <div className="results" aria-label="Search results">
            {results.map((person) => (
              <div className="result" key={person.id}>
                <button
                  type="button"
                  className="result__open"
                  onClick={() => setSelected(person.nickname)}
                >
                  <PersonAvatar url={person.avatar} name={person.firstName} size="md" />
                  <span className="result__body">
                    <span className="result__name">
                      {person.firstName} {person.lastName}
                    </span>
                    <span className="result__meta">
                      <span className="result__nick">@{person.nickname}</span>
                      <span className="result__dot">·</span>
                      <span>{friendCountLabel(person.friendCount)}</span>
                    </span>
                  </span>
                </button>

                {person.relation === "friends" ? (
                  <span className="result__icon is-friend" title="Friends">
                    <UserCheck size={17} strokeWidth={2.1} />
                  </span>
                ) : person.relation === "requested" ? (
                  <span className="result__icon is-muted" title="Request sent">
                    <Clock3 size={17} strokeWidth={2} />
                  </span>
                ) : person.relation === "incoming" ? (
                  <button
                    type="button"
                    className="result__icon is-action"
                    onClick={() => void handleAccept(person)}
                    disabled={busyId === person.id}
                    aria-label={`Accept ${person.firstName}'s friend request`}
                    title="Accept request"
                  >
                    {busyId === person.id ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Check size={18} strokeWidth={2.4} />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="result__icon is-action"
                    onClick={() => void handleAdd(person)}
                    disabled={busyId === person.id}
                    aria-label={`Add ${person.firstName} as a friend`}
                    title="Add friend"
                  >
                    {busyId === person.id ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <UserPlus size={17} strokeWidth={2.1} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </main>

      <BottomNav active="search" onNavigate={onNavigate} />
      <Toast message={toast} />
    </div>
  );
}
