import type { ReactNode } from "react";
import {
  Bell,
  Bookmark,
  Check,
  ChevronRight,
  CloudSun,
  LoaderCircle,
  LocateFixed,
  MapPin,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { WeatherNow } from "../lib/weather";
import { describeWeather } from "../lib/weather";
import { NewsSectionHead, WeatherGlyph } from "./NewsChrome";
import { DEFAULT_NEWS_PREFS } from "./news-prefs";
import {
  FEED_CATEGORIES,
  temperature,
  temperatureUnit,
  timeAgo,
  type NewsArticle,
  type NewsCategory,
  type NewsPrefs,
} from "./news-types";

interface Props {
  prefs: NewsPrefs;
  weather: WeatherNow | null;
  weatherStatus: "loading" | "ready" | "error";
  savedStories: NewsArticle[];
  savedStoriesLoading: boolean;
  onUpdate: (patch: Partial<NewsPrefs>) => void;
  onOpenPlace: () => void;
  onOpenWeather: () => void;
  onOpenArticle: (articleId: string) => void;
  onRemoveSaved: (articleId: string) => void;
  isAdmin?: boolean;
  onOpenModeration?: () => void;
  notify: (message: string) => void;
}

export function NewsSettings({
  prefs,
  weather,
  weatherStatus,
  savedStories,
  savedStoriesLoading,
  onUpdate,
  onOpenPlace,
  onOpenWeather,
  onOpenArticle,
  onRemoveSaved,
  isAdmin = false,
  onOpenModeration,
  notify,
}: Props) {
  const condition =
    weatherStatus === "ready" && weather ? describeWeather(weather.code).label : "Weather loading";

  const toggleCategory = (category: NewsCategory) => {
    if (prefs.categories.includes(category)) {
      if (prefs.categories.length === 1) {
        notify("Keep at least one preferred category.");
        return;
      }
      onUpdate({ categories: prefs.categories.filter((item) => item !== category) });
      return;
    }

    onUpdate({ categories: [...prefs.categories, category] });
  };

  return (
    <main className="news-main news-settings">
      <div className="news-shell">
        <header className="news-page-head news-page-head--compact">
          <div>
            <p className="news-kicker">News edition only</p>
            <h1>Settings</h1>
            <p>Weather, alerts and the way your news feed is built.</p>
          </div>
          <span className="news-fixed-badge">
            <Sparkles size={13} strokeWidth={2.1} />
            Fixed identity
          </span>
        </header>

        <section className="news-settings-section" aria-labelledby="settings-weather">
          <NewsSectionHead eyebrow="Local & live" title="Weather" action={<CloudSun size={18} strokeWidth={1.9} />} />

          <div className="news-settings-list">
            <button type="button" className="news-settings-row" onClick={onOpenPlace}>
              <span className="news-settings-row__icon">
                <MapPin size={18} strokeWidth={2.1} />
              </span>
              <span className="news-settings-row__copy">
                <span className="news-settings-row__title">Weather location</span>
                <span className="news-settings-row__text">
                  {prefs.placeName} · {prefs.placeRegion}
                </span>
              </span>
              <span className="news-settings-row__end">
                {weatherStatus === "ready" && weather ? (
                  <span className="news-settings-row__temp">
                    {temperature(weather.temp, prefs.units)}
                    {temperatureUnit(prefs.units)}
                  </span>
                ) : null}
                <ChevronRight size={16} strokeWidth={2.2} />
              </span>
            </button>

            <div className="news-settings-row">
              <span className="news-settings-row__icon">
                <WeatherGlyph
                  code={weather?.code}
                  isDay={weather?.isDay}
                  size={18}
                />
              </span>
              <span className="news-settings-row__copy">
                <span className="news-settings-row__title">Current conditions</span>
                <span className="news-settings-row__text">
                  {condition}
                  {weatherStatus === "ready" && weather
                    ? ` · H ${temperature(weather.high, prefs.units)} L ${temperature(weather.low, prefs.units)}`
                    : ""}
                </span>
              </span>
              <button
                type="button"
                className="news-inline-action"
                onClick={onOpenWeather}
                aria-label="Open weather details"
              >
                Open
              </button>
            </div>

            <div className="news-settings-row">
              <span className="news-settings-row__icon">
                <LocateFixed size={18} strokeWidth={2.1} />
              </span>
              <span className="news-settings-row__copy">
                <span className="news-settings-row__title">Temperature units</span>
                <span className="news-settings-row__text">Celsius or Fahrenheit</span>
              </span>
              <div className="news-segment news-segment--small" aria-label="Temperature units">
                <button
                  type="button"
                  className={prefs.units === "c" ? "is-active" : ""}
                  onClick={() => onUpdate({ units: "c" })}
                >
                  °C
                </button>
                <button
                  type="button"
                  className={prefs.units === "f" ? "is-active" : ""}
                  onClick={() => onUpdate({ units: "f" })}
                >
                  °F
                </button>
              </div>
            </div>

            <ToggleRow
              icon={<Bell size={18} strokeWidth={2.1} />}
              title="Severe weather alerts"
              text="Heat, wind and heavy rain warnings for your saved place."
              value={prefs.severeAlerts}
              onChange={(value) => onUpdate({ severeAlerts: value })}
            />
          </div>
        </section>

        <section className="news-settings-section" aria-labelledby="settings-feed">
          <NewsSectionHead
            eyebrow="Your briefing"
            title="Feed"
            action={
              <button
                type="button"
                className="news-text-link"
                onClick={() => {
                  onUpdate(DEFAULT_NEWS_PREFS);
                  notify("News preferences reset");
                }}
              >
                <RotateCcw size={13} strokeWidth={2.2} />
                Reset
              </button>
            }
          />

          <div className="news-settings-card">
            <div className="news-settings-card__head">
              <div>
                <h3>Preferred categories</h3>
                <p>Used to rank Home and shape your local briefing.</p>
              </div>
              <span className="news-settings-card__count">{prefs.categories.length}</span>
            </div>

            <div className="news-sheet__chips">
              {FEED_CATEGORIES.map((category) => {
                const active = prefs.categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    className={`news-sheet-chip${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => toggleCategory(category)}
                  >
                    {active ? <Check size={12} strokeWidth={2.4} /> : null}
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="news-settings-list">
            <ToggleRow
              icon={<Bell size={18} strokeWidth={2.1} />}
              title="Breaking news alerts"
              text="A quiet notification when a channel you follow publishes an urgent flash."
              value={prefs.breakingAlerts}
              onChange={(value) => onUpdate({ breakingAlerts: value })}
            />
            <ToggleRow
              icon={<PlayCircle size={18} strokeWidth={2.1} />}
              title="Autoplay Shorts"
              text="Start the first news short automatically while browsing."
              value={prefs.autoplay}
              onChange={(value) => onUpdate({ autoplay: value })}
            />
          </div>
        </section>

        <section className="news-settings-section" aria-labelledby="settings-saved">
          <NewsSectionHead
            eyebrow="Your library"
            title="Saved stories"
            action={<Bookmark size={18} strokeWidth={1.9} />}
          />

          {savedStoriesLoading ? (
            <p className="news-saved-note" role="status">
              <LoaderCircle size={15} strokeWidth={2} className="news-spin" />
              Loading your saved stories…
            </p>
          ) : savedStories.length > 0 ? (
            <div className="news-settings-list">
              {savedStories.map((story) => (
                <div className="news-saved-row" key={story.id}>
                  <button
                    type="button"
                    className="news-saved-row__open"
                    onClick={() => onOpenArticle(story.id)}
                  >
                    <img src={story.cover} alt="" loading="lazy" />
                    <span className="news-saved-row__copy">
                      <span className="news-saved-row__title">{story.title}</span>
                      <span className="news-saved-row__meta">
                        {story.category} · {timeAgo(story.minutesAgo)}
                      </span>
                    </span>
                    <ChevronRight size={16} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className="news-saved-row__remove"
                    onClick={() => onRemoveSaved(story.id)}
                    aria-label={`Remove ${story.title} from saved`}
                    title="Remove from saved"
                  >
                    <Bookmark size={16} strokeWidth={2} fill="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="news-saved-note">
              Save a story from the reader and it will wait for you here.
            </p>
          )}
        </section>

        {isAdmin ? (
          <section className="news-settings-section" aria-labelledby="settings-moderation">
            <NewsSectionHead
              eyebrow="Trust & safety"
              title="Moderation"
              action={<ShieldAlert size={18} strokeWidth={1.9} />}
            />

            <div className="news-settings-list">
              <button
                type="button"
                className="news-settings-row"
                onClick={onOpenModeration}
              >
                <span className="news-settings-row__icon news-settings-row__icon--alert">
                  <ShieldAlert size={18} strokeWidth={2.1} />
                </span>
                <span className="news-settings-row__copy">
                  <span className="news-settings-row__title">Reports queue</span>
                  <span className="news-settings-row__text">
                    Review reported posts, comments and channels.
                  </span>
                </span>
                <span className="news-settings-row__end">
                  <ChevronRight size={16} strokeWidth={2.2} />
                </span>
              </button>
            </div>
          </section>
        ) : null}

        <section className="news-settings-section" aria-labelledby="settings-edition">
          <NewsSectionHead eyebrow="How this works" title="The news edition" />

          <div className="news-edition-card">
            <div className="news-edition-card__brand">
              <span className="news-edition-card__mark">
                <ShieldCheck size={20} strokeWidth={1.9} />
              </span>
              <div>
                <h3>Independent by design</h3>
                <p>F News keeps its own Paper &amp; Signal palette, typography and navigation.</p>
              </div>
            </div>

            <ul>
              <li>Your F App Gold or Midnight theme never changes this section.</li>
              <li>The F App logo always stays in its original blue, on a white plate when needed.</li>
              <li>Sharing is reserved for F Chat and stays disabled until that service arrives.</li>
              <li>Flash videos leave the feed after 24 hours and move to the channel archive.</li>
            </ul>
          </div>
        </section>

        <p className="news-signed-note">
          In the live edition, preferences, saved stories and reactions follow your account. The
          preview edition keeps them on this device only.
        </p>
      </div>
    </main>
  );
}

function ToggleRow({
  icon,
  title,
  text,
  value,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="news-settings-row">
      <span className="news-settings-row__icon">{icon}</span>
      <span className="news-settings-row__copy">
        <span className="news-settings-row__title">{title}</span>
        <span className="news-settings-row__text">{text}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={title}
        className={`news-switch${value ? " is-on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </div>
  );
}
