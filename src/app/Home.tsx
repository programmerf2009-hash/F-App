import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, LogOut, RotateCcw, Search } from "lucide-react";
import { CurrencySheet } from "./CurrencySheet";
import { PlaceSheet } from "./PlaceSheet";
import { WeatherCard } from "./WeatherCard";
import { AppNav } from "../components/AppNav";
import { BottomNav, type Tab } from "../components/BottomNav";
import { Toast } from "../components/Toast";
import type { Session } from "../lib/auth";
import type { Theme } from "../lib/theme";
import { loadHomePrefs, saveHomePrefs, type HomePrefs } from "../lib/home-prefs";
import { DEFAULT_PLACE, type Place } from "../lib/places";
import {
  UZS,
  changePercent,
  crossRate,
  currencySymbol,
  fetchRates,
  findCurrency,
  formatPercent,
  formatRate,
  isFresh,
  readRatesCache,
  type RatesSnapshot,
} from "../lib/rates";
import {
  fetchWeather,
  getPosition,
  locationPermission,
  nearestPlace,
  type WeatherNow,
} from "../lib/weather";
import "./home.css";

const LOGO_SRC = `${import.meta.env.BASE_URL}brand/fapplogo2.png`;

interface Props {
  session: Session;
  theme: Theme;
  onLogout: () => void;
  onReplay: () => void;
  onNavigate: (tab: Tab) => void;
  onOpenNews: () => void;
}

type SheetState = null | { type: "slot"; index: number } | { type: "base" } | { type: "place" };

