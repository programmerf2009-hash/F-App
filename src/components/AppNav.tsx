import { useEffect, type CSSProperties } from "react";
import {
  Bot,
  BriefcaseBusiness,
  CarTaxiFront,
  ChevronRight,
  Clapperboard,
  CloudSun,
  Coins,
  Film,
  Globe2,
  GraduationCap,
  House,
  LayoutGrid,
  Library,
  MapPin,
  MessageCircle,
  Music2,
  ShoppingBag,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import "./app-nav.css";

const LOGO_SRC = `${import.meta.env.BASE_URL}brand/fapplogo2.png`;

interface NavItem {
  label: string;
  Icon: LucideIcon;
  tone: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Home", Icon: House, tone: "#8fc2ff" },
  { label: "News & Weather", Icon: CloudSun, tone: "#ffd46b" },
  { label: "Video & Shorts", Icon: Clapperboard, tone: "#8fb2ff" },
  { label: "Movies & Series", Icon: Film, tone: "#c0a0ff" },
  { label: "Songs & Music", Icon: Music2, tone: "#ff9cc4" },
  { label: "F Shop", Icon: ShoppingBag, tone: "#8bc6ff" },
  { label: "Taxi", Icon: CarTaxiFront, tone: "#e8f1ff" },
  { label: "Web", Icon: Globe2, tone: "#77d5ff" },
  { label: "Chat", Icon: MessageCircle, tone: "#83a9ff" },
  { label: "Wallet", Icon: Wallet, tone: "#8fc2ff" },
  { label: "Education & Lesson", Icon: GraduationCap, tone: "#7fd4ff" },
  { label: "Library & Book", Icon: Library, tone: "#a5beff" },
  { label: "App Store", Icon: LayoutGrid, tone: "#7fb3ff" },
  { label: "World Sport", Icon: Trophy, tone: "#ffd46b" },
  { label: "AI Assistant", Icon: Bot, tone: "#8ed4ff" },
  { label: "Map", Icon: MapPin, tone: "#7fb3ff" },
  { label: "Jobs & Services", Icon: BriefcaseBusiness, tone: "#9db9ff" },
  { label: "Casino", Icon: Coins, tone: "#ffd46b" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSoon: (message: string) => void;
  onOpenNews: () => void;
}

/**
 * F App navigatsiyasi. Home'dagi logotipdan ochiladi, paneldagi logotipdan
 * yopiladi. News & Weather o'z bo'limini ochadi; qolgan bandlar hozircha
 * "Coming soon" qaytaradi.
 */
export function AppNav({ open, onClose, onSoon, onOpenNews }: Props) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const pickItem = (item: NavItem) => {
    onClose();
    if (item.label === "News & Weather") {
      onOpenNews();
      return;
    }
    if (item.label !== "Home") onSoon(`Coming soon: ${item.label}`);
  };

  return (
    <div className="app-nav">
      <button
        type="button"
        className="app-nav__scrim"
        onClick={onClose}
        aria-label="Close app menu"
        aria-hidden="true"
        tabIndex={-1}
      />

      <section
        className="app-nav__panel"
        id="app-nav"
        role="dialog"
        aria-modal="true"
        aria-label="F App menu"
      >
        <header className="app-nav__head">
          <button
            type="button"
            className="app-nav__brand"
            onClick={onClose}
            aria-label="Close app menu"
            autoFocus
          >
            <img
              className="app-nav__logo"
              src={LOGO_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            <span className="app-nav__wordmark">F App</span>
          </button>
        </header>

        <nav className="app-nav__list" aria-label="F App sections">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              className="app-nav__item"
              key={item.label}
              onClick={() => pickItem(item)}
              aria-current={item.label === "Home" ? "page" : undefined}
              style={{ "--nav-tone": item.tone } as CSSProperties}
            >
              <span className="app-nav__icon" aria-hidden="true">
                <item.Icon size={16} strokeWidth={2.05} />
              </span>
              <span className="app-nav__label">{item.label}</span>
              <ChevronRight
                className="app-nav__chevron"
                size={14}
                strokeWidth={2.2}
                aria-hidden="true"
              />
            </button>
          ))}
        </nav>
      </section>
    </div>
  );
}
