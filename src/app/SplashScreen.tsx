import { useState } from "react";
import { CosmicBackground } from "../components/CosmicBackground";
import { LogoMark } from "../components/LogoMark";
import "./splash.css";

const LOGO_SRC = `${import.meta.env.BASE_URL}brand/fapplogo2.png`;

/**
 * Kirish ekrani: kosmik fon, markazda faqat logotip.
 * Matn, tugma yoki boshqa element yo'q.
 */
export function SplashScreen() {
  const [logoMissing, setLogoMissing] = useState(false);

  return (
    <div className="splash" aria-label="F App">
      <CosmicBackground />

      <div className="splash__stage">
        {logoMissing ? (
          <LogoMark className="splash__fallback" />
        ) : (
          <img
            className="splash__logo"
            src={LOGO_SRC}
            alt="F App"
            draggable={false}
            onError={() => setLogoMissing(true)}
          />
        )}
      </div>
    </div>
  );
}
