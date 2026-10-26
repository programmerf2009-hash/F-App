import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CloudSun,
  Droplets,
  Gauge,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Thermometer,
  Wind,
} from "lucide-react";
import type { Session } from "../lib/auth";
import type { Place } from "../lib/places";
import { describeWeather, type WeatherNow } from "../lib/weather";
import { Sheet } from "../components/Sheet";
import { WeatherGlyph } from "./NewsChrome";
import { handleTaken } from "./news-prefs";
import {
  FEED_CATEGORIES,
  slugifyHandle,
  temperature,
  temperatureUnit,
  type CreateChannelInput,
  type NewsCategory,
  type NewsChannel,
  type NewsPrefs,
} from "./news-types";

/* ========================================================================== */
/* Weather desk                                                               */
/* ========================================================================== */

export function WeatherSheet({
  place,
  weather,
  status,
  prefs,
  onClose,
  onChangePlace,
  onRetry,
  onOpenSettings,
}: {
  place: Place;
  weather: WeatherNow | null;
  status: "loading" | "ready" | "error";
  prefs: NewsPrefs;
  onClose: () => void;
  onChangePlace: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
}) {
  const look = weather ? describeWeather(weather.code) : null;

  return (
    <Sheet
      title="Weather desk"
      subtitle={`${place.name} · ${place.region}`}
      onClose={onClose}
    >
      <div className="news-weather-sheet">
        {status === "loading" ? (
          <div className="news-weather-sheet__skeleton" aria-live="polite">
            <span className="news-skeleton news-skeleton--circle" />
            <div>
              <span className="news-skeleton news-skeleton--temp" />
              <span className="news-skeleton news-skeleton--line" />
            </div>
          </div>
        ) : status === "error" || !weather ? (
          <div className="news-weather-sheet__error">
            <CloudSun size={30} strokeWidth={1.6} />
            <h3>Weather is unavailable right now.</h3>
            <p>Check your connection and try again.</p>
            <button type="button" className="news-button news-button--blue" onClick={onRetry}>
              <RefreshCw size={15} strokeWidth={2.2} />
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="news-weather-sheet__now">
              <span className="news-weather-sheet__glyph">
                <WeatherGlyph code={weather.code} isDay={weather.isDay} size={48} />
              </span>
              <div className="news-weather-sheet__reading">
                <p className="news-weather-sheet__temp">
                  {temperature(weather.temp, prefs.units)}
                  <small>{temperatureUnit(prefs.units)}</small>
                </p>
                <p className="news-weather-sheet__condition">
                  {look?.label}
                  <span>Feels like {temperature(weather.feels, prefs.units)}</span>
                </p>
              </div>
              <div className="news-weather-sheet__highlow">
                <span>
                  H <b>{temperature(weather.high, prefs.units)}</b>
                </span>
                <span>
                  L <b>{temperature(weather.low, prefs.units)}</b>
                </span>
              </div>
            </div>

            <div className="news-weather-sheet__stats">
              <div>
                <span className="news-weather-sheet__stat-icon">
                  <Thermometer size={16} strokeWidth={2} />
                </span>
                <span>Feels like</span>
                <strong>{temperature(weather.feels, prefs.units)}</strong>
              </div>
              <div>
                <span className="news-weather-sheet__stat-icon">
                  <Droplets size={16} strokeWidth={2} />
                </span>
                <span>Humidity</span>
                <strong>{weather.humidity}%</strong>
              </div>
              <div>
                <span className="news-weather-sheet__stat-icon">
                  <Wind size={16} strokeWidth={2} />
                </span>
                <span>Wind</span>
                <strong>{weather.wind} km/h</strong>
              </div>
              <div>
                <span className="news-weather-sheet__stat-icon">
                  <Gauge size={16} strokeWidth={2} />
                </span>
                <span>Pressure</span>
                <strong>Stable</strong>
              </div>
            </div>
          </>
        )}

        <button type="button" className="news-weather-sheet__place" onClick={onChangePlace}>
          <span className="news-weather-sheet__place-icon">
            <MapPin size={17} strokeWidth={2.1} />
          </span>
          <span>
            <span>Weather location</span>
            <strong>{place.name}</strong>
          </span>
          <ArrowRight size={16} strokeWidth={2.1} />
        </button>

        <div className="news-weather-sheet__alert">
          <span>
            <ShieldAlert size={18} strokeWidth={2} />
          </span>
          <div>
            <strong>Severe weather alerts {prefs.severeAlerts ? "are on" : "are off"}</strong>
            <p>
              {prefs.severeAlerts
                ? "You will see heat, wind and heavy rain warnings for this place."
                : "Turn them on in News settings to see local warnings."}
            </p>
          </div>
          <button type="button" onClick={onOpenSettings}>
            Settings
          </button>
        </div>

        <p className="news-weather-sheet__source">
          Live from Open-Meteo · {place.name}, {place.region}
        </p>
      </div>
    </Sheet>
  );
}

