import { useEffect, useState } from "react";

interface Props {
  url: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}

/** Avatar — rasm bo'lmasa yoki yuklanmasa ismning birinchi harfi. */
export function PersonAvatar({ url, name, size = "md" }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const initial = (name.trim()[0] ?? "F").toUpperCase();

  return (
    <span className={`pavatar pavatar--${size}`}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="pavatar__initial" aria-hidden="true">
          {initial}
        </span>
      )}
    </span>
  );
}
