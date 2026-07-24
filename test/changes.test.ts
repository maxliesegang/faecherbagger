import { describe, expect, it } from "vitest";
import type { Baustelle } from "../src/types/index.ts";
import { computeChanges } from "../src/lib/changes.ts";

function record(id: string, lastModified: string): Baustelle {
  return {
    id,
    phase: "active",
    category: "other",
    artRaw: "",
    closure: "unknown",
    siteType: null,
    municipality: "Karlsruhe",
    location: "",
    notes: null,
    cause: null,
    startDate: "2026-01-01",
    endDate: null,
    point: [8.4, 49.0],
    geometry: { type: "Point", coordinates: [8.4, 49.0] },
    source: "Stadt Karlsruhe",
    lastModified,
  };
}

describe("computeChanges", () => {
  it("detects added, modified (by lastModified) and removed records", () => {
    const previous = [record("A", "2026-01-01T00:00:00Z"), record("B", "2026-01-01T00:00:00Z")];
    const current = [
      record("A", "2026-01-01T00:00:00Z"), // unchanged
      record("B", "2026-02-01T00:00:00Z"), // stand changed -> modified
      record("C", "2026-02-01T00:00:00Z"), // new -> added
    ];

    expect(computeChanges(previous, current, "2026-01-10T00:00:00Z")).toEqual({
      since: "2026-01-10T00:00:00Z",
      added: ["C"],
      modified: ["B"],
      removed: [],
    });
  });

  it("reports every record as added on the first run", () => {
    const current = [record("B", "x"), record("A", "x")];
    const changes = computeChanges([], current, null);
    expect(changes.since).toBeNull();
    expect(changes.added).toEqual(["A", "B"]); // sorted
    expect(changes.modified).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it("detects removals", () => {
    const changes = computeChanges([record("A", "x")], [], "2026-01-10T00:00:00Z");
    expect(changes.removed).toEqual(["A"]);
    expect(changes.added).toEqual([]);
  });
});
