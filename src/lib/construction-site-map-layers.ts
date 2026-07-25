import type {
  ExpressionSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import type {
  ConstructionSite,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import {
  createConstructionSiteGeometryFeatureCollection,
  createConstructionSitePointFeatureCollection,
  createNotificationAreaFeatureCollection,
  createUserLocationFeatureCollection,
} from "./map-geojson.ts";

export const MAP_SOURCE_IDS = {
  points: "baustellen-points",
  geometries: "baustellen-geometries",
  userLocation: "user-location",
  notificationArea: "notification-area",
} as const;

export const MAP_LAYER_IDS = {
  notificationAreaFill: "notification-area-fill",
  notificationAreaLine: "notification-area-line",
  areaFill: "baustellen-area-fill",
  geometryLine: "baustellen-geometry-line",
  geometryPoints: "baustellen-geometry-points",
  selected: "baustellen-selected",
  userLocation: "user-location",
} as const;

interface InitialConstructionSiteMapData {
  constructionSites: readonly ConstructionSite[];
  currentLocation?: LngLat;
  notificationArea?: NotificationArea;
}

const CONSTRUCTION_PHASE_COLOR: ExpressionSpecification = [
  "match",
  ["get", "phase"],
  "active",
  "#1d5e9e",
  "#ad6800",
];

/**
 * Adds construction-site sources and layers in their rendering order.
 * Runtime updates stay in the map component and reuse these source IDs.
 */
export function addConstructionSiteMapLayers(
  map: MapLibreMap,
  initialData: InitialConstructionSiteMapData,
): void {
  map.addSource(MAP_SOURCE_IDS.points, {
    type: "geojson",
    data: createConstructionSitePointFeatureCollection(
      initialData.constructionSites,
    ),
  });
  map.addSource(MAP_SOURCE_IDS.geometries, {
    type: "geojson",
    data: createConstructionSiteGeometryFeatureCollection(
      initialData.constructionSites,
    ),
  });
  map.addSource(MAP_SOURCE_IDS.userLocation, {
    type: "geojson",
    data: createUserLocationFeatureCollection(initialData.currentLocation),
  });
  map.addSource(MAP_SOURCE_IDS.notificationArea, {
    type: "geojson",
    data: createNotificationAreaFeatureCollection(
      initialData.notificationArea,
    ),
  });

  map.addLayer({
    id: MAP_LAYER_IDS.notificationAreaFill,
    type: "fill",
    source: MAP_SOURCE_IDS.notificationArea,
    paint: {
      "fill-color": "#2459a9",
      "fill-opacity": 0.035,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.notificationAreaLine,
    type: "line",
    source: MAP_SOURCE_IDS.notificationArea,
    paint: {
      "line-color": "#2459a9",
      "line-width": 1,
      "line-opacity": 0.55,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.areaFill,
    type: "fill",
    source: MAP_SOURCE_IDS.geometries,
    paint: {
      "fill-color": CONSTRUCTION_PHASE_COLOR,
      "fill-opacity": 0.2,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.geometryLine,
    type: "line",
    source: MAP_SOURCE_IDS.geometries,
    paint: {
      "line-color": CONSTRUCTION_PHASE_COLOR,
      "line-width": 3,
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.geometryPoints,
    type: "circle",
    source: MAP_SOURCE_IDS.geometries,
    paint: {
      "circle-color": CONSTRUCTION_PHASE_COLOR,
      "circle-radius": 7,
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.selected,
    type: "circle",
    source: MAP_SOURCE_IDS.points,
    filter: ["==", ["get", "id"], ""],
    paint: {
      "circle-color": "#fff",
      "circle-radius": 12,
      "circle-stroke-color": "#1d1d1b",
      "circle-stroke-width": 4,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.userLocation,
    type: "circle",
    source: MAP_SOURCE_IDS.userLocation,
    paint: {
      "circle-color": "#fff",
      "circle-radius": 7,
      "circle-stroke-color": "#2459a9",
      "circle-stroke-width": 4,
    },
  });
}
