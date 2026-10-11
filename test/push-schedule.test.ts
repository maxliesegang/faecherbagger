import { describe, expect, it } from "vitest";
import {
  coercePushScheduleState,
  planNextPushDate,
} from "../src/lib/push-schedule.ts";
import {
  collectNotificationEvents,
  selectNotificationEvents,
} from "../src/lib/notification-events.ts";
import type {
  ConstructionSite,
  NotificationPreferences,
} from "../src/types/index.ts";

const TODAY = "2026-10-11";

const preferences: NotificationPreferences = {
  areas: [
    {
      id: "home",
      label: "Zuhause",
      kind: "circle",
      center: [8.4044, 49.0069],
      radiusKm: 1,
    },
  ],
  kinds: ["new", "starts-soon", "changed"],
  minSeverity: "all",
  followedSiteIds: [],
  remindDayBefore: true,
};

function createSite(
  id: string,
  overrides: Partial<ConstructionSite> = {},
): ConstructionSite {
  return {
    id,
    phase: "upcoming",
    category: "road-construction",
    artRaw: "Straßenbau",
    closure: "full",
    siteType: "stationary",
    municipality: "Karlsruhe",
    location: `Teststraße ${id}`,
    notes: null,
    cause: null,
    startDate: "2026-11-30",
    endDate: "2026-12-31",
    point: [8.405, 49.007],
    source: "Test",
    lastModified: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const plan = (
  constructionSites: ConstructionSite[],
  overrides: Partial<Parameters<typeof planNextPushDate>[0]> = {},
) =>
  planNextPushDate({
    constructionSites,
    preferences,
    today: TODAY,
    ...overrides,
  });

describe("planNextPushDate", () => {
  it("falls back to the rhythm when no reminder is coming", () => {
    expect(plan([])).toBe("2026-10-18");
    expect(plan([], { preferences: { ...preferences, pushRhythmDays: 3 } })).toBe(
      "2026-10-14",
    );
  });

  it("counts the rhythm from the last push", () => {
    expect(plan([], { lastPushOn: "2026-10-09" })).toBe("2026-10-16");
  });

  it("wakes on the day a matching start reminder falls due", () => {
    // Starts on the 16th: the 14-day reminder is past, the day-before one is not.
    expect(plan([createSite("near", { startDate: "2026-10-16" })])).toBe(
      "2026-10-15",
    );
    // Starts on the 30th: the 14-day reminder comes first.
    expect(plan([createSite("near", { startDate: "2026-10-30" })])).toBe(
      "2026-10-16",
    );
  });

  it("ignores sites outside the device's areas and reminders it turned off", () => {
    const farAway = createSite("far", {
      startDate: "2026-10-16",
      point: [8.6, 49.2],
    });
    expect(plan([farAway])).toBe("2026-10-18");
    expect(
      plan([createSite("near", { startDate: "2026-10-16" })], {
        preferences: { ...preferences, remindDayBefore: false },
      }),
    ).toBe("2026-10-18");
  });

  it("plans for followed sites wherever they are", () => {
    const followed = createSite("followed", {
      startDate: "2026-10-16",
      point: [8.6, 49.2],
    });
    expect(
      plan([followed], {
        preferences: { ...preferences, followedSiteIds: ["followed"] },
      }),
    ).toBe("2026-10-15");
  });

  it("lets today's evening push carry a reminder due today, unless it already came", () => {
    const startsTomorrow = createSite("tomorrow", { startDate: "2026-10-12" });
    expect(plan([startsTomorrow])).toBe(TODAY);
    expect(plan([startsTomorrow], { lastPushOn: TODAY })).toBe("2026-10-18");
  });

  it("names a date on which the pipeline really publishes that reminder", () => {
    const site = createSite("near", { startDate: "2026-10-30" });
    const plannedOn = plan([site]);
    const published = collectNotificationEvents(
      [site],
      {
        since: null,
        added: [],
        modified: [],
        removed: [],
        relevantModifications: [],
      },
      plannedOn,
    );
    expect(selectNotificationEvents(published, preferences, plannedOn)).toHaveLength(
      1,
    );
  });
});

describe("coercePushScheduleState", () => {
  it("keeps valid fields and drops the rest", () => {
    expect(
      coercePushScheduleState({
        lastPushOn: "2026-10-11",
        reportedNextPushOn: "nächste Woche",
        reportedEndpoint: "https://web.push.apple.com/x",
      }),
    ).toEqual({
      lastPushOn: "2026-10-11",
      reportedEndpoint: "https://web.push.apple.com/x",
    });
    expect(coercePushScheduleState(null)).toEqual({});
  });
});
