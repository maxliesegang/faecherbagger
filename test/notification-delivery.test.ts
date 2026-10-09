import { describe, expect, it } from "vitest";
import type { NotificationFeedEvent } from "../src/types/index.ts";
import {
  coerceNotificationDeliveryState,
  createNotificationDeliveryState,
  recordNotificationDelivery,
  selectUndeliveredNotificationEvents,
} from "../src/lib/notification-delivery.ts";

const event: NotificationFeedEvent = {
  kind: "starts-soon",
  signature: "starts-soon:site:2026-08-15:14",
  siteId: "site",
  point: [8.4, 49],
  closure: "full",
  startDate: "2026-08-15",
  endDate: null,
  municipality: "Karlsruhe",
  location: "Teststraße",
  reminderLeadDays: 14,
};

describe("local notification delivery", () => {
  it("suppresses a repeated wake-up without suppressing the day-before reminder", () => {
    const initial = createNotificationDeliveryState();
    const delivered = recordNotificationDelivery(
      initial,
      [event],
      "2026-08-01T16:00:00Z",
    );
    const tomorrow = {
      ...event,
      reminderLeadDays: 1,
      signature: "starts-soon:site:2026-08-15:1",
    };
    expect(
      selectUndeliveredNotificationEvents([event, tomorrow], delivered),
    ).toEqual([tomorrow]);
    expect(initial.delivered).toEqual({});
  });

  it("keeps unread delivered hints across later data runs and records separate changes", () => {
    const first = recordNotificationDelivery(
      createNotificationDeliveryState(),
      [event],
      "2026-08-01T16:00:00Z",
    );
    const change = {
      ...event,
      kind: "changed" as const,
      signature: "changed:site:revision",
    };
    const second = recordNotificationDelivery(
      { ...first, readSignatures: [event.signature] },
      [change],
      "2026-08-02T16:00:00Z",
    );
    expect(second.events).toEqual([change, event]);
    expect(second.readSignatures).toEqual([event.signature]);
  });

  it("expires old receipts and read flags after thirty days", () => {
    const first = recordNotificationDelivery(
      createNotificationDeliveryState(),
      [event],
      "2026-08-01T16:00:00Z",
    );
    const expired = recordNotificationDelivery(
      { ...first, readSignatures: [event.signature] },
      [],
      "2026-09-01T16:00:00Z",
    );
    expect(expired).toEqual(createNotificationDeliveryState());
  });

  it("rejects corrupt persisted events and falls back for absent storage", () => {
    expect(coerceNotificationDeliveryState(null)).toEqual(
      createNotificationDeliveryState(),
    );
    expect(
      coerceNotificationDeliveryState({
        events: [event, { kind: "new" }],
        delivered: { bad: "yesterday" },
      }).events,
    ).toEqual([event]);
    expect(
      coerceNotificationDeliveryState({ delivered: { bad: "yesterday" } })
        .delivered,
    ).toEqual({});
  });
});

it("acknowledges both recovered reminder thresholds while displaying one hint", () => {
  const tomorrow = {
    ...event,
    reminderLeadDays: 1,
    signature: "starts-soon:site:2026-08-15:1",
  };
  const state = recordNotificationDelivery(
    createNotificationDeliveryState(),
    [event, tomorrow],
    "2026-08-14T16:00:00Z",
  );
  expect(state.events).toEqual([tomorrow]);
  expect(selectUndeliveredNotificationEvents([event, tomorrow], state)).toEqual(
    [],
  );
});
