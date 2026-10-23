import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Modalni `.social__main` (z-index: 1) ichidan chiqarib, sahifa ildiziga
 * joylashtiradi. Shu bilan bottom nav va boshqa qatlamlar ustida turadi.
 * Rang tokenlari `.profile` / `.search` ildizidan meros bo'lib qoladi.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(
      document.querySelector<HTMLElement>(".profile, .search, .home, .settings"),
    );
  }, []);

  if (!host) return null;
  return createPortal(children, host);
}
