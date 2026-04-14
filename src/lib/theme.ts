export type AppTheme = "dark" | "light";

const THEME_STORAGE_KEY = "study-theme";
const FIRST_LOGIN_THEME_STORAGE_PREFIX = "study-theme-first-login";
const ACCENT_COLOR_STORAGE_KEY = "study-accent-color";
const DEFAULT_ACCENT_COLOR = "#ff7700";
const FIRST_LOGIN_THEME_THRESHOLD_MS = 60_000;

const HEX_COLOR_REGEX = /^#?[0-9a-f]{6}$/i;

const normalizeHexColor = (value: string | null | undefined) => {
  const fallback = DEFAULT_ACCENT_COLOR;
  if (!value) return fallback;

  const trimmed = value.trim().toLowerCase();
  if (!HEX_COLOR_REGEX.test(trimmed)) return fallback;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHexColor(hex).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
};

const rgbToHsl = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    h: hue,
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  };
};

const toHslToken = (hsl: { h: number; s: number; l: number }) =>
  `${hsl.h} ${hsl.s}% ${hsl.l}%`;

export const getStoredTheme = (): AppTheme => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
};

export const getDefaultAccentColor = () => DEFAULT_ACCENT_COLOR;

export const getStoredAccentColor = () => {
  if (typeof window === "undefined") return DEFAULT_ACCENT_COLOR;
  const stored = window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
  return normalizeHexColor(stored);
};

export const applyAccentColor = (accentColor: string) => {
  if (typeof window === "undefined") return;

  const normalizedColor = normalizeHexColor(accentColor);
  const hsl = rgbToHsl(hexToRgb(normalizedColor));
  const hslToken = toHslToken(hsl);
  const root = window.document.documentElement;

  root.style.setProperty("--primary", hslToken);
  root.style.setProperty("--sidebar-primary", hslToken);
  root.style.setProperty("--ring", hslToken);
  root.style.setProperty("--sidebar-ring", hslToken);
  window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, normalizedColor);
};

export const resetAccentColor = () => applyAccentColor(DEFAULT_ACCENT_COLOR);

export const applyTheme = (theme: AppTheme) => {
  if (typeof window === "undefined") return;
  const root = window.document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
};

const isFirstSignIn = (
  createdAt?: string | null,
  lastSignInAt?: string | null
) => {
  const createdAtMs = Date.parse(createdAt ?? "");
  const lastSignInAtMs = Date.parse(lastSignInAt ?? "");

  if (!Number.isFinite(createdAtMs) || !Number.isFinite(lastSignInAtMs))
    return false;

  return (
    Math.abs(lastSignInAtMs - createdAtMs) <= FIRST_LOGIN_THEME_THRESHOLD_MS
  );
};

export const applyLightThemeOnFirstLogin = ({
  userId,
  createdAt,
  lastSignInAt
}: {
  userId?: string;
  createdAt?: string | null;
  lastSignInAt?: string | null;
}) => {
  if (typeof window === "undefined" || !userId) return;
  if (!isFirstSignIn(createdAt, lastSignInAt)) return;

  const storageKey = `${FIRST_LOGIN_THEME_STORAGE_PREFIX}:${userId}`;
  if (window.localStorage.getItem(storageKey) === "1") return;

  applyTheme("light");
  window.localStorage.setItem(storageKey, "1");
};

export const applyDarkThemeForLoggedOutLanding = () => {
  if (typeof window === "undefined") return;
  applyTheme("dark");
};

export const initializeTheme = (): AppTheme => {
  const theme = getStoredTheme();
  applyTheme(theme);
  if (typeof window !== "undefined")
    window.localStorage.removeItem(ACCENT_COLOR_STORAGE_KEY);
  return theme;
};
