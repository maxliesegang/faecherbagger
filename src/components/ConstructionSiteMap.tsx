import { useEffect, useMemo, useRef } from "react";
import { KernButton, KernIcon } from "@kern-ux-annex/kern-react-kit";
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
  CLOSURE_SEVERITY_COLORS,
  CLOSURE_SEVERITIES,
  getConstructionCategoryLabel,
  getClosureHeadline,
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
  type NotificationAreaShape,
} from "../lib/map-geojson.ts";
import { useConstructionSiteGeometries } from "../hooks/useConstructionSiteGeometries.ts";
import {
  addConstructionSiteMapLayers,
  MAP_CLUSTER_MAX_ZOOM,
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
  notificationAreas: readonly NotificationArea[];
  onSiteSelect: (siteId: string | undefined) => void;
  getSiteDetailsHref: (siteId: string) => string;
  onSiteDetailsRequest: (siteId: string) => void;
  onListViewRequest: () => void;
}

const FIT_PADDING = { top: 54, right: 54, bottom: 54, left: 54 };
/**
 * How much of the surroundings a shared location opens up. A walkable/short-ride
 * radius answers "what is going on around me" far better than the region-wide
 * fit, which renders as one indistinct mass of markers.
 */
const NEARBY_RADIUS_KM = 3;

const getGeoJSONSource = (map: MapLibreMap, id: string): GeoJSONSource =>
  map.getSource(id) as GeoJSONSource;

/** Severities the legend explains; `"unknown"` carries no useful colour cue. */
const LEGEND_SEVERITIES = CLOSURE_SEVERITIES.filter(
  (closure) => closure !== "unknown",
);

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

function fitRadius(
  map: MapLibreMap,
  area: NotificationAreaShape,
  duration: number,
) {
  const bounds = new LngLatBounds();
  createNotificationAreaPolygon(area).coordinates[0].forEach((point) =>
    bounds.extend(point as LngLat),
  );
  map.fitBounds(bounds, {
    padding: FIT_PADDING,
    maxZoom: 15,
    duration,
  });
}

/** Opens the map on everything the visitor is watching. */
function fitNotificationAreas(
  map: MapLibreMap,
  areas: readonly NotificationArea[],
) {
  if (areas.length === 1) {
    fitRadius(map, areas[0], 500);
    return;
  }
  const bounds = new LngLatBounds();
  for (const area of areas) {
    createNotificationAreaPolygon(area).coordinates[0].forEach((point) =>
      bounds.extend(point as LngLat),
    );
  }
  map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 15, duration: 500 });
}

function focusCurrentLocation(
  map: MapLibreMap,
  location: LngLat,
  duration = 650,
) {
  fitRadius(map, { center: location, radiusKm: NEARBY_RADIUS_KM }, duration);
}

