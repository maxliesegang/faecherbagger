import { describe, expect, it } from "vitest";
import { createPushNotificationPayload } from "../src/lib/push-notification.ts";
import type { ConstructionSite, LngLat } from "../src/types/index.ts";

const APP_URL = "https://example.test/faecherbagger/";
const FETCHED_AT = "2026-07-29T05:00:00Z";

function createConstructionSite(
  id: string,
  overrides: Partial<ConstructionSite> = {},
): ConstructionSite {
  const point: LngLat = [8.4044, 49.0069];
  return {
    id,
    point,
    phase: "active",
    category: "road-construction",
    artRaw: "Straßenbau",
    closure: "obstruction",
    siteType: "stationary",
    municipality: "Karlsruhe",
    location: `Teststraße ${id}`,
    notes: null,
    cause: null,
    startDate: "2026-08-01",
    endDate: null,
    geometry: { type: "Point", coordinates: point },
    source: "Test",
    lastModified: "2026-07-24T00:00:00Z",
    ...overrides,
  };
}

describe("createPushNotificationPayload", () => {
  it("names and deep-links a single new construction site", () => {
    const payload = createPushNotificationPayload(
      [createConstructionSite("42", { municipality: "Ettlingen" })],
      APP_URL,
      FETCHED_AT,
    );

    expect(payload.title).toBe("Neue Baustelle in Ettlingen");
    expect(payload.body).toBe("Teststraße 42 · ab 01.08.2026");
    expect(payload.url).toBe(`${APP_URL}?baustelle=42`);
    expect(payload.count).toBe(1);
    expect(payload.fetchedAt).toBe(FETCHED_AT);
  });

  it("summarizes several sites and links to the overview", () => {
    const payload = createPushNotificationPayload(
      [
        createConstructionSite("1"),
        createConstructionSite("2"),
        createConstructionSite("3"),
      ],
      APP_URL,
      FETCHED_AT,
    );

    expect(payload.title).toBe("3 neue Baustellen in Ihrem Umkreis");
    expect(payload.body).toBe("Unter anderem: Teststraße 1, Karlsruhe");
    expect(payload.url).toBe(APP_URL);
    expect(payload.count).toBe(3);
  });

  it("keeps an existing query string in the app URL", () => {
    const payload = createPushNotificationPayload(
      [createConstructionSite("7")],
      "https://example.test/app/?bereich=alle",
      FETCHED_AT,
    );

    expect(payload.url).toBe(
      "https://example.test/app/?bereich=alle&baustelle=7",
    );
  });

  it("refuses to compose a notification about nothing", () => {
    expect(() =>
      createPushNotificationPayload([], APP_URL, FETCHED_AT),
    ).toThrow();
  });
});
