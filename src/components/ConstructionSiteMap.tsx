import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DependencyList,
} from "react";
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
  ConstructionSiteGeometries,
  LngLat,
  HomeArea,
} from "../types/index.ts";
import { loadConstructionSiteGeometries } from "../lib/construction-site-data.ts";
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
  selectedConstructionSiteId?: string;
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
  onSelectedConstructionSiteIdChange: (
    constructionSiteId: string | undefined,
  ) => void;
  getConstructionSiteDetailHref: (constructionSiteId: string) => string;
  onOpenConstructionSiteDetail: (constructionSiteId: string) => void;
  onShowList: () => void;
}

const FIT_PADDING = { top: 54, right: 54, bottom: 54, left: 54 };
const FIT_MAX_ZOOM = 14;
/** Close enough to read street names around a single point of interest. */
const DETAIL_ZOOM = 15;
const FIT_DURATION_MS = 500;
const FOCUS_DURATION_MS = 650;
/** Keeping up with a dragged radius slider, not travelling to a new place. */
const RADIUS_TRACK_DURATION_MS = 250;

/** One shared empty object, so "not loaded yet" is a stable dependency. */
const NO_GEOMETRIES: ConstructionSiteGeometries = {};

const getGeoJSONSource = (map: MapLibreMap, id: string): GeoJSONSource =>
  map.getSource(id) as GeoJSONSource;

/**
 * Runs `effect` against the map, but only once it exists and its style has
 * loaded — before that there are no sources to write to.
 *
 * Every prop-sync effect below needs that guard, and each one that forgot it
 * would throw on the first render rather than on the render that changed the
 * prop. One hook keeps the guard in a single place; `deps` is the effect's own,
 * because what each of them watches differs.
 */
function useLoadedMapEffect(
  getLoadedMap: () => MapLibreMap | null,
  effect: (map: MapLibreMap) => void,
  deps: DependencyList,
): void {
  useEffect(() => {
    const map = getLoadedMap();
    if (map) effect(map);
    // The closure is rebuilt every render; `deps` states what it actually reads.
  }, deps);
}

