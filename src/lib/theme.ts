export type AppTheme = "dark" | "light";

const THEME_STORAGE_KEY = "study-theme";

export const getStoredTheme = (): AppTheme => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
};

export const applyTheme = (theme: AppTheme) => {
  if (typeof window === "undefined") return;
  const root = window.document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
};

export const initializeTheme = (): AppTheme => {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
};
