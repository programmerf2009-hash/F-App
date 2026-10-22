import { House, Settings2, UserRound } from "lucide-react";
import "./bottom-nav.css";

export type Tab = "home" | "settings";

interface Props {
  active: Tab;
  onNavigate: (tab: Tab) => void;
  onSoon: (message: string) => void;
}

export function BottomNav({ active, onNavigate, onSoon }: Props) {
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

      <button type="button" className="tabbar__item" onClick={() => onSoon("Profile is coming soon")}>
        <span className="tabbar__icon">
          <UserRound size={21} strokeWidth={2} />
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

      <span className="tabbar__slot" aria-hidden="true" />
      <span className="tabbar__slot" aria-hidden="true" />
    </nav>
  );
}
