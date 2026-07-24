import { describe, expect, it } from "vitest";
import { distanceInMeters, formatDistance } from "../src/lib/distance.ts";

describe("distanceInMeters", () => {
  it("returns zero for identical points", () => {
    expect(distanceInMeters([8.403, 49.009], [8.403, 49.009])).toBe(0);
  });

  it("calculates a plausible distance between Karlsruhe and Ettlingen", () => {
    const distance = distanceInMeters([8.403, 49.009], [8.407, 48.94]);
    expect(distance).toBeGreaterThan(7_000);
    expect(distance).toBeLessThan(8_000);
  });
});

describe("formatDistance", () => {
  it("uses coarse meters nearby and kilometers farther away", () => {
    expect(formatDistance(12)).toBe("< 50 m");
    expect(formatDistance(974)).toBe("950 m");
    expect(formatDistance(1_250)).toBe("1,3 km");
  });
});
