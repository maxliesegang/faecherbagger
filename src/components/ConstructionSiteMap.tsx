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
  HomeArea,
} from "../types/index.ts";
import {
  getConstructionCategoryLabel,
  getClosureLabel,
  formatConstructionPeriod,
  getConstructionPhaseLabel,
} from "../shared/construction-site-labels.ts";
import {
  createConstructionSiteGeometryFeatureCollection,
  createConstructionSitePointFeatureCollection,
  createHomeAreaFeatureCollection,
  createHomeAreaPolygon,
  createUserLocationFeatureCollection,
} from "../lib/map-geojson.ts";
import {
  addConstructionSiteMapLayers,
  MAP_LAYER_IDS,
  MAP_SOURCE_IDS,
} from "../lib/construction-site-map-layers.ts";
import { ClientNavigationLink } from "./ClientNavigationLink.tsx";
import "maplibre-gl/dist/maplibre-gl.css";
import "./ConstructionSiteMap.css";

// Bundle the worker and its shared module dependency into one deployable asset.
setWorkerUrl(mapLibreWorkerURL);

export interface ConstructionSiteMapProps {
  constructionSites: readonly ConstructionSite[];
  selectedSiteId?: string;
  currentLocation?: LngLat;
  homeArea?: HomeArea;
  /**
   * `"sites"` frames the records — the explorer's job, where the result set is
   * the subject. `"homeArea"` frames the circle and keeps it framed, because
   * there the map exists to show how far the radius reaches; a record outside it
   * must be allowed to sit outside the picture.
   */
  fitMode?: "sites" | "homeArea";
  /** `"compact"` is the inline map above a list, at a fraction of the height. */
  variant?: "primary" | "compact";
  onSiteSelect: (siteId: string | undefined) => void;
  getSiteDetailsHref: (siteId: string) => string;
  onSiteDetailsRequest: (siteId: string) => void;
  onListViewRequest: () => void;
}

const FIT_PADDING = { top: 54, right: 54, bottom: 54, left: 54 };
const FIT_MAX_ZOOM = 14;
/** Close enough to read street names around a single point of interest. */
const DETAIL_ZOOM = 15;
const FIT_DURATION_MS = 500;
const FOCUS_DURATION_MS = 650;
/** Keeping up with a dragged radius slider, not travelling to a new place. */
const RADIUS_TRACK_DURATION_MS = 250;

const getGeoJSONSource = (map: MapLibreMap, id: string): GeoJSONSource =>
  map.getSource(id) as GeoJSONSource;

/** Highlights one construction site, or none when the id is undefined. */
function setSelectedSiteFilter(map: MapLibreMap, selectedSiteId?: string) {
  map.setFilter(MAP_LAYER_IDS.selected, [
    "==",
    ["get", "id"],
    selectedSiteId ?? "",
  ]);
}

/** Moves to one point without ever zooming further out than the viewer is. */
function focusPoint(map: MapLibreMap, point: LngLat, durationMs: number) {
  map.easeTo({
    center: point,
    zoom: Math.max(map.getZoom(), DETAIL_ZOOM),
    duration: durationMs,
  });
}

function fitBounds(
  map: MapLibreMap,
  bounds: LngLatBounds,
  durationMs = FIT_DURATION_MS,
) {
  map.fitBounds(bounds, {
    padding: FIT_PADDING,
    maxZoom: FIT_MAX_ZOOM,
    duration: durationMs,
  });
}

function fitConstructionSites(
  map: MapLibreMap,
  constructionSites: readonly ConstructionSite[],
) {
  if (constructionSites.length === 0) return;
  if (constructionSites.length === 1) {
    map.easeTo({
      center: constructionSites[0].point,
      zoom: DETAIL_ZOOM,
      duration: FIT_DURATION_MS,
    });
    return;
  }

  const bounds = new LngLatBounds();
  constructionSites.forEach((site) => bounds.extend(site.point));
  fitBounds(map, bounds);
}

