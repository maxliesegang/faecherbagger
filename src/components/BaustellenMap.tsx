import { useEffect, useMemo, useRef } from "react";
import maplibregl, {
  LngLatBounds,
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import type { Point } from "geojson";
import type {
  Baustelle,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import {
  categoryLabel,
  closureLabel,
  formatPeriod,
  phaseLabel,
} from "../lib/labels.ts";
import {
  notificationAreaGeoJson,
  notificationAreaPolygon,
  recordsToGeometries,
  recordsToPoints,
  userLocationGeoJson,
} from "../lib/map-data.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import "./BaustellenMap.css";

interface Props {
  records: Baustelle[];
  selectedId?: string;
  currentLocation?: LngLat;
  notificationArea?: NotificationArea;
  onSelect: (id: string) => void;
  onShowList: () => void;
}

const POINT_SOURCE = "baustellen-points";
const GEOMETRY_SOURCE = "baustellen-geometries";
const USER_LOCATION_SOURCE = "user-location";
const NOTIFICATION_AREA_SOURCE = "notification-area";
const ACTIVE_COLOR = "#1d5e9e";
const UPCOMING_COLOR = "#ad6800";
const FIT_PADDING = { top: 54, right: 54, bottom: 54, left: 54 };
const CURRENT_LOCATION_ZOOM = 15;

/** Data-driven paint color: {@link ACTIVE_COLOR} for active sites, else upcoming. */
const phaseColor: ExpressionSpecification = [
  "match",
  ["get", "phase"],
  "active",
  ACTIVE_COLOR,
  UPCOMING_COLOR,
];

const geoJsonSource = (map: MapLibreMap, id: string): GeoJSONSource =>
  map.getSource(id) as GeoJSONSource;

function fitRecords(map: MapLibreMap, records: readonly Baustelle[]) {
  if (records.length === 0) return;
  if (records.length === 1) {
    map.easeTo({ center: records[0].point, zoom: 15, duration: 500 });
    return;
  }

  const bounds = new LngLatBounds();
  records.forEach((record) => bounds.extend(record.point));
  map.fitBounds(bounds, {
    padding: FIT_PADDING,
    maxZoom: 14,
    duration: 500,
  });
}

function fitNotificationArea(map: MapLibreMap, area: NotificationArea) {
  const bounds = new LngLatBounds();
  notificationAreaPolygon(area).coordinates[0].forEach((point) =>
    bounds.extend(point as LngLat),
  );
  map.fitBounds(bounds, {
    padding: FIT_PADDING,
    maxZoom: 14,
    duration: 500,
  });
}

function focusCurrentLocation(map: MapLibreMap, location: LngLat) {
  map.easeTo({
    center: location,
    zoom: Math.max(map.getZoom(), CURRENT_LOCATION_ZOOM),
    duration: 650,
  });
}

export function BaustellenMap({
  records,
  selectedId,
  currentLocation,
  notificationArea,
  onSelect,
  onShowList,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapReadyRef = useRef(false);

  // Latest props, read by the one-shot init effect and event handlers below,
  // which must not re-run when these change. Adding a value is a one-line edit.
  const latest = useRef({
    records,
    selectedId,
    currentLocation,
    notificationArea,
    onSelect,
  });
  latest.current = {
    records,
    selectedId,
    currentLocation,
    notificationArea,
    onSelect,
  };

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId),
    [records, selectedId],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [8.4044, 49.0069],
      zoom: 9,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("load", () => {
      const initial = latest.current;
      map.addSource(POINT_SOURCE, {
        type: "geojson",
        data: recordsToPoints(initial.records),
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 42,
      });
      map.addSource(GEOMETRY_SOURCE, {
        type: "geojson",
        data: recordsToGeometries(initial.records),
      });
      map.addSource(USER_LOCATION_SOURCE, {
        type: "geojson",
        data: userLocationGeoJson(initial.currentLocation),
      });
      map.addSource(NOTIFICATION_AREA_SOURCE, {
        type: "geojson",
        data: notificationAreaGeoJson(initial.notificationArea),
      });

      map.addLayer({
        id: "notification-area-fill",
        type: "fill",
        source: NOTIFICATION_AREA_SOURCE,
        paint: {
          "fill-color": "#2459a9",
          "fill-opacity": 0.035,
        },
      });
      map.addLayer({
        id: "notification-area-line",
        type: "line",
        source: NOTIFICATION_AREA_SOURCE,
        paint: {
          "line-color": "#2459a9",
          "line-width": 1,
          "line-opacity": 0.55,
          "line-dasharray": [2, 2],
        },
      });
      map.addLayer({
        id: "baustellen-area-fill",
        type: "fill",
        source: GEOMETRY_SOURCE,
        minzoom: 12,
        paint: {
          "fill-color": phaseColor,
          "fill-opacity": 0.2,
        },
      });
      map.addLayer({
        id: "baustellen-geometry-line",
        type: "line",
        source: GEOMETRY_SOURCE,
        minzoom: 11,
        paint: {
          "line-color": phaseColor,
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "baustellen-clusters",
        type: "circle",
        source: POINT_SOURCE,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#454b6b",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            20,
            23,
            75,
            29,
          ],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "baustellen-cluster-count",
        type: "symbol",
        source: POINT_SOURCE,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 13,
        },
        paint: { "text-color": "#fff" },
      });
      map.addLayer({
        id: "baustellen-points",
        type: "circle",
        source: POINT_SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": phaseColor,
          "circle-radius": 7,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "baustellen-selected",
        type: "circle",
        source: POINT_SOURCE,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-color": "#fff",
          "circle-radius": 12,
          "circle-stroke-color": "#1d1d1b",
          "circle-stroke-width": 4,
        },
      });
      map.addLayer({
        id: "user-location",
        type: "circle",
        source: USER_LOCATION_SOURCE,
        paint: {
          "circle-color": "#fff",
          "circle-radius": 7,
          "circle-stroke-color": "#2459a9",
          "circle-stroke-width": 4,
        },
      });

      map.on("click", "baustellen-clusters", async (event) => {
        const feature = map.queryRenderedFeatures(event.point, {
          layers: ["baustellen-clusters"],
        })[0];
        const clusterId = feature?.properties?.cluster_id as number | undefined;
        if (clusterId === undefined) return;
        const zoom = await geoJsonSource(
          map,
          POINT_SOURCE,
        ).getClusterExpansionZoom(clusterId);
        const coordinates = (feature.geometry as Point).coordinates as [
          number,
          number,
        ];
        map.easeTo({ center: coordinates, zoom });
      });

      map.on("click", "baustellen-points", (event) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        if (id) latest.current.onSelect(id);
      });

      for (const layer of ["baustellen-clusters", "baustellen-points"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      mapReadyRef.current = true;
      const {
        records,
        selectedId,
        currentLocation,
        notificationArea,
      } = latest.current;
      map.setFilter("baustellen-selected", [
        "==",
        ["get", "id"],
        selectedId ?? "",
      ]);
      fitRecords(map, records);
      const initiallySelected = records.find(
        (record) => record.id === selectedId,
      );
      if (initiallySelected) {
        map.easeTo({ center: initiallySelected.point, zoom: 15, duration: 0 });
      } else if (currentLocation) {
        focusCurrentLocation(map, currentLocation);
      } else if (notificationArea) {
        fitNotificationArea(map, notificationArea);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    geoJsonSource(map, POINT_SOURCE).setData(recordsToPoints(records));
    geoJsonSource(map, GEOMETRY_SOURCE).setData(recordsToGeometries(records));
    fitRecords(map, records);
  }, [records]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    geoJsonSource(map, USER_LOCATION_SOURCE).setData(
      userLocationGeoJson(currentLocation),
    );
    if (currentLocation && !selectedId) {
      focusCurrentLocation(map, currentLocation);
    }
  }, [currentLocation, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    geoJsonSource(map, NOTIFICATION_AREA_SOURCE).setData(
      notificationAreaGeoJson(notificationArea),
    );
  }, [notificationArea]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    map.setFilter("baustellen-selected", [
      "==",
      ["get", "id"],
      selectedId ?? "",
    ]);
    if (selected) {
      map.easeTo({
        center: selected.point,
        zoom: Math.max(map.getZoom(), 15),
        duration: 650,
      });
    }
  }, [selected, selectedId]);

  return (
    <div className="map-explorer">
      <div className="map-explorer__toolbar">
        <div className="map-legend" aria-label="Legende">
          <span>
            <i className="map-legend__dot map-legend__dot--active" />
            Aktuell
          </span>
          <span>
            <i className="map-legend__dot map-legend__dot--upcoming" />
            Geplant
          </span>
          <span className="map-legend__hint">
            Gruppen anklicken, um hineinzuzoomen
          </span>
          {currentLocation && (
            <span>
              <i className="map-legend__dot map-legend__dot--location" />
              Mein Standort
            </span>
          )}
          {notificationArea && (
            <span>
              <i className="map-legend__radius" />
              Benachrichtigungsradius ({notificationArea.radiusKm} km)
            </span>
          )}
        </div>
        <button
          type="button"
          className="map-explorer__fit"
          onClick={() => {
            if (mapRef.current) fitRecords(mapRef.current, records);
          }}
        >
          Alle zeigen
        </button>
      </div>

      <div
        ref={containerRef}
        className="map-explorer__map"
        role="region"
        aria-label={`Karte mit ${records.length} Baustellen`}
      />

      {selected && (
        <article className="map-selection" aria-live="polite">
          <div className="map-selection__content">
            <div className="map-selection__eyebrow">
              {phaseLabel(selected.phase)} · {selected.municipality}
            </div>
            <h3>{selected.location}</h3>
            <p>
              {categoryLabel(selected.category)} ·{" "}
              {closureLabel(selected.closure)}
            </p>
            <p>{formatPeriod(selected.startDate, selected.endDate)}</p>
          </div>
          <button
            type="button"
            className="map-selection__list-button"
            onClick={onShowList}
          >
            In der Liste ansehen
          </button>
        </article>
      )}
    </div>
  );
}
