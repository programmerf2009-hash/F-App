import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./sheet.css";

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Pastdan chiqadigan panel (mobil) / markazdagi oyna (desktop).
 * Home ichida chiziladi — ranglar Home temasidan meros olinadi.
 */
export function Sheet({ title, subtitle, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };

    window.addEventListener("keydown", handleKey);
    panelRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="sheet__scrim"
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close"
      />

      <div className="sheet__panel" ref={panelRef} tabIndex={-1}>
        <span className="sheet__grab" aria-hidden="true" />

        <header className="sheet__head">
          <div className="sheet__heading">
            <h2 className="sheet__title">{title}</h2>
            {subtitle ? <p className="sheet__subtitle">{subtitle}</p> : null}
          </div>

          <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
            <X size={17} strokeWidth={2.2} />
          </button>
        </header>

        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
