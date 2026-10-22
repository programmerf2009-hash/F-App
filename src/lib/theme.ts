/* ==========================================================================
   Tema — Settings'dan tanlanadi. Yangi qurilmada Gold (light) standart.
   ========================================================================== */

export type Theme = "dark" | "gold";

export const DEFAULT_THEME: Theme = "gold";

const THEME_KEY = "fapp:theme:v1";

export function loadTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === "gold" || raw === "dark" ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode — jim o'tamiz */
  }
}
