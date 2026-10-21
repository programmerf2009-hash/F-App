/**
 * Vaqtinchalik logotip belgisi.
 * `public/brand/fapplogo2.png` qo'shilgach, bu komponent ishlatilmaydi.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="52 28 150 158"
      role="img"
      aria-label="F App"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="f-arm-top" x1="84" y1="38" x2="196" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8FD8FF" />
          <stop offset="45%" stopColor="#3B86FF" />
          <stop offset="100%" stopColor="#1F5BFF" />
        </linearGradient>
        <linearGradient id="f-arm-mid" x1="84" y1="106" x2="168" y2="158" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2F6BFF" />
          <stop offset="55%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#E07BFF" />
        </linearGradient>
        <linearGradient id="f-stem" x1="60" y1="34" x2="92" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2F6BFF" />
          <stop offset="100%" stopColor="#6B3BFF" />
        </linearGradient>
      </defs>

      {/* Vertikal o'zak */}
      <path
        d="M60 46c0-7 6-12 13-12h13v122c0 14-10 24-24 24h-2z"
        fill="url(#f-stem)"
      />
      {/* Yuqori qanot */}
      <path
        d="M86 34h88c16 0 25 19 13 30l-32 32c-5 5-11 8-18 8H86z"
        fill="url(#f-arm-top)"
      />
      {/* O'rta qanot */}
      <path
        d="M86 106h56c18 0 27 21 13 33l-16 16c-5 5-11 7-18 7H86z"
        fill="url(#f-arm-mid)"
      />
    </svg>
  );
}
