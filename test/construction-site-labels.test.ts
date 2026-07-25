import { describe, expect, it } from "vitest";
import {
  formatIsoDate,
  formatConstructionPeriod,
  formatIsoTimestamp,
} from "../src/lib/construction-site-labels.ts";

describe("formatIsoDate", () => {
  it("formats valid date-only values without a timezone conversion", () => {
    expect(formatIsoDate("2026-07-24")).toBe("24.07.2026");
  });

  it("passes invalid date-only values through unchanged", () => {
    expect(formatIsoDate("2026-02-30")).toBe("2026-02-30");
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
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

describe("formatIsoTimestamp", () => {
  it("passes invalid timestamps through unchanged", () => {
    expect(formatIsoTimestamp("not-a-date")).toBe("not-a-date");
  });
});
