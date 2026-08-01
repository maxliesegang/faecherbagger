import { describe, expect, it } from "vitest";
import {
  CLOSURE_SEVERITIES,
  CONSTRUCTION_CATEGORIES,
  formatISODate,
  formatConstructionPeriod,
  formatISOTimestamp,
  getClosureDescription,
  getClosureHeadline,
  getConstructionCategoryDescription,
} from "../src/lib/construction-site-labels.ts";

describe("formatISODate", () => {
  it("formats valid date-only values without a timezone conversion", () => {
    expect(formatISODate("2026-07-24")).toBe("24.07.2026");
  });

  it("passes invalid date-only values through unchanged", () => {
    expect(formatISODate("2026-02-30")).toBe("2026-02-30");
    expect(formatISODate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatConstructionPeriod", () => {
  it("formats closed and open-ended periods", () => {
    expect(formatConstructionPeriod("2026-07-24", "2026-08-01")).toBe(
      "24.07.2026 – 01.08.2026",
    );
    expect(formatConstructionPeriod("2026-07-24", null)).toBe("ab 24.07.2026");
  });
});

describe("formatISOTimestamp", () => {
  it("passes invalid timestamps through unchanged", () => {
    expect(formatISOTimestamp("not-a-date")).toBe("not-a-date");
  });
});

describe("plain-language labels", () => {
  it("glosses every category and answers 'can I get through?' for every severity", () => {
    for (const category of CONSTRUCTION_CATEGORIES) {
      expect(getConstructionCategoryDescription(category)).toBeTruthy();
    }
    for (const closure of CLOSURE_SEVERITIES) {
      expect(getClosureHeadline(closure)).toBeTruthy();
      expect(getClosureDescription(closure)).toBeTruthy();
    }
  });

  it("states the full closure as a consequence, not as a category name", () => {
    expect(getClosureHeadline("full")).toMatch(/nicht durch/);
    expect(getClosureHeadline("none")).toMatch(/normal durch/);
  });
});
