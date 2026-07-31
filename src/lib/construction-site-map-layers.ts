import type {
  ExpressionSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import type {
  ConstructionSite,
  ConstructionSiteGeometries,
  LngLat,
  HomeArea,
} from "../types/index.ts";
import {
  createConstructionSiteGeometryFeatureCollection,
  createConstructionSitePointFeatureCollection,
  createHomeAreaFeatureCollection,
  createUserLocationFeatureCollection,
} from "./map-geojson.ts";

export const MAP_SOURCE_IDS = {
  points: "baustellen-points",
  geometries: "baustellen-geometries",
  userLocation: "user-location",
  homeArea: "home-area",
} as const;

export const MAP_LAYER_IDS = {
  homeAreaFill: "home-area-fill",
  homeAreaLine: "home-area-line",
  areaFill: "baustellen-area-fill",
  geometryLine: "baustellen-geometry-line",
  geometryPoints: "baustellen-geometry-points",
  selected: "baustellen-selected",
  userLocation: "user-location",
} as const;

interface InitialConstructionSiteMapData {
  constructionSites: readonly ConstructionSite[];
  /** Usually empty on the first paint: geometry arrives in its own file. */
  geometries: ConstructionSiteGeometries;
  currentLocation?: LngLat;
  homeArea?: HomeArea;
}

/**
 * The map palette. MapLibre paint properties cannot read CSS custom properties,
 * so these are the one place the WebGL side spells the colours out — the same
 * values as the `--phase-*` and `--map-home-area` tokens in `src/App.css`, which
 * the legend and the rest of the UI use. Change a colour in both or the legend
 * stops describing the map.
 */
const MAP_COLORS = {
  phaseActive: "#1d5e9e",
  phaseUpcoming: "#ad6800",
  /** The home-area circle and the device location, which are both "you". */
  homeArea: "#2459a9",
  surface: "#fff",
  selectedOutline: "#1d1d1b",
} as const;

const CONSTRUCTION_PHASE_COLOR: ExpressionSpecification = [
  "match",
  ["get", "phase"],
  "active",
  MAP_COLORS.phaseActive,
  MAP_COLORS.phaseUpcoming,
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
      initialData.geometries,
    ),
  });
  map.addSource(MAP_SOURCE_IDS.userLocation, {
    type: "geojson",
    data: createUserLocationFeatureCollection(initialData.currentLocation),
  });
  map.addSource(MAP_SOURCE_IDS.homeArea, {
    type: "geojson",
    data: createHomeAreaFeatureCollection(
      initialData.homeArea,
    ),
  });

  map.addLayer({
    id: MAP_LAYER_IDS.homeAreaFill,
    type: "fill",
    source: MAP_SOURCE_IDS.homeArea,
    paint: {
      "fill-color": MAP_COLORS.homeArea,
      "fill-opacity": 0.035,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.homeAreaLine,
    type: "line",
    source: MAP_SOURCE_IDS.homeArea,
    paint: {
      "line-color": MAP_COLORS.homeArea,
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
      "circle-stroke-color": MAP_COLORS.surface,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.selected,
    type: "circle",
    source: MAP_SOURCE_IDS.points,
    filter: ["==", ["get", "id"], ""],
    paint: {
      "circle-color": MAP_COLORS.surface,
      "circle-radius": 12,
      "circle-stroke-color": MAP_COLORS.selectedOutline,
      "circle-stroke-width": 4,
    },
  });
  map.addLayer({
    id: MAP_LAYER_IDS.userLocation,
    type: "circle",
    source: MAP_SOURCE_IDS.userLocation,
    paint: {
      "circle-color": MAP_COLORS.surface,
      "circle-radius": 7,
      "circle-stroke-color": MAP_COLORS.homeArea,
      "circle-stroke-width": 4,
    },
  });
}
