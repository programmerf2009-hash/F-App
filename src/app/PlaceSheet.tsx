import { useMemo, useState } from "react";
import { Check, LocateFixed, Search } from "lucide-react";
import { Sheet } from "../components/Sheet";
import { CITIES, DISTRICTS, REGIONS, type Place } from "../lib/places";

interface Props {
  place: Place;
  locating: boolean;
  locateError: string | null;
  onLocate: () => void;
  onPick: (place: Place) => void;
  onClose: () => void;
}

/** Ob-havo joyini tanlash — shaharlar va barcha tumanlar. */
export function PlaceSheet({
  place,
  locating,
  locateError,
  onLocate,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");

  const { cities, groups, total } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (item: Place) =>
      !needle ||
      item.name.toLowerCase().includes(needle) ||
      item.region.toLowerCase().includes(needle);

    const cityList = CITIES.filter(matches);
    const regionGroups = REGIONS.map((region) => ({
      region,
      items: DISTRICTS.filter((district) => district.region === region && matches(district)),
    })).filter((group) => group.items.length > 0);

    return {
      cities: cityList,
      groups: regionGroups,
      total: cityList.length + regionGroups.reduce((sum, group) => sum + group.items.length, 0),
    };
  }, [query]);

  return (
    <Sheet
      title="Weather location"
      subtitle={`Uzbekistan · ${CITIES.length} cities, ${DISTRICTS.length} districts`}
      onClose={onClose}
    >
      <div className="sheet-search">
        <div className="sheet-search__field">
          <span className="sheet-search__icon">
            <Search size={16} strokeWidth={2.2} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search city or district"
            aria-label="Search city or district"
            autoFocus
          />
        </div>
      </div>

      {!query.trim() ? (
        <button type="button" className="pick-action" onClick={onLocate} disabled={locating}>
          <span className="pick-action__icon">
            <LocateFixed size={17} strokeWidth={2.1} />
          </span>
          <span className="pick-action__text">
            <span className="pick-action__title">
              {locating ? "Finding your location…" : "Use my location"}
            </span>
            <span className={`pick-action__sub${locateError ? " is-error" : ""}`}>
              {locateError ?? "Weather for the place you are in right now"}
            </span>
          </span>
        </button>
      ) : null}

      {total === 0 ? (
        <p className="pick-empty">No place matches “{query.trim()}”.</p>
      ) : (
        <div className="pick-list">
          {cities.length > 0 ? (
            <>
              <p className="pick-group">Cities</p>
              {cities.map((city) => (
                <PlaceItem
                  key={`city-${city.name}`}
                  place={city}
                  subtitle={city.region}
                  active={city.name === place.name && city.region === place.region}
                  onPick={onPick}
                />
              ))}
            </>
          ) : null}

          {groups.map((group) => (
            <div key={group.region}>
              <p className="pick-group">{group.region}</p>
              {group.items.map((district) => (
                <PlaceItem
                  key={`${group.region}-${district.name}`}
                  place={district}
                  subtitle="District"
                  active={district.name === place.name && district.region === place.region}
                  onPick={onPick}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function PlaceItem({
  place,
  subtitle,
  active,
  onPick,
}: {
  place: Place;
  subtitle: string;
  active: boolean;
  onPick: (place: Place) => void;
}) {
  return (
    <button
      type="button"
      className={`pick-item${active ? " is-active" : ""}`}
      onClick={() => onPick(place)}
    >
      <span className="pick-badge pick-badge--place">{place.name.slice(0, 1).toUpperCase()}</span>

      <span className="pick-text">
        <span className="pick-name">{place.name}</span>
        <span className="pick-sub">{subtitle}</span>
      </span>

      {active ? (
        <span className="pick-check">
          <Check size={17} strokeWidth={2.6} />
        </span>
      ) : null}
    </button>
  );
}
