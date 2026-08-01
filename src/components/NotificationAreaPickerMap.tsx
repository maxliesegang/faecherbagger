import { useEffect, useRef } from "react";
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
import type { LngLat } from "../types/index.ts";
import {
  createNotificationAreaFeatureCollection,
  createNotificationAreaPolygon,
  createUserLocationFeatureCollection,
} from "../lib/map-geojson.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import "./NotificationAreaPickerMap.css";

setWorkerUrl(mapLibreWorkerURL);

const AREA_SOURCE_ID = "notification-area-preview";
const CENTER_SOURCE_ID = "notification-area-center";

interface NotificationAreaPickerMapProps {
  center: LngLat;
  radiusKm: number;
  onCenterChange: (center: LngLat) => void;
}

/**
 * Pick the middle of a notification area by tapping the map.
 *
 * The centre used to be "wherever you are standing", which is the wrong default
 * for the main use case: people set this up for their home street, from the
 * office or from a desktop where geolocation is accurate to a few kilometres.
 * The circle is drawn live so the radius means something before it is saved.
 */
export function NotificationAreaPickerMap({
  center,
  radiusKm,
  onCenterChange,
}: NotificationAreaPickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const isMapReadyRef = useRef(false);
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center,
      zoom: 12,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      map.addSource(AREA_SOURCE_ID, {
        type: "geojson",
        data: createNotificationAreaFeatureCollection([{ center, radiusKm }]),
      });
      map.addLayer({
        id: `${AREA_SOURCE_ID}-fill`,
        type: "fill",
        source: AREA_SOURCE_ID,
        paint: { "fill-color": "#1d5e9e", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: `${AREA_SOURCE_ID}-line`,
        type: "line",
        source: AREA_SOURCE_ID,
        paint: {
          "line-color": "#1d5e9e",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });
      map.addSource(CENTER_SOURCE_ID, {
        type: "geojson",
        data: createUserLocationFeatureCollection(center),
      });
      map.addLayer({
        id: CENTER_SOURCE_ID,
        type: "circle",
        source: CENTER_SOURCE_ID,
        paint: {
          "circle-color": "#1d5e9e",
          "circle-radius": 8,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 3,
        },
      });
      isMapReadyRef.current = true;
    });

    map.on("click", (event) => {
      onCenterChangeRef.current([event.lngLat.lng, event.lngLat.lat]);
    });
    map.getCanvas().style.cursor = "crosshair";

    return () => {
      map.remove();
      mapRef.current = null;
      isMapReadyRef.current = false;
    };
    // The map is created once; centre and radius are pushed in by the effects
    // below, so re-creating it on every slider step is neither needed nor safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    (map.getSource(AREA_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      createNotificationAreaFeatureCollection([{ center, radiusKm }]),
    );
    (map.getSource(CENTER_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
      createUserLocationFeatureCollection(center),
    );

    const bounds = new LngLatBounds();
    createNotificationAreaPolygon({ center, radiusKm }).coordinates[0].forEach(
      (point) => bounds.extend(point as LngLat),
    );
    map.fitBounds(bounds, { padding: 32, duration: 400, maxZoom: 15 });
  }, [center, radiusKm]);

  return (
    <div
      ref={containerRef}
      className="notification-area-picker-map"
      role="application"
      aria-label="Karte: Mittelpunkt des Gebiets antippen"
    />
  );
}
