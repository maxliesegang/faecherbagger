import { describe, expect, it } from "vitest";
import {
  createFallbackNextPushDate,
  createNothingNewPayload,
  createPlannedPushMessage,
  createWakeUpMessage,
  getPushDeliveryMode,
  isSubscriptionDue,
  parsePushMessage,
} from "../src/lib/push-delivery.ts";

const APPLE_ENDPOINT = "https://web.push.apple.com/QH8m3x";
const FCM_ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
const MOZILLA_ENDPOINT = "https://updates.push.services.mozilla.com/wpush/v2/x";
const APP_URL = "https://example.test/faecherbagger/";

const NOW = new Date("2026-10-11T16:00:00Z");
const hoursAgo = (hours: number) => NOW.getTime() / 1_000 - hours * 3_600;

describe("getPushDeliveryMode", () => {
  it("plans pushes for Safari and Firefox and wakes Chromium daily", () => {
    expect(getPushDeliveryMode(APPLE_ENDPOINT)).toBe("planned");
    expect(getPushDeliveryMode(MOZILLA_ENDPOINT)).toBe("planned");
    expect(getPushDeliveryMode(FCM_ENDPOINT)).toBe("wake-up");
  });

  it("is not fooled by a lookalike host", () => {
    expect(getPushDeliveryMode("https://push.apple.com.example.test/x")).toBe(
      "wake-up",
    );
    expect(getPushDeliveryMode("https://evilpush.services.mozilla.com/x")).toBe(
      "wake-up",
    );
    expect(getPushDeliveryMode("not a url")).toBe("wake-up");
  });
});

describe("isSubscriptionDue", () => {
  it("wakes other browsers at most twice a day, as before", () => {
    const subscription = { endpoint: FCM_ENDPOINT, nextPushOn: null };
    expect(
      isSubscriptionDue({ ...subscription, lastNotifiedAt: hoursAgo(11) }, NOW),
    ).toBe(false);
    expect(
      isSubscriptionDue({ ...subscription, lastNotifiedAt: hoursAgo(24) }, NOW),
    ).toBe(true);
  });

  it("pushes to an Apple device on the date it planned, not before", () => {
    const planned = { endpoint: APPLE_ENDPOINT, lastNotifiedAt: hoursAgo(48) };
    expect(isSubscriptionDue({ ...planned, nextPushOn: "2026-10-12" }, NOW)).toBe(
      false,
    );
    expect(isSubscriptionDue({ ...planned, nextPushOn: "2026-10-11" }, NOW)).toBe(
      true,
    );
    // A date missed while the device was offline is still due.
    expect(isSubscriptionDue({ ...planned, nextPushOn: "2026-10-09" }, NOW)).toBe(
      true,
    );
  });

  it("never pushes twice within twelve hours, even when a date is due", () => {
    expect(
      isSubscriptionDue(
        {
          endpoint: APPLE_ENDPOINT,
          lastNotifiedAt: hoursAgo(2),
          nextPushOn: "2026-10-11",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("falls back to a weekly push for a device that never reported a date", () => {
    const unplanned = { endpoint: APPLE_ENDPOINT, nextPushOn: null };
    expect(
      isSubscriptionDue({ ...unplanned, lastNotifiedAt: null }, NOW),
    ).toBe(true);
    expect(
      isSubscriptionDue({ ...unplanned, lastNotifiedAt: hoursAgo(6 * 24) }, NOW),
    ).toBe(false);
    // Last week's run started a little later than today's.
    expect(
      isSubscriptionDue({ ...unplanned, lastNotifiedAt: hoursAgo(7 * 24 - 1) }, NOW),
    ).toBe(true);
  });

  it("writes the fallback a week ahead, in Berlin dates", () => {
    expect(createFallbackNextPushDate(new Date("2026-10-11T22:30:00Z"))).toBe(
      "2026-10-19",
    );
  });
});

describe("push messages", () => {
  it("names no place in either message", () => {
    expect(createWakeUpMessage("2026-10-11T16:00:00Z")).toEqual({
      kind: "events",
      generatedAt: "2026-10-11T16:00:00Z",
    });
    const planned = createPlannedPushMessage("2026-10-11T16:00:00Z", APP_URL);
    expect(Object.keys(planned).sort()).toEqual([
      "generatedAt",
      "kind",
      "mutable",
      "notification",
      "web_push",
    ]);
  });

  it("builds a declarative push the service worker may replace", () => {
    const planned = createPlannedPushMessage("2026-10-11T16:00:00Z", APP_URL);
    expect(planned.web_push).toBe(8030);
    expect(planned.mutable).toBe(true);
    expect(planned.notification.title).not.toBe("");
    expect(planned.notification.navigate).toBe(
      `${APP_URL}?bereich=fuer-mich#meldungen`,
    );
  });

  it("reads back what the sender wrote, and nothing unexpected", () => {
    expect(
      parsePushMessage(
        JSON.parse(
          JSON.stringify(createPlannedPushMessage("2026-10-11T16:00:00Z", APP_URL)),
        ),
      ),
    ).toEqual({
      kind: "planned",
      generatedAt: "2026-10-11T16:00:00Z",
      title: undefined,
      body: undefined,
      url: undefined,
    });
    expect(parsePushMessage({ web_push: 8030, notification: {} }).kind).toBe(
      "planned",
    );
    expect(parsePushMessage({ kind: "other", title: 3 })).toEqual({
      kind: undefined,
      generatedAt: undefined,
      title: undefined,
      body: undefined,
      url: undefined,
    });
    expect(parsePushMessage(null)).toEqual({});
  });

  it("says plainly when a planned push has nothing to report", () => {
    expect(createNothingNewPayload(APP_URL)).toMatchObject({
      url: APP_URL,
      count: 0,
    });
  });
});
