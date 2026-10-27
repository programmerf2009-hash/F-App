import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Session } from "../lib/auth";
import { PlaceSheet } from "../app/PlaceSheet";
import {
  getPosition,
  nearestPlace,
  fetchWeather,
  type WeatherNow,
} from "../lib/weather";
import { NewsTopBar, NewsNav } from "./NewsChrome";
import { NewsHome } from "./NewsHome";
import { NewsChannels } from "./NewsChannels";
import { NewsShorts } from "./NewsShorts";
import { NewsSettings } from "./NewsSettings";
import { NewsStudio } from "./NewsStudio";
import {
  NewsArticleView,
  NewsChannelView,
  NewsFlashView,
  NewsSearchView,
} from "./NewsViews";
import { CreateChannelSheet, WeatherSheet } from "./NewsSheets";
import { ManageChannelSheet } from "./NewsManage";
import {
  ArticleComposerSheet,
  FlashComposerSheet,
  ShortComposerSheet,
} from "./NewsComposer";
import { DEMO_ARTICLES, DEMO_CHANNELS, DEMO_FLASHES, DEMO_SHORTS } from "./news-data";
import {
  createLiveChannel,
  loadMyNewsState,
  loadNewsSnapshot,
  loadSavedArticles,
  newsErrorMessage,
  saveNewsPreferences,
  setNewsSubscription,
  toggleSavedArticle as persistSavedArticle,
  toggleShortReaction as persistShortReaction,
  type NewsSnapshot,
  type ShortReaction,
} from "./news-api";
import {
  loadFollowed,
  loadMyChannels,
  loadNewsPrefs,
  resolvePlace,
  saveFollowed,
  saveMyChannels,
  saveNewsPrefs,
} from "./news-prefs";
import { supabaseConfigured } from "../lib/supabase";
import {
  categoryAccent,
  isFlashLive,
  slugifyHandle,
  type CreateChannelInput,
  type NewsArticle,
  type NewsChannel,
  type NewsPrefs,
  type NewsTab,
} from "./news-types";
import "./news.css";

type ViewState =
  | { type: "article"; id: string }
  | { type: "channel"; id: string }
  | { type: "flash"; id: string }
  | null;

type SheetState =
  | { type: "weather" }
  | { type: "place" }
  | { type: "create" }
  | { type: "flash"; channelId: string }
  | { type: "short"; channelId: string }
  | { type: "article"; channelId: string }
  | {
      type: "manage";
      channelId: string;
      tab?: "profile" | "trust" | "ownership";
    }
  | null;

interface Props {
  session: Session;
  onClose: () => void;
}

function appendUnique<T extends { id: string }>(base: T[], incoming: T[]): T[] {
  if (!incoming.length) return base;
  const seen = new Set(base.map((item) => item.id));
  return [...base, ...incoming.filter((item) => !seen.has(item.id))];
}

function withEngagement(list: string[], id: string, active: boolean): string[] {
  if (!active) return list.filter((item) => item !== id);
  return list.includes(id) ? list : [...list, id];
}

/**
 * F News & Weather — a fixed-identity product inside F App.
 *
 * It has its own five-tab navigation, Paper & Signal palette and editorial
 * type system. The original F App logo is always used unchanged.
 */
