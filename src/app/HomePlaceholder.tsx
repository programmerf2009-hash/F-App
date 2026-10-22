import { LogOut } from "lucide-react";
import { CosmicBackground } from "../components/CosmicBackground";
import { LogoMark } from "../components/LogoMark";
import type { Session } from "../lib/auth";
import "./home-placeholder.css";

interface Props {
  session: Session;
  onLogout: () => void;
  onReplay: () => void;
}

/**
 * Vaqtinchalik ekran — kirishdan keyin ko'rinadi.
 * Home ekrani qurilgach o'chiriladi.
 */
export function HomePlaceholder({ session, onLogout, onReplay }: Props) {
  return (
    <div className="home-ph">
      <CosmicBackground />

      <div className="home-ph__inner">
        <LogoMark className="home-ph__logo" />
        <p className="home-ph__label">Home</p>
        <p className="home-ph__account">@{session.nickname}</p>

        <button className="home-ph__logout" onClick={onLogout}>
          <LogOut size={16} strokeWidth={2} />
          <span>Log out</span>
        </button>

        {import.meta.env.DEV && (
          <button className="home-ph__replay" onClick={onReplay}>
            Replay onboarding
          </button>
        )}
      </div>
    </div>
  );
}