/** Home — kurslar, ob-havo va bo'sh javonlar. */
export function Home({ session, theme, onLogout, onReplay, onNavigate, onOpenNews }: Props) {
  const [prefs, setPrefs] = useState<HomePrefs>(loadHomePrefs);

  const [rates, setRates] = useState<RatesSnapshot | null>(null);
  const [ratesStatus, setRatesStatus] = useState<"loading" | "ready" | "error">("loading");

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<"loading" | "ready" | "error">("loading");

  const [sheet, setSheet] = useState<SheetState>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);

  const place = prefs.place ?? DEFAULT_PLACE;

  /* ---------------------------------------------------------------- toast */

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1900);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  /* --------------------------------------------------------------- sozlama */

  useEffect(() => {
    saveHomePrefs(prefs);
  }, [prefs]);

  /* ----------------------------------------------------------------- kurs */

  const refreshRates = useCallback(async () => {
    try {
      const snapshot = await fetchRates();
      setRates(snapshot);
      setRatesStatus("ready");
    } catch {
      setRatesStatus((previous) => (previous === "ready" ? "ready" : "error"));
    }
  }, []);

  useEffect(() => {
    const cached = readRatesCache();

    if (cached) {
      setRates(cached);
      setRatesStatus("ready");
      if (!isFresh(cached)) void refreshRates();
      return;
    }

    void refreshRates();
  }, [refreshRates]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const cached = readRatesCache();
      if (!cached || !isFresh(cached)) void refreshRates();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshRates]);

  /* ---------------------------------------------------------------- ob-havo */

  const loadWeather = useCallback(async (target: Place) => {
    setWeatherStatus("loading");

    try {
      const data = await fetchWeather(target);
      setWeather(data);
      setWeatherStatus("ready");
    } catch {
      setWeatherStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadWeather(place);
  }, [place, loadWeather]);

  /* Joylashuv: ruxsat avval berilgan bo'lsa — jimgina ishlatamiz. */
  useEffect(() => {
    if (prefs.place) return;

    let cancelled = false;

    void (async () => {
      const permission = await locationPermission();
      if (cancelled || permission !== "granted") return;

      try {
        const position = await getPosition();
        if (cancelled) return;

        setPrefs((previous) =>
          previous.place
            ? previous
            : {
                ...previous,
                place: nearestPlace(position.coords.latitude, position.coords.longitude),
              },
        );
      } catch {
        /* jim o'tamiz */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prefs.place]);

  const useMyLocation = async () => {
    setLocating(true);
    setLocateError(null);

    try {
      const position = await getPosition();
      const nearest = nearestPlace(position.coords.latitude, position.coords.longitude);

      setPrefs((previous) => ({ ...previous, place: nearest }));
      setSheet(null);
      showToast(`Weather location: ${nearest.name}`);
    } catch (error) {
      setLocateError(locationErrorText(error));
    } finally {
      setLocating(false);
    }
  };

  /* ------------------------------------------------------------- tanlovlar */

  const pickSlot = (index: number, code: string) => {
    setPrefs((previous) => {
      const slots = [...previous.slots];

      if (code === previous.base) {
        const replaced = slots[index];
        slots[index] = code;
        return { ...previous, slots, base: replaced };
      }

      const twin = slots.findIndex((item, itemIndex) => item === code && itemIndex !== index);
      if (twin >= 0) slots[twin] = slots[index];
      slots[index] = code;

      return { ...previous, slots };
    });

    setSheet(null);
  };

  const pickBase = (code: string) => {
    setPrefs((previous) => {
      const slots = [...previous.slots];
      const twin = slots.indexOf(code);

      if (twin >= 0) slots[twin] = previous.base;

      return { ...previous, base: code, slots };
    });

    setSheet(null);
  };

  const pickPlace = (next: Place) => {
    setPrefs((previous) => ({ ...previous, place: next }));
    setSheet(null);
  };

  /* --------------------------------------------------------------- menyu */

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /* ------------------------------------------------------------------ UI */

  const currencies = rates?.currencies ?? [];
  const base = findCurrency(currencies, prefs.base) ?? UZS;
  const initial = (session.firstName.trim()[0] ?? session.nickname[0] ?? "F").toUpperCase();

  return (
    <div className={`home${sheet || navOpen ? " is-locked" : ""}`} data-theme={theme}>
      <div className="home__glow home__glow--one" aria-hidden="true" />
      <div className="home__glow home__glow--two" aria-hidden="true" />

      <header className="home__header">
        <button
          type="button"
          className="home__brand"
          onClick={() => {
            setMenuOpen(false);
            setNavOpen(true);
          }}
          aria-label="Open F App menu"
          aria-haspopup="dialog"
          aria-expanded={navOpen}
          aria-controls="app-nav"
        >
          <img className="home__logo" src={LOGO_SRC} alt="" aria-hidden="true" draggable={false} />
          <span className="home__wordmark">F App</span>
        </button>

        <div className="home__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onNavigate("search")}
            aria-label="Search"
          >
            <Search size={19} strokeWidth={2.1} />
          </button>

          <div className="avatar-wrap" ref={menuRef}>
            <button
              type="button"
              className="avatar"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              <span className="avatar__initial">
                {session.photo ? (
                  <img className="avatar__photo" src={session.photo} alt="" />
                ) : (
                  initial
                )}
              </span>
            </button>

            {menuOpen ? (
              <div className="avatar__menu" role="menu">
                <div className="avatar__me">
                  <span className="avatar__big">
                    {session.photo ? (
                      <img className="avatar__photo" src={session.photo} alt="" />
                    ) : (
                      initial
                    )}
                  </span>
                  <div className="avatar__id">
                    <p className="avatar__name">{session.firstName}</p>
                    <p className="avatar__nick">@{session.nickname}</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="avatar__item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  <LogOut size={16} strokeWidth={2.1} />
                  Log out
                </button>

                {import.meta.env.DEV ? (
                  <button
                    type="button"
                    className="avatar__item avatar__item--muted"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onReplay();
                    }}
                  >
                    <RotateCcw size={15} strokeWidth={2.1} />
                    Replay onboarding
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="home__main">
        {/* ------------------------------------------------------------ kurs */}
        <section className="sec sec--rates" aria-labelledby="rates-title">
          <div className="sec__head">
            <h2 className="sec__title" id="rates-title">
              Exchange rates
            </h2>

            <button
              type="button"
              className="rates__base"
              onClick={() => setSheet({ type: "base" })}
              disabled={ratesStatus !== "ready"}
            >
              in {prefs.base}
              <ChevronDown size={13} strokeWidth={2.4} />
            </button>
          </div>

          <div className="rates__grid">
            {prefs.slots.map((code, index) => {
              const currency = findCurrency(currencies, code);
              const value = currency ? crossRate(currency, base) : null;
              const delta = currency ? changePercent(currency, base) : null;
              const deltaLabel = formatPercent(delta);
              const deltaClass =
                delta === null || Math.abs(delta) < 0.005
                  ? "is-flat"
                  : delta > 0
                    ? "is-up"
                    : "is-down";

              return (
                <button
                  key={`${index}-${code}`}
                  type="button"
                  className="rate-card"
                  onClick={() => setSheet({ type: "slot", index })}
                  disabled={ratesStatus !== "ready"}
                  aria-label={`Change currency ${code}`}
                >
                  {currency ? (
                    <>
                      <span className="rate-card__top">
                        <span className="rate-card__badge">{currencySymbol(code)}</span>
                        <span className="rate-card__code">{code}</span>
                      </span>

                      <span className="rate-card__value">
                        {value === null ? "—" : formatRate(value)}
                      </span>

                      <span className="rate-card__meta">
                        <span className="rate-card__unit">{base.code}</span>
                        {deltaLabel ? (
                          <span className={`rate-card__delta ${deltaClass}`}>{deltaLabel}</span>
                        ) : null}
                      </span>
                    </>
                  ) : ratesStatus === "error" ? (
                    <>
                      <span className="rate-card__top">
                        <span className="rate-card__badge rate-card__badge--muted">
                          {currencySymbol(code)}
                        </span>
                        <span className="rate-card__code">{code}</span>
                      </span>
                      <span className="rate-card__value">—</span>
                      <span className="rate-card__meta">
                        <span className="rate-card__unit">{prefs.base}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="rate-card__top">
                        <span className="sk sk--badge" />
                        <span className="sk sk--code" />
                      </span>
                      <span className="sk sk--value" />
                      <span className="sk sk--unit" />
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {ratesStatus === "error" ? (
            <p className="rates__error">
              Rates are unavailable.{" "}
              <button type="button" onClick={() => void refreshRates()}>
                Retry
              </button>
            </p>
          ) : null}
        </section>

        {/* ---------------------------------------------------------- ob-havo */}
        <section className="sec sec--weather" aria-label="Weather">
          <WeatherCard
            place={place}
            weather={weather}
            status={weatherStatus}
            onChange={() => setSheet({ type: "place" })}
            onRetry={() => void loadWeather(place)}
          />
        </section>

        {/* ---------------------------------------------------------- yangilik */}
        <section className="sec sec--news" aria-labelledby="news-title">
          <div className="sec__head">
            <h2 className="sec__title" id="news-title">
              News
            </h2>
            <span className="sec__chip sec__chip--live">Live</span>
          </div>

          <button type="button" className="news-entry" onClick={onOpenNews}>
            <span className="news-entry__plate">
              <img src={LOGO_SRC} alt="" />
            </span>
            <span className="news-entry__copy">
              <strong>Today&rsquo;s edition is live</strong>
              <span>Stories, 24-hour flashes and Shorts from newsrooms in Uzbekistan.</span>
            </span>
            <span className="news-entry__cta">
              Open
              <ArrowRight size={14} strokeWidth={2.2} />
            </span>
          </button>
        </section>

        {/* ------------------------------------------------------- do'kon aksiya */}
        <section className="sec sec--deals" aria-labelledby="deals-title">
          <div className="sec__head">
            <h2 className="sec__title" id="deals-title">
              Shop deals
            </h2>
            <span className="sec__chip">Soon</span>
          </div>

          <div className="shelf shelf--products" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div className="shelf__card shelf__card--product" key={index}>
                <span className="sk sk--square" />
                <span className="sk sk--line" />
                <span className="sk sk--line sk--short" />
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- xizmatlar */}
        <section className="sec sec--services" aria-labelledby="services-title">
          <div className="sec__head">
            <h2 className="sec__title" id="services-title">
              Services
            </h2>
            <span className="sec__chip">Soon</span>
          </div>

          <div className="shelf" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <div className="shelf__card" key={index}>
                <span className="sk sk--media" />
                <span className="sk sk--line" />
                <span className="sk sk--line sk--short" />
              </div>
            ))}
          </div>
        </section>
      </main>

      <BottomNav active="home" onNavigate={onNavigate} />

      <Toast message={toast} />

      <AppNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onSoon={showToast}
        onOpenNews={onOpenNews}
      />

      {sheet?.type === "slot" ? (
        <CurrencySheet
          mode="slot"
          slotIndex={sheet.index}
          currencies={currencies}
          baseCode={prefs.base}
          slotCodes={prefs.slots}
          onPick={(code) => pickSlot(sheet.index, code)}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.type === "base" ? (
        <CurrencySheet
          mode="base"
          slotIndex={0}
          currencies={currencies}
          baseCode={prefs.base}
          slotCodes={prefs.slots}
          onPick={pickBase}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.type === "place" ? (
        <PlaceSheet
          place={place}
          locating={locating}
          locateError={locateError}
          onLocate={() => void useMyLocation()}
          onPick={pickPlace}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

function locationErrorText(error: unknown): string {
  const code = (error as GeolocationPositionError | undefined)?.code;

  if (code === 1) return "Location is blocked. Allow it in your browser settings.";
  if (code === 2) return "Your location could not be determined.";
  if (code === 3) return "Location request timed out. Try again.";
  return "Location is unavailable. Pick a place from the list.";
}
