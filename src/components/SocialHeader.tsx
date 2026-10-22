const LOGO_SRC = `${import.meta.env.BASE_URL}brand/fapplogo2.png`;

export function SocialHeader({ badge }: { badge: string }) {
  return (
    <header className="social__header">
      <div className="social__brand">
        <img className="social__logo" src={LOGO_SRC} alt="" aria-hidden="true" draggable={false} />
        <span className="social__wordmark">F App</span>
      </div>
      <span className="social__badge">{badge}</span>
    </header>
  );
}
