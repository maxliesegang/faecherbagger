import type { Geometry, Position } from "geojson";
import type { LngLat } from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";

/**
 * Planar geometry for watched areas and site extents.
 *
 * Everything here works at the scale of a region — a few dozen kilometres —
 * where an equirectangular projection around the shape is accurate to well
 * under a metre per kilometre. That is far below the precision of a hand-drawn
 * outline or a site's representative point, and keeps this free of a
 * geometry library in the service worker.
 */

const METERS_PER_DEGREE_LATITUDE = 111_320;

type PlanarPoint = [number, number];

/** Projects to metres east/north of `origin`. */
function createLocalProjection(origin: LngLat): (point: LngLat) => PlanarPoint {
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos((origin[1] * Math.PI) / 180);
  return (point) => [
    (point[0] - origin[0]) * metersPerDegreeLongitude,
    (point[1] - origin[1]) * METERS_PER_DEGREE_LATITUDE,
  ];
}

function distanceToSegment(
  point: PlanarPoint,
  start: PlanarPoint,
  end: PlanarPoint,
): number {
  const segmentX = end[0] - start[0];
  const segmentY = end[1] - start[1];
  const lengthSquared = segmentX ** 2 + segmentY ** 2;
  const fraction =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * segmentX + (point[1] - start[1]) * segmentY) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    point[0] - (start[0] + fraction * segmentX),
    point[1] - (start[1] + fraction * segmentY),
  );
}

/** Shortest distance from a point to a polyline, in metres. */
export function distanceToLineMeters(
  point: LngLat,
  line: readonly LngLat[],
): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  if (line.length === 1) return distanceInMeters(point, line[0]!);
  const project = createLocalProjection(point);
  const target = project(point);
  let nearest = Number.POSITIVE_INFINITY;
  let previous = project(line[0]!);
  for (let index = 1; index < line.length; index += 1) {
    const current = project(line[index]!);
    nearest = Math.min(nearest, distanceToSegment(target, previous, current));
    previous = current;
  }
  return nearest;
}

/**
 * Whether a point lies inside a ring (even-odd rule).
 *
 * Even-odd rather than non-zero: a hand-drawn lasso that crosses itself at the
 * closing point should not turn the overlap into a hole-free blob the visitor
 * never drew. The ring may or may not repeat its first point.
 */
export function isPointInRing(point: LngLat, ring: readonly LngLat[]): boolean {
  let isInside = false;
  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index, index += 1
  ) {
    const [currentX, currentY] = ring[index]!;
    const [previousX, previousY] = ring[previousIndex]!;
    if (
      currentY > point[1] !== previousY > point[1] &&
      point[0] <
        ((previousX - currentX) * (point[1] - currentY)) /
          (previousY - currentY) +
          currentX
    ) {
      isInside = !isInside;
    }
  }
  return isInside;
}

/** Ramer–Douglas–Peucker: drops points closer than `toleranceMeters` to the line. */
export function simplifyLine(
  line: readonly LngLat[],
  toleranceMeters: number,
): LngLat[] {
  if (line.length <= 2) return [...line];
  const project = createLocalProjection(line[0]!);
  const planar = line.map(project);
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthestIndex = -1;
    let farthestDistance = toleranceMeters;
    for (let index = first + 1; index < last; index += 1) {
      const distance = distanceToSegment(
        planar[index]!,
        planar[first]!,
        planar[last]!,
      );
      if (distance > farthestDistance) {
        farthestIndex = index;
        farthestDistance = distance;
      }
    }
    if (farthestIndex >= 0) {
      keep[farthestIndex] = 1;
      stack.push([first, farthestIndex], [farthestIndex, last]);
    }
  }
  return line.filter((_, index) => keep[index] === 1);
}

/**
 * Simplifies until the line fits `maxVertices`, starting at a tolerance that
 * is invisible on a street map and doubling it as needed. Coordinates are
 * rounded to five decimals (about a metre), the precision the data uses.
 */
export function simplifyToVertexLimit(
  line: readonly LngLat[],
  maxVertices: number,
  initialToleranceMeters = 5,
): LngLat[] {
  let tolerance = initialToleranceMeters;
  let simplified = simplifyLine(line, tolerance);
  while (simplified.length > maxVertices) {
    tolerance *= 2;
    simplified = simplifyLine(line, tolerance);
  }
  return simplified.map(roundLngLat);
}

