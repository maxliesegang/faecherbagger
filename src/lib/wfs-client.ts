import type {
  ConstructionPhase,
  WFSConstructionSiteFeatureCollection,
} from "../types/index.ts";

export const WFS_ENDPOINT_URL = "https://mobil.trk.de/geoserver/TBA/ows";

/** WFS type names for the two operational construction-site layers. */
export const WFS_LAYER_NAME_BY_PHASE: Readonly<
  Record<ConstructionPhase, string>
> = {
  active: "TBA:baustellen_aktuell",
  upcoming: "TBA:baustellen_vorschau",
};

/**
 * Properties requested via `propertyName`. `geom` must be listed explicitly —
 * GeoServer drops the geometry otherwise. `projektnummer` is omitted (it is
 * only a project year and is not used).
 */
const WFS_PROPERTY_NAMES = [
  "geom",
  "id",
  "gemeinde",
  "vorgangszeitraum_von",
  "vorgangszeitraum_bis",
  "art",
  "lage",
  "tagesbaustelle",
  "verursacher",
  "zusatzinfo",
  "sperrung",
  "vorgangsnummer",
  "datenquelle",
  "stand",
] as const;

/**
 * Excludes Alsace/France at the source: those records have a null `gemeinde`
 * (correlating 1:1 with `datenquelle = "Collectivité européenne d'Alsace"`).
 */
const CONSTRUCTION_SITE_CQL_FILTER = "gemeinde IS NOT NULL";

/** Builds a WFS 1.0.0 GetFeature URL requesting GeoJSON in EPSG:4326. */
export function createWFSRequestURL(typeName: string): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    // Server reprojects correctly to WGS84 with GeoJSON [lon, lat] axis order,
    // so no client-side proj4 step is needed.
    srsName: "EPSG:4326",
    propertyName: WFS_PROPERTY_NAMES.join(","),
    CQL_FILTER: CONSTRUCTION_SITE_CQL_FILTER,
  });
  return `${WFS_ENDPOINT_URL}?${params.toString()}`;
}

/** Fetches and parses one construction-site layer as GeoJSON. */
export async function fetchConstructionSiteLayer(
  phase: ConstructionPhase,
  fetchImpl: typeof fetch = fetch,
): Promise<WFSConstructionSiteFeatureCollection> {
  const layerName = WFS_LAYER_NAME_BY_PHASE[phase];
  const requestURL = createWFSRequestURL(layerName);
  const response = await fetchImpl(requestURL);
  if (!response.ok) {
    throw new Error(
      `WFS request for ${layerName} failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as WFSConstructionSiteFeatureCollection;
}
