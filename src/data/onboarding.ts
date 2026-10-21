import {
  Bot,
  Car,
  Film,
  Layers,
  MessageCircle,
  Music,
  Newspaper,
  PlayCircle,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface OnboardingChip {
  icon: LucideIcon;
  label: string;
}

export interface OnboardingSlide {
  id: string;
  title: string;
  body: string;
  icon: LucideIcon;
  tone: "blue" | "pink" | "violet";
  chips: OnboardingChip[];
}

/** Matnlarda emoji ishlatilmaydi — faqat tipografiya va ikonkalar. */
export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: "ecosystem",
    title: "One app. Everything.",
    body: "Chat, rides, shopping, movies and payments — one place instead of twenty separate apps.",
    icon: Layers,
    tone: "blue",
    chips: [
      { icon: MessageCircle, label: "Chat" },
      { icon: Car, label: "Taxi" },
      { icon: ShoppingBag, label: "Shop" },
    ],
  },
  {
    id: "entertainment",
    title: "Made for your free time.",
    body: "Movies, music and stories picked around what you actually enjoy watching and listening to.",
    icon: PlayCircle,
    tone: "pink",
    chips: [
      { icon: Film, label: "Movies" },
      { icon: Music, label: "Music" },
      { icon: Newspaper, label: "News" },
    ],
  },
  {
    id: "freddie",
    title: "Meet Freddie.",
    body: "Your AI assistant. Ask anything and get things done across every F App service.",
    icon: Bot,
    tone: "violet",
    chips: [
      { icon: Sparkles, label: "Ideas" },
      { icon: Zap, label: "Actions" },
      { icon: ShieldCheck, label: "Private" },
    ],
  },
];
