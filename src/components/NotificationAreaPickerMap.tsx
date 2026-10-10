import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  LngLatBounds,
  Map,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import mapLibreWorkerURL from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import {
  TerraDraw,
  TerraDrawFreehandLineStringMode,
  TerraDrawFreehandMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { FeatureCollection, Point } from "geojson";
import type { LngLat } from "../types/index.ts";
import {
  createNotificationAreaFeatureCollection,
  getNotificationAreaOutline,
  type NotificationAreaShape,
} from "../lib/map-geojson.ts";
import {
  findBasemapRoadLayerId,
  NOTIFICATION_AREA_COLOR,
  NOTIFICATION_AREA_CORRIDOR_COLOR,
  NOTIFICATION_AREA_CORRIDOR_FILTER,
  NOTIFICATION_AREA_CORRIDOR_WIDTH,
  NOTIFICATION_AREA_POLYGON_FILTER,
} from "../lib/notification-area-map-style.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import "./NotificationAreaPickerMap.css";

setWorkerUrl(mapLibreWorkerURL);

const AREA_SOURCE_ID = "notification-area-preview";
const MARKER_SOURCE_ID = "notification-area-markers";
const MATCH_SOURCE_ID = "notification-area-matches";

/** What a finger or mouse drag draws while the draw mode is on. */
export type PickerDrawMode = "polygon" | "line";

const TERRA_DRAW_MODE: Record<PickerDrawMode, string> = {
  polygon: "freehand",
  line: "freehand-linestring",
};

export interface PickerMarker {
  point: LngLat;
  /** Shown inside the marker: "A"/"B" for a route, empty for a centre. */
  text: string;
}

interface NotificationAreaPickerMapProps {
  /** The area as it stands; `undefined` while there is nothing to show yet. */
  shape: NotificationAreaShape | undefined;
  markers: readonly PickerMarker[];
  /** Sites the area would currently match, as feedback for every kind. */
  matchingPoints: readonly LngLat[];
  /** Taps on the map, or `undefined` when a tap means nothing here. */
  onMapClick?: (point: LngLat) => void;
  /** The draw button; none when `undefined`. */
  drawAction?: { label: string; mode: PickerDrawMode };
  drawMode: PickerDrawMode | undefined;
  onDrawModeChange: (drawMode: PickerDrawMode | undefined) => void;
  /** Called with the finished line or outline (ring without closing point). */
  onDrawComplete: (coordinates: LngLat[]) => void;
  /** The visible rectangle, south-west then north-east, after every move. */
  onViewportChange?: (bounds: [LngLat, LngLat]) => void;
  /** Where to look before there is a shape. */
  initialCenter: LngLat;
  ariaLabel: string;
}

const createMarkerFeatureCollection = (
  markers: readonly PickerMarker[],
): FeatureCollection<Point, { text: string }> => ({
  type: "FeatureCollection",
  features: markers.map((marker) => ({
    type: "Feature",
    properties: { text: marker.text },
    geometry: { type: "Point", coordinates: marker.point },
  })),
});

const createMatchFeatureCollection = (
  points: readonly LngLat[],
): FeatureCollection<Point> => ({
  type: "FeatureCollection",
  features: points.map((point) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: point },
  })),
});

/**
 * The map in the area setup: shows the area as it stands, takes taps, and
 * switches into a one-shot draw mode.
 *
 * Draw mode is a deliberate, visible state rather than a toggle that stays on:
 * the button starts it, one stroke draws, lifting the finger finishes it and
 * the map is a map again. While it is on, one finger draws and two fingers
 * still zoom, the frame is coloured and a banner says what to do, so nobody
 * pans by accident or wonders why the map stopped moving.
 */
