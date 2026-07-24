import type { Phase, WfsBaustelleCollection } from "../types/index.ts";

export const WFS_BASE = "https://mobil.trk.de/geoserver/TBA/ows";

/** WFS type names for the two operational Baustellen layers and their phase. */
export const LAYERS: Readonly<Record<Phase, string>> = {
  active: "TBA:baustellen_aktuell",
  upcoming: "TBA:baustellen_vorschau",
};

/**
 * Properties requested via `propertyName`. `geom` must be listed explicitly —
 * GeoServer drops the geometry otherwise. `projektnummer` is omitted (it is
 * only a project year and is not used).
 */
const PROPERTY_NAMES = [
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
const CQL_FILTER = "gemeinde IS NOT NULL";

/** Builds a WFS 1.0.0 GetFeature URL requesting GeoJSON in EPSG:4326. */
export function buildWfsUrl(typeName: string): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName,
    outputFormat: "application/json",
    // Server reprojects correctly to WGS84 with GeoJSON [lon, lat] axis order,
    // so no client-side proj4 step is needed.
    srsName: "EPSG:4326",
    propertyName: PROPERTY_NAMES.join(","),
    CQL_FILTER,
  });
  return `${WFS_BASE}?${params.toString()}`;
}

/** Fetches and parses one Baustellen layer as a GeoJSON FeatureCollection. */
export async function fetchLayer(
  phase: Phase,
  fetchImpl: typeof fetch = fetch,
): Promise<WfsBaustelleCollection> {
  const url = buildWfsUrl(LAYERS[phase]);
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `WFS request for ${LAYERS[phase]} failed: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as WfsBaustelleCollection;
}
