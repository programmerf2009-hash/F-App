import { useEffect, useState } from "react";
import { CloudOff, Wifi } from "lucide-react";

/**
 * A thin status line that appears when the device loses the network and
 * confirms when it comes back. The app keeps working with already loaded
 * data, so silence would look like a freeze.
 */
export function OfflineNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [justBack, setJustBack] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setJustBack(true);
    };
    const goOffline = () => {
      setOnline(false);
      setJustBack(false);
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!justBack) return;
    const timer = window.setTimeout(() => setJustBack(false), 2600);
    return () => window.clearTimeout(timer);
  }, [justBack]);

  if (online && !justBack) return null;

  return (
    <div
      className={`net-banner${online ? " net-banner--back" : ""}`}
      role="status"
      aria-live="polite"
    >
      {online ? (
        <Wifi size={14} strokeWidth={2.2} aria-hidden="true" />
      ) : (
        <CloudOff size={14} strokeWidth={2.2} aria-hidden="true" />
      )}
      <span>{online ? "Back online" : "No connection — showing saved data"}</span>
    </div>
  );
}
