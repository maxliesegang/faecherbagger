import type { Feature, FeatureCollection, Geometry } from "geojson";

/**
 * Raw feature properties as returned by the TRK GeoServer WFS for the
 * `baustellen_aktuell` and `baustellen_vorschau` layers. All fields are
 * nullable in practice; the normalizer is responsible for tightening them.
 *
 * @see https://mobil.trk.de/geoserver/TBA/ows
 */
export interface WfsBaustelleProperties {
  id: number | null;
  gemeinde: string | null;
  vorgangszeitraum_von: string | null;
  vorgangszeitraum_bis: string | null;
  art: string | null;
  lage: string | null;
  tagesbaustelle: string | null;
  verursacher: string | null;
  /** May contain raw HTML (`<br />`) and `\r\n`. */
  zusatzinfo: string | null;
  sperrung: string | null;
  projektnummer: string | null;
  vorgangsnummer: string | null;
  datenquelle: string | null;
  stand: string | null;
}

/** A single WFS feature. Geometry is `Point` for list features, otherwise the area/line geometry. */
export type WfsBaustelleFeature = Feature<Geometry | null, WfsBaustelleProperties>;

/** A WFS GetFeature response for a Baustellen layer (GeoJSON, EPSG:4326). */
export type WfsBaustelleCollection = FeatureCollection<
  Geometry | null,
  WfsBaustelleProperties
>;
