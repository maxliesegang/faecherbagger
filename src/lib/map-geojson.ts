import type {
  FeatureCollection,
  Geometry,
  LineString,
  Point,
  Polygon,
} from "geojson";
import type {
  CircleNotificationArea,
  ConstructionSite,
  ConstructionSiteGeometries,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";

interface ConstructionSiteFeatureProperties {
  id: string;
  phase: ConstructionSite["phase"];
  /** Drives the marker colour: what a visitor can and cannot drive through. */
  closure: ConstructionSite["closure"];
  /** `1` for a full closure, `0` otherwise, so clusters can be summed up. */
  isFullClosure: number;
}

const EARTH_RADIUS_KM = 6_371;
const NOTIFICATION_AREA_STEPS = 64;

/**
 * Creates one feature per construction site, retaining only the properties
 * required by MapLibre styling and selection.
 */
function createConstructionSiteFeatureCollection(
  constructionSites: readonly ConstructionSite[],
  getGeometry: (site: ConstructionSite) => Geometry | undefined,
): FeatureCollection<Geometry, ConstructionSiteFeatureProperties> {
  const features: FeatureCollection<
    Geometry,
    ConstructionSiteFeatureProperties
  >["features"] = [];
  for (const site of constructionSites) {
    const geometry = getGeometry(site);
    if (!geometry) continue;
    features.push({
      type: "Feature",
      id: site.id,
      geometry,
      properties: {
        id: site.id,
        phase: site.phase,
        closure: site.closure,
        isFullClosure: site.closure === "full" ? 1 : 0,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function createConstructionSitePointFeatureCollection(
  constructionSites: readonly ConstructionSite[],
): FeatureCollection<Geometry, ConstructionSiteFeatureProperties> {
  return createConstructionSiteFeatureCollection(constructionSites, (site) => ({
    type: "Point",
    coordinates: site.point,
  }));
}

/**
 * Detailed shapes for the sites whose geometry has arrived. Sites still missing
 * from `geometries` are skipped rather than faked: the point layer already
 * shows them, so the map stays complete while the larger file is in flight.
 */
export function createConstructionSiteGeometryFeatureCollection(
  constructionSites: readonly ConstructionSite[],
  geometries: ConstructionSiteGeometries | undefined,
): FeatureCollection<Geometry, ConstructionSiteFeatureProperties> {
  return createConstructionSiteFeatureCollection(
    constructionSites,
    (site) => geometries?.[site.id],
  );
}

export function createUserLocationFeatureCollection(
  location?: LngLat,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: location
      ? [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: location },
            properties: {},
          },
        ]
      : [],
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * Just the shape of an area. Taking this rather than a whole
 * {@link NotificationArea} lets the picker preview an area that has no
 * identity yet.
 */
export type NotificationAreaShape = DistributiveOmit<
  NotificationArea,
  "id" | "label"
>;

type CircleShape = Pick<CircleNotificationArea, "center" | "radiusKm">;

/**
 * Approximates a geodesic notification circle as a closed GeoJSON polygon.
 * The fixed segment count keeps rendering cost predictable at every radius.
 */
export function createNotificationAreaPolygon(area: CircleShape): Polygon {
  const [longitude, latitude] = area.center;
  const angularDistance = area.radiusKm / EARTH_RADIUS_KM;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const coordinates: LngLat[] = [];

  for (let step = 0; step <= NOTIFICATION_AREA_STEPS; step += 1) {
    const bearing = (step / NOTIFICATION_AREA_STEPS) * Math.PI * 2;
    const pointLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angularDistance) +
        Math.cos(latitudeRadians) *
          Math.sin(angularDistance) *
          Math.cos(bearing),
    );
    const pointLongitude =
      longitudeRadians +
      Math.atan2(
        Math.sin(bearing) *
          Math.sin(angularDistance) *
          Math.cos(latitudeRadians),
        Math.cos(angularDistance) -
          Math.sin(latitudeRadians) * Math.sin(pointLatitude),
      );
    coordinates.push([
      (pointLongitude * 180) / Math.PI,
      (pointLatitude * 180) / Math.PI,
    ]);
  }

  return { type: "Polygon", coordinates: [coordinates] };
}

/** Metres per pixel at zoom 0 on MapLibre's 512-pixel tiles, at the equator. */
const METERS_PER_PIXEL_AT_ZOOM_ZERO = 40_075_016.686 / 512;

export interface NotificationAreaFeatureProperties {
  /**
   * For corridors: the band's full width in pixels at zoom 0. The map scales
   * it by 2^zoom, so the band stays the same width on the ground at every zoom
   * without buffering the line into a polygon.
   */
  bandWidthAtZoomZero?: number;
  /** The area's name, drawn on the map where the area has a shape. */
  label?: string;
}

type LabeledNotificationAreaShape = NotificationAreaShape & { label?: string };

/** The northernmost vertex: the label sits on top of the outline. */
const getTopPoint = (points: readonly LngLat[]): LngLat =>
  points.reduce((top, point) => (point[1] > top[1] ? point : top));

/** The point halfway along a line, by distance. */
function getLineMidpoint(line: readonly LngLat[]): LngLat {
  const segmentLengths = line
    .slice(1)
    .map((point, index) => distanceInMeters(line[index]!, point));
  let remaining = segmentLengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [index, length] of segmentLengths.entries()) {
    if (remaining <= length && length > 0) {
      const fraction = remaining / length;
      const [startLongitude, startLatitude] = line[index]!;
      const [endLongitude, endLatitude] = line[index + 1]!;
      return [
        startLongitude + (endLongitude - startLongitude) * fraction,
        startLatitude + (endLatitude - startLatitude) * fraction,
      ];
    }
    remaining -= length;
  }
  return line[0]!;
}

/**
 * Every drawable area: circles and outlines as polygons, corridors as lines
 * with a ground width. Municipalities and streets have no shape of their own
 * and are left out. A named area also gets one point for its label: on the
 * top edge of a circle or outline, where it is clear of the markers that
 * crowd the middle, and halfway along a corridor. A point rather than
 * MapLibre's own polygon or line placement, which repeats a label per tile
 * and drops it on a winding route.
 */
export function createNotificationAreaFeatureCollection(
  areas: readonly LabeledNotificationAreaShape[],
): FeatureCollection<
  Polygon | LineString | Point,
  NotificationAreaFeatureProperties
> {
  const features: FeatureCollection<
    Polygon | LineString | Point,
    NotificationAreaFeatureProperties
  >["features"] = [];
  const addLabelPoint = (label: string | undefined, point: LngLat) => {
    if (!label) return;
    features.push({
      type: "Feature",
      properties: { label },
      geometry: { type: "Point", coordinates: point },
    });
  };
  for (const area of areas) {
    switch (area.kind) {
      case "circle":
        features.push({
          type: "Feature",
          properties: {},
          geometry: createNotificationAreaPolygon(area),
        });
        addLabelPoint(
          area.label,
          getTopPoint(createNotificationAreaPolygon(area).coordinates[0] as LngLat[]),
        );
        break;
      case "polygon":
        features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[...area.ring, area.ring[0]!]],
          },
        });
        addLabelPoint(area.label, getTopPoint(area.ring));
        break;
      case "corridor": {
        const latitude = area.line[0]![1];
        const metersPerPixel =
          METERS_PER_PIXEL_AT_ZOOM_ZERO * Math.cos((latitude * Math.PI) / 180);
        features.push({
          type: "Feature",
          properties: {
            bandWidthAtZoomZero: (2 * area.widthMeters) / metersPerPixel,
          },
          geometry: { type: "LineString", coordinates: area.line },
        });
        addLabelPoint(area.label, getLineMidpoint(area.line));
        break;
      }
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * Points that bound an area on the map, for fitting the view, or `undefined`
 * for areas without a shape.
 */
export function getNotificationAreaOutline(
  area: NotificationAreaShape,
): LngLat[] | undefined {
  switch (area.kind) {
    case "circle":
      return createNotificationAreaPolygon(area).coordinates[0] as LngLat[];
    case "polygon":
      return area.ring;
    case "corridor":
      return area.line;
    default:
      return undefined;
  }
}
