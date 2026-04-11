export const COOKIE_CONSENT_STORAGE_KEY = "iberica-oposiciones:cookie-consent";
export const COOKIE_CONSENT_UPDATED_EVENT =
  "iberica-oposiciones:cookie-consent-updated";

export type CookieConsentCategory =
  | "necessary"
  | "preferences"
  | "analytics"
  | "marketing";

export type CookieConsentDecision = "accept_all" | "reject_all" | "custom";

export type CookieConsentCategories = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type CookieConsentRecord = {
  version: 1;
  decision: CookieConsentDecision;
  categories: CookieConsentCategories;
  updatedAt: string;
};

const COOKIE_CONSENT_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const rejectOptionalCookieCategories = (): CookieConsentCategories => ({
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false
});

export const acceptAllCookieCategories = (): CookieConsentCategories => ({
  necessary: true,
  preferences: true,
  analytics: true,
  marketing: true
});

export const normalizeCookieConsentCategories = (
  value: unknown
): CookieConsentCategories => {
  if (!isRecord(value)) return rejectOptionalCookieCategories();

  return {
    necessary: true,
    preferences: Boolean(value.preferences),
    analytics: Boolean(value.analytics),
    marketing: Boolean(value.marketing)
  };
};

export const createCookieConsentRecord = ({
  decision,
  categories,
  updatedAt = new Date().toISOString()
}: {
  decision: CookieConsentDecision;
  categories: CookieConsentCategories;
  updatedAt?: string;
}): CookieConsentRecord => ({
  version: COOKIE_CONSENT_VERSION,
  decision,
  categories: normalizeCookieConsentCategories(categories),
  updatedAt
});

export const readCookieConsent = (): CookieConsentRecord | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;

    const decision =
      parsed.decision === "accept_all" ||
      parsed.decision === "reject_all" ||
      parsed.decision === "custom"
        ? parsed.decision
        : null;

    if (!decision) return null;

    return createCookieConsentRecord({
      decision,
      categories: normalizeCookieConsentCategories(parsed.categories),
      updatedAt:
        typeof parsed.updatedAt === "string" &&
        parsed.updatedAt.trim().length > 0
          ? parsed.updatedAt
          : new Date().toISOString()
    });
  } catch {
    return null;
  }
};

const dispatchCookieConsentUpdate = (consent: CookieConsentRecord) => {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<CookieConsentRecord>(COOKIE_CONSENT_UPDATED_EVENT, {
      detail: consent
    })
  );
};

export const writeCookieConsent = (consent: CookieConsentRecord) => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify(consent)
  );
  dispatchCookieConsentUpdate(consent);
};

export const hasCookieConsentFor = (
  category: CookieConsentCategory,
  consent: CookieConsentRecord | null = readCookieConsent()
) => {
  if (category === "necessary") return true;
  return Boolean(consent?.categories[category]);
};

declare global {
  interface WindowEventMap {
    [COOKIE_CONSENT_UPDATED_EVENT]: CustomEvent<CookieConsentRecord>;
  }
}
