import type { Geometry, Point, Position } from "geojson";
import type {
  ConstructionPhase,
  ConstructionSiteWithGeometry,
  ISODate,
  LngLat,
  WFSConstructionSiteFeature,
} from "../types/index.ts";
import {
  normalizeConstructionCategory,
  normalizeClosureSeverity,
  normalizeConstructionSiteMobility,
} from "./construction-site-mappings.ts";

export interface ConstructionSiteNormalizationOptions {
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
export function toBerlinDate(
  timestamp: string | null | undefined,
): ISODate | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return BERLIN_DATE.format(date); // en-CA formats as YYYY-MM-DD
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
  let text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(
      /&#?\w+;/g,
      (entity) => ENTITIES[entity.toLowerCase()] ?? ENTITIES[entity] ?? entity,
    )
    .replace(/\r\n?/g, "\n");
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > 0 ? text : null;
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

/**
 * Decimal places kept for every published coordinate.
 *
 * The source emits full double precision (8+ decimals, i.e. millimetres), which
 * is meaningless for a road-works notice and made up a large share of the
 * transferred bytes. Six decimals are ~0.11 m at this latitude — finer than the
 * geometries themselves.
 */
export const PUBLISHED_COORDINATE_DECIMALS = 6;

const COORDINATE_FACTOR = 10 ** PUBLISHED_COORDINATE_DECIMALS;

/** Rounds one coordinate value; `Number` drops the trailing zeros again. */
const roundCoordinate = (value: number): number =>
  Math.round(value * COORDINATE_FACTOR) / COORDINATE_FACTOR;

const roundPosition = (position: Position): Position =>
  position.map(roundCoordinate);

const roundLngLat = ([longitude, latitude]: LngLat): LngLat => [
  roundCoordinate(longitude),
  roundCoordinate(latitude),
];

/** Rounds every position of a geometry to {@link PUBLISHED_COORDINATE_DECIMALS}. */
export function roundGeometryCoordinates(geometry: Geometry): Geometry {
  switch (geometry.type) {
    case "Point":
      return { ...geometry, coordinates: roundPosition(geometry.coordinates) };
    case "LineString":
    case "MultiPoint":
      return { ...geometry, coordinates: geometry.coordinates.map(roundPosition) };
    case "Polygon":
    case "MultiLineString":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((ring) => ring.map(roundPosition)),
      };
    case "MultiPolygon":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map(roundPosition)),
        ),
      };
    case "GeometryCollection":
      return {
        ...geometry,
        geometries: geometry.geometries.map(roundGeometryCoordinates),
      };
    default:
      return geometry;
  }
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
 * {@link ConstructionSite} records — one per `vorgangsnummer`.
 *
 * Alsace/France records (null `gemeinde` / null `vorgangsnummer`) are dropped
 * defensively here even though the server-side `CQL_FILTER` already excludes
 * them. Records are returned sorted by `id` for stable diffs between runs.
 */
export function normalizeConstructionSites(
  features: readonly WFSConstructionSiteFeature[],
  phase: ConstructionPhase,
  options: ConstructionSiteNormalizationOptions = {},
): ConstructionSiteWithGeometry[] {
  const featureGroupsBySiteId = new Map<string, WFSConstructionSiteFeature[]>();
  for (const feature of features) {
    const { vorgangsnummer, gemeinde } = feature.properties;
    // Exclude Alsace (null gemeinde) and any record without a grouping key.
    if (vorgangsnummer == null || gemeinde == null) continue;
    const group = featureGroupsBySiteId.get(vorgangsnummer);
    if (group) group.push(feature);
    else featureGroupsBySiteId.set(vorgangsnummer, [feature]);
  }

  const constructionSites: ConstructionSiteWithGeometry[] = [];
  for (const [vorgangsnummer, members] of featureGroupsBySiteId) {
    const properties = members[0]!.properties;

    const points: LngLat[] = [];
    const areaGeometries: Geometry[] = [];
    for (const member of members) {
      collectGeometryParts(member.geometry, points, areaGeometries);
    }

    const startDate = toBerlinDate(properties.vorgangszeitraum_von);
    if (startDate == null) {
      options.onWarn?.(`Skipping ${vorgangsnummer}: missing start date`);
      continue;
    }

    const point =
      points.length > 0
        ? meanPoint(points)
        : firstCoordinate(areaGeometries);
    if (point == null) {
      options.onWarn?.(`Skipping ${vorgangsnummer}: no usable geometry`);
      continue;
    }

    constructionSites.push({
      id: vorgangsnummer,
      phase,
      category: normalizeConstructionCategory(properties.art, options.onUnknownArt),
      artRaw: properties.art ?? "",
      closure: normalizeClosureSeverity(properties.sperrung),
      siteType: normalizeConstructionSiteMobility(properties.tagesbaustelle),
      municipality: properties.gemeinde ?? "",
      location: (properties.lage ?? "").trim(),
      notes: sanitizeText(properties.zusatzinfo),
      cause: sanitizeText(properties.verursacher),
      startDate,
      endDate: toBerlinDate(properties.vorgangszeitraum_bis),
      point: roundLngLat(point),
      geometry: roundGeometryCoordinates(
        buildGeometry(areaGeometries, points.length > 0 ? points : [point]),
      ),
      source: properties.datenquelle ?? "",
      lastModified: properties.stand ?? "",
    });
  }

  constructionSites.sort((left, right) => left.id.localeCompare(right.id));
  return constructionSites;
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

function firstPosition(geometry: Geometry): Position | null {
  switch (geometry.type) {
    case "Point":
      return geometry.coordinates;
    case "LineString":
    case "MultiPoint":
      return geometry.coordinates[0] ?? null;
    case "Polygon":
    case "MultiLineString":
      return geometry.coordinates[0]?.[0] ?? null;
    case "MultiPolygon":
      return geometry.coordinates[0]?.[0]?.[0] ?? null;
    case "GeometryCollection":
      for (const child of geometry.geometries) {
        const position = firstPosition(child);
        if (position) return position;
      }
      return null;
    default:
      return null;
  }
}
