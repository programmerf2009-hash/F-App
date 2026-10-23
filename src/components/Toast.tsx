import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./toast.css";

export function Toast({ message }: { message: string | null }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(
      document.querySelector<HTMLElement>(".profile, .search, .home, .settings"),
    );
  }, []);

  if (!message || !host) return null;

  return createPortal(
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>,
    host,
  );
}
