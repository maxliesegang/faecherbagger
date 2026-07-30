import { describe, expect, it } from "vitest";
import { createPushNotificationPayload } from "../src/pipeline/push-notification.ts";
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
    firstSeenAt: "2026-07-24T00:00:00Z",
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
    // The lead time, not the raw date: the notification exists to let someone
    // plan, and "in 3 Tagen" is what they plan against.
    expect(payload.body).toBe("Teststraße 42 · Beginnt in 3 Tagen");
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
    expect(payload.body).toBe(
      "3 davon in den nächsten 7 Tagen. Zuerst: Teststraße 1 · Beginnt in 3 Tagen",
    );
    expect(payload.url).toBe(APP_URL);
    expect(payload.count).toBe(3);
  });

  it("names the most urgent site first, whatever order it was given in", () => {
    const payload = createPushNotificationPayload(
      [
        createConstructionSite("spaet", { startDate: "2026-09-05" }),
        createConstructionSite("morgen", { startDate: "2026-07-30" }),
      ],
      APP_URL,
      FETCHED_AT,
    );

    expect(payload.body).toBe(
      "1 davon in den nächsten 7 Tagen. Zuerst: Teststraße morgen · Beginnt morgen",
    );
  });

  it("falls back to a plain summary when nothing is imminent", () => {
    const payload = createPushNotificationPayload(
      [
        createConstructionSite("1", { startDate: "2026-11-02" }),
        createConstructionSite("2", { startDate: "2026-12-01" }),
      ],
      APP_URL,
      FETCHED_AT,
    );

    expect(payload.body).toBe("Unter anderem: Teststraße 1, Karlsruhe");
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
