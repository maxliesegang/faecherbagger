import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatPeriod,
  formatTimestamp,
} from "../src/lib/labels.ts";

describe("formatDate", () => {
  it("formats valid date-only values without a timezone conversion", () => {
    expect(formatDate("2026-07-24")).toBe("24.07.2026");
  });

  it("passes invalid date-only values through unchanged", () => {
    expect(formatDate("2026-02-30")).toBe("2026-02-30");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatPeriod", () => {
  it("formats closed and open-ended periods", () => {
    expect(formatPeriod("2026-07-24", "2026-08-01")).toBe(
      "24.07.2026 – 01.08.2026",
    );
    expect(formatPeriod("2026-07-24", null)).toBe("ab 24.07.2026");
  });
});

describe("formatTimestamp", () => {
  it("passes invalid timestamps through unchanged", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });
});
