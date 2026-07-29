import { describe, expect, it } from "vitest";
import {
  formatISODate,
  formatConstructionPeriod,
  formatISOTimestamp,
  formatRelativeDay,
} from "../src/shared/construction-site-labels.ts";

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

describe("formatRelativeDay", () => {
  const now = new Date(2026, 6, 28, 10, 0, 0);

  it("names today and yesterday", () => {
    expect(formatRelativeDay(new Date(2026, 6, 28, 6, 0, 0).toISOString(), now)).toBe(
      "heute",
    );
    expect(
      formatRelativeDay(new Date(2026, 6, 27, 23, 0, 0).toISOString(), now),
    ).toBe("gestern");
  });

  it("counts whole calendar days further back", () => {
    expect(
      formatRelativeDay(new Date(2026, 6, 25, 8, 0, 0).toISOString(), now),
    ).toBe("vor 3 Tagen");
  });

  it("passes unparseable values through", () => {
    expect(formatRelativeDay("not-a-date", now)).toBe("not-a-date");
  });
});
