import { describe, expect, it } from "vitest";
import type { LngLat } from "../src/types/index.ts";
import { distanceInMeters } from "../src/lib/distance.ts";
import {
  distanceToLineMeters,
  isPointInRing,
  sampleExtentPoints,
  simplifyLine,
  simplifyToVertexLimit,
} from "../src/lib/geometry.ts";

/** About 1 km of Kaiserstraße, west to east. */
const STREET: LngLat[] = [
  [8.3940, 49.0095],
  [8.4080, 49.0095],
];

describe("distanceToLineMeters", () => {
  it("measures perpendicular distance to a segment", () => {
    // 0.001° latitude ≈ 111 m north of the middle of the street.
    expect(distanceToLineMeters([8.401, 49.0105], STREET)).toBeCloseTo(111, -1);
  });

  it("measures to the nearest end beyond the segment", () => {
    const beyond: LngLat = [8.42, 49.0095];
    expect(distanceToLineMeters(beyond, STREET)).toBeCloseTo(
      distanceInMeters(beyond, STREET[1]!),
      -1,
    );
  });

  it("treats an empty line as infinitely far away", () => {
    expect(distanceToLineMeters([8.4, 49], [])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("isPointInRing", () => {
  const square: LngLat[] = [
    [8.39, 49.0],
    [8.41, 49.0],
    [8.41, 49.02],
    [8.39, 49.02],
  ];

  it("works with open and closed rings", () => {
    expect(isPointInRing([8.4, 49.01], square)).toBe(true);
    expect(isPointInRing([8.4, 49.01], [...square, square[0]!])).toBe(true);
    expect(isPointInRing([8.42, 49.01], square)).toBe(false);
  });
});

describe("simplifyLine", () => {
  it("drops points that barely deviate and keeps the ends", () => {
    const wiggly: LngLat[] = [
      [8.394, 49.0095],
      [8.398, 49.00951],
      [8.402, 49.00949],
      [8.408, 49.0095],
    ];
    expect(simplifyLine(wiggly, 5)).toEqual([wiggly[0], wiggly[3]]);
  });

  it("keeps a real corner", () => {
    const corner: LngLat[] = [
      [8.39, 49.0],
      [8.40, 49.0],
      [8.40, 49.01],
    ];
    expect(simplifyLine(corner, 5)).toEqual(corner);
  });

  it("loosens the tolerance until the vertex limit holds", () => {
    const zigzag: LngLat[] = Array.from({ length: 200 }, (_, index) => [
      8.39 + index * 0.0005,
      49 + (index % 2) * 0.001,
    ]);
    const simplified = simplifyToVertexLimit(zigzag, 20);
    expect(simplified.length).toBeLessThanOrEqual(20);
    // Ends survive, rounded to the published precision.
    expect(simplified[0]![0]).toBeCloseTo(zigzag[0]![0], 5);
    expect(simplified.at(-1)![0]).toBeCloseTo(zigzag.at(-1)![0], 5);
  });
});

describe("sampleExtentPoints", () => {
  it("leaves compact sites to their representative point", () => {
    expect(
      sampleExtentPoints({
        type: "Polygon",
        coordinates: [
          [
            [8.4, 49.0],
            [8.4005, 49.0],
            [8.4005, 49.0005],
            [8.4, 49.0],
          ],
        ],
      }),
    ).toBeUndefined();
  });

  it("spreads points along a long site, including a sparse straight line", () => {
    // Two vertices 3 km apart: the points must be interpolated, not taken
    // from the vertices.
    const line: LngLat[] = [
      [8.36, 49.0],
      [8.401, 49.0],
    ];
    const points = sampleExtentPoints({ type: "LineString", coordinates: line })!;
    expect(points.length).toBeGreaterThan(10);
    expect(points.length).toBeLessThanOrEqual(32);
    for (const point of points) {
      expect(distanceToLineMeters(point, line)).toBeLessThan(2);
    }
    // No stretch of the site is further than the spacing from a point.
    for (let longitude = 8.36; longitude <= 8.401; longitude += 0.001) {
      const nearest = Math.min(
        ...points.map((point) => distanceInMeters(point, [longitude, 49.0])),
      );
      expect(nearest).toBeLessThan(250);
    }
  });
});
