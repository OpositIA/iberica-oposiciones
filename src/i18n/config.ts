import i18n from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import { APP_LOCALES, DEFAULT_LOCALE, normalizeLocale } from "./locales";

if (!i18n.isInitialized) {
  i18n
    .use(
      resourcesToBackend(
        (language: string, namespace: string) =>
          import(`../locales/${normalizeLocale(language)}/${namespace}.json`)
      )
    )
    .use(initReactI18next)
    .init({
      lng: DEFAULT_LOCALE,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...APP_LOCALES],
      defaultNS: "common",
      ns: ["common"],
      interpolation: {
        escapeValue: false
      },
      react: {
        useSuspense: true
      }
    });
}

const setDocumentLanguage = (language: string) => {
  document.documentElement.lang = normalizeLocale(language);
};

setDocumentLanguage(i18n.resolvedLanguage ?? DEFAULT_LOCALE);

i18n.on("languageChanged", (language) => {
  setDocumentLanguage(language);
});

export default i18n;
