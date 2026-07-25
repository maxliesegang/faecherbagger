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
import mapLibreWorkerURL from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
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
  createConstructionSiteGeometryFeatureCollection,
  createConstructionSitePointFeatureCollection,
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

// Bundle the worker and its shared module dependency into one deployable asset.
setWorkerUrl(mapLibreWorkerURL);

interface ConstructionSiteMapProps {
  constructionSites: readonly ConstructionSite[];
  selectedSiteId?: string;
  currentLocation?: LngLat;
  notificationArea?: NotificationArea;
  onSiteSelect: (siteId: string | undefined) => void;
  getSiteDetailsHref: (siteId: string) => string;
  onSiteDetailsRequest: (siteId: string) => void;
  onListViewRequest: () => void;
}

const FIT_PADDING = { top: 54, right: 54, bottom: 54, left: 54 };
const CURRENT_LOCATION_ZOOM = 15;

const getGeoJSONSource = (map: MapLibreMap, id: string): GeoJSONSource =>
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
  getSiteDetailsHref,
  onSiteDetailsRequest,
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

      const interactiveGeometryLayers = [
        MAP_LAYER_IDS.areaFill,
        MAP_LAYER_IDS.geometryLine,
        MAP_LAYER_IDS.geometryPoints,
      ] as const;
      for (const layer of interactiveGeometryLayers) {
        map.on("click", layer, (event) => {
          const id = event.features?.[0]?.properties?.id as string | undefined;
          if (id) latestPropsRef.current.onSiteSelect(id);
        });
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
    getGeoJSONSource(map, MAP_SOURCE_IDS.points).setData(
      createConstructionSitePointFeatureCollection(constructionSites),
    );
    getGeoJSONSource(map, MAP_SOURCE_IDS.geometries).setData(
      createConstructionSiteGeometryFeatureCollection(constructionSites),
    );
    fitConstructionSites(map, constructionSites);
  }, [constructionSites]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    getGeoJSONSource(map, MAP_SOURCE_IDS.userLocation).setData(
      createUserLocationFeatureCollection(currentLocation),
    );
    if (currentLocation && !selectedSiteId) {
      focusCurrentLocation(map, currentLocation);
    }
  }, [currentLocation, selectedSiteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    getGeoJSONSource(map, MAP_SOURCE_IDS.notificationArea).setData(
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

  useEffect(() => {
    if (!selectedSiteId) return;
    const closeSelection = (event: KeyboardEvent) => {
      if (event.key === "Escape") latestPropsRef.current.onSiteSelect(undefined);
    };
    window.addEventListener("keydown", closeSelection);
    return () => window.removeEventListener("keydown", closeSelection);
  }, [selectedSiteId]);

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
              {getConstructionPhaseLabel(selectedSite.phase)} ·{" "}
              {selectedSite.municipality}
            </div>
            <h3>{selectedSite.location}</h3>
            <p>
              {getConstructionCategoryLabel(selectedSite.category)} ·{" "}
              {getClosureLabel(selectedSite.closure)}
            </p>
            <p>
              {formatConstructionPeriod(
                selectedSite.startDate,
                selectedSite.endDate,
              )}
            </p>
            {selectedSite.notes && (
              <p className="map-selection__notes">{selectedSite.notes}</p>
            )}
          </div>
          <button
            type="button"
            className="map-selection__list-button"
            onClick={onListViewRequest}
          >
            In der Liste ansehen
          </button>
          <a
            className="map-selection__details-link"
            href={getSiteDetailsHref(selectedSite.id)}
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              onSiteDetailsRequest(selectedSite.id);
            }}
          >
            Detailansicht
          </a>
          <button
            type="button"
            className="map-selection__close"
            aria-label="Auswahl schließen"
            onClick={() => onSiteSelect(undefined)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </article>
      )}
    </div>
  );
}