/* ========================================================================== */
/* Create channel                                                             */
/* ========================================================================== */

export function CreateChannelSheet({
  session,
  channels,
  onClose,
  onCreate,
}: {
  session: Session;
  channels: NewsChannel[];
  onClose: () => void;
  onCreate: (input: CreateChannelInput) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [category, setCategory] = useState<NewsCategory>("Local");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const ownerName = `${session.firstName} ${session.lastName}`.trim();
  const previewHandle = handle || slugifyHandle(name) || "yourchannel";

  const duplicate = useMemo(() => handleTaken(channels, previewHandle), [channels, previewHandle]);

  const changeName = (value: string) => {
    setName(value);
    if (!handleTouched) setHandle(slugifyHandle(value));
    setError(null);
  };

  const changeHandle = (value: string) => {
    setHandleTouched(true);
    setHandle(slugifyHandle(value));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;

    const cleanName = name.trim();
    const cleanHandle = slugifyHandle(handle || cleanName);

    if (cleanName.length < 3) {
      setError("Give your channel a name with at least 3 characters.");
      return;
    }
    if (cleanHandle.length < 3) {
      setError("The handle needs at least 3 letters or numbers.");
      return;
    }
    if (duplicate) {
      setError("That handle is already in use. Choose another one.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const result = await onCreate({
        name: cleanName,
        handle: cleanHandle,
        category,
        description: description.trim(),
      });

      if (result) {
        setError(result);
        return;
      }

      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet
      title="Create a channel"
      subtitle="Channels are separate from your personal profile."
      onClose={onClose}
    >
      <form className="news-channel-form" onSubmit={submit}>
        <div className="news-channel-form__owner">
          <span className="news-channel-form__owner-avatar">
            {session.photo ? <img src={session.photo} alt="" /> : session.firstName.slice(0, 1)}
          </span>
          <div>
            <span>Owner stays visible</span>
            <strong>{ownerName}</strong>
            <small>@{session.nickname}</small>
          </div>
          <BadgeCheck size={18} strokeWidth={2} />
        </div>

        <label className="news-field">
          <span>Channel name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => changeName(event.target.value)}
            placeholder="e.g. Tashkent Morning"
            maxLength={48}
            autoFocus
          />
        </label>

        <label className="news-field">
          <span>Handle</span>
          <div className="news-field__prefix">
            <span>@</span>
            <input
              type="text"
              value={handle}
              onChange={(event) => changeHandle(event.target.value)}
              placeholder="tashkentmorning"
              maxLength={24}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <small className={duplicate ? "is-error" : ""}>
            {duplicate ? "That handle is already taken." : "Letters and numbers only. This stays with the channel."}
          </small>
        </label>

        <div className="news-field">
          <span>Primary category</span>
          <div className="news-channel-form__categories">
            {FEED_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                className={`news-sheet-chip${category === item ? " is-active" : ""}`}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {category === item ? <Check size={12} strokeWidth={2.4} /> : null}
                {item}
              </button>
            ))}
          </div>
        </div>

        <label className="news-field">
          <span>Short description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What will this newsroom cover?"
            maxLength={240}
            rows={3}
          />
          <small>{description.length}/240</small>
        </label>

        <div className="news-channel-form__note">
          <Sparkles size={16} strokeWidth={1.9} />
          <p>
            Everyone can open a channel. A Verified newsroom certificate can be requested later;
            the publishing tools are the same.
          </p>
        </div>

        {error ? (
          <p className="news-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="news-sheet__actions">
          <button
            type="button"
            className="news-button news-button--ghost"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="news-button news-button--blue"
            disabled={creating || duplicate}
          >
            {creating ? "Creating..." : "Create channel"}
            <ArrowRight size={15} strokeWidth={2.2} />
          </button>
        </div>
      </form>
    </Sheet>
  );
}
