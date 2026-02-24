export const APP_LOCALES = ["es", "en"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "es";

export const isAppLocale = (value: string): value is AppLocale =>
  APP_LOCALES.includes(value as AppLocale);

export const normalizeLocale = (
  value: string | null | undefined
): AppLocale => {
  if (!value) return DEFAULT_LOCALE;
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
};

export const toIntlLocale = (locale: AppLocale) =>
  locale === "en" ? "en-US" : "es-ES";
