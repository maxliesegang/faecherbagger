import type { Geometry, Point, Position } from "geojson";
import type {
  Baustelle,
  IsoDate,
  LngLat,
  Phase,
  WfsBaustelleFeature,
} from "../types/index.ts";
import { mapCategory, mapClosure, mapSiteType } from "./mappings.ts";

export interface NormalizeOptions {
  /** Called once per normalized record whose `art` is not in the mapping table. */
  onUnknownArt?: (art: string) => void;
  /** Called for records that had to be skipped (e.g. no usable geometry). */
  onWarn?: (message: string) => void;
}

const BERLIN_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Converts a WFS timestamp to a date-only string in the Europe/Berlin calendar.
 *
 * The source stores dates as local midnight expressed in UTC (e.g.
 * `"2026-07-23T22:00:00Z"` is midnight CEST), so the correct calendar date only
 * appears after converting to Europe/Berlin. Returns `null` for null/invalid input.
 */
export function toBerlinDate(ts: string | null | undefined): IsoDate | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return BERLIN_DATE.format(d); // en-CA formats as YYYY-MM-DD
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
};

/**
 * Converts the raw `zusatzinfo` HTML fragment to plain text: `<br>` becomes a
 * newline, all other tags are stripped, a few common entities are decoded, and
 * whitespace (including `\r\n`) is normalized. Returns `null` when empty.
 *
 * The output is plain text by construction and must be rendered as text (never
 * via `dangerouslySetInnerHTML`).
 */
export function sanitizeText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#?\w+;/g, (m) => ENTITIES[m.toLowerCase()] ?? ENTITIES[m] ?? m)
    .replace(/\r\n?/g, "\n");
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s.length > 0 ? s : null;
}

function toLngLat(position: Position): LngLat | null {
  const [longitude, latitude] = position;
  if (
    typeof longitude !== "number" ||
    typeof latitude !== "number" ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude)
  ) {
    return null;
  }
  return [longitude, latitude];
}

function meanPoint(points: readonly LngLat[]): LngLat {
  const sum = points.reduce<[number, number]>(
    (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
    [0, 0],
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

/** Builds the map geometry from a Vorgang's non-point parts (points as fallback). */
function buildGeometry(
  areaGeometries: readonly Geometry[],
  points: readonly LngLat[],
): Geometry {
  if (areaGeometries.length === 1) return areaGeometries[0]!;
  if (areaGeometries.length > 1) {
    return { type: "GeometryCollection", geometries: [...areaGeometries] };
  }
  // Point-only Vorgang: represent with the point(s).
  if (points.length === 1) {
    return { type: "Point", coordinates: points[0]! } satisfies Point;
  }
  return { type: "MultiPoint", coordinates: [...points] };
}

/**
 * Normalizes and deduplicates the features of a single WFS layer into
 * {@link Baustelle} records — one per `vorgangsnummer`.
 *
 * Alsace/France records (null `gemeinde` / null `vorgangsnummer`) are dropped
 * defensively here even though the server-side `CQL_FILTER` already excludes
 * them. Records are returned sorted by `id` for stable diffs between runs.
 */
export function normalizeFeatures(
  features: readonly WfsBaustelleFeature[],
  phase: Phase,
  opts: NormalizeOptions = {},
): Baustelle[] {
  const groups = new Map<string, WfsBaustelleFeature[]>();
  for (const feature of features) {
    const { vorgangsnummer, gemeinde } = feature.properties;
    // Exclude Alsace (null gemeinde) and any record without a grouping key.
    if (vorgangsnummer == null || gemeinde == null) continue;
    const group = groups.get(vorgangsnummer);
    if (group) group.push(feature);
    else groups.set(vorgangsnummer, [feature]);
  }

  const records: Baustelle[] = [];
  for (const [vorgangsnummer, members] of groups) {
    const p = members[0]!.properties;

    const points: LngLat[] = [];
    const areaGeometries: Geometry[] = [];
    for (const member of members) {
      collectGeometryParts(member.geometry, points, areaGeometries);
    }

    const startDate = toBerlinDate(p.vorgangszeitraum_von);
    if (startDate == null) {
      opts.onWarn?.(`Skipping ${vorgangsnummer}: missing start date`);
      continue;
    }

    const point =
      points.length > 0
        ? meanPoint(points)
        : firstCoordinate(areaGeometries);
    if (point == null) {
      opts.onWarn?.(`Skipping ${vorgangsnummer}: no usable geometry`);
      continue;
    }

    records.push({
      id: vorgangsnummer,
      phase,
      category: mapCategory(p.art, opts.onUnknownArt),
      artRaw: p.art ?? "",
      closure: mapClosure(p.sperrung),
      siteType: mapSiteType(p.tagesbaustelle),
      municipality: p.gemeinde ?? "",
      location: (p.lage ?? "").trim(),
      notes: sanitizeText(p.zusatzinfo),
      cause: sanitizeText(p.verursacher),
      startDate,
      endDate: toBerlinDate(p.vorgangszeitraum_bis),
      point,
      geometry: buildGeometry(
        areaGeometries,
        points.length > 0 ? points : [point],
      ),
      source: p.datenquelle ?? "",
      lastModified: p.stand ?? "",
    });
  }

  records.sort((a, b) => a.id.localeCompare(b.id));
  return records;
}

/**
 * Flattens collections so nested point features contribute to the
 * representative point and nested non-point features remain in the map shape.
 */
function collectGeometryParts(
  geometry: Geometry | null,
  points: LngLat[],
  areaGeometries: Geometry[],
): void {
  if (geometry == null) return;
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      collectGeometryParts(child, points, areaGeometries);
    }
    return;
  }
  if (geometry.type === "Point") {
    const point = toLngLat(geometry.coordinates);
    if (point) points.push(point);
    return;
  }
  areaGeometries.push(geometry);
}

/** Fallback representative point when a Vorgang has no Point features. */
function firstCoordinate(geometries: readonly Geometry[]): LngLat | null {
  for (const geometry of geometries) {
    const position = firstPosition(geometry);
    if (position) {
      const point = toLngLat(position);
      if (point) return point;
    }
  }
  return null;
}

function firstPosition(g: Geometry): Position | null {
  switch (g.type) {
    case "Point":
      return g.coordinates;
    case "LineString":
    case "MultiPoint":
      return g.coordinates[0] ?? null;
    case "Polygon":
    case "MultiLineString":
      return g.coordinates[0]?.[0] ?? null;
    case "MultiPolygon":
      return g.coordinates[0]?.[0]?.[0] ?? null;
    case "GeometryCollection":
      for (const sub of g.geometries) {
        const pos = firstPosition(sub);
        if (pos) return pos;
      }
      return null;
    default:
      return null;
  }
}
