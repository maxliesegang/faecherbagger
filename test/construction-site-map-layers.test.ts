import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  addConstructionSiteMapLayers,
  MAP_LAYER_IDS,
  MAP_SOURCE_IDS,
} from "../src/lib/construction-site-map-layers.ts";

describe("addConstructionSiteMapLayers", () => {
  it("adds sources and layers in the required rendering order", () => {
    const sourceIds: string[] = [];
    const layerIds: string[] = [];
    const map = {
      addSource(id: string) {
        sourceIds.push(id);
      },
      addLayer(layer: { id: string }) {
        layerIds.push(layer.id);
      },
    } as unknown as MapLibreMap;

    addConstructionSiteMapLayers(map, { constructionSites: [] });

    expect(sourceIds).toEqual([
      MAP_SOURCE_IDS.points,
      MAP_SOURCE_IDS.geometries,
      MAP_SOURCE_IDS.userLocation,
      MAP_SOURCE_IDS.homeArea,
    ]);
    expect(layerIds).toEqual([
      MAP_LAYER_IDS.homeAreaFill,
      MAP_LAYER_IDS.homeAreaLine,
      MAP_LAYER_IDS.areaFill,
      MAP_LAYER_IDS.geometryLine,
      MAP_LAYER_IDS.geometryPoints,
      MAP_LAYER_IDS.selected,
      MAP_LAYER_IDS.userLocation,
    ]);
  });
});
