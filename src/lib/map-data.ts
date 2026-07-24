import type {
  FeatureCollection,
  Geometry,
  Point,
  Polygon,
} from "geojson";
import type {
  Baustelle,
  LngLat,
  NotificationArea,
} from "../types/index.ts";

interface BaustelleFeatureProperties {
  id: string;
  phase: Baustelle["phase"];
}

const EARTH_RADIUS_KM = 6_371;
const NOTIFICATION_AREA_STEPS = 64;

/**
 * Creates one feature per construction site, retaining only the properties
 * required by MapLibre styling and selection.
 */
function toFeatureCollection(
  records: readonly Baustelle[],
  geometry: (record: Baustelle) => Geometry,
): FeatureCollection<Geometry, BaustelleFeatureProperties> {
  return {
    type: "FeatureCollection",
    features: records.map((record) => ({
      type: "Feature",
      id: record.id,
      geometry: geometry(record),
      properties: { id: record.id, phase: record.phase },
    })),
  };
}

export function recordsToPoints(
  records: readonly Baustelle[],
): FeatureCollection<Geometry, BaustelleFeatureProperties> {
  return toFeatureCollection(records, (record) => ({
    type: "Point",
    coordinates: record.point,
  }));
}

export function recordsToGeometries(
  records: readonly Baustelle[],
): FeatureCollection<Geometry, BaustelleFeatureProperties> {
  return toFeatureCollection(records, (record) => record.geometry);
}

export function userLocationGeoJson(
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
 * Approximates a geodesic notification circle as a closed GeoJSON polygon.
 * The fixed segment count keeps rendering cost predictable at every radius.
 */
export function notificationAreaPolygon(area: NotificationArea): Polygon {
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

export function notificationAreaGeoJson(
  area?: NotificationArea,
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: area
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: notificationAreaPolygon(area),
          },
        ]
      : [],
  };
}
