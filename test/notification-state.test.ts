import { describe, expect, it } from "vitest";
import {
  canOfferPushNotifications,
  describeNotificationState,
  type NotificationStateInput,
} from "../src/lib/notification-state.ts";

/** A device that can receive notifications and has an area, unless said otherwise. */
const describeState = (overrides: Partial<NotificationStateInput> = {}) =>
  describeNotificationState({
    status: "disabled",
    isInstalled: false,
    hasHomeArea: true,
    isIosDevice: false,
    ...overrides,
  });

describe("canOfferPushNotifications", () => {
  it("only offers the switch when the service can actually be used", () => {
    expect(canOfferPushNotifications("disabled", false, false)).toBe(true);
    expect(canOfferPushNotifications("enabled", false, false)).toBe(true);
    expect(canOfferPushNotifications("blocked", false, false)).toBe(false);
    expect(canOfferPushNotifications("unsupported", false, false)).toBe(false);
    expect(canOfferPushNotifications("unconfigured", false, false)).toBe(false);
  });

  it("requires the installed app on iOS, where Safari has no web push", () => {
    expect(canOfferPushNotifications("disabled", false, true)).toBe(false);
    expect(canOfferPushNotifications("disabled", true, true)).toBe(true);
  });
});

describe("describeNotificationState", () => {
  it("offers to switch off what is on, and on what is off", () => {
    const enabled = describeState({ status: "enabled" });
    expect(enabled.tone).toBe("on");
    expect(enabled.toggleLabel).toBe("Benachrichtigungen ausschalten");

    const disabled = describeState({ status: "disabled" });
    expect(disabled.tone).toBe("off");
    expect(disabled.toggleLabel).toBe("Benachrichtigungen einschalten");
  });

  it("asks for an area before offering to switch notifications on", () => {
    const state = describeState({ hasHomeArea: false });
    expect(state.tone).toBe("needs-area");
    expect(state.toggleLabel).toBeNull();
  });

  it("never offers a switch that cannot succeed", () => {
    for (const state of [
      describeState({ status: "blocked" }),
      describeState({ status: "unsupported" }),
      describeState({ status: "unconfigured" }),
      describeState({ isIosDevice: true, isInstalled: false }),
    ]) {
      expect(state.toggleLabel).toBeNull();
    }
  });

  it("reserves the hidden tone for what has no next step at all", () => {
    expect(describeState({ status: "unsupported" }).tone).toBe("unavailable");
    expect(describeState({ status: "unconfigured" }).tone).toBe("unavailable");
    // These three are one action away, so they must stay visible.
    expect(describeState({ status: "blocked" }).tone).toBe("blocked");
    expect(describeState({ hasHomeArea: false }).tone).toBe("needs-area");
    expect(describeState({ isIosDevice: true }).tone).toBe("needs-app");
  });

  it("points iOS visitors at the home screen instead of a dead switch", () => {
    const state = describeState({ isIosDevice: true, isInstalled: false });
    expect(state.description).toContain("Home-Bildschirm");
    expect(describeState({ isIosDevice: true, isInstalled: true }).tone).toBe(
      "off",
    );
  });

  it("describes every tone with something to show", () => {
    const states = [
      describeState({ status: "enabled" }),
      describeState({ status: "disabled" }),
      describeState({ hasHomeArea: false }),
      describeState({ isIosDevice: true }),
      describeState({ status: "blocked" }),
      describeState({ status: "unsupported" }),
    ];

    // Every tone is reachable, so no surface can be handed one it never styles.
    expect(new Set(states.map((state) => state.tone))).toEqual(
      new Set([
        "on",
        "off",
        "needs-area",
        "needs-app",
        "blocked",
        "unavailable",
      ]),
    );
    for (const state of states) {
      expect(state.shortLabel).not.toBe("");
      expect(state.headline).not.toBe("");
      expect(state.description).not.toBe("");
    }
  });
});
