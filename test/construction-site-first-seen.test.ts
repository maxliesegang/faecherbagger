import { describe, expect, it } from "vitest";
import {
  assignFirstSeenAt,
  FIRST_SEEN_BEFORE_TRACKING,
} from "../src/pipeline/construction-site-first-seen.ts";
import type {
  ConstructionSite,
  NormalizedConstructionSite,
} from "../src/types/index.ts";

const FETCHED_AT = "2026-07-25T06:00:00.000Z";

function createNormalizedSite(
  id: string,
  lastModified = "2026-07-24T09:00:00.000Z",
): NormalizedConstructionSite {
  return {
    id,
    point: [8.4, 49.0],
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
    geometry: { type: "Point", coordinates: [8.4, 49.0] },
    source: "Test",
    lastModified,
  };
}

const withFirstSeenAt = (
  id: string,
  firstSeenAt: string,
): ConstructionSite => ({ ...createNormalizedSite(id), firstSeenAt });

describe("assignFirstSeenAt", () => {
  it("carries a known record's first sighting forward unchanged", () => {
    const [site] = assignFirstSeenAt(
      [createNormalizedSite("known")],
      [withFirstSeenAt("known", "2026-03-01T00:00:00.000Z")],
      FETCHED_AT,
    );

    expect(site.firstSeenAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("stamps this run onto a record it has never seen", () => {
    const [site] = assignFirstSeenAt(
      [createNormalizedSite("brand-new")],
      [withFirstSeenAt("known", "2026-03-01T00:00:00.000Z")],
      FETCHED_AT,
    );

    expect(site.firstSeenAt).toBe(FETCHED_AT);
  });

  it("stamps every record on a first run with no previous data", () => {
    const sites = assignFirstSeenAt(
      [createNormalizedSite("a"), createNormalizedSite("b")],
      [],
      FETCHED_AT,
    );

    expect(sites.map((site) => site.firstSeenAt)).toEqual([
      FETCHED_AT,
      FETCHED_AT,
    ]);
  });

  it("re-stamps a record that vanished and came back", () => {
    const [site] = assignFirstSeenAt(
      [createNormalizedSite("returned")],
      [withFirstSeenAt("something-else", "2026-03-01T00:00:00.000Z")],
      FETCHED_AT,
    );

    expect(site.firstSeenAt).toBe(FETCHED_AT);
  });

  it("marks a legacy record as predating tracking, not as new", () => {
    // The migration from data written before the field existed. `fetchedAt`
    // would declare the whole dataset new and push the backlog to everyone;
    // the record's own `stand` would make it read "Neu" for a full window.
    const legacy = {
      ...createNormalizedSite("legacy", "2026-07-24T20:00:00.000Z"),
      firstSeenAt: "",
    };

    const [site] = assignFirstSeenAt(
      [createNormalizedSite("legacy")],
      [legacy as ConstructionSite],
      FETCHED_AT,
    );

    expect(site.firstSeenAt).toBe(FIRST_SEEN_BEFORE_TRACKING);
  });

  it("leaves the inputs untouched", () => {
    const normalized = [createNormalizedSite("a")];
    const previous = [withFirstSeenAt("a", "2026-03-01T00:00:00.000Z")];
    assignFirstSeenAt(normalized, previous, FETCHED_AT);

    expect(normalized[0]).not.toHaveProperty("firstSeenAt");
    expect(previous[0].firstSeenAt).toBe("2026-03-01T00:00:00.000Z");
  });
});
