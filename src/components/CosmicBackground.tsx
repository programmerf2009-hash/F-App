import "./cosmic.css";

/**
 * Purpur kosmik fon — splash va onboarding uchun umumiy.
 * To'liq CSS gradientlar: hech qanday rasm yuklanmaydi.
 */
export function CosmicBackground() {
  return (
    <div className="cosmic" aria-hidden="true">
      <div className="cosmic__haze" />
      <div className="stars stars--dust" />
      <div className="stars stars--far" />
      <div className="stars stars--mid" />
      <div className="stars stars--near" />
      <span className="spark spark--1" />
      <span className="spark spark--2" />
      <span className="spark spark--3" />
      <span className="spark spark--4" />
      <span className="spark spark--5" />
      <div className="cosmic__vignette" />
    </div>
  );
}
