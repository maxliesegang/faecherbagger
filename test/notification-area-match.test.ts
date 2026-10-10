import { describe, expect, it } from "vitest";
import type { LngLat, NotificationArea } from "../src/types/index.ts";
import {
  findNotificationAreaForTarget,
  measureNotificationAreaMatch,
  type NotificationAreaTarget,
} from "../src/lib/notification-area-match.ts";

const target = (
  point: LngLat,
  overrides: Partial<NotificationAreaTarget> = {},
): NotificationAreaTarget => ({
  point,
  municipality: "Karlsruhe",
  location: "Kaiserstraße zw. Kronenstraße und Adlerstraße",
  ...overrides,
});

const identity = { id: "area", label: "Bereich" };

/** A commute along a parallel of latitude, about 3 km long. */
const commute: NotificationArea = {
  ...identity,
  kind: "corridor",
  line: [
    [8.36, 49.0],
    [8.401, 49.0],
  ],
  widthMeters: 250,
};

describe("measureNotificationAreaMatch", () => {
  it("reports distance to a circle's centre", () => {
    const circle: NotificationArea = {
      ...identity,
      kind: "circle",
      center: [8.4, 49.0],
      radiusKm: 1,
    };
    expect(measureNotificationAreaMatch(circle, target([8.4, 49.005]))).toBeCloseTo(556, -1);
    expect(measureNotificationAreaMatch(circle, target([8.4, 49.02]))).toBeUndefined();
  });

  it("matches a corridor within its width to either side", () => {
    // 0.002° latitude ≈ 222 m off the line.
    expect(measureNotificationAreaMatch(commute, target([8.38, 49.002]))).toBeCloseTo(222, -1);
    expect(measureNotificationAreaMatch(commute, target([8.38, 49.003]))).toBeUndefined();
  });

  it("sees a long site that crosses a route with its point far away", () => {
    // A road running north–south across the commute; its representative point
    // is 1 km north, but its southern end reaches the route.
    const crossing = target([8.38, 49.009], {
      extentPoints: [
        [8.38, 49.0045],
        [8.38, 49.0],
        [8.38, 48.9955],
      ],
    });
    expect(measureNotificationAreaMatch(commute, target([8.38, 49.009]))).toBeUndefined();
    expect(measureNotificationAreaMatch(commute, crossing)).toBe(0);
  });

  it("matches the way back of a corridor too", () => {
    const roundTrip: NotificationArea = {
      ...commute,
      returnLine: [
        [8.401, 49.01],
        [8.36, 49.01],
      ],
    };
    expect(measureNotificationAreaMatch(commute, target([8.38, 49.0105]))).toBeUndefined();
    expect(measureNotificationAreaMatch(roundTrip, target([8.38, 49.0105]))).toBeCloseTo(56, -1);
  });

  it("matches inside a drawn outline", () => {
    const outline: NotificationArea = {
      ...identity,
      kind: "polygon",
      ring: [
        [8.39, 49.0],
        [8.41, 49.0],
        [8.41, 49.02],
        [8.39, 49.02],
      ],
    };
    expect(measureNotificationAreaMatch(outline, target([8.4, 49.01]))).toBe(0);
    expect(measureNotificationAreaMatch(outline, target([8.43, 49.01]))).toBeUndefined();
  });

  it("matches a municipality by name", () => {
    const ettlingen: NotificationArea = {
      ...identity,
      kind: "municipality",
      municipality: "Ettlingen",
    };
    expect(
      measureNotificationAreaMatch(ettlingen, target([8.4, 49], { municipality: "Ettlingen" })),
    ).toBe(0);
    expect(measureNotificationAreaMatch(ettlingen, target([8.4, 49]))).toBeUndefined();
  });

  it("matches works on a street, in the right municipality", () => {
    const street: NotificationArea = {
      ...identity,
      kind: "street",
      street: "Kaiserstr.",
      municipality: "Karlsruhe",
    };
    expect(measureNotificationAreaMatch(street, target([8.4, 49]))).toBe(0);
    expect(
      measureNotificationAreaMatch(street, target([8.4, 49], { municipality: "Ettlingen" })),
    ).toBeUndefined();
  });

  it("leaves junctions out unless they are asked for", () => {
    // "Kaiserstraße zw. Kronenstraße und Adlerstraße": Adlerstraße only bounds it.
    const street: NotificationArea = {
      ...identity,
      kind: "street",
      street: "Adlerstraße",
      municipality: "Karlsruhe",
    };
    expect(measureNotificationAreaMatch(street, target([8.4, 49]))).toBeUndefined();
    expect(
      measureNotificationAreaMatch({ ...street, includeJunctions: true }, target([8.4, 49])),
    ).toBe(0);
  });
});

describe("findNotificationAreaForTarget", () => {
  it("returns the first matching area of mixed kinds", () => {
    const ettlingen: NotificationArea = {
      id: "ettlingen",
      label: "Ettlingen",
      kind: "municipality",
      municipality: "Ettlingen",
    };
    expect(
      findNotificationAreaForTarget([ettlingen, commute], target([8.38, 49.001]))?.id,
    ).toBe("area");
  });
});