export function NewsApp({ session, onClose }: Props) {
  const [tab, setTab] = useState<NewsTab>("home");
  const [prefs, setPrefs] = useState<NewsPrefs>(loadNewsPrefs);
  const [followed, setFollowed] = useState<string[]>(loadFollowed);
  const [localChannels, setLocalChannels] = useState<NewsChannel[]>(loadMyChannels);
  const [snapshot, setSnapshot] = useState<NewsSnapshot | null>(null);
  const [extraArticles, setExtraArticles] = useState<NewsArticle[]>([]);
  const [extraChannels, setExtraChannels] = useState<NewsChannel[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [live, setLive] = useState(false);
  const [initialLoading, setInitialLoading] = useState(supabaseConfigured);

  const [view, setView] = useState<ViewState>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const [savedArticles, setSavedArticles] = useState<string[]>([]);
  const [likedShorts, setLikedShorts] = useState<string[]>([]);
  const [savedShorts, setSavedShorts] = useState<string[]>([]);
  const [libraryArticles, setLibraryArticles] = useState<NewsArticle[]>([]);
  const [libraryChannels, setLibraryChannels] = useState<NewsChannel[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<"loading" | "ready" | "error">("loading");

  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<number | null>(null);

  const baseChannels = useMemo(
    () => snapshot?.channels ?? [...localChannels, ...DEMO_CHANNELS],
    [localChannels, snapshot],
  );
  const channels = useMemo(
    () => appendUnique(baseChannels, extraChannels),
    [baseChannels, extraChannels],
  );
  const articles = useMemo(
    () => appendUnique(snapshot?.articles ?? DEMO_ARTICLES, extraArticles),
    [extraArticles, snapshot],
  );
  const flashes = snapshot?.flashes ?? DEMO_FLASHES;
  const shorts = snapshot?.shorts ?? DEMO_SHORTS;
  const myChannels = useMemo(
    () => (snapshot ? channels.filter((channel) => channel.isMine === true) : localChannels),
    [channels, localChannels, snapshot],
  );

  const liveFlashes = useMemo(() => flashes.filter((flash) => isFlashLive(flash)), [flashes]);

  /**
   * The Settings library must reflect the current saved set immediately, even
   * while the server refresh is still in flight. Snapshot stories fill the gap
   * for a story saved during this session; hydrated rows cover older saves.
   */
  const savedStories = useMemo(() => {
    if (!live) return articles.filter((item) => savedArticles.includes(item.id));
    const hydrated = new Set(libraryArticles.map((item) => item.id));
    const fresh = articles.filter(
      (item) => savedArticles.includes(item.id) && !hydrated.has(item.id),
    );
    return [
      ...fresh,
      ...libraryArticles.filter((item) => savedArticles.includes(item.id)),
    ];
  }, [articles, libraryArticles, live, savedArticles]);

  const place = useMemo(() => resolvePlace(prefs), [prefs]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  /** Feed and search pages can introduce channels outside the top snapshot. */
  const rememberContent = useCallback(
    (nextArticles: NewsArticle[], nextChannels: NewsChannel[]) => {
      if (nextArticles.length) {
        setExtraArticles((previous) => appendUnique(previous, nextArticles));
      }
      if (nextChannels.length) {
        setExtraChannels((previous) => appendUnique(previous, nextChannels));
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const loadLive = useCallback(async () => {
    if (!supabaseConfigured) {
      setInitialLoading(false);
      return;
    }

    try {
      const [next, engagement] = await Promise.all([
        loadNewsSnapshot(session),
        loadMyNewsState(),
      ]);
      setSnapshot(next);
      setFollowed(next.followed);
      setSavedArticles(engagement.savedArticles);
      setLikedShorts(engagement.likedShorts);
      setSavedShorts(engagement.savedShorts);
      if (next.prefs) {
        setPrefs((previous) => ({ ...previous, ...next.prefs }));
      }
      setLive(true);
      setDataVersion((value) => value + 1);
    } catch {
      // Missing schema or offline: keep the local-first preview edition.
      setSnapshot(null);
      setLive(false);
    } finally {
      setInitialLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadLive();
  }, [loadLive]);

  useEffect(() => {
    saveNewsPrefs(prefs);

    if (!live) return;
    const timer = window.setTimeout(() => {
      void saveNewsPreferences(session.id, prefs).catch(() => {
        /* keep local preferences if the server is unavailable */
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [live, prefs, session.id]);

  useEffect(() => {
    saveFollowed(followed);
  }, [followed]);

  useEffect(() => {
    saveMyChannels(localChannels);
  }, [localChannels]);

  const loadWeather = useCallback(async () => {
    setWeatherStatus("loading");

    try {
      const next = await fetchWeather(place);
      setWeather(next);
      setWeatherStatus("ready");
    } catch {
      setWeatherStatus("error");
    }
  }, [place]);

  useEffect(() => {
    void loadWeather();
  }, [loadWeather]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (view) {
        setView(null);
      } else if (searchOpen) {
        setSearchOpen(false);
      } else if (sheet) {
        setSheet(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, sheet, view]);

  const navigate = (next: NewsTab) => {
    setTab(next);
    setView(null);
    setSearchOpen(false);
    setSheet(null);
  };

  const toggleFollow = async (channelId: string) => {
    const channel = channels.find((item) => item.id === channelId);
    const exists = followed.includes(channelId);
    const nextFollow = !exists;

    setFollowed((previous) =>
      exists ? previous.filter((id) => id !== channelId) : [...previous, channelId],
    );

    if (live) {
      try {
        await setNewsSubscription(channelId, session.id, nextFollow);
        // Keep the snapshot count in step with the write, so the card does not
        // show the pre-follow number until the next full load.
        setSnapshot((previous) =>
          previous
            ? {
                ...previous,
                channels: previous.channels.map((item) =>
                  item.id === channelId
                    ? { ...item, subscribers: Math.max(0, item.subscribers + (nextFollow ? 1 : -1)) }
                    : item,
                ),
              }
            : previous,
        );
        // The following feed is server-filtered, so refresh only after the
        // subscription write has landed.
        setDataVersion((value) => value + 1);
      } catch (error) {
        setFollowed((previous) =>
          exists ? [...previous, channelId] : previous.filter((id) => id !== channelId),
        );
        notify(newsErrorMessage(error, "Could not update this follow."));
        return;
      }
    }

    notify(
      exists
        ? `Unfollowed ${channel?.name ?? "channel"}`
        : `Following ${channel?.name ?? "channel"}`,
    );
  };

  const toggleArticleSave = useCallback(
    (articleId: string) => {
      const wasSaved = savedArticles.includes(articleId);
      const next = !wasSaved;
      setSavedArticles((previous) => withEngagement(previous, articleId, next));

      if (!live) {
        notify(next ? "Story saved" : "Removed from saved");
        return;
      }

      void persistSavedArticle(articleId)
        .then((savedNow) => {
          setSavedArticles((previous) => withEngagement(previous, articleId, savedNow));
          notify(savedNow ? "Story saved" : "Removed from saved");
        })
        .catch((error: unknown) => {
          setSavedArticles((previous) => withEngagement(previous, articleId, wasSaved));
          notify(newsErrorMessage(error, "Could not save this story."));
        });
    },
    [live, notify, savedArticles],
  );

  const changeShortReaction = useCallback(
    (shortId: string, kind: ShortReaction): Promise<boolean> => {
      const list = kind === "like" ? likedShorts : savedShorts;
      const wasActive = list.includes(shortId);
      const next = !wasActive;
      const setter = kind === "like" ? setLikedShorts : setSavedShorts;

      setter((previous) => withEngagement(previous, shortId, next));

      if (!live) {
        notify(
          kind === "like"
            ? next
              ? "Reaction added"
              : "Reaction removed"
            : next
              ? "Short saved"
              : "Removed from saved",
        );
        return Promise.resolve(next);
      }

      return persistShortReaction(shortId, kind)
        .then((active) => {
          setter((previous) => withEngagement(previous, shortId, active));
          notify(
            kind === "like"
              ? active
                ? "Reaction added"
                : "Reaction removed"
              : active
                ? "Short saved"
                : "Removed from saved",
          );
          return active;
        })
        .catch((error: unknown) => {
          setter((previous) => withEngagement(previous, shortId, wasActive));
          notify(newsErrorMessage(error, "Could not update this reaction."));
          throw error;
        });
    },
    [likedShorts, live, notify, savedShorts],
  );

  const loadLibrary = useCallback(async () => {
    if (!live) {
      setLibraryArticles([]);
      setLibraryChannels([]);
      return;
    }

    setLibraryLoading(true);
    try {
      const page = await loadSavedArticles(session);
      setLibraryArticles(page.articles);
      setLibraryChannels(page.channels);
      rememberContent(page.articles, page.channels);
    } catch {
      setLibraryArticles([]);
      setLibraryChannels([]);
    } finally {
      setLibraryLoading(false);
    }
  }, [live, rememberContent, session]);

  useEffect(() => {
    if (tab === "settings") void loadLibrary();
  }, [loadLibrary, savedArticles, tab]);

  const createChannel = useCallback(
    async (input: CreateChannelInput): Promise<string | null> => {
      const handle = slugifyHandle(input.handle);
      if (channels.some((channel) => channel.handle.toLowerCase() === handle)) {
        return "That handle is already in use. Choose another one.";
      }

      if (live) {
        try {
          const channel = await createLiveChannel({ ...input, handle }, session);
          setSnapshot((previous) =>
            previous
              ? {
                  ...previous,
                  channels: [channel, ...previous.channels],
                  followed: previous.followed.includes(channel.id)
                    ? previous.followed
                    : [...previous.followed, channel.id],
                }
              : previous,
          );
          setFollowed((previous) =>
            previous.includes(channel.id) ? previous : [...previous, channel.id],
          );
          setTab("studio");
          notify("Channel created. Your newsroom is ready.");
          return null;
        } catch (error) {
          return newsErrorMessage(error, "Could not create this channel.");
        }
      }

      const channel: NewsChannel = {
        id: `own-${Date.now()}`,
        name: input.name,
        handle,
        description: input.description || "A new F News channel.",
        category: input.category,
        ownerName: `${session.firstName} ${session.lastName}`.trim(),
        ownerNickname: session.nickname,
        verified: false,
        subscribers: 0,
        cover: null,
        tone: categoryAccent(input.category),
        joined: String(new Date().getFullYear()),
        isMine: true,
        isOwner: true,
      };

      setLocalChannels((previous) => [channel, ...previous]);
      setFollowed((previous) =>
        previous.includes(channel.id) ? previous : [...previous, channel.id],
      );
      setTab("studio");
      notify("Channel created. Your newsroom is ready.");
      return null;
    },
    [channels, live, notify, session],
  );

  const handleLocate = async () => {
    setLocating(true);
    setLocateError(null);

    try {
      const position = await getPosition();
      const nearest = nearestPlace(position.coords.latitude, position.coords.longitude);
      setPrefs((previous) => ({
        ...previous,
        placeName: nearest.name,
        placeRegion: nearest.region,
      }));
      setSheet(null);
      notify(`Weather location: ${nearest.name}`);
    } catch (error) {
      const code = (error as GeolocationPositionError | undefined)?.code;
      if (code === 1) {
        setLocateError("Location is blocked. Allow it in your browser settings.");
      } else if (code === 2) {
        setLocateError("Your location could not be determined.");
      } else if (code === 3) {
        setLocateError("Location request timed out. Try again.");
      } else {
        setLocateError("Location is unavailable. Pick a place from the list.");
      }
    } finally {
      setLocating(false);
    }
  };

  const openComposer = (type: "flash" | "short" | "article", channelId: string) => {
    if (!live) {
      notify("Publishing needs the live news schema. Preview channels stay read-only.");
      return;
    }
    setSheet({ type, channelId });
  };

  const openManage = (
    channelId: string,
    tab: "profile" | "trust" | "ownership" = "profile",
  ) => {
    if (!live) {
      notify("Channel settings need the live news schema.");
      return;
    }
    setSheet({ type: "manage", channelId, tab });
  };

  const refreshAfterPublish = useCallback(() => {
    void loadLive();
  }, [loadLive]);

  const article =
    view?.type === "article"
      ? articles.find((item) => item.id === view.id) ??
        libraryArticles.find((item) => item.id === view.id) ??
        null
      : null;
  const articleChannel = article
    ? channels.find((channel) => channel.id === article.channelId) ??
      libraryChannels.find((channel) => channel.id === article.channelId) ??
      null
    : null;

  const channelView =
    view?.type === "channel" ? channels.find((item) => item.id === view.id) ?? null : null;

  const flash = view?.type === "flash" ? flashes.find((item) => item.id === view.id) : null;
  const flashChannel = flash
    ? channels.find((channel) => channel.id === flash.channelId) ?? null
    : null;

  return (
    <div className={`news-app${tab === "shorts" ? " news-app--shorts" : ""}`}>
      {!view && !searchOpen ? (
        <NewsTopBar
          onBack={onClose}
          backLabel="Back to F App"
          dark={tab === "shorts"}
          right={
            <button
              type="button"
              className="news-top__search"
              onClick={() => setSearchOpen(true)}
              aria-label="Search F News"
            >
              <Search size={18} strokeWidth={2.1} />
            </button>
          }
        />
      ) : null}

      <div className="news-body">
        {tab === "home" ? (
          <NewsHome
            session={session}
            channels={channels}
            articles={articles}
            flashes={liveFlashes}
            followed={followed}
            prefs={prefs}
            weather={weather}
            weatherStatus={weatherStatus}
            live={live}
            loading={initialLoading}
            refreshKey={dataVersion}
            onArticlesLoaded={rememberContent}
            onOpenArticle={(id) => setView({ type: "article", id })}
            onOpenFlash={(id) => setView({ type: "flash", id })}
            onOpenChannel={(id) => setView({ type: "channel", id })}
            onToggleFollow={toggleFollow}
            onOpenWeather={() => setSheet({ type: "weather" })}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenStudio={() => navigate("studio")}
          />
        ) : null}

        {tab === "channels" ? (
          <NewsChannels
            session={session}
            channels={channels}
            followed={followed}
            onOpenChannel={(id) => setView({ type: "channel", id })}
            onToggleFollow={toggleFollow}
            onOpenStudio={() => navigate("studio")}
            notify={notify}
          />
        ) : null}

        {tab === "shorts" ? (
          <NewsShorts
            channels={channels}
            shorts={shorts}
            prefs={prefs}
            liked={likedShorts}
            saved={savedShorts}
            onToggleReaction={changeShortReaction}
            onOpenChannel={(id) => setView({ type: "channel", id })}
          />
        ) : null}

        {tab === "settings" ? (
          <NewsSettings
            prefs={prefs}
            weather={weather}
            weatherStatus={weatherStatus}
            savedStories={savedStories}
            savedStoriesLoading={libraryLoading}
            onUpdate={(patch) => setPrefs((previous) => ({ ...previous, ...patch }))}
            onOpenPlace={() => setSheet({ type: "place" })}
            onOpenWeather={() => setSheet({ type: "weather" })}
            onOpenArticle={(id) => setView({ type: "article", id })}
            onRemoveSaved={toggleArticleSave}
            notify={notify}
          />
        ) : null}

        {tab === "studio" ? (
          <NewsStudio
            session={session}
            channels={channels}
            myChannels={myChannels}
            articles={articles}
            flashes={flashes}
            onOpenChannel={(id) => setView({ type: "channel", id })}
            onOpenCreate={() => setSheet({ type: "create" })}
            onManageChannel={openManage}
            onComposeFlash={(id) => openComposer("flash", id)}
            onComposeArticle={(id) => openComposer("article", id)}
            onComposeShort={(id) => openComposer("short", id)}
            onRefresh={refreshAfterPublish}
            notify={notify}
          />
        ) : null}
      </div>

      <NewsNav active={tab} onNavigate={navigate} dark={tab === "shorts"} />

      {article && articleChannel ? (
        <NewsArticleView
          key={article.id}
          article={article}
          channel={articleChannel}
          related={articles
            .filter((item) => item.channelId === article.channelId && item.id !== article.id)
            .slice(0, 3)}
          followed={followed.includes(article.channelId)}
          isOwn={articleChannel.isMine === true}
          saved={savedArticles.includes(article.id)}
          onToggleSave={() => toggleArticleSave(article.id)}
          onBack={() => setView(null)}
          onOpenChannel={(id) => setView({ type: "channel", id })}
          onOpenArticle={(id) => setView({ type: "article", id })}
          onToggleFollow={toggleFollow}
        />
      ) : null}

      {channelView ? (
        <NewsChannelView
          key={channelView.id}
          channel={channelView}
          articles={articles}
          flashes={flashes}
          followed={followed.includes(channelView.id)}
          isOwn={channelView.isMine === true}
          onBack={() => setView(null)}
          onOpenArticle={(id) => setView({ type: "article", id })}
          onOpenFlash={(id) => setView({ type: "flash", id })}
          onToggleFollow={toggleFollow}
          notify={notify}
        />
      ) : null}

      {flash && flashChannel ? (
        <NewsFlashView
          key={flash.id}
          flash={flash}
          channel={flashChannel}
          relatedArticles={articles
            .filter((item) => item.channelId === flash.channelId)
            .slice(0, 1)}
          followed={followed.includes(flash.channelId)}
          isOwn={flashChannel.isMine === true}
          onBack={() => setView(null)}
          onOpenChannel={(id) => setView({ type: "channel", id })}
          onOpenArticle={(id) => setView({ type: "article", id })}
          onToggleFollow={toggleFollow}
        />
      ) : null}

      {searchOpen ? (
        <NewsSearchView
          session={session}
          articles={articles}
          channels={channels}
          followed={followed}
          live={live}
          onArticlesLoaded={rememberContent}
          onBack={() => setSearchOpen(false)}
          onOpenArticle={(id) => {
            setSearchOpen(false);
            setView({ type: "article", id });
          }}
          onOpenChannel={(id) => {
            setSearchOpen(false);
            setView({ type: "channel", id });
          }}
          onToggleFollow={toggleFollow}
        />
      ) : null}

      {sheet?.type === "weather" ? (
        <WeatherSheet
          place={place}
          weather={weather}
          status={weatherStatus}
          prefs={prefs}
          onClose={() => setSheet(null)}
          onChangePlace={() => setSheet({ type: "place" })}
          onRetry={() => void loadWeather()}
          onOpenSettings={() => {
            setSheet(null);
            navigate("settings");
          }}
        />
      ) : null}

      {sheet?.type === "place" ? (
        <PlaceSheet
          place={place}
          locating={locating}
          locateError={locateError}
          onLocate={() => void handleLocate()}
          onPick={(next) => {
            setPrefs((previous) => ({
              ...previous,
              placeName: next.name,
              placeRegion: next.region,
            }));
            setSheet(null);
            notify(`Weather location: ${next.name}`);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.type === "create" ? (
        <CreateChannelSheet
          session={session}
          channels={channels}
          onClose={() => setSheet(null)}
          onCreate={createChannel}
        />
      ) : null}

      {sheet?.type === "manage" ? (
        <ManageChannelSheet
          session={session}
          channels={myChannels}
          initialChannelId={sheet.channelId}
          initialTab={sheet.tab}
          onClose={() => setSheet(null)}
          onRefresh={refreshAfterPublish}
          notify={notify}
        />
      ) : null}

      {sheet?.type === "flash" ? (
        <FlashComposerSheet
          session={session}
          channels={myChannels}
          initialChannelId={sheet.channelId}
          onClose={() => setSheet(null)}
          onPublished={() => {
            notify("Flash published for the next 24 hours.");
            refreshAfterPublish();
          }}
        />
      ) : null}

      {sheet?.type === "short" ? (
        <ShortComposerSheet
          session={session}
          channels={myChannels}
          initialChannelId={sheet.channelId}
          onClose={() => setSheet(null)}
          onPublished={() => {
            notify("News Short published to your channel.");
            refreshAfterPublish();
          }}
        />
      ) : null}

      {sheet?.type === "article" ? (
        <ArticleComposerSheet
          session={session}
          channels={myChannels}
          initialChannelId={sheet.channelId}
          onClose={() => setSheet(null)}
          onPublished={() => {
            notify("Article published to your channel.");
            refreshAfterPublish();
          }}
        />
      ) : null}

      <div className={`news-toast${toast ? " is-visible" : ""}`} role="status" aria-live="polite">
        {toast}
        {toast ? (
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            <X size={13} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
