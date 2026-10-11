import { describe, expect, it } from "vitest";
import type { ConstructionSite, NotificationArea } from "../src/types/index.ts";
import {
  countUpcomingNotifications,
  formatUpcomingNotificationCount,
  previewNotificationArea,
} from "../src/lib/notification-area-preview.ts";

const TODAY = "2026-07-15";

const site = (
  id: string,
  startDate: string,
  overrides: Partial<ConstructionSite> = {},
): ConstructionSite => ({
  id,
  phase: startDate > TODAY ? "upcoming" : "active",
  category: "road-construction",
  artRaw: "Straßenbau",
  closure: "full",
  siteType: "stationary",
  municipality: "Karlsruhe",
  location: "",
  notes: null,
  cause: null,
  startDate,
  endDate: null,
  point: [8.4, 49.0],
  source: "Stadt Karlsruhe",
  lastModified: "2026-07-01T00:00:00Z",
  ...overrides,
});

const area: NotificationArea = {
  id: "home",
  label: "Zuhause",
  kind: "circle",
  center: [8.4, 49.0],
  radiusKm: 1,
};

const constructionSites = [
  site("running", "2026-07-01"),
  site("in-a-week", "2026-07-22"),
  site("tomorrow", "2026-07-16"),
  site("mild", "2026-07-20", { closure: "none" }),
  site("next-quarter", "2026-10-01"),
  site("far-away", "2026-07-20", { point: [8.6, 49.0] }),
];

describe("notification area preview", () => {
  const options = { today: TODAY, minSeverity: "obstruction" as const };

  it("counts starts within 30 days that pass the threshold", () => {
    expect(countUpcomingNotifications(area, constructionSites, options)).toBe(2);
    expect(
      countUpcomingNotifications(area, constructionSites, { ...options, minSeverity: "all" }),
    ).toBe(3);
  });

  it("lists upcoming sites soonest first, then those under way", () => {
    const preview = previewNotificationArea(area, constructionSites, options);
    expect(preview.matchingSites.map(({ id }) => id)).toEqual([
      "tomorrow",
      "mild",
      "in-a-week",
      "next-quarter",
      "running",
    ]);
    expect(preview.upcomingNotificationCount).toBe(2);
  });

  it("words the count", () => {
    expect(formatUpcomingNotificationCount(0)).toBe("keine Meldung");
    expect(formatUpcomingNotificationCount(1)).toBe("etwa 1 Meldung");
    expect(formatUpcomingNotificationCount(4)).toBe("etwa 4 Meldungen");
  });
});
