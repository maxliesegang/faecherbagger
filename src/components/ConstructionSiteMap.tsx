import { useEffect, useMemo, useRef } from "react";
import {
  AttributionControl,
  LngLatBounds,
  Map,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { Point } from "geojson";
import type {
  ConstructionSite,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import {
  getConstructionCategoryLabel,
  getClosureLabel,
  formatConstructionPeriod,
  getConstructionPhaseLabel,
} from "../lib/construction-site-labels.ts";
import {
  constructionSitesToGeometryFeatures,
  constructionSitesToPointFeatures,
  createNotificationAreaFeatureCollection,
  createNotificationAreaPolygon,
  createUserLocationFeatureCollection,
} from "../lib/map-geojson.ts";
import {
  addConstructionSiteMapLayers,
  MAP_LAYER_IDS,
  MAP_SOURCE_IDS,
} from "../lib/construction-site-map-layers.ts";
import "maplibre-gl/dist/maplibre-gl.css";
import "./ConstructionSiteMap.css";

// MapLibre 6 discovers its worker relative to the library module by default.
// After Vite bundles this lazy component, that inferred file does not exist.
setWorkerUrl(maplibreWorkerUrl);

interface ConstructionSiteMapProps {
  constructionSites: readonly ConstructionSite[];
  selectedSiteId?: string;
  currentLocation?: LngLat;
  notificationArea?: NotificationArea;
  onSiteSelect: (siteId: string) => void;
  onListViewRequest: () => void;
}

const FIT_PADDING = { top: 54, right: 54, bottom: 54, left: 54 };
const CURRENT_LOCATION_ZOOM = 15;

const getGeoJsonSource = (map: MapLibreMap, id: string): GeoJSONSource =>
  map.getSource(id) as GeoJSONSource;

function fitConstructionSites(
  map: MapLibreMap,
  constructionSites: readonly ConstructionSite[],
) {
  if (constructionSites.length === 0) return;
  if (constructionSites.length === 1) {
    map.easeTo({ center: constructionSites[0].point, zoom: 15, duration: 500 });
    return;
  }

  const bounds = new LngLatBounds();
  constructionSites.forEach((site) => bounds.extend(site.point));
  map.fitBounds(bounds, {
    padding: FIT_PADDING,
    maxZoom: 14,
    duration: 500,
  });
}

function fitNotificationArea(map: MapLibreMap, area: NotificationArea) {
  const bounds = new LngLatBounds();
  createNotificationAreaPolygon(area).coordinates[0].forEach((point) =>
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

export function ConstructionSiteMap({
  constructionSites,
  selectedSiteId,
  currentLocation,
  notificationArea,
  onSiteSelect,
  onListViewRequest,
}: ConstructionSiteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const isMapReadyRef = useRef(false);

  // Latest props, read by the one-shot init effect and event handlers below,
  // which must not re-run when these change. Adding a value is a one-line edit.
  const latestPropsRef = useRef({
    constructionSites,
    selectedSiteId,
    currentLocation,
    notificationArea,
    onSiteSelect,
  });
  latestPropsRef.current = {
    constructionSites,
    selectedSiteId,
    currentLocation,
    notificationArea,
    onSiteSelect,
  };

  const selectedSite = useMemo(
    () => constructionSites.find((site) => site.id === selectedSiteId),
    [constructionSites, selectedSiteId],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [8.4044, 49.0069],
      zoom: 9,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.addControl(
      new AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("load", () => {
      const initial = latestPropsRef.current;
      addConstructionSiteMapLayers(map, {
        constructionSites: initial.constructionSites,
        currentLocation: initial.currentLocation,
        notificationArea: initial.notificationArea,
      });

      map.on("click", MAP_LAYER_IDS.clusters, async (event) => {
        const feature = map.queryRenderedFeatures(event.point, {
          layers: [MAP_LAYER_IDS.clusters],
        })[0];
        const clusterId = feature?.properties?.cluster_id as number | undefined;
        if (clusterId === undefined) return;
        const zoom = await getGeoJsonSource(
          map,
          MAP_SOURCE_IDS.points,
        ).getClusterExpansionZoom(clusterId);
        const coordinates = (feature.geometry as Point).coordinates as [
          number,
          number,
        ];
        map.easeTo({ center: coordinates, zoom });
      });

      map.on("click", MAP_LAYER_IDS.points, (event) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        if (id) latestPropsRef.current.onSiteSelect(id);
      });

      for (const layer of [MAP_LAYER_IDS.clusters, MAP_LAYER_IDS.points]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      isMapReadyRef.current = true;
      const {
        constructionSites,
        selectedSiteId,
        currentLocation,
        notificationArea,
      } = latestPropsRef.current;
      map.setFilter(MAP_LAYER_IDS.selected, [
        "==",
        ["get", "id"],
        selectedSiteId ?? "",
      ]);
      fitConstructionSites(map, constructionSites);
      const initiallySelected = constructionSites.find(
        (site) => site.id === selectedSiteId,
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
      isMapReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    getGeoJsonSource(map, MAP_SOURCE_IDS.points).setData(
      constructionSitesToPointFeatures(constructionSites),
    );
    getGeoJsonSource(map, MAP_SOURCE_IDS.geometries).setData(
      constructionSitesToGeometryFeatures(constructionSites),
    );
    fitConstructionSites(map, constructionSites);
  }, [constructionSites]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    getGeoJsonSource(map, MAP_SOURCE_IDS.userLocation).setData(
      createUserLocationFeatureCollection(currentLocation),
    );
    if (currentLocation && !selectedSiteId) {
      focusCurrentLocation(map, currentLocation);
    }
  }, [currentLocation, selectedSiteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    getGeoJsonSource(map, MAP_SOURCE_IDS.notificationArea).setData(
      createNotificationAreaFeatureCollection(notificationArea),
    );
  }, [notificationArea]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    map.setFilter(MAP_LAYER_IDS.selected, [
      "==",
      ["get", "id"],
      selectedSiteId ?? "",
    ]);
    if (selectedSite) {
      map.easeTo({
        center: selectedSite.point,
        zoom: Math.max(map.getZoom(), 15),
        duration: 650,
      });
    }
  }, [selectedSite, selectedSiteId]);

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
            if (mapRef.current) {
              fitConstructionSites(mapRef.current, constructionSites);
            }
          }}
        >
          Alle zeigen
        </button>
      </div>

      <div
        ref={containerRef}
        className="map-explorer__map"
        role="region"
        aria-label={`Karte mit ${constructionSites.length} Baustellen`}
      />

      {selectedSite && (
        <article className="map-selection" aria-live="polite">
          <div className="map-selection__content">
            <div className="map-selection__eyebrow">
              {getConstructionPhaseLabel(selectedSite.phase)} · {selectedSite.municipality}
            </div>
            <h3>{selectedSite.location}</h3>
            <p>
              {getConstructionCategoryLabel(selectedSite.category)} ·{" "}
              {getClosureLabel(selectedSite.closure)}
            </p>
            <p>
              {formatConstructionPeriod(selectedSite.startDate, selectedSite.endDate)}
            </p>
          </div>
          <button
            type="button"
            className="map-selection__list-button"
            onClick={onListViewRequest}
          >
            In der Liste ansehen
          </button>
        </article>
      )}
    </div>
  );
}