export function ConstructionSiteMap({
  constructionSites,
  selectedSiteId,
  currentLocation,
  notificationAreas,
  onSiteSelect,
  getSiteDetailsHref,
  onSiteDetailsRequest,
  onListViewRequest,
}: ConstructionSiteMapProps) {
  const geometries = useConstructionSiteGeometries();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const isMapReadyRef = useRef(false);

  // Latest props, read by the one-shot init effect and event handlers below,
  // which must not re-run when these change. Adding a value is a one-line edit.
  const latestPropsRef = useRef({
    constructionSites,
    geometries,
    selectedSiteId,
    currentLocation,
    notificationAreas,
    onSiteSelect,
  });
  latestPropsRef.current = {
    constructionSites,
    geometries,
    selectedSiteId,
    currentLocation,
    notificationAreas,
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
        geometries: initial.geometries,
        currentLocation: initial.currentLocation,
        notificationAreas: initial.notificationAreas,
      });

      const interactiveSiteLayers = [
        MAP_LAYER_IDS.areaFill,
        MAP_LAYER_IDS.geometryLine,
        MAP_LAYER_IDS.points,
      ] as const;
      for (const layer of interactiveSiteLayers) {
        map.on("click", layer, (event) => {
          const id = event.features?.[0]?.properties?.id as string | undefined;
          if (id) latestPropsRef.current.onSiteSelect(id);
        });
      }

      // Tapping a cluster zooms to the level where it breaks apart, which is
      // the only useful thing it can do and saves a round of pinch-zooming.
      map.on("click", MAP_LAYER_IDS.clusters, (event) => {
        const feature = event.features?.[0];
        const clusterId = feature?.properties?.cluster_id as number | undefined;
        if (clusterId === undefined || feature?.geometry.type !== "Point") {
          return;
        }
        const center = feature.geometry.coordinates as LngLat;
        void getGeoJSONSource(map, MAP_SOURCE_IDS.points)
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => map.easeTo({ center, zoom, duration: 500 }))
          .catch(() =>
            map.easeTo({
              center,
              zoom: MAP_CLUSTER_MAX_ZOOM + 1,
              duration: 500,
            }),
          );
      });

      for (const layer of [...interactiveSiteLayers, MAP_LAYER_IDS.clusters]) {
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
        notificationAreas,
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
        focusCurrentLocation(map, currentLocation, 0);
      } else if (notificationAreas.length > 0) {
        fitNotificationAreas(map, notificationAreas);
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
    fitConstructionSites(map, constructionSites);
  }, [constructionSites]);

  // Separate from the point update: geometry arrives later than the records and
  // must not drag a viewport refit along when it does.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    getGeoJSONSource(map, MAP_SOURCE_IDS.geometries).setData(
      createConstructionSiteGeometryFeatureCollection(
        constructionSites,
        geometries,
      ),
    );
  }, [constructionSites, geometries]);

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
      createNotificationAreaFeatureCollection(notificationAreas),
    );
  }, [notificationAreas]);

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
      {/*
        The markers live in a canvas and cannot be reached with the keyboard.
        Rather than leave that as a dead end, the list view is offered as the
        equivalent — visible on focus only, like a skip link.
      */}
      <button
        type="button"
        className="map-explorer__list-hint"
        onClick={onListViewRequest}
      >
        Karte nicht mit der Tastatur bedienbar – zur Liste wechseln
      </button>

      <div className="map-explorer__toolbar">
        <ul className="map-legend" aria-label="Legende: Farbe zeigt die Sperrung">
          {LEGEND_SEVERITIES.map((closure) => (
            <li key={closure}>
              <i
                className="map-legend__dot"
                style={{ background: CLOSURE_SEVERITY_COLORS[closure] }}
              />
              {getClosureLabel(closure)}
            </li>
          ))}
          <li>
            <i className="map-legend__dot map-legend__dot--upcoming" />
            Geplant
          </li>
          {currentLocation && (
            <li>
              <i className="map-legend__dot map-legend__dot--location" />
              Mein Standort
            </li>
          )}
          {notificationAreas.length > 0 && (
            <li>
              <i className="map-legend__radius" />
              {notificationAreas.length === 1
                ? `Mein Gebiet (${notificationAreas[0].radiusKm} km)`
                : `Meine Gebiete (${notificationAreas.length})`}
            </li>
          )}
        </ul>
        <KernButton
          type="button"
          variant="tertiary"
          className="map-explorer__fit"
          label="Alle zeigen"
          onClick={() => {
            if (mapRef.current) {
              fitConstructionSites(mapRef.current, constructionSites);
            }
          }}
        />
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
            {/* Same lead answer as the detail page, so the two agree. */}
            <p className="map-selection__verdict">
              {getClosureHeadline(selectedSite.closure)}
            </p>
            <p>{getConstructionCategoryLabel(selectedSite.category)}</p>
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
            Details ansehen
          </a>
          <button
            type="button"
            className="map-selection__close"
            aria-label="Auswahl schließen"
            onClick={() => onSiteSelect(undefined)}
          >
            <KernIcon icon="close" />
          </button>
        </article>
      )}
    </div>
  );
}
