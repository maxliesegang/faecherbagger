import type {
  ExpressionSpecification,
  FilterSpecification,
  Map as MapLibreMap,
  SymbolLayerSpecification,
} from "maplibre-gl";

/**
 * How watched areas look on a map, shared by the overview map and the setup
 * picker so a place looks the same in both.
 */

export const NOTIFICATION_AREA_COLOR = "#2459a9";

/**
 * The corridor band is opaque and drawn beneath the basemap's roads: a
 * translucent line darkens wherever its own segments overlap (every bend of a
 * real route), and beneath the roads the streets along the route stay legible.
 * These are the area colour blended onto the basemap's background.
 */
export const NOTIFICATION_AREA_CORRIDOR_COLOR = "#c6d4ec";
export const NOTIFICATION_AREA_CORRIDOR_COLOR_SUBTLE = "#e1e8f4";

/** The basemap's first road layer, to slide the corridor band beneath. */
export function findBasemapRoadLayerId(map: MapLibreMap): string | undefined {
  return map
    .getStyle()
    .layers.find(
      (layer) =>
        "source-layer" in layer && layer["source-layer"] === "transportation",
    )?.id;
}

/** Circles and outlines; corridors are lines and get the band instead. */
export const NOTIFICATION_AREA_POLYGON_FILTER: FilterSpecification = [
  "==",
  ["geometry-type"],
  "Polygon",
];

export const NOTIFICATION_AREA_CORRIDOR_FILTER: FilterSpecification = [
  "==",
  ["geometry-type"],
  "LineString",
];

/**
 * The corridor's ground width in pixels: `bandWidthAtZoomZero · 2^zoom`.
 * An exponential interpolation with base 2 between zoom 0 and 24 is exactly
 * that curve, and the only form MapLibre accepts for zoom-driven widths.
 */
export const NOTIFICATION_AREA_CORRIDOR_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  0,
  ["get", "bandWidthAtZoomZero"],
  24,
  ["*", ["get", "bandWidthAtZoomZero"], 2 ** 24],
];

export const NOTIFICATION_AREA_LABEL_FILTER: FilterSpecification = [
  "all",
  ["==", ["geometry-type"], "Point"],
  ["has", "label"],
];

/**
 * Area names in the area colour on a white halo, set just above their anchor
 * point. Always shown: the name is what ties a shape on the map to the place
 * in the list, so it must not be the label that loses a collision.
 */
export const NOTIFICATION_AREA_LABEL_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": ["get", "label"],
  "text-font": ["Noto Sans Bold"],
  "text-size": 12,
  "text-letter-spacing": 0.02,
  "text-anchor": "bottom",
  "text-offset": [0, -0.3],
  "text-allow-overlap": true,
};

export const NOTIFICATION_AREA_LABEL_PAINT: SymbolLayerSpecification["paint"] = {
  "text-color": NOTIFICATION_AREA_COLOR,
  "text-halo-color": "#ffffff",
  "text-halo-width": 2,
};