function fitHomeArea(
  map: MapLibreMap,
  area: HomeArea,
  durationMs = FIT_DURATION_MS,
) {
  const bounds = new LngLatBounds();
  createHomeAreaPolygon(area).coordinates[0].forEach((point) =>
    bounds.extend(point as LngLat),
  );
  fitBounds(map, bounds, durationMs);
}

export function ConstructionSiteMap({
  constructionSites,
  selectedSiteId,
  currentLocation,
  homeArea,
  fitMode = "sites",
  variant = "primary",
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
    homeArea,
    fitMode,
    onSiteSelect,
  });
  latestPropsRef.current = {
    constructionSites,
    selectedSiteId,
    currentLocation,
    homeArea,
    fitMode,
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
        homeArea: initial.homeArea,
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
        homeArea,
        fitMode,
      } = latestPropsRef.current;
      setSelectedSiteFilter(map, selectedSiteId);
      const initiallySelected = constructionSites.find(
        (site) => site.id === selectedSiteId,
      );
      if (fitMode === "homeArea" && homeArea) {
        fitHomeArea(map, homeArea, 0);
        return;
      }
      fitConstructionSites(map, constructionSites);
      if (initiallySelected) {
        focusPoint(map, initiallySelected.point, 0);
      } else if (currentLocation) {
        focusPoint(map, currentLocation, FOCUS_DURATION_MS);
      } else if (homeArea) {
        fitHomeArea(map, homeArea);
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
    if (fitMode === "sites") fitConstructionSites(map, constructionSites);
  }, [constructionSites, fitMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    getGeoJSONSource(map, MAP_SOURCE_IDS.userLocation).setData(
      createUserLocationFeatureCollection(currentLocation),
    );
    // Zooming to the device location would throw the radius out of the picture,
    // which is the one thing the area map is there to show.
    if (currentLocation && !selectedSiteId && fitMode === "sites") {
      focusPoint(map, currentLocation, FOCUS_DURATION_MS);
    }
  }, [currentLocation, fitMode, selectedSiteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    getGeoJSONSource(map, MAP_SOURCE_IDS.homeArea).setData(
      createHomeAreaFeatureCollection(homeArea),
    );
    // Follows a radius the visitor is dragging, so the circle stays framed
    // while it grows. Short enough to read as one continuous movement.
    if (fitMode === "homeArea" && homeArea) {
      fitHomeArea(map, homeArea, RADIUS_TRACK_DURATION_MS);
    }
  }, [fitMode, homeArea]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;
    setSelectedSiteFilter(map, selectedSiteId);
    if (selectedSite && fitMode === "sites") {
      focusPoint(map, selectedSite.point, FOCUS_DURATION_MS);
    }
  }, [fitMode, selectedSite, selectedSiteId]);

  useEffect(() => {
    if (!selectedSiteId) return;
    const closeSelection = (event: KeyboardEvent) => {
      if (event.key === "Escape") latestPropsRef.current.onSiteSelect(undefined);
    };
    window.addEventListener("keydown", closeSelection);
    return () => window.removeEventListener("keydown", closeSelection);
  }, [selectedSiteId]);

  const isAreaMap = fitMode === "homeArea";

  return (
    <div className={`map-explorer map-explorer--${variant}`}>
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
          {homeArea && (
            <span>
              <i className="map-legend__radius" />
              Umkreis ({homeArea.radiusKm} km)
            </span>
          )}
        </div>
        <button
          type="button"
          className="map-explorer__fit"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            if (isAreaMap && homeArea) {
              fitHomeArea(map, homeArea);
              return;
            }
            fitConstructionSites(map, constructionSites);
          }}
        >
          {isAreaMap ? "Umkreis zeigen" : "Alle zeigen"}
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
          <ClientNavigationLink
            className="map-selection__details-link"
            href={getSiteDetailsHref(selectedSite.id)}
            onNavigate={() => onSiteDetailsRequest(selectedSite.id)}
          >
            Detailansicht
          </ClientNavigationLink>
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
