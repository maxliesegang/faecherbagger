import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { WfsConstructionSiteCollection } from "../src/types/index.ts";
import {
  normalizeConstructionSites,
  sanitizeText,
  toBerlinDate,
} from "../src/lib/construction-site-normalization.ts";

/**
 * The fixture is real WFS output (EPSG:4326) from `baustellen_aktuell`, with
 * one record lightly adapted: `2019V3783` has its `vorgangszeitraum_bis` set to
 * null, an HTML/CRLF `zusatzinfo`, and an unknown `art` ("Zeitreisebau"). The
 * live German records exhibit none of these today (only Alsace does), so the
 * adaptation lets us exercise the open-ended-date, sanitization and "other"
 * code paths on a *kept* record. Every other field is untouched real data.
 */
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/wfs-aktuell-sample.json", import.meta.url), "utf8"),
) as WfsConstructionSiteCollection;

describe("normalizeConstructionSites", () => {
  it("drops Alsace/France records and deduplicates by vorgangsnummer", () => {
    const records = normalizeConstructionSites(fixture.features, "active");
    // 5 features -> Alsace (null vorgangsnummer) dropped, two Vorgänge (each a
    // point+polygon pair) collapsed to one record each.
    expect(records.map((r) => r.id)).toEqual(["2019V3783", "2022V5840"]);
    expect(records.every((r) => r.source !== "Collectivité européenne d’Alsace")).toBe(true);
  });

  it("keeps a representative point and the area geometry per Vorgang", () => {
    const [, sondernutzung] = normalizeConstructionSites(
      fixture.features,
      "active",
    );
    expect(sondernutzung!.id).toBe("2022V5840");
    // Representative point comes from the Point feature; map geometry is the Polygon.
    expect(sondernutzung!.point).toEqual([8.40304, 49.009]);
    expect(sondernutzung!.geometry.type).toBe("Polygon");
  });

  it("flattens nested geometry collections without losing their parts", () => {
    const members = fixture.features.filter(
      (feature) => feature.properties.vorgangsnummer === "2022V5840",
    );
    const point = members.find((feature) => feature.geometry?.type === "Point");
    const polygon = members.find((feature) => feature.geometry?.type === "Polygon");
    expect(point).toBeDefined();
    expect(polygon).toBeDefined();

    const nested = {
      ...point!,
      geometry: {
        type: "GeometryCollection" as const,
        geometries: [point!.geometry!, polygon!.geometry!],
      },
    };
    const [record] = normalizeConstructionSites([nested], "active");

    expect(record!.point).toEqual([8.40304, 49.009]);
    expect(record!.geometry).toEqual(polygon!.geometry);
  });

  it("normalizes category, closure, dates and phase", () => {
    const [openEnded, sondernutzung] = normalizeConstructionSites(
      fixture.features,
      "active",
    );

    expect(sondernutzung!.category).toBe("special-use");
    expect(sondernutzung!.closure).toBe("full");
    expect(sondernutzung!.phase).toBe("active");
    expect(sondernutzung!.startDate).toBe("2023-01-09"); // 2023-01-08T23:00Z -> CET
    expect(sondernutzung!.endDate).toBe("2026-12-31");

    expect(openEnded!.category).toBe("other"); // unknown art -> fallback
    expect(openEnded!.closure).toBe("obstruction");
    expect(openEnded!.endDate).toBeNull(); // open-ended
    expect(openEnded!.startDate).toBe("2020-02-03"); // 2020-02-02T23:00Z -> CET (winter)
  });

  it("sanitizes HTML/CRLF zusatzinfo to plain text", () => {
    const [openEnded] = normalizeConstructionSites(fixture.features, "active");
    expect(openEnded!.notes).toBe(
      "Vollsperrung wegen Bauarbeiten.\nUmleitung ist ausgeschildert.\n\nDauer unklar.",
    );
    expect(openEnded!.notes).not.toMatch(/[<>]/);
  });

  it("reports unknown art values via onUnknownArt (excluding filtered Alsace)", () => {
    const onUnknownArt = vi.fn();
    normalizeConstructionSites(fixture.features, "active", { onUnknownArt });
    expect(onUnknownArt).toHaveBeenCalledWith("Zeitreisebau");
    // The Alsace record's French art code is never seen: it is filtered first.
    expect(onUnknownArt).not.toHaveBeenCalledWith("KC1-route-inondee");
  });
});

describe("toBerlinDate", () => {
  it("returns the Europe/Berlin calendar date (handles the local-midnight-in-UTC storage)", () => {
    expect(toBerlinDate("2026-07-23T22:00:00Z")).toBe("2026-07-24"); // CEST (+2)
    expect(toBerlinDate("2020-02-02T23:00:00Z")).toBe("2020-02-03"); // CET (+1)
  });

  it("returns null for null/invalid input", () => {
    expect(toBerlinDate(null)).toBeNull();
    expect(toBerlinDate("")).toBeNull();
    expect(toBerlinDate("not-a-date")).toBeNull();
  });
});

describe("sanitizeText", () => {
  it("converts <br> to newline, strips tags and decodes entities", () => {
    expect(sanitizeText("a<br />b<br>c")).toBe("a\nb\nc");
    expect(sanitizeText("Rad &amp; Fuß")).toBe("Rad & Fuß");
    expect(sanitizeText("<b>bold</b> &gt; text")).toBe("bold > text");
  });

  it("collapses whitespace and returns null when empty", () => {
    expect(sanitizeText("  x   y \r\n\r\n\r\n z ")).toBe("x y\n\nz");
    expect(sanitizeText(null)).toBeNull();
    expect(sanitizeText("   ")).toBeNull();
    expect(sanitizeText("<br/>")).toBeNull();
  });
});