export function NotificationAreaPickerMap({
  shape,
  markers,
  matchingPoints,
  onMapClick,
  drawAction,
  drawMode,
  onDrawModeChange,
  onDrawComplete,
  onViewportChange,
  initialCenter,
  ariaLabel,
}: NotificationAreaPickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const callbacksRef = useRef({
    onMapClick,
    onDrawComplete,
    onDrawModeChange,
    onViewportChange,
  });
  callbacksRef.current = {
    onMapClick,
    onDrawComplete,
    onDrawModeChange,
    onViewportChange,
  };
  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: initialCenter,
      zoom: 12,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    const reportViewport = () => {
      const bounds = map.getBounds();
      callbacksRef.current.onViewportChange?.([
        [bounds.getWest(), bounds.getSouth()],
        [bounds.getEast(), bounds.getNorth()],
      ]);
    };

    map.on("load", () => {
      map.addSource(AREA_SOURCE_ID, {
        type: "geojson",
        data: createNotificationAreaFeatureCollection([]),
      });
      const basemapRoadLayerId = findBasemapRoadLayerId(map);
      map.addLayer(
        {
          id: `${AREA_SOURCE_ID}-corridor-outline`,
          type: "line",
          source: AREA_SOURCE_ID,
          filter: NOTIFICATION_AREA_CORRIDOR_FILTER,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": NOTIFICATION_AREA_COLOR,
            "line-width": 1.5,
            "line-gap-width": NOTIFICATION_AREA_CORRIDOR_WIDTH,
          },
        },
        basemapRoadLayerId,
      );
      map.addLayer(
        {
          id: `${AREA_SOURCE_ID}-corridor`,
          type: "line",
          source: AREA_SOURCE_ID,
          filter: NOTIFICATION_AREA_CORRIDOR_FILTER,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": NOTIFICATION_AREA_CORRIDOR_COLOR,
            "line-width": NOTIFICATION_AREA_CORRIDOR_WIDTH,
          },
        },
        basemapRoadLayerId,
      );
      map.addLayer({
        id: `${AREA_SOURCE_ID}-fill`,
        type: "fill",
        source: AREA_SOURCE_ID,
        filter: NOTIFICATION_AREA_POLYGON_FILTER,
        paint: { "fill-color": NOTIFICATION_AREA_COLOR, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: `${AREA_SOURCE_ID}-line`,
        type: "line",
        source: AREA_SOURCE_ID,
        layout: { "line-join": "round" },
        paint: {
          "line-color": NOTIFICATION_AREA_COLOR,
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });
      map.addSource(MATCH_SOURCE_ID, {
        type: "geojson",
        data: createMatchFeatureCollection([]),
      });
      map.addLayer({
        id: MATCH_SOURCE_ID,
        type: "circle",
        source: MATCH_SOURCE_ID,
        paint: {
          "circle-color": "#c2410c",
          "circle-radius": 4,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1.5,
        },
      });
      map.addSource(MARKER_SOURCE_ID, {
        type: "geojson",
        data: createMarkerFeatureCollection([]),
      });
      map.addLayer({
        id: MARKER_SOURCE_ID,
        type: "circle",
        source: MARKER_SOURCE_ID,
        paint: {
          "circle-color": NOTIFICATION_AREA_COLOR,
          "circle-radius": ["case", ["==", ["get", "text"], ""], 8, 11],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: `${MARKER_SOURCE_ID}-text`,
        type: "symbol",
        source: MARKER_SOURCE_ID,
        layout: {
          "text-field": ["get", "text"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#fff" },
      });

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawFreehandMode({
            drawInteraction: "click-drag",
            minDistance: 8,
            keyEvents: null,
            styles: {
              fillColor: NOTIFICATION_AREA_COLOR,
              fillOpacity: 0.15,
              outlineColor: NOTIFICATION_AREA_COLOR,
              outlineWidth: 3,
            },
          }),
          new TerraDrawFreehandLineStringMode({
            drawInteraction: "click-drag",
            minDistance: 8,
            keyEvents: null,
            styles: {
              lineStringColor: NOTIFICATION_AREA_COLOR,
              lineStringWidth: 4,
            },
          }),
        ],
      });
      draw.start();
      draw.on("finish", (id) => {
        const feature = draw.getSnapshotFeature(id);
        draw.clear();
        callbacksRef.current.onDrawModeChange(undefined);
        if (!feature) return;
        const { geometry } = feature;
        if (geometry.type === "Polygon") {
          const ring = (geometry.coordinates[0] ?? []) as LngLat[];
          callbacksRef.current.onDrawComplete(ring.slice(0, -1));
        } else if (geometry.type === "LineString") {
          callbacksRef.current.onDrawComplete(geometry.coordinates as LngLat[]);
        }
      });
      drawRef.current = draw;
      setIsMapReady(true);
      reportViewport();
    });

    map.on("moveend", reportViewport);
    map.on("click", (event) => {
      if (drawModeRef.current) return;
      callbacksRef.current.onMapClick?.([event.lngLat.lng, event.lngLat.lat]);
    });

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
      setIsMapReady(false);
    };
    // Created once; everything else is pushed in by the effects below, so
    // re-creating the map on every slider step is neither needed nor safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !isMapReady) return;
    draw.clear();
    draw.setMode(drawMode ? TERRA_DRAW_MODE[drawMode] : "static");
  }, [drawMode, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    map.getCanvas().style.cursor = drawMode
      ? "crosshair"
      : onMapClick
        ? "pointer"
        : "";
  }, [drawMode, onMapClick, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    (map.getSource(AREA_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      createNotificationAreaFeatureCollection(shape ? [shape] : []),
    );
    (map.getSource(MARKER_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      createMarkerFeatureCollection(markers),
    );
    (map.getSource(MATCH_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      createMatchFeatureCollection(matchingPoints),
    );

    // Follow the area, so a new radius or a route that was just calculated
    // is in view. A shapeless area (municipality, street) frames its matches.
    const outline =
      (shape && getNotificationAreaOutline(shape)) ??
      (matchingPoints.length > 0 ? matchingPoints : markers.map(({ point }) => point));
    if (outline.length === 0) return;
    const bounds = new LngLatBounds();
    outline.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, { padding: 40, duration: 400, maxZoom: 15 });
    // `markers` and `matchingPoints` derive from `shape` in the caller, except
    // for a route's first marker, which arrives with the second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    (map.getSource(MARKER_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      createMarkerFeatureCollection(markers),
    );
  }, [markers, isMapReady]);

  return (
    <div
      className="notification-area-picker"
      data-drawing={drawMode ? "true" : undefined}
      onKeyDown={(event) => {
        // Escape leaves draw mode first; only a second one closes the dialog.
        if (event.key === "Escape" && drawMode) {
          event.stopPropagation();
          event.preventDefault();
          onDrawModeChange(undefined);
        }
      }}
    >
      <div
        ref={containerRef}
        className="notification-area-picker-map"
        role="application"
        aria-label={ariaLabel}
      />
      {drawMode ? (
        <div className="notification-area-picker__banner" role="status">
          <span>
            {drawMode === "polygon"
              ? "Mit Finger oder Maus umranden. Loslassen beendet."
              : "Strecke mit Finger oder Maus nachziehen. Loslassen beendet."}
          </span>
          <button
            type="button"
            className="notification-area-picker__banner-action"
            onClick={() => onDrawModeChange(undefined)}
          >
            Abbrechen
          </button>
        </div>
      ) : (
        drawAction && (
          <button
            type="button"
            className="notification-area-picker__draw"
            disabled={!isMapReady}
            onClick={() => onDrawModeChange(drawAction.mode)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                fill="currentColor"
              />
            </svg>
            {drawAction.label}
          </button>
        )
      )}
    </div>
  );
}
