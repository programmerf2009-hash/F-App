import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "./app/AuthScreen";
import { Home } from "./app/Home";
import { Onboarding } from "./app/Onboarding";
import { Profile } from "./app/Profile";
import { SearchPage } from "./app/Search";
import { Settings } from "./app/Settings";
import { SplashScreen } from "./app/SplashScreen";
import { NewsApp } from "./news/NewsApp";
import { getSession, logOut, type Session } from "./lib/auth";
import { isOnboardingDone, markOnboardingDone, resetOnboarding } from "./lib/onboarding-storage";
import { setPendingCount } from "./lib/pending";
import { getPendingCount, subscribeFriendships } from "./lib/social";
import { loadTheme, saveTheme, type Theme } from "./lib/theme";
import type { Tab } from "./components/BottomNav";

/** Kirish ekrani qancha turadi (ms). */
const SPLASH_DURATION = 3000;

type Phase = "splash" | "onboarding" | "auth" | "app";

/** `?onboarding` yoki `?onboarding=2` — tanishuvni qayta ko'rish uchun. */
function onboardingStartIndex(): number | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("onboarding")) return null;
  const value = Number.parseInt(params.get("onboarding") ?? "1", 10);
  return Number.isFinite(value) && value > 1 ? value - 1 : 0;
}

export default function App() {
  const [startIndex] = useState(onboardingStartIndex);
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<Phase>(startIndex === null ? "splash" : "onboarding");
  const [tab, setTab] = useState<Tab>("home");
  const [profileTarget, setProfileTarget] = useState<string | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  const restore = useCallback(async () => {
    const next = await getSession().catch(() => null);
    setSession(next);
    setPhase(next ? "app" : "auth");
  }, []);

  /* Splash davomida sessiyani tiklaymiz (tarmoq sekin bo'lsa ham kutamiz). */
  useEffect(() => {
    if (phase !== "splash") return;

    let cancelled = false;
    const timer = new Promise<void>((resolve) => {
      window.setTimeout(resolve, SPLASH_DURATION);
    });

    if (!isOnboardingDone()) {
      void timer.then(() => {
        if (!cancelled) setPhase("onboarding");
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([timer, getSession().catch(() => null)]).then(([, next]) => {
      if (cancelled) return;
      setSession(next);
      setPhase(next ? "app" : "auth");
    });

    return () => {
      cancelled = true;
    };
  }, [phase]);

  /* Profil badge'i — kiruvchi so'rovlar soni, realtime bilan. */
  useEffect(() => {
    if (!session) return;

    let active = true;

    const refresh = async () => {
      try {
        const count = await getPendingCount();
        if (active) setPendingCount(count);
      } catch {
        /* badge — best effort */
      }
    };

    void refresh();
    const unsubscribe = subscribeFriendships(() => {
      void refresh();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);

    return () => {
      active = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      setPendingCount(0);
    };
  }, [session?.id]);

  const finishOnboarding = () => {
    markOnboardingDone();
    void restore();
  };

  const handleAuthenticated = (next: Session) => {
    setSession(next);
    setTab("home");
    setProfileTarget(null);
    setNewsOpen(false);
    setPhase("app");
  };

  const handleLogOut = () => {
    void logOut();
    setSession(null);
    setTab("home");
    setProfileTarget(null);
    setNewsOpen(false);
    setPhase("auth");
    setPendingCount(0);
  };

  const handleThemeChange = (next: Theme) => {
    saveTheme(next);
    setTheme(next);
  };

  const replayOnboarding = () => {
    resetOnboarding();
    setPhase("onboarding");
  };

  const navigate = useCallback((next: Tab) => {
    if (next === "profile") setProfileTarget(null);
    setNewsOpen(false);
    setTab(next);
  }, []);

  const openProfile = useCallback((nickname: string) => {
    setProfileTarget(nickname);
    setTab("profile");
  }, []);

  if (phase === "splash") return <SplashScreen />;

  if (phase === "onboarding") {
    return <Onboarding onFinish={finishOnboarding} initialIndex={startIndex ?? 0} />;
  }

  if (phase === "app" && session) {
    if (newsOpen) {
      return <NewsApp session={session} onClose={() => setNewsOpen(false)} />;
    }

    if (tab === "settings") {
      return (
        <Settings
          session={session}
          theme={theme}
          onThemeChange={handleThemeChange}
          onSessionChange={setSession}
          onLogout={handleLogOut}
          onNavigate={navigate}
        />
      );
    }

    if (tab === "profile") {
      return (
        <Profile
          session={session}
          theme={theme}
          target={profileTarget}
          onOpenProfile={openProfile}
          onCloseTarget={() => setProfileTarget(null)}
          onNavigate={navigate}
        />
      );
    }

    if (tab === "search") {
      return <SearchPage theme={theme} onNavigate={navigate} />;
    }

    return (
      <Home
        session={session}
        theme={theme}
        onLogout={handleLogOut}
        onReplay={replayOnboarding}
        onNavigate={navigate}
        onOpenNews={() => {
          setTab("home");
          setProfileTarget(null);
          setNewsOpen(true);
        }}
      />
    );
  }

  return <AuthScreen onAuthenticated={handleAuthenticated} />;
}
