import { useEffect, useState } from "react";
import { HomePlaceholder } from "./app/HomePlaceholder";
import { Onboarding } from "./app/Onboarding";
import { SplashScreen } from "./app/SplashScreen";
import { isOnboardingDone, markOnboardingDone, resetOnboarding } from "./lib/onboarding-storage";

/** Kirish ekrani qancha turadi (ms). */
const SPLASH_DURATION = 3000;

type Phase = "splash" | "onboarding" | "app";

/** `?onboarding` yoki `?onboarding=2` — tanishuvni qayta ko'rish uchun. */
function onboardingStartIndex(): number | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("onboarding")) return null;
  const value = Number.parseInt(params.get("onboarding") ?? "1", 10);
  return Number.isFinite(value) && value > 1 ? value - 1 : 0;
}

export default function App() {
  const [startIndex] = useState(onboardingStartIndex);
  const [phase, setPhase] = useState<Phase>(startIndex === null ? "splash" : "onboarding");

  useEffect(() => {
    if (phase !== "splash") return;

    const timer = window.setTimeout(() => {
      setPhase(isOnboardingDone() ? "app" : "onboarding");
    }, SPLASH_DURATION);

    return () => window.clearTimeout(timer);
  }, [phase]);

  const finishOnboarding = () => {
    markOnboardingDone();
    setPhase("app");
  };

  const replayOnboarding = () => {
    resetOnboarding();
    setPhase("onboarding");
  };

  if (phase === "splash") return <SplashScreen />;
  if (phase === "onboarding")
    return <Onboarding onFinish={finishOnboarding} initialIndex={startIndex ?? 0} />;

  return <HomePlaceholder onReplay={replayOnboarding} />;
}
