import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Sheet } from "../components/Sheet";
import {
  UZS,
  crossRate,
  currencySymbol,
  findCurrency,
  formatRate,
  type Currency,
} from "../lib/rates";

interface Props {
  mode: "slot" | "base";
  slotIndex: number;
  currencies: Currency[];
  baseCode: string;
  slotCodes: string[];
  onPick: (code: string) => void;
  onClose: () => void;
}

/** Valyuta tanlash paneli — karta yoki baza valyuta uchun. */
export function CurrencySheet({
  mode,
  slotIndex,
  currencies,
  baseCode,
  slotCodes,
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");

  const base = findCurrency(currencies, baseCode) ?? UZS;
  const selected = mode === "slot" ? slotCodes[slotIndex] : baseCode;

  const list = useMemo(() => {
    const sorted = [...currencies].sort((a, b) => {
      if (a.code === "UZS") return -1;
      if (b.code === "UZS") return 1;
      return a.code.localeCompare(b.code);
    });

    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;

    return sorted
      .filter(
        (currency) =>
          currency.code.toLowerCase().includes(needle) ||
          currency.name.toLowerCase().includes(needle) ||
          currency.nameUz.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        const aExact = a.code.toLowerCase().startsWith(needle) ? 0 : 1;
        const bExact = b.code.toLowerCase().startsWith(needle) ? 0 : 1;
        return aExact - bExact || a.code.localeCompare(b.code);
      });
  }, [currencies, query]);

  return (
    <Sheet
      title={mode === "slot" ? "Choose currency" : "Show values in"}
      subtitle={
        mode === "slot"
          ? `Card ${slotIndex + 1} · currently ${selected}`
          : "All three cards will use this currency"
      }
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
            placeholder="Search currency"
            aria-label="Search currency"
            autoFocus
          />
        </div>
      </div>

      {currencies.length === 0 ? (
        <p className="pick-empty">Exchange rates are not available yet.</p>
      ) : list.length === 0 ? (
        <p className="pick-empty">No currency matches “{query.trim()}”.</p>
      ) : (
        <div className="pick-list">
          {list.map((currency) => {
            const active = currency.code === selected;
            const isBase = currency.code === base.code;

            return (
              <button
                key={currency.code}
                type="button"
                className={`pick-item${active ? " is-active" : ""}`}
                onClick={() => onPick(currency.code)}
              >
                <span className="pick-badge">{currencySymbol(currency.code)}</span>

                <span className="pick-text">
                  <span className="pick-name">{currency.code}</span>
                  <span className="pick-sub">{currency.name}</span>
                </span>

                {active ? (
                  <span className="pick-check">
                    <Check size={17} strokeWidth={2.6} />
                  </span>
                ) : (
                  <span className="pick-value">
                    {isBase ? "Base" : `${formatRate(crossRate(currency, base))} ${base.code}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
