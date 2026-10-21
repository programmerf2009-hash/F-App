import { CosmicBackground } from "../components/CosmicBackground";
import { LogoMark } from "../components/LogoMark";
import "./home-placeholder.css";

interface Props {
  onReplay: () => void;
}

/**
 * Vaqtinchalik ekran — onboarding tugagach ko'rinadi.
 * Home ekrani qurilgach o'chiriladi.
 */
export function HomePlaceholder({ onReplay }: Props) {
  return (
    <div className="home-ph">
      <CosmicBackground />

      <div className="home-ph__inner">
        <LogoMark className="home-ph__logo" />
        <p className="home-ph__label">Home</p>

        {import.meta.env.DEV && (
          <button className="home-ph__replay" onClick={onReplay}>
            Replay onboarding
          </button>
        )}
      </div>
    </div>
  );
}