export const roundLngLat = (point: LngLat): LngLat => [
  Number(point[0].toFixed(5)),
  Number(point[1].toFixed(5)),
];

/** Every polyline in a geometry: line parts as-is, polygon rings as outlines. */
function collectPolylines(geometry: Geometry, lines: Position[][]): void {
  switch (geometry.type) {
    case "LineString":
      lines.push(geometry.coordinates);
      return;
    case "MultiLineString":
    case "Polygon":
      lines.push(...geometry.coordinates);
      return;
    case "MultiPolygon":
      for (const polygon of geometry.coordinates) lines.push(...polygon);
      return;
    case "MultiPoint":
      lines.push(geometry.coordinates);
      return;
    case "GeometryCollection":
      for (const child of geometry.geometries) collectPolylines(child, lines);
      return;
    case "Point":
      lines.push([geometry.coordinates]);
  }
}

const isPosition = (position: Position | undefined): position is Position =>
  position !== undefined &&
  Number.isFinite(position[0]) &&
  Number.isFinite(position[1]);

/** A site this short is matched well enough by its representative point. */
export const EXTENT_POINT_MIN_SPAN_METERS = 300;
const EXTENT_POINT_SPACING_METERS = 150;
/** Spacing grows past this many points along the span… */
const TARGET_EXTENT_POINTS = 16;
/** …and a winding shape is cut off here, so the published file stays small. */
const MAX_EXTENT_POINTS = 32;

/**
 * Points spread along a site's shape, or `undefined` for compact sites.
 *
 * Walks every line and ring at a fixed step and keeps a point whenever it is
 * further than the spacing from every point kept so far — so a three-kilometre
 * road gets a point every 150 m or so while a dense polygon outline does not
 * produce dozens of near-duplicates. The spacing widens for very long sites so
 * the count stays bounded.
 */
export function sampleExtentPoints(geometry: Geometry): LngLat[] | undefined {
  const polylines: Position[][] = [];
  collectPolylines(geometry, polylines);
  const vertices = polylines.flat().filter(isPosition);
  if (vertices.length < 2) return undefined;

  const first = vertices[0]!;
  const origin: LngLat = [first[0]!, first[1]!];
  const project = createLocalProjection(origin);
  const planarVertices = vertices.map((vertex) =>
    project([vertex[0]!, vertex[1]!]),
  );
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of planarVertices) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const span = Math.hypot(maxX - minX, maxY - minY);
  if (span < EXTENT_POINT_MIN_SPAN_METERS) return undefined;

  const spacing = Math.max(
    EXTENT_POINT_SPACING_METERS,
    span / TARGET_EXTENT_POINTS,
  );
  const step = spacing / 3;
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos((origin[1] * Math.PI) / 180);
  const kept: PlanarPoint[] = [];
  const result: LngLat[] = [];
  const consider = (candidate: PlanarPoint) => {
    if (result.length >= MAX_EXTENT_POINTS) return;
    const isFarFromKept = kept.every(
      (point) =>
        Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) >= spacing,
    );
    if (isFarFromKept) {
      kept.push(candidate);
      result.push(
        roundLngLat([
          origin[0] + candidate[0] / metersPerDegreeLongitude,
          origin[1] + candidate[1] / METERS_PER_DEGREE_LATITUDE,
        ]),
      );
    }
  };

  for (const polyline of polylines) {
    const planar = polyline
      .filter(isPosition)
      .map((vertex) => project([vertex[0]!, vertex[1]!]));
    if (planar.length === 0) continue;
    consider(planar[0]!);
    for (let index = 1; index < planar.length; index += 1) {
      const start = planar[index - 1]!;
      const end = planar[index]!;
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const steps = Math.ceil(length / step);
      for (let stepIndex = 1; stepIndex <= steps; stepIndex += 1) {
        const fraction = stepIndex / steps;
        consider([
          start[0] + (end[0] - start[0]) * fraction,
          start[1] + (end[1] - start[1]) * fraction,
        ]);
      }
    }
  }
  return result;
}
