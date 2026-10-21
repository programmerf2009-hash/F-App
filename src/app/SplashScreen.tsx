import { useState } from "react";
import { LogoMark } from "../components/LogoMark";
import "./splash.css";

const LOGO_SRC = `${import.meta.env.BASE_URL}brand/fapplogo2.png`;

/**
 * Kirish ekrani: purpur kosmik fon, markazda faqat logotip.
 * Matn, tugma yoki boshqa element yo'q.
 */
export function SplashScreen() {
  const [logoMissing, setLogoMissing] = useState(false);

  return (
    <div className="splash" aria-label="F App">
      <div className="splash__sky" aria-hidden="true">
        <div className="splash__haze" />
        <div className="stars stars--dust" />
        <div className="stars stars--far" />
        <div className="stars stars--mid" />
        <div className="stars stars--near" />
        <span className="spark spark--1" />
        <span className="spark spark--2" />
        <span className="spark spark--3" />
        <span className="spark spark--4" />
        <span className="spark spark--5" />
        <div className="splash__vignette" />
      </div>

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
