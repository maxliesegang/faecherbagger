import { describe, expect, it } from "vitest";
import {
  createRouteURL,
  getDistinctReturnLine,
  parseRouteResponse,
} from "../src/lib/route-search.ts";
import type { LngLat } from "../src/types/index.ts";

describe("getDistinctReturnLine", () => {
  const there: LngLat[] = [
    [8.39, 49.0],
    [8.41, 49.0],
  ];

  it("drops a way back along the same road", () => {
    expect(getDistinctReturnLine(there, [[8.41, 49.0001], [8.39, 49.0001]])).toBeUndefined();
  });

  it("keeps a way back along another road", () => {
    const back: LngLat[] = [
      [8.41, 49.0],
      [8.40, 49.005],
      [8.39, 49.0],
    ];
    expect(getDistinctReturnLine(there, back)).toEqual(back);
  });
});

describe("createRouteURL", () => {
  it("asks the profile for the travel mode, with a full GeoJSON geometry", () => {
    const url = createRouteURL([8.40441234, 49.0094], [8.47, 49.0], "bike");
    expect(url.origin).toBe("https://routing.openstreetmap.de");
    expect(url.pathname).toBe(
      "/routed-bike/route/v1/driving/8.40441,49.00940;8.47000,49.00000",
    );
    expect(url.searchParams.get("overview")).toBe("full");
    expect(url.searchParams.get("geometries")).toBe("geojson");
  });
});

describe("parseRouteResponse", () => {
  it("returns the route line", () => {
    expect(
      parseRouteResponse({
        code: "Ok",
        routes: [
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [8.4, 49.0],
                [8.41, 49.0],
                [8.41, 49.01],
              ],
            },
          },
        ],
      }),
    ).toEqual([
      [8.4, 49.0],
      [8.41, 49.0],
      [8.41, 49.01],
    ]);
  });

  it("rejects errors and malformed geometry", () => {
    expect(() => parseRouteResponse({ code: "NoRoute", routes: [] })).toThrow();
    expect(() =>
      parseRouteResponse({
        code: "Ok",
        routes: [{ geometry: { type: "LineString", coordinates: [[8.4, 49]] } }],
      }),
    ).toThrow();
    expect(() =>
      parseRouteResponse({
        code: "Ok",
        routes: [
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [8.4, 49],
                [200, 49],
              ],
            },
          },
        ],
      }),
    ).toThrow();
  });
});
