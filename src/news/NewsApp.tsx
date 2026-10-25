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
import { DEMO_ARTICLES, DEMO_CHANNELS, DEMO_FLASHES, DEMO_SHORTS } from "./news-data";
import {
  loadFollowed,
  loadMyChannels,
  loadNewsPrefs,
  resolvePlace,
  saveFollowed,
  saveMyChannels,
  saveNewsPrefs,
} from "./news-prefs";
import {
  categoryAccent,
  isFlashLive,
  slugifyHandle,
  type CreateChannelInput,
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
  | null;

interface Props {
  session: Session;
  onClose: () => void;
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
  const [myChannels, setMyChannels] = useState<NewsChannel[]>(loadMyChannels);

  const [view, setView] = useState<ViewState>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<"loading" | "ready" | "error">("loading");

  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<number | null>(null);

  const channels = useMemo(
    () => [...myChannels, ...DEMO_CHANNELS],
    [myChannels],
  );

  const liveFlashes = useMemo(() => DEMO_FLASHES.filter((flash) => isFlashLive(flash)), []);

  const place = useMemo(() => resolvePlace(prefs), [prefs]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    saveNewsPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    saveFollowed(followed);
  }, [followed]);

  useEffect(() => {
    saveMyChannels(myChannels);
  }, [myChannels]);

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

  const toggleFollow = (channelId: string) => {
    const channel = channels.find((item) => item.id === channelId);
    const exists = followed.includes(channelId);
    setFollowed((previous) =>
      exists ? previous.filter((id) => id !== channelId) : [...previous, channelId],
    );
    notify(
      exists
        ? `Unfollowed ${channel?.name ?? "channel"}`
        : `Following ${channel?.name ?? "channel"}`,
    );
  };

  const createChannel = useCallback(
    (input: CreateChannelInput): string | null => {
      const handle = slugifyHandle(input.handle);
      if (channels.some((channel) => channel.handle.toLowerCase() === handle)) {
        return "That handle is already in use. Choose another one.";
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
      };

      setMyChannels((previous) => [channel, ...previous]);
      setFollowed((previous) =>
        previous.includes(channel.id) ? previous : [...previous, channel.id],
      );
      setTab("studio");
      notify("Channel created. Your newsroom is ready.");
      return null;
    },
    [channels, notify, session.firstName, session.lastName, session.nickname],
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

  const article = view?.type === "article" ? DEMO_ARTICLES.find((item) => item.id === view.id) : null;
  const articleChannel = article
    ? channels.find((channel) => channel.id === article.channelId) ?? channels[0]
    : null;

  const channelView =
    view?.type === "channel" ? channels.find((item) => item.id === view.id) ?? null : null;

  const flash = view?.type === "flash" ? DEMO_FLASHES.find((item) => item.id === view.id) : null;
  const flashChannel = flash
    ? channels.find((channel) => channel.id === flash.channelId) ?? channels[0]
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
            articles={DEMO_ARTICLES}
            flashes={liveFlashes}
            followed={followed}
            prefs={prefs}
            weather={weather}
            weatherStatus={weatherStatus}
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
            shorts={DEMO_SHORTS}
            prefs={prefs}
            onOpenChannel={(id) => setView({ type: "channel", id })}
            notify={notify}
          />
        ) : null}

        {tab === "settings" ? (
          <NewsSettings
            prefs={prefs}
            weather={weather}
            weatherStatus={weatherStatus}
            onUpdate={(patch) => setPrefs((previous) => ({ ...previous, ...patch }))}
            onOpenPlace={() => setSheet({ type: "place" })}
            onOpenWeather={() => setSheet({ type: "weather" })}
            notify={notify}
          />
        ) : null}

        {tab === "studio" ? (
          <NewsStudio
            session={session}
            myChannels={myChannels}
            onOpenChannel={(id) => setView({ type: "channel", id })}
            onOpenCreate={() => setSheet({ type: "create" })}
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
          related={DEMO_ARTICLES.filter(
            (item) => item.channelId === article.channelId && item.id !== article.id,
          ).slice(0, 3)}
          followed={followed.includes(article.channelId)}
          onBack={() => setView(null)}
          onOpenChannel={(id) => setView({ type: "channel", id })}
          onOpenArticle={(id) => setView({ type: "article", id })}
          onToggleFollow={toggleFollow}
          notify={notify}
        />
      ) : null}

      {channelView ? (
        <NewsChannelView
          key={channelView.id}
          channel={channelView}
          articles={DEMO_ARTICLES}
          flashes={DEMO_FLASHES}
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
          relatedArticles={DEMO_ARTICLES.filter(
            (item) => item.channelId === flash.channelId,
          ).slice(0, 1)}
          followed={followed.includes(flash.channelId)}
          onBack={() => setView(null)}
          onOpenChannel={(id) => setView({ type: "channel", id })}
          onOpenArticle={(id) => setView({ type: "article", id })}
          onToggleFollow={toggleFollow}
        />
      ) : null}

      {searchOpen ? (
        <NewsSearchView
          articles={DEMO_ARTICLES}
          channels={channels}
          followed={followed}
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