/** Highlights one construction site, or none when the id is undefined. */
function setSelectedConstructionSiteFilter(
  map: MapLibreMap,
  selectedConstructionSiteId?: string,
) {
  map.setFilter(MAP_LAYER_IDS.selected, [
    "==",
    ["get", "id"],
    selectedConstructionSiteId ?? "",
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
  selectedConstructionSiteId,
  currentLocation,
  homeArea,
  fitMode = "sites",
  variant = "primary",
  onSelectedConstructionSiteIdChange,
  getConstructionSiteDetailHref,
  onOpenConstructionSiteDetail,
  onShowList,
}: ConstructionSiteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const isMapReadyRef = useRef(false);

  /**
   * The detailed lines and areas, fetched the first time a map is mounted.
   *
   * They live in their own published file because they are the bulk of the data
   * and only a map ever reads them. Until they arrive — and if they never do —
   * every record is still on the map as a point, which is what carries the
   * clustering, the selection and the fit; the geometry is the detail on top.
   */
  const [geometries, setGeometries] =
    useState<ConstructionSiteGeometries>(NO_GEOMETRIES);

  useEffect(() => {
    let isMounted = true;
    void loadConstructionSiteGeometries().then(
      (loadedGeometries) => {
        if (isMounted) setGeometries(loadedGeometries);
      },
      () => {
        // Nothing to report: the map is complete without them, and a second
        // map later in the session is free to try again.
      },
    );
    return () => {
      isMounted = false;
    };
  }, []);

  // Latest props, read by the one-shot init effect and event handlers below,
  // which must not re-run when these change. Adding a value is a one-line edit.
  const latestPropsRef = useRef({
    constructionSites,
    geometries,
    selectedConstructionSiteId,
    currentLocation,
    homeArea,
    fitMode,
    onSelectedConstructionSiteIdChange,
  });
  latestPropsRef.current = {
    constructionSites,
    geometries,
    selectedConstructionSiteId,
    currentLocation,
    homeArea,
    fitMode,
    onSelectedConstructionSiteIdChange,
  };

  const selectedSite = useMemo(
    () =>
      constructionSites.find(
        (candidate) => candidate.id === selectedConstructionSiteId,
      ),
    [constructionSites, selectedConstructionSiteId],
  );

  const getLoadedMap = useCallback(
    () => (isMapReadyRef.current ? mapRef.current : null),
    [],
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
          if (id) latestPropsRef.current.onSelectedConstructionSiteIdChange(id);
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
        selectedConstructionSiteId,
        currentLocation,
        homeArea,
        fitMode,
      } = latestPropsRef.current;
      setSelectedConstructionSiteFilter(map, selectedConstructionSiteId);
      const initiallySelected = constructionSites.find(
        (site) => site.id === selectedConstructionSiteId,
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

  useLoadedMapEffect(
    getLoadedMap,
    (map) => {
      getGeoJSONSource(map, MAP_SOURCE_IDS.points).setData(
        createConstructionSitePointFeatureCollection(constructionSites),
      );
      if (fitMode === "sites") fitConstructionSites(map, constructionSites);
    },
    [constructionSites, fitMode],
  );

  // Its own effect, and deliberately without the fit above: the geometry file
  // lands some time after the first paint, and re-framing the map at that
  // moment would move it under a visitor who has already started panning.
  useLoadedMapEffect(
    getLoadedMap,
    (map) => {
      getGeoJSONSource(map, MAP_SOURCE_IDS.geometries).setData(
        createConstructionSiteGeometryFeatureCollection(
          constructionSites,
          geometries,
        ),
      );
    },
    [constructionSites, geometries],
  );

  useLoadedMapEffect(
    getLoadedMap,
    (map) => {
      getGeoJSONSource(map, MAP_SOURCE_IDS.userLocation).setData(
        createUserLocationFeatureCollection(currentLocation),
      );
      // Zooming to the device location would throw the radius out of the
      // picture, which is the one thing the area map is there to show.
      if (currentLocation && !selectedConstructionSiteId && fitMode === "sites") {
        focusPoint(map, currentLocation, FOCUS_DURATION_MS);
      }
    },
    [currentLocation, fitMode, selectedConstructionSiteId],
  );

  useLoadedMapEffect(
    getLoadedMap,
    (map) => {
      getGeoJSONSource(map, MAP_SOURCE_IDS.homeArea).setData(
        createHomeAreaFeatureCollection(homeArea),
      );
      // Follows a radius the visitor is dragging, so the circle stays framed
      // while it grows. Short enough to read as one continuous movement.
      if (fitMode === "homeArea" && homeArea) {
        fitHomeArea(map, homeArea, RADIUS_TRACK_DURATION_MS);
      }
    },
    [fitMode, homeArea],
  );

  useLoadedMapEffect(
    getLoadedMap,
    (map) => {
      setSelectedConstructionSiteFilter(map, selectedConstructionSiteId);
      if (selectedSite && fitMode === "sites") {
        focusPoint(map, selectedSite.point, FOCUS_DURATION_MS);
      }
    },
    [fitMode, selectedSite, selectedConstructionSiteId],
  );

  useEffect(() => {
    if (!selectedConstructionSiteId) return;
    const closeSelection = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        latestPropsRef.current.onSelectedConstructionSiteIdChange(undefined);
      }
    };
    window.addEventListener("keydown", closeSelection);
    return () => window.removeEventListener("keydown", closeSelection);
  }, [selectedConstructionSiteId]);

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
            onClick={onShowList}
          >
            In der Liste ansehen
          </button>
          <ClientNavigationLink
            className="map-selection__details-link"
            href={getConstructionSiteDetailHref(selectedSite.id)}
            onNavigate={() => onOpenConstructionSiteDetail(selectedSite.id)}
          >
            Detailansicht
          </ClientNavigationLink>
          <button
            type="button"
            className="map-selection__close"
            aria-label="Auswahl schließen"
            onClick={() => onSelectedConstructionSiteIdChange(undefined)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </article>
      )}
    </div>
  );
}
