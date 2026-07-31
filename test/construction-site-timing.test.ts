import { describe, expect, it } from "vitest";
import {
  compareByShortNoticeUrgency,
  differenceInCalendarDays,
  getConstructionSiteTiming,
  getStartLeadDays,
  isShortNoticeConstructionSite,
  toBerlinCalendarDate,
} from "../src/shared/construction-site-timing.ts";
import { describeConstructionTiming } from "../src/shared/construction-site-labels.ts";
import { createConstructionSite } from "./fixtures.ts";

/** The day every case below is measured against. */
const TODAY = "2026-07-29";

const on = (startDate: string, endDate: string | null = null) =>
  createConstructionSite("x", { startDate, endDate });

describe("toBerlinCalendarDate", () => {
  it("uses the Karlsruhe calendar, not the machine's", () => {
    // 22:30 UTC in July is already the next day in Berlin.
    expect(toBerlinCalendarDate("2026-07-28T22:30:00Z")).toBe("2026-07-29");
  });

  it("passes an unparseable timestamp through untouched", () => {
    expect(toBerlinCalendarDate("nicht-datum")).toBe("nicht-datum");
  });
});

describe("differenceInCalendarDays", () => {
  it("counts whole days across a month boundary", () => {
    expect(differenceInCalendarDays("2026-07-29", "2026-08-02")).toBe(4);
    expect(differenceInCalendarDays("2026-08-02", "2026-07-29")).toBe(-4);
  });

  it("is unaffected by the summer-time switch", () => {
    expect(differenceInCalendarDays("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("getStartLeadDays", () => {
  it("is zero on the start day and negative once under way", () => {
    expect(getStartLeadDays(on(TODAY), TODAY)).toBe(0);
    expect(getStartLeadDays(on("2026-07-26"), TODAY)).toBe(-3);
    expect(getStartLeadDays(on("2026-08-02"), TODAY)).toBe(4);
  });

  it("is NaN for a start date the source did not supply usably", () => {
    expect(getStartLeadDays(on("unbekannt"), TODAY)).toBeNaN();
  });
});

describe("getConstructionSiteTiming", () => {
  it("calls a site running once it has started", () => {
    expect(getConstructionSiteTiming(on("2026-07-20", "2026-08-30"), TODAY)).toBe(
      "running",
    );
    expect(getConstructionSiteTiming(on(TODAY, TODAY), TODAY)).toBe("running");
  });

  it("separates an imminent start from a distant one", () => {
    expect(getConstructionSiteTiming(on("2026-08-05"), TODAY)).toBe(
      "starting-soon",
    );
    expect(getConstructionSiteTiming(on("2026-08-06"), TODAY)).toBe("later");
  });

  it("calls a site with a passed end date ended, whatever the phase says", () => {
    const site = createConstructionSite("stale", {
      phase: "active",
      startDate: "2026-07-01",
      endDate: "2026-07-28",
    });
    expect(getConstructionSiteTiming(site, TODAY)).toBe("ended");
    // The source's own classification is left alone.
    expect(site.phase).toBe("active");
  });
});

describe("isShortNoticeConstructionSite", () => {
  it("covers the week ahead and the week just past", () => {
    expect(isShortNoticeConstructionSite(on("2026-08-05"), TODAY)).toBe(true);
    expect(
      isShortNoticeConstructionSite(on("2026-07-22", "2026-09-01"), TODAY),
    ).toBe(true);
  });

  it("excludes a distant start and anything already over", () => {
    expect(isShortNoticeConstructionSite(on("2026-11-01"), TODAY)).toBe(false);
    expect(
      isShortNoticeConstructionSite(on("2026-06-01", "2026-07-01"), TODAY),
    ).toBe(false);
    // Running for months: nothing to re-plan, it is simply the way things are.
    expect(
      isShortNoticeConstructionSite(on("2026-02-01", "2026-12-01"), TODAY),
    ).toBe(false);
  });
});

describe("compareByShortNoticeUrgency", () => {
  it("puts what can still be planned around ahead of what has begun", () => {
    const startsTomorrow = on("2026-07-30");
    const startedYesterday = on("2026-07-28", "2026-09-01");
    expect(
      compareByShortNoticeUrgency(startsTomorrow, startedYesterday, TODAY),
    ).toBeLessThan(0);
  });

  it("orders upcoming starts by how soon they are", () => {
    expect(
      compareByShortNoticeUrgency(
        on("2026-07-31"),
        on("2026-08-03"),
        TODAY,
      ),
    ).toBeLessThan(0);
  });
});

describe("describeConstructionTiming", () => {
  it("states a start as lead time", () => {
    expect(describeConstructionTiming(on("2026-07-29"), TODAY)).toBe(
      "Läuft seit heute",
    );
    expect(describeConstructionTiming(on("2026-07-30"), TODAY)).toBe(
      "Beginnt morgen",
    );
    expect(describeConstructionTiming(on("2026-08-02"), TODAY)).toBe(
      "Beginnt in 4 Tagen",
    );
  });

  it("names the date once a start is too far out to count in days", () => {
    expect(describeConstructionTiming(on("2026-11-02"), TODAY)).toBe(
      "Beginnt am 02.11.2026",
    );
  });

  it("says when a running site ends", () => {
    expect(
      describeConstructionTiming(on("2026-07-28", "2026-10-30"), TODAY),
    ).toBe("Läuft seit gestern, noch bis 30.10.2026");
    expect(describeConstructionTiming(on("2026-07-01", TODAY), TODAY)).toBe(
      "Läuft seit 28 Tagen, endet heute",
    );
  });

  it("calls a single-day closure what it is", () => {
    expect(
      describeConstructionTiming(on("2026-08-02", "2026-08-02"), TODAY),
    ).toBe("Beginnt in 4 Tagen, nur an diesem Tag");
  });

  it("reports a finished site instead of counting towards it", () => {
    expect(
      describeConstructionTiming(on("2026-06-01", "2026-07-20"), TODAY),
    ).toBe("Abgeschlossen am 20.07.2026");
  });

  it("falls back to the plain period when the start date is unusable", () => {
    expect(describeConstructionTiming(on("unbekannt"), TODAY)).toBe(
      "ab unbekannt",
    );
  });
});
