import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

const DEFAULT_SITE_URL = "https://ibericaoposiciones.com";
const DEFAULT_SOCIAL_IMAGE = "/iberica-oposiciones-logo.png";

type SeoConfig = {
  description: string;
  robots: "index, follow" | "noindex, nofollow";
  title: string;
};

const upsertMetaTag = (
  selector: string,
  attributeName: "name" | "property",
  attributeValue: string,
  content: string
) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
};

const upsertLinkTag = (rel: string, href: string) => {
  let element = document.head.querySelector<HTMLLinkElement>(
    `link[rel="${rel}"]`
  );
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
};

const removeLinkTag = (rel: string) => {
  document.head.querySelector(`link[rel="${rel}"]`)?.remove();
};

const composeTitle = (pageTitle: string, siteName: string) =>
  `${pageTitle} | ${siteName}`;

const SeoManager = () => {
  const location = useLocation();
  const { i18n, t } = useTranslation([
    "auth",
    "common",
    "footerPages",
    "faq",
    "landing",
    "plans"
  ]);

  useEffect(() => {
    const siteName = t("common:appName");
    const origin =
      typeof window !== "undefined" ? window.location.origin : DEFAULT_SITE_URL;
    const currentUrl = new URL(location.pathname, origin);
    const socialImageUrl = new URL(DEFAULT_SOCIAL_IMAGE, origin).toString();
    const locale = i18n.resolvedLanguage?.toLowerCase().startsWith("en")
      ? "en-US"
      : "es-ES";
    const ogLocale = locale === "en-US" ? "en_US" : "es_ES";

    const seoConfig: SeoConfig = (() => {
      switch (location.pathname) {
        case "/":
          return {
            description: t("landing:seo.home.description"),
            robots: "index, follow",
            title: composeTitle(t("landing:seo.home.title"), siteName)
          };
        case "/planes":
          return {
            description: t("plans:seo.public.description"),
            robots: "index, follow",
            title: composeTitle(t("plans:seo.public.title"), siteName)
          };
        case "/preguntas-frecuentes":
          return {
            description: t("faq:seo.page.description"),
            robots: "index, follow",
            title: composeTitle(t("faq:seo.page.title"), siteName)
          };
        case "/terminos":
          return {
            description: t("footerPages:terms.seo.description"),
            robots: "index, follow",
            title: composeTitle(t("footerPages:terms.seo.title"), siteName)
          };
        case "/privacidad":
          return {
            description: t("footerPages:privacy.seo.description"),
            robots: "index, follow",
            title: composeTitle(t("footerPages:privacy.seo.title"), siteName)
          };
        case "/sobre-nosotros":
          return {
            description: t("footerPages:about.seo.description"),
            robots: "index, follow",
            title: composeTitle(t("footerPages:about.seo.title"), siteName)
          };
        case "/login":
          return {
            description: t("auth:login.heroDescription"),
            robots: "noindex, nofollow",
            title: composeTitle(t("auth:login.title"), siteName)
          };
        case "/registro":
          return {
            description: t("auth:register.heroDescription"),
            robots: "noindex, nofollow",
            title: composeTitle(t("auth:register.title"), siteName)
          };
        case "/reset-password":
          return {
            description: t("auth:resetPassword.heroDescription"),
            robots: "noindex, nofollow",
            title: composeTitle(t("auth:resetPassword.title"), siteName)
          };
        case "/registro/planes":
          return {
            description: t("plans:selector.description"),
            robots: "noindex, nofollow",
            title: composeTitle(t("plans:selector.title"), siteName)
          };
        case "/registro/pago-completado":
        case "/auth/callback":
          return {
            description: t("common:seo.secureAccess.description"),
            robots: "noindex, nofollow",
            title: composeTitle(t("common:seo.secureAccess.title"), siteName)
          };
        default:
          if (
            location.pathname === "/dashboard" ||
            location.pathname === "/seleccion-plan" ||
            location.pathname.startsWith("/perfil")
          ) {
            return {
              description: t("common:seo.privateArea.description"),
              robots: "noindex, nofollow",
              title: composeTitle(t("common:seo.privateArea.title"), siteName)
            };
          }

          return {
            description: t("common:seo.notFound.description"),
            robots: "noindex, nofollow",
            title: composeTitle(t("common:seo.notFound.title"), siteName)
          };
      }
    })();

    document.documentElement.lang = locale;
    document.title = seoConfig.title;

    upsertMetaTag(
      'meta[name="description"]',
      "name",
      "description",
      seoConfig.description
    );
    upsertMetaTag('meta[name="robots"]', "name", "robots", seoConfig.robots);
    upsertMetaTag(
      'meta[name="googlebot"]',
      "name",
      "googlebot",
      seoConfig.robots
    );
    upsertMetaTag('meta[property="og:type"]', "property", "og:type", "website");
    upsertMetaTag(
      'meta[property="og:site_name"]',
      "property",
      "og:site_name",
      siteName
    );
    upsertMetaTag(
      'meta[property="og:locale"]',
      "property",
      "og:locale",
      ogLocale
    );
    upsertMetaTag(
      'meta[property="og:title"]',
      "property",
      "og:title",
      seoConfig.title
    );
    upsertMetaTag(
      'meta[property="og:description"]',
      "property",
      "og:description",
      seoConfig.description
    );
    upsertMetaTag(
      'meta[property="og:url"]',
      "property",
      "og:url",
      currentUrl.toString()
    );
    upsertMetaTag(
      'meta[property="og:image"]',
      "property",
      "og:image",
      socialImageUrl
    );
    upsertMetaTag(
      'meta[name="twitter:card"]',
      "name",
      "twitter:card",
      "summary_large_image"
    );
    upsertMetaTag(
      'meta[name="twitter:title"]',
      "name",
      "twitter:title",
      seoConfig.title
    );
    upsertMetaTag(
      'meta[name="twitter:description"]',
      "name",
      "twitter:description",
      seoConfig.description
    );
    upsertMetaTag(
      'meta[name="twitter:image"]',
      "name",
      "twitter:image",
      socialImageUrl
    );

    if (seoConfig.robots === "index, follow")
      upsertLinkTag("canonical", currentUrl.toString());
    else removeLinkTag("canonical");
  }, [i18n.resolvedLanguage, location.pathname, t]);

  return null;
};

export default SeoManager;
