import { useCallback, useEffect, useRef } from "react";
import {
  AttributionControl,
  LngLatBounds,
  Map,
  setWorkerUrl,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import mapLibreWorkerURL from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { ConstructionSite, LngLat } from "../types/index.ts";
import { CLOSURE_SEVERITY_COLORS } from "../lib/construction-site-labels.ts";
import { useConstructionSiteGeometries } from "../hooks/useConstructionSiteGeometries.ts";
import {
  createConstructionSiteGeometryFeatureCollection,
  createConstructionSitePointFeatureCollection,
  createNotificationAreaPolygon,
} from "../lib/map-geojson.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import "./ConstructionSiteLocationMap.css";

setWorkerUrl(mapLibreWorkerURL);

interface ConstructionSiteLocationMapProps {
  constructionSite: ConstructionSite;
}

const GEOMETRY_SOURCE_ID = "construction-site-geometry";
/** Enough context to recognize the street, without inviting panning. */
const CONTEXT_RADIUS_KM = 0.35;

/**
 * Static locator map for the detail view: where the site actually is, which is
 * the first thing a visitor wants from a page about a place. Deliberately
 * non-interactive — it is a picture, not a second explorer, so it cannot trap
 * keyboard focus or swallow page scrolling.
 */
export function ConstructionSiteLocationMap({
  constructionSite,
}: ConstructionSiteLocationMapProps) {
  const geometries = useConstructionSiteGeometries();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Read by the one-shot init effect, which must not re-run when it arrives.
  const geometriesRef = useRef(geometries);
  geometriesRef.current = geometries;

  /**
   * The exact shape once it has been loaded, the representative point until
   * then — the locator must always show *something* at the right place.
   */
  const createSiteGeometryData = useCallback(
    () =>
      geometriesRef.current?.[constructionSite.id]
        ? createConstructionSiteGeometryFeatureCollection(
            [constructionSite],
            geometriesRef.current,
          )
        : createConstructionSitePointFeatureCollection([constructionSite]),
    [constructionSite],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const bounds = new LngLatBounds();
    createNotificationAreaPolygon({
      center: constructionSite.point,
      radiusKm: CONTEXT_RADIUS_KM,
    }).coordinates[0].forEach((point) => bounds.extend(point as LngLat));

    const map = new Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    const color = CLOSURE_SEVERITY_COLORS[constructionSite.closure];
    map.on("load", () => {
      map.addSource(GEOMETRY_SOURCE_ID, {
        type: "geojson",
        data: createSiteGeometryData(),
      });
      map.addLayer({
        id: `${GEOMETRY_SOURCE_ID}-fill`,
        type: "fill",
        source: GEOMETRY_SOURCE_ID,
        paint: { "fill-color": color, "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: `${GEOMETRY_SOURCE_ID}-line`,
        type: "line",
        source: GEOMETRY_SOURCE_ID,
        paint: { "line-color": color, "line-width": 4, "line-opacity": 0.95 },
      });
      map.addLayer({
        id: `${GEOMETRY_SOURCE_ID}-point`,
        type: "circle",
        source: GEOMETRY_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": color,
          "circle-radius": 9,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 3,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [constructionSite, createSiteGeometryData]);

  useEffect(() => {
    const source = mapRef.current?.getSource(GEOMETRY_SOURCE_ID) as
      | GeoJSONSource
      | undefined;
    source?.setData(createSiteGeometryData());
  }, [createSiteGeometryData, geometries]);

  return (
    <div
      ref={containerRef}
      className="construction-site-location-map"
      role="img"
      aria-label={`Lage der Baustelle ${constructionSite.location} in ${constructionSite.municipality} auf der Karte`}
    />
  );
}
