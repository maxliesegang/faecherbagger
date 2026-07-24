import type { Geometry } from "geojson";

/** Date-only string in the Europe/Berlin calendar, e.g. `"2026-07-24"`. */
export type IsoDate = string;

/** ISO-8601 timestamp, e.g. `"2026-07-23T22:00:00Z"`. */
export type IsoTimestamp = string;

/** WGS84 position in GeoJSON order: `[longitude, latitude]`. */
export type LngLat = [number, number];

/** Anonymous notification area centered on a user-selected WGS84 point. */
export interface NotificationArea {
  center: LngLat;
  radiusKm: number;
}

/**
 * Lifecycle phase of a construction site.
 *
 * Derived from the source WFS layer (`baustellen_aktuell` -> `"active"`,
 * `baustellen_vorschau` -> `"upcoming"`) and cross-checked against the dates,
 * so the UI can filter on it independently of the source layer.
 */
export type Phase = "active" | "upcoming";

/**
 * Normalized construction category, mapped from the free-form `art` field.
 * `"other"` is the fallback for values not in the mapping table; unknown `art`
 * strings are logged at build time so the table can be extended.
 */
export type Category =
  | "special-use" // Bauliche Sondernutzung
  | "power-telecom" // Strom bzw. TK-Versorgung
  | "district-heating" // Fernwärmeversorgung
  | "gas-water" // Gas bzw. Wasserversorgung
  | "road-construction" // Straßenbau
  | "road-maintenance" // Straßenunterhaltung
  | "sewer" // Kanalbau
  | "rail" // Gleisbau
  | "bridge" // Brückenbau
  | "tunnel" // Tunnelbau / Tunnelwartung / Tunnel
  | "retaining-wall" // Stützwand
  | "demolition" // Abbruch/Rückbau
  | "stop-rebuild" // Haltestellenumbau mit Straßenumgestaltung
  | "traffic-reroute" // geänderte Verkehrsführung im Zuge von Baumaßnahmen
  | "crane" // Kraneinsatz
  | "soil-survey" // Baugrunduntersuchung
  | "green-maintenance" // Grünpflegearbeiten
  | "other";

/**
 * Closure severity, mapped from the `sperrung` field. Ordinal: the
 * {@link CLOSURE_SEVERITY_RANK} table gives the sort order (`"none"` lowest,
 * `"full"` highest). `"unknown"` represents a null `sperrung`.
 */
export type ClosureSeverity =
  | "none" // keine Verkehrsbehinderung
  | "obstruction" // mit Verkehrsbehinderung
  | "one-direction" // mit Sperrung in eine Fahrtrichtung
  | "full" // mit Vollsperrung
  | "unknown";

/** Sort ranks for {@link ClosureSeverity}; higher means more disruptive. */
export const CLOSURE_SEVERITY_RANK: Record<ClosureSeverity, number> = {
  none: 0,
  obstruction: 1,
  "one-direction": 2,
  full: 3,
  unknown: -1,
};

/** Site mobility, mapped from `tagesbaustelle`; `null` when unspecified. */
export type SiteType = "stationary" | "mobile" | null;

/**
 * A single deduplicated construction site (one per `vorgangsnummer`).
 *
 * The Alsace/France records (which carry a null `gemeinde` and a null
 * `vorgangsnummer`) are excluded upstream, so `municipality` and `id` are
 * always present here.
 */
export interface Baustelle {
  /** Stable logical key: the TRK `vorgangsnummer` (a string, e.g. `"2026V2026"`). */
  id: string;
  phase: Phase;
  category: Category;
  /** The original `art` value, kept for tooltips and reviewing `"other"`. */
  artRaw: string;
  closure: ClosureSeverity;
  siteType: SiteType;

  /** Municipality (`gemeinde`). */
  municipality: string;
  /** Free-text location (`lage`), trimmed. */
  location: string;
  /** Notes (`zusatzinfo`), sanitized to plain text; `null` when empty. */
  notes: string | null;
  /** Responsible party (`verursacher`); `null` when empty. */
  cause: string | null;

  /** Start date (`vorgangszeitraum_von`), Europe/Berlin calendar date. */
  startDate: IsoDate;
  /** End date (`vorgangszeitraum_bis`); `null` when open-ended. */
  endDate: IsoDate | null;

  /** Representative point for lists and distance (mean of member points). */
  point: LngLat;
  /** Full geometry for the map: all non-point parts (GeometryCollection if many). */
  geometry: Geometry;

  /** Attribution: the source authority (`datenquelle`, e.g. `"Stadt Karlsruhe"`). */
  source: string;
  /** Source last-modified timestamp (`stand`); change-detection key with `id`. */
  lastModified: IsoTimestamp;
}

/** Contents of `data/meta.json`. */
export interface Meta {
  /** When the pipeline fetched the data. */
  fetchedAt: IsoTimestamp;
  /** Total deduplicated records in `baustellen.json`. */
  recordCount: number;
  counts: {
    active: number;
    upcoming: number;
  };
  source: {
    name: string;
    url: string;
    layers: string[];
  };
  /** Distinct `datenquelle` values present, for attribution in the UI. */
  attribution: string[];
}

/**
 * Contents of `data/changes.json`: what changed relative to the previous run.
 * All arrays hold `vorgangsnummer` values. Basis for later notifications.
 */
export interface Changes {
  /** `fetchedAt` of the previous run, or `null` on the first run. */
  since: IsoTimestamp | null;
  added: string[];
  modified: string[];
  removed: string[];
}
