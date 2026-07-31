import type { ConstructionSite, LngLat } from "../src/types/index.ts";

/**
 * A construction site with every field at a plausible default, for tests that
 * care about two or three of them. Override exactly what the case is about, so
 * the assertion and the fixture read as one thought.
 */
export function createConstructionSite(
  id: string,
  overrides: Partial<ConstructionSite> = {},
): ConstructionSite {
  const point: LngLat = overrides.point ?? [8.4, 49.0];
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
    source: "Test",
    lastModified: "2026-07-24T06:00:00.000Z",
    firstSeenAt: "2026-07-24T06:00:00.000Z",
    ...overrides,
  };
}

/** The instant the recency fixtures below are measured against. */
export const FETCHED_AT = "2026-07-25T06:00:00.000Z";
/** Older than any window these tests use. */
export const LONG_AGO = "2026-01-01T00:00:00.000Z";

/** Known for months, edited yesterday: an edit, not an addition. */
export const editedYesterday = createConstructionSite("edited-yesterday", {
  lastModified: "2026-07-24T09:00:00.000Z",
  firstSeenAt: LONG_AGO,
});
/** Appeared in this run. */
export const newToday = createConstructionSite("new-today", {
  lastModified: "2026-07-25T05:00:00.000Z",
  firstSeenAt: "2026-07-25T05:00:00.000Z",
});
/** Appeared five days ago: inside a 7 d window, outside a 24 h one. */
export const newLastWeek = createConstructionSite("new-last-week", {
  lastModified: "2026-07-20T09:00:00.000Z",
  firstSeenAt: "2026-07-20T06:00:00.000Z",
});
/** Untouched since well before any window. */
export const untouched = createConstructionSite("untouched", {
  lastModified: "2026-05-01T09:00:00.000Z",
  firstSeenAt: LONG_AGO,
});

/** Deliberately unsorted, so a selector's ordering has something to prove. */
export const recencyFixtures = [
  newLastWeek,
  untouched,
  newToday,
  editedYesterday,
];
