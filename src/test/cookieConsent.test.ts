import { beforeEach, describe, expect, it } from "vitest";

import {
  acceptAllCookieCategories,
  COOKIE_CONSENT_STORAGE_KEY,
  createCookieConsentRecord,
  normalizeCookieConsentCategories,
  readCookieConsent,
  rejectOptionalCookieCategories,
  writeCookieConsent
} from "@/lib/cookieConsent";

describe("cookieConsent", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("normalizes optional categories while keeping necessary always enabled", () => {
    expect(
      normalizeCookieConsentCategories({
        necessary: false,
        preferences: 1,
        analytics: "",
        marketing: "yes"
      })
    ).toEqual({
      necessary: true,
      preferences: true,
      analytics: false,
      marketing: true
    });
  });

  it("persists and restores a valid consent record", () => {
    const consent = createCookieConsentRecord({
      decision: "custom",
      categories: {
        ...rejectOptionalCookieCategories(),
        analytics: true
      },
      updatedAt: "2026-03-25T00:00:00.000Z"
    });

    writeCookieConsent(consent);

    expect(readCookieConsent()).toEqual(consent);
  });

  it("returns null when the stored payload is invalid", () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "{invalid-json");

    expect(readCookieConsent()).toBeNull();
    expect(acceptAllCookieCategories()).toEqual({
      necessary: true,
      preferences: true,
      analytics: true,
      marketing: true
    });
  });
});
