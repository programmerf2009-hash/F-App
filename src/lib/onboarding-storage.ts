const KEY = "fapp:onboarding:v1";

/** Tanishuv tugallanganmi? localStorage ishlamasa — takrorlamaymiz. */
export function isOnboardingDone(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "done";
  } catch {
    return true;
  }
}

export function markOnboardingDone(): void {
  try {
    window.localStorage.setItem(KEY, "done");
  } catch {
    /* private mode — jim o'tamiz */
  }
}

export function resetOnboarding(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* jim o'tamiz */
  }
}
