import { describe, expect, it } from "vitest";
import type { ConstructionSite } from "../src/types/index.ts";
import {
  addCalendarDays,
  countDaysBetween,
  formatConstructionPeriodRelativeToToday,
  getBerlinCalendarDate,
  isConstructionSiteInTimeframe,
} from "../src/lib/construction-site-timeframe.ts";

function createConstructionSite(
  overrides: Partial<ConstructionSite> = {},
): ConstructionSite {
  return {
    id: "X",
    phase: "active",
    category: "other",
    artRaw: "",
    closure: "unknown",
    siteType: null,
    municipality: "Karlsruhe",
    location: "",
    notes: null,
    cause: null,
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    point: [8.4, 49],
    source: "Stadt Karlsruhe",
    lastModified: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

const TODAY = "2026-07-15";

describe("addCalendarDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addCalendarDays("2026-07-30", 3)).toBe("2026-08-02");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("crosses the start of summer time without shifting the date", () => {
    expect(addCalendarDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addCalendarDays("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("passes unparseable input through", () => {
    expect(addCalendarDays("morgen", 1)).toBe("morgen");
  });
});

describe("countDaysBetween", () => {
  it("counts whole days in both directions", () => {
    expect(countDaysBetween("2026-07-15", "2026-07-22")).toBe(7);
    expect(countDaysBetween("2026-07-22", "2026-07-15")).toBe(-7);
    expect(countDaysBetween("2026-07-15", "2026-07-15")).toBe(0);
  });
});

describe("getBerlinCalendarDate", () => {
  it("uses the Berlin calendar date, not the machine's", () => {
    // 22:30 UTC on 23 July is already 24 July in Berlin (CEST).
    expect(getBerlinCalendarDate(new Date("2026-07-23T22:30:00Z"))).toBe(
      "2026-07-24",
    );
    // 23:30 UTC in winter is 00:30 the next day in Berlin (CET).
    expect(getBerlinCalendarDate(new Date("2026-01-15T23:30:00Z"))).toBe(
      "2026-01-16",
    );
  });
});

describe("isConstructionSiteInTimeframe", () => {
  const runningNow = createConstructionSite({
    startDate: "2026-07-01",
    endDate: "2026-07-31",
  });
  const startsInFiveDays = createConstructionSite({
    startDate: "2026-07-20",
    endDate: "2026-08-30",
  });
  const startsInTwoMonths = createConstructionSite({
    startDate: "2026-09-20",
    endDate: null,
  });
  const finishedLastWeek = createConstructionSite({
    startDate: "2026-06-01",
    endDate: "2026-07-08",
  });
  const openEndedRunning = createConstructionSite({
    startDate: "2020-01-01",
    endDate: null,
  });

  it("keeps everything when no window is selected", () => {
    for (const site of [startsInTwoMonths, finishedLastWeek]) {
      expect(isConstructionSiteInTimeframe(site, "", TODAY)).toBe(true);
    }
  });

  it("matches only what is under way for `today`", () => {
    expect(isConstructionSiteInTimeframe(runningNow, "today", TODAY)).toBe(true);
    expect(isConstructionSiteInTimeframe(openEndedRunning, "today", TODAY)).toBe(
      true,
    );
    expect(
      isConstructionSiteInTimeframe(startsInFiveDays, "today", TODAY),
    ).toBe(false);
    expect(
      isConstructionSiteInTimeframe(finishedLastWeek, "today", TODAY),
    ).toBe(false);
  });

  it("includes sites that start inside the window", () => {
    expect(isConstructionSiteInTimeframe(startsInFiveDays, "week", TODAY)).toBe(
      true,
    );
    expect(
      isConstructionSiteInTimeframe(startsInTwoMonths, "week", TODAY),
    ).toBe(false);
    expect(
      isConstructionSiteInTimeframe(startsInTwoMonths, "month", TODAY),
    ).toBe(false);
  });

  it("still excludes finished sites from every window", () => {
    for (const timeframe of ["today", "week", "month"] as const) {
      expect(
        isConstructionSiteInTimeframe(finishedLastWeek, timeframe, TODAY),
      ).toBe(false);
    }
  });

  it("treats the window edges as inclusive", () => {
    const startsOnLastDay = createConstructionSite({
      startDate: "2026-07-21",
      endDate: null,
    });
    const endsToday = createConstructionSite({
      startDate: "2026-01-01",
      endDate: TODAY,
    });
    expect(isConstructionSiteInTimeframe(startsOnLastDay, "week", TODAY)).toBe(
      true,
    );
    expect(isConstructionSiteInTimeframe(endsToday, "today", TODAY)).toBe(true);
  });
});

describe("formatConstructionPeriodRelativeToToday", () => {
  const format = (overrides: Partial<ConstructionSite>) =>
    formatConstructionPeriodRelativeToToday(
      createConstructionSite(overrides),
      TODAY,
    );

  it("counts down to a start that is still ahead", () => {
    expect(format({ startDate: "2026-07-16" })).toBe("beginnt morgen");
    expect(format({ startDate: "2026-07-19" })).toBe("beginnt in 4 Tagen");
  });

  it("says nothing about a start far in the future", () => {
    expect(format({ startDate: "2026-11-01" })).toBeNull();
  });

  it("describes a running site by what is left of it", () => {
    expect(format({ startDate: "2026-07-01", endDate: TODAY })).toBe(
      "läuft, endet heute",
    );
    expect(format({ startDate: "2026-07-01", endDate: "2026-07-20" })).toBe(
      "läuft, noch 5 Tage",
    );
    expect(format({ startDate: "2026-07-01", endDate: "2026-08-12" })).toBe(
      "läuft, noch 4 Wochen",
    );
    expect(format({ startDate: "2026-07-01", endDate: null })).toBe(
      "läuft, Ende offen",
    );
  });

  it("flags a period the source never closed", () => {
    expect(format({ startDate: "2026-01-01", endDate: "2026-06-30" })).toBe(
      "Zeitraum überschritten",
    );
  });

  it("stays silent when the end is too far out to be meaningful", () => {
    expect(format({ startDate: "2026-01-01", endDate: "2027-12-31" })).toBeNull();
  });
});
