import type { Geometry } from "geojson";

/** Date-only string in the Europe/Berlin calendar, e.g. `"2026-07-24"`. */
export type ISODate = string;

/** ISO-8601 timestamp, e.g. `"2026-07-23T22:00:00Z"`. */
export type ISOTimestamp = string;

/** WGS84 position in GeoJSON order: `[longitude, latitude]`. */
export type LngLat = [number, number];

/**
 * The visitor's surroundings: an anonymous area centred on a WGS84 point they
 * chose. It scopes the primary screen and, when notifications are on, is what
 * the push service matches new construction sites against.
 */
export interface HomeArea {
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
export type ConstructionPhase = "active" | "upcoming";

/**
 * Normalized construction category, mapped from the free-form `art` field.
 * `"other"` is the fallback for values not in the mapping table; unknown `art`
 * strings are logged at build time so the table can be extended.
 */
export type ConstructionCategory =
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
 * {@link CLOSURE_SEVERITY_SORT_RANK} table gives the sort order (`"none"` lowest,
 * `"full"` highest). `"unknown"` represents a null `sperrung`.
 */
export type ClosureSeverity =
  | "none" // keine Verkehrsbehinderung
  | "obstruction" // mit Verkehrsbehinderung
  | "one-direction" // mit Sperrung in eine Fahrtrichtung
  | "full" // mit Vollsperrung
  | "unknown";

/** Sort ranks for {@link ClosureSeverity}; higher means more disruptive. */
export const CLOSURE_SEVERITY_SORT_RANK: Record<ClosureSeverity, number> = {
  none: 0,
  obstruction: 1,
  "one-direction": 2,
  full: 3,
  unknown: -1,
};

/** Site mobility, mapped from `tagesbaustelle`; `null` when unspecified. */
export type ConstructionSiteMobility = "stationary" | "mobile" | null;

/**
 * A single deduplicated construction site (one per `vorgangsnummer`).
 *
 * The Alsace/France records (which carry a null `gemeinde` and a null
 * `vorgangsnummer`) are excluded upstream, so `municipality` and `id` are
 * always present here.
 */
export interface ConstructionSite {
  /** Stable logical key: the TRK `vorgangsnummer` (a string, e.g. `"2026V2026"`). */
  id: string;
  phase: ConstructionPhase;
  category: ConstructionCategory;
  /** The original `art` value, kept for tooltips and reviewing `"other"`. */
  artRaw: string;
  closure: ClosureSeverity;
  siteType: ConstructionSiteMobility;

  /** Municipality (`gemeinde`). */
  municipality: string;
  /** Free-text location (`lage`), trimmed. */
  location: string;
  /** Notes (`zusatzinfo`), sanitized to plain text; `null` when empty. */
  notes: string | null;
  /** Responsible party (`verursacher`); `null` when empty. */
  cause: string | null;

  /** Start date (`vorgangszeitraum_von`), Europe/Berlin calendar date. */
  startDate: ISODate;
  /** End date (`vorgangszeitraum_bis`); `null` when open-ended. */
  endDate: ISODate | null;

  /** Representative point for lists and distance (mean of member points). */
  point: LngLat;
  /** Full geometry for the map: all non-point parts (GeometryCollection if many). */
  geometry: Geometry;

  /** Attribution: the source authority (`datenquelle`, e.g. `"Stadt Karlsruhe"`). */
  source: string;
  /**
   * Source last-modified timestamp (`stand`), canonicalized to exact ISO
   * precision by the normalizer so plain string comparison is chronological.
   */
  lastModified: ISOTimestamp;
  /**
   * When this pipeline first saw the record, stamped once and carried forward
   * across runs.
   *
   * The source publishes no creation date, so this is the only way to tell a
   * genuinely new construction site from an edited old one. It is what the push
   * pipeline notifies on — an edit to a record someone already knows about is
   * not worth interrupting them for.
   */
  firstSeenAt: ISOTimestamp;
}

/**
 * A record as it comes out of normalization, before the pipeline stamps
 * {@link ConstructionSite.firstSeenAt} onto it. Normalization sees one WFS
 * response and cannot know whether a record is new, so the type makes that
 * missing step explicit instead of leaving a placeholder value behind.
 */
export type NormalizedConstructionSite = Omit<ConstructionSite, "firstSeenAt">;

/** Contents of `data/meta.json`. */
export interface ConstructionSiteMetadata {
  /** When the pipeline fetched the data. */
  fetchedAt: ISOTimestamp;
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

/** One newly appeared construction site, as published in `data/changes.json`. */
export interface ConstructionSiteAdditionEntry {
  /** `vorgangsnummer` of the construction site. */
  id: string;
  /** The site's `lastModified` (`stand`), repeated so consumers need one file. */
  lastModified: ISOTimestamp;
  /** The site's `firstSeenAt`; equal to `lastModified` is not implied. */
  firstSeenAt: ISOTimestamp;
}

/**
 * Contents of `data/changes.json`: the construction sites the pipeline first
 * saw inside the published window, newest first.
 *
 * A window over `firstSeenAt`, not over `stand` and not a diff of the whole
 * dataset. It carries additions only, because that is the app's single
 * definition of "neu" and the only thing the push pipeline is willing to
 * interrupt someone for; a source edit to a known record is not in here.
 *
 * The app does not read this file; it reads `baustellen.json` and applies the
 * visitor's own window (see `selectRecentConstructionSites`).
 */
export interface ConstructionSiteAdditions {
  /** When the pipeline produced this file; matches `meta.json`. */
  fetchedAt: ISOTimestamp;
  /** Length of the published window in days. */
  windowDays: number;
  /** Start of the published window: `fetchedAt` minus `windowDays`. */
  since: ISOTimestamp;
  /** Sites with `firstSeenAt >= since`, newest first. */
  added: ConstructionSiteAdditionEntry[];
}
