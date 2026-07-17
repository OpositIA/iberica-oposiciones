import { pushDataLayerEvent, trackSignUpSuccess } from "@/lib/gtm";
import { beforeEach, describe, expect, it } from "vitest";

describe("gtm", () => {
  beforeEach(() => {
    window.dataLayer = undefined;
  });

  it("initializes dataLayer before pushing an event", () => {
    pushDataLayerEvent({ event: "custom_event", value: 1 });

    expect(window.dataLayer).toEqual([{ event: "custom_event", value: 1 }]);
  });

  it("pushes the sign up success event expected by GTM", () => {
    trackSignUpSuccess();

    expect(window.dataLayer).toEqual([{ event: "sign_up_success" }]);
  });
});
