import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  addConstructionSiteMapLayers,
  MAP_CLUSTER_MAX_ZOOM,
  MAP_LAYER_IDS,
  MAP_SOURCE_IDS,
} from "../src/lib/construction-site-map-layers.ts";

interface RecordedLayer {
  id: string;
  minzoom?: number;
  filter?: unknown;
}

interface RecordedSource {
  id: string;
  specification: { cluster?: boolean; clusterMaxZoom?: number };
}

function recordConstructionSiteMapLayers() {
  const sources: RecordedSource[] = [];
  const layers: RecordedLayer[] = [];
  const map = {
    addSource(id: string, specification: RecordedSource["specification"]) {
      sources.push({ id, specification });
    },
    addLayer(layer: RecordedLayer) {
      layers.push(layer);
    },
  } as unknown as MapLibreMap;

  addConstructionSiteMapLayers(map, {
    constructionSites: [],
    notificationAreas: [],
  });
  return { sources, layers };
}

describe("addConstructionSiteMapLayers", () => {
  it("adds sources and layers in the required rendering order", () => {
    const { sources, layers } = recordConstructionSiteMapLayers();

    expect(sources.map(({ id }) => id)).toEqual([
      MAP_SOURCE_IDS.points,
      MAP_SOURCE_IDS.geometries,
      MAP_SOURCE_IDS.userLocation,
      MAP_SOURCE_IDS.notificationArea,
    ]);
    expect(layers.map(({ id }) => id)).toEqual([
      MAP_LAYER_IDS.notificationAreaFill,
      MAP_LAYER_IDS.notificationAreaLine,
      MAP_LAYER_IDS.areaFill,
      MAP_LAYER_IDS.geometryLine,
      MAP_LAYER_IDS.clusters,
      MAP_LAYER_IDS.clusterCount,
      MAP_LAYER_IDS.points,
      MAP_LAYER_IDS.selected,
      MAP_LAYER_IDS.userLocation,
    ]);
  });

  it("clusters the marker source up to the zoom the geometries appear at", () => {
    const { sources, layers } = recordConstructionSiteMapLayers();
    const points = sources.find(({ id }) => id === MAP_SOURCE_IDS.points);
    const geometryLayers = layers.filter(({ id }) =>
      [MAP_LAYER_IDS.areaFill, MAP_LAYER_IDS.geometryLine].includes(
        id as typeof MAP_LAYER_IDS.areaFill,
      ),
    );

    expect(points?.specification.cluster).toBe(true);
    expect(points?.specification.clusterMaxZoom).toBe(MAP_CLUSTER_MAX_ZOOM);
    expect(geometryLayers).toHaveLength(2);
    for (const layer of geometryLayers) {
      expect(layer.minzoom).toBe(MAP_CLUSTER_MAX_ZOOM + 1);
    }
  });

  it("separates cluster bubbles from individual markers", () => {
    const { layers } = recordConstructionSiteMapLayers();
    const byId = (id: string) => layers.find((layer) => layer.id === id);

    expect(byId(MAP_LAYER_IDS.clusters)?.filter).toEqual([
      "has",
      "point_count",
    ]);
    expect(byId(MAP_LAYER_IDS.points)?.filter).toEqual([
      "!",
      ["has", "point_count"],
    ]);
  });
});
