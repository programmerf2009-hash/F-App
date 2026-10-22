import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  ChevronDown,
  MapPin,
  Moon,
  Snowflake,
  Sun,
  TriangleAlert,
} from "lucide-react";
import type { Place } from "../lib/places";
import { describeWeather, type WeatherNow } from "../lib/weather";

interface Props {
  place: Place;
  weather: WeatherNow | null;
  status: "loading" | "ready" | "error";
  onChange: () => void;
  onRetry: () => void;
}

export function WeatherCard({ place, weather, status, onChange, onRetry }: Props) {
  const look = weather ? describeWeather(weather.code) : null;
  const Icon = weather && look ? iconFor(look.kind, weather.isDay) : Sun;

  return (
    <section className="weather" aria-label={`Weather in ${place.name}`}>
      <span className="weather__glow" aria-hidden="true" />

      <header className="weather__top">
        <div className="weather__place">
          <span className="weather__pin" aria-hidden="true">
            <MapPin size={13} strokeWidth={2.4} />
          </span>
          <div className="weather__place-text">
            <p className="weather__name">{place.name}</p>
            <p className="weather__region">{place.region}</p>
          </div>
        </div>

        <button type="button" className="weather__change" onClick={onChange}>
          Change
          <ChevronDown size={14} strokeWidth={2.4} />
        </button>
      </header>

      {status === "loading" ? (
        <div className="weather__loading" aria-live="polite">
          <span className="sk sk--weather-icon" />
          <span className="weather__loading-text">
            <span className="sk sk--weather-temp" />
            <span className="sk sk--weather-line" />
          </span>
        </div>
      ) : status === "error" || !weather ? (
        <div className="weather__error">
          <TriangleAlert size={18} strokeWidth={2.1} />
          <p>Weather is unavailable right now.</p>
          <button type="button" className="weather__retry" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="weather__main">
            <span className={`weather__icon weather__icon--${look?.kind ?? "partly"}`}>
              <Icon size={46} strokeWidth={1.5} />
            </span>

            <div className="weather__reading">
              <p className="weather__temp">
                {weather.temp}
                <span className="weather__degree">°</span>
              </p>
              <p className="weather__desc">
                {look?.label}
                <span className="weather__feels">Feels like {weather.feels}°</span>
              </p>
            </div>
          </div>

          <div className="weather__foot">
            <span>
              H <b>{weather.high}°</b>
            </span>
            <span>
              L <b>{weather.low}°</b>
            </span>
            <span>
              Humidity <b>{weather.humidity}%</b>
            </span>
            <span>
              Wind <b>{weather.wind} km/h</b>
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function iconFor(kind: ReturnType<typeof describeWeather>["kind"], isDay: boolean) {
  switch (kind) {
    case "clear":
      return isDay ? Sun : Moon;
    case "mostly-clear":
      return isDay ? Sun : Moon;
    case "partly":
      return isDay ? CloudSun : CloudMoon;
    case "overcast":
      return Cloud;
    case "fog":
      return CloudFog;
    case "drizzle":
      return CloudDrizzle;
    case "rain":
      return CloudRain;
    case "showers":
      return CloudRain;
    case "freezing":
      return Snowflake;
    case "snow":
      return CloudSnow;
    case "thunder":
      return CloudLightning;
    default:
      return Cloud;
  }
}
