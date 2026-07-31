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
  HomeArea,
} from "../types/index.ts";

interface ConstructionSiteFeatureProperties {
  id: string;
  phase: ConstructionSite["phase"];
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
  return {
    type: "FeatureCollection",
    features: constructionSites.flatMap((site) => {
      const geometry = getGeometry(site);
      return geometry
        ? [
            {
              type: "Feature" as const,
              id: site.id,
              geometry,
              properties: { id: site.id, phase: site.phase },
            },
          ]
        : [];
    }),
  };
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
 * The detailed lines and areas, for the records whose geometry has arrived.
 *
 * Geometry is published in its own file and fetched when a map first appears,
 * so a record without an entry is the normal state of the first paint rather
 * than an error: it is drawn by the point layer until the file lands, and this
 * collection grows to the full set on the render after that.
 */
export function createConstructionSiteGeometryFeatureCollection(
  constructionSites: readonly ConstructionSite[],
  geometries: ConstructionSiteGeometries,
): FeatureCollection<Geometry, ConstructionSiteFeatureProperties> {
  return createConstructionSiteFeatureCollection(
    constructionSites,
    (site) => geometries[site.id],
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
 * Approximates a geodesic notification circle as a closed GeoJSON polygon.
 * The fixed segment count keeps rendering cost predictable at every radius.
 */
export function createHomeAreaPolygon(area: HomeArea): Polygon {
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

export function createHomeAreaFeatureCollection(
  area?: HomeArea,
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: area
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: createHomeAreaPolygon(area),
          },
        ]
      : [],
  };
}
