import { House, Search, Settings2, UserRound } from "lucide-react";
import { usePendingCount } from "../lib/pending";
import "./bottom-nav.css";

export type Tab = "home" | "profile" | "settings" | "search";

interface Props {
  active: Tab;
  onNavigate: (tab: Tab) => void;
}

export function BottomNav({ active, onNavigate }: Props) {
  const pending = usePendingCount();

  return (
    <nav className="tabbar" aria-label="Main navigation">
      <button
        type="button"
        className={`tabbar__item${active === "home" ? " is-active" : ""}`}
        aria-current={active === "home" ? "page" : undefined}
        onClick={() => onNavigate("home")}
      >
        <span className="tabbar__icon">
          <House size={21} strokeWidth={2} />
        </span>
        <span className="tabbar__label">Home</span>
      </button>

      <button
        type="button"
        className={`tabbar__item${active === "profile" ? " is-active" : ""}`}
        aria-current={active === "profile" ? "page" : undefined}
        onClick={() => onNavigate("profile")}
      >
        <span className="tabbar__icon">
          <UserRound size={21} strokeWidth={2} />
          {pending > 0 ? (
            <span className="tabbar__badge" aria-label={`${pending} friend requests`}>
              {pending > 9 ? "9+" : pending}
            </span>
          ) : null}
        </span>
        <span className="tabbar__label">Profile</span>
      </button>

      <button
        type="button"
        className={`tabbar__item${active === "settings" ? " is-active" : ""}`}
        aria-current={active === "settings" ? "page" : undefined}
        onClick={() => onNavigate("settings")}
      >
        <span className="tabbar__icon">
          <Settings2 size={21} strokeWidth={2} />
        </span>
        <span className="tabbar__label">Settings</span>
      </button>

      <button
        type="button"
        className={`tabbar__item${active === "search" ? " is-active" : ""}`}
        aria-current={active === "search" ? "page" : undefined}
        onClick={() => onNavigate("search")}
      >
        <span className="tabbar__icon">
          <Search size={21} strokeWidth={2} />
        </span>
        <span className="tabbar__label">Search</span>
      </button>

      <span className="tabbar__slot" aria-hidden="true" />
    </nav>
  );
}
