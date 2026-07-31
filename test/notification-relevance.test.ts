import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_CLOSURE_LEVEL,
  isNotifiableConstructionSite,
  isNotificationClosureLevel,
  selectNotifiableConstructionSites,
  toNotificationClosureLevel,
} from "../src/shared/notification-relevance.ts";
import { createConstructionSite } from "./fixtures.ts";

const TODAY = "2026-07-29";

describe("notification relevance", () => {
  it("reports a closure that starts within the short-notice window", () => {
    const site = createConstructionSite("starts-in-two-days", {
      startDate: "2026-07-31",
      closure: "full",
    });
    expect(isNotifiableConstructionSite(site, TODAY, "obstruction")).toBe(true);
  });

  it("does not report work that began long before the pipeline saw it", () => {
    // The case the filter exists for: the source backfills a record whose work
    // started eighteen months ago, and "neue Baustelle" would be a lie.
    const backfilled = createConstructionSite("started-562-days-ago", {
      startDate: "2025-01-13",
      endDate: "2027-01-13",
      closure: "full",
    });
    expect(isNotifiableConstructionSite(backfilled, TODAY, "all")).toBe(false);
  });

  it("does not report work that is still months away", () => {
    const distant = createConstructionSite("starts-in-100-days", {
      startDate: "2026-11-06",
      closure: "full",
    });
    expect(isNotifiableConstructionSite(distant, TODAY, "all")).toBe(false);
  });

  it("keeps a site that obstructs nothing out of everything but the widest level", () => {
    const harmless = createConstructionSite("scaffolding", {
      startDate: "2026-07-30",
      closure: "none",
    });
    expect(isNotifiableConstructionSite(harmless, TODAY, "all")).toBe(true);
    expect(isNotifiableConstructionSite(harmless, TODAY, "obstruction")).toBe(
      false,
    );
    expect(isNotifiableConstructionSite(harmless, TODAY, "full")).toBe(false);
  });

  it("reports only Vollsperrungen at the strictest level", () => {
    const startDate = "2026-07-30";
    const oneDirection = createConstructionSite("one-direction", {
      startDate,
      closure: "one-direction",
    });
    const full = createConstructionSite("full", { startDate, closure: "full" });

    expect(isNotifiableConstructionSite(oneDirection, TODAY, "obstruction")).toBe(
      true,
    );
    expect(isNotifiableConstructionSite(oneDirection, TODAY, "full")).toBe(false);
    expect(isNotifiableConstructionSite(full, TODAY, "full")).toBe(true);
  });

  it("keeps an unstated closure until the visitor asks for Vollsperrungen only", () => {
    // We do not know that it is harmless, so dropping it would be a guess made
    // against the visitor.
    const unknown = createConstructionSite("unknown-closure", {
      startDate: "2026-07-30",
      closure: "unknown",
    });
    expect(isNotifiableConstructionSite(unknown, TODAY, "obstruction")).toBe(
      true,
    );
    expect(isNotifiableConstructionSite(unknown, TODAY, "full")).toBe(false);
  });

  it("selects in the given order", () => {
    const sites = [
      createConstructionSite("a", { startDate: "2026-07-30", closure: "full" }),
      createConstructionSite("b", { startDate: "2027-07-30", closure: "full" }),
      createConstructionSite("c", { startDate: "2026-08-01", closure: "none" }),
      createConstructionSite("d", {
        startDate: "2026-07-28",
        closure: "obstruction",
      }),
    ];
    expect(
      selectNotifiableConstructionSites(sites, TODAY, "obstruction").map(
        (site) => site.id,
      ),
    ).toEqual(["a", "d"]);
  });

  it("falls back to the default level for anything unrecognized", () => {
    expect(isNotificationClosureLevel("obstruction")).toBe(true);
    expect(isNotificationClosureLevel("everything")).toBe(false);
    expect(toNotificationClosureLevel(null)).toBe(
      DEFAULT_NOTIFICATION_CLOSURE_LEVEL,
    );
    expect(toNotificationClosureLevel("full")).toBe("full");
  });
});
