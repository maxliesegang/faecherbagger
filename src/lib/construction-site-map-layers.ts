import type {
  ExpressionSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import type {
  ConstructionSite,
  ConstructionSiteGeometries,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import { CLOSURE_SEVERITY_COLORS } from "./construction-site-labels.ts";
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
  clusters: "baustellen-clusters",
  clusterCount: "baustellen-cluster-count",
  points: "baustellen-points",
  selected: "baustellen-selected",
  userLocation: "user-location",
} as const;

/**
 * Above this zoom every marker stands on its own, which is also where the
 * detailed geometries become large enough to be worth drawing.
 */
export const MAP_CLUSTER_MAX_ZOOM = 12;
const GEOMETRY_MIN_ZOOM = MAP_CLUSTER_MAX_ZOOM + 1;

interface InitialConstructionSiteMapData {
  constructionSites: readonly ConstructionSite[];
  /** Detailed shapes; may still be in flight when the map is created. */
  geometries?: ConstructionSiteGeometries;
  currentLocation?: LngLat;
  notificationAreas: readonly NotificationArea[];
}

const CLOSURE_SEVERITY_COLOR: ExpressionSpecification = [
  "match",
  ["get", "closure"],
  "full",
  CLOSURE_SEVERITY_COLORS.full,
  "one-direction",
  CLOSURE_SEVERITY_COLORS["one-direction"],
  "obstruction",
  CLOSURE_SEVERITY_COLORS.obstruction,
  "none",
  CLOSURE_SEVERITY_COLORS.none,
  CLOSURE_SEVERITY_COLORS.unknown,
];

/** Base marker radius per zoom stop, before the severity scaling. */
const MARKER_RADIUS_STOPS: readonly [zoom: number, radius: number][] = [
  [9, 7],
  [12, 10],
  [15, 13],
];

/**
 * Severity-scaled radius for one zoom stop.
 *
 * The scaling has to live in the interpolation's *output* rather than wrap the
 * interpolation: MapLibre only accepts `zoom` at the top level of an
 * `interpolate` or `step`, so `["*", interpolate(...), ...]` is rejected.
 */
const getMarkerRadiusAtZoom = (base: number): ExpressionSpecification => [
  "match",
  ["get", "closure"],
  "full",
  Number((base * 1.2).toFixed(2)),
  "one-direction",
  Number((base * 1.05).toFixed(2)),
  Number((base * 0.95).toFixed(2)),
];

/**
 * Marker size: a zoom ramp scaled by severity, so the size repeats the colour's
 * message and so an individual marker clears the 24 px minimum touch target
 * once the clusters have dissolved.
 */
const MARKER_RADIUS: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  ...MARKER_RADIUS_STOPS.flatMap(([zoom, radius]) => [
    zoom,
    getMarkerRadiusAtZoom(radius),
  ]),
] as ExpressionSpecification;

/** Planned sites read as lighter and hollow; current ones stay solid. */
const MARKER_OPACITY: ExpressionSpecification = [
  "match",
  ["get", "phase"],
  "active",
  0.95,
  0.45,
];

/** Ring around the selected site, just outside the largest marker at any zoom. */
const SELECTION_RADIUS: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  ...MARKER_RADIUS_STOPS.flatMap(([zoom, radius]) => [zoom, radius * 1.2 + 7]),
] as ExpressionSpecification;

const MARKER_STROKE_COLOR: ExpressionSpecification = [
  "match",
  ["get", "phase"],
  "active",
  "#ffffff",
  CLOSURE_SEVERITY_COLOR,
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
    cluster: true,
    clusterMaxZoom: MAP_CLUSTER_MAX_ZOOM,
    clusterRadius: 48,
    // Lets a cluster warn about full closures without expanding it first.
    clusterProperties: {
      fullClosureCount: ["+", ["get", "isFullClosure"]],
    },
  });
  map.addSource(MAP_SOURCE_IDS.geometries, {
    type: "geojson",
    data: createConstructionSiteGeometryFeatureCollection(
      initialData.constructionSites,
      initialData.geometries,
    ),
  });
  map.addSource(MAP_SOURCE_IDS.userLocation, {
    type: "geojson",
    data: createUserLocationFeatureCollection(initialData.currentLocation),
  });
  map.addSource(MAP_SOURCE_IDS.notificationArea, {
    type: "geojson",
    data: createNotificationAreaFeatureCollection(
      initialData.notificationAreas,
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
  // The exact outlines only carry information once they are more than a pixel
  // wide; below that they just muddy the marker colours.
  map.addLayer({
    id: MAP_LAYER_IDS.areaFill,
    type: "fill",
    source: MAP_SOURCE_IDS.geometries,
    minzoom: GEOMETRY_MIN_ZOOM,
    paint: {
      "fill-color": CLOSURE_SEVERITY_COLOR,
      "fill-opacity": 0.2,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.geometryLine,
    type: "line",
    source: MAP_SOURCE_IDS.geometries,
    minzoom: GEOMETRY_MIN_ZOOM,
    paint: {
      "line-color": CLOSURE_SEVERITY_COLOR,
      "line-width": 3,
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.clusters,
    type: "circle",
    source: MAP_SOURCE_IDS.points,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#454b6b",
      "circle-radius": [
        "step",
        ["get", "point_count"],
        15,
        10,
        19,
        50,
        24,
      ],
      "circle-stroke-width": 3,
      "circle-stroke-color": [
        "case",
        [">", ["get", "fullClosureCount"], 0],
        CLOSURE_SEVERITY_COLORS.full,
        "#ffffff",
      ],
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.clusterCount,
    type: "symbol",
    source: MAP_SOURCE_IDS.points,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 13,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.points,
    type: "circle",
    source: MAP_SOURCE_IDS.points,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": CLOSURE_SEVERITY_COLOR,
      "circle-opacity": MARKER_OPACITY,
      "circle-radius": MARKER_RADIUS,
      "circle-stroke-color": MARKER_STROKE_COLOR,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.selected,
    type: "circle",
    source: MAP_SOURCE_IDS.points,
    filter: ["==", ["get", "id"], ""],
    paint: {
      "circle-color": "rgba(0, 0, 0, 0)",
      "circle-radius": SELECTION_RADIUS,
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
