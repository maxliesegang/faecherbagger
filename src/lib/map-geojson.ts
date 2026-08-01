import type {
  FeatureCollection,
  Geometry,
  Point,
  Polygon,
} from "geojson";
import type {
  ConstructionSite,
  ConstructionSiteGeometries,
  LngLat,
  NotificationArea,
} from "../types/index.ts";

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

/**
 * Just the geometry of an area. Taking this rather than a whole
 * {@link NotificationArea} lets the picker preview a circle that has no
 * identity yet.
 */
export type NotificationAreaShape = Pick<
  NotificationArea,
  "center" | "radiusKm"
>;

/**
 * Approximates a geodesic notification circle as a closed GeoJSON polygon.
 * The fixed segment count keeps rendering cost predictable at every radius.
 */
export function createNotificationAreaPolygon(
  area: NotificationAreaShape,
): Polygon {
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

/** One polygon per watched area; the map draws them as a single layer. */
export function createNotificationAreaFeatureCollection(
  areas: readonly NotificationAreaShape[],
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: areas.map((area) => ({
      type: "Feature",
      properties: {},
      geometry: createNotificationAreaPolygon(area),
    })),
  };
}
