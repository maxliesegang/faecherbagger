import type { Geometry } from "geojson";

/** Date-only string in the Europe/Berlin calendar, e.g. `"2026-07-24"`. */
export type ISODate = string;

/** ISO-8601 timestamp, e.g. `"2026-07-23T22:00:00Z"`. */
export type ISOTimestamp = string;

/** WGS84 position in GeoJSON order: `[longitude, latitude]`. */
export type LngLat = [number, number];

/**
 * Anonymous notification area centered on a user-selected WGS84 point.
 *
 * People watch more than one place — home and work, or a school route — so a
 * subscription carries a list of these rather than a single circle.
 */
export interface NotificationArea {
  /** Stable local identity, so an area can be edited and removed. */
  id: string;
  /** User-supplied name ("Zuhause"), shown wherever the area is listed. */
  label: string;
  center: LngLat;
  radiusKm: number;
}

/**
 * What a notification can be about.
 *
 * `new` alone — which is all the first version sent — misses the two things
 * people actually asked to hear: a long-announced site that is about to start
 * next to them, and a closure that got worse or longer.
 */
export type NotificationEventKind = "new" | "starts-soon" | "changed";

/**
 * How disruptive a site has to be before it is worth a notification.
 *
 * `unknown` severity always passes: the source occasionally leaves `sperrung`
 * empty on real full closures, and a missed full closure costs more than a
 * surplus notification.
 */
export type NotificationSeverityThreshold = "all" | "obstruction" | "closure";

/**
 * Everything a subscriber has chosen about what they want to hear about.
 *
 * This never leaves the device. The notification service stores only a push
 * endpoint; which of a run's events are worth showing is decided in the service
 * worker, so no server ever learns where anyone lives.
 */
export interface NotificationPreferences {
  areas: NotificationArea[];
  kinds: NotificationEventKind[];
  minSeverity: NotificationSeverityThreshold;
}

/**
 * One announceable event, carrying everything needed to decide whether it
 * matters to a given device and to word the notification.
 *
 * Self-contained by design: the service worker matches against this file alone
 * rather than downloading the full record set every time a push arrives.
 */
export interface NotificationFeedEvent {
  kind: NotificationEventKind;
  /**
   * Identity of the event, used as the sender's "already announced" key.
   *
   * It includes whatever would make the event worth sending again: a site whose
   * start date moves re-arms its reminder, one whose closure changes again
   * produces a second `changed` event, but a re-run of the same data produces
   * nothing.
   */
  signature: string;
  siteId: string;
  point: LngLat;
  closure: ClosureSeverity;
  startDate: ISODate;
  endDate: ISODate | null;
  municipality: string;
  location: string;
}

/** Contents of `data/ereignisse.json`: what this run has to announce. */
export interface NotificationFeed {
  generatedAt: ISOTimestamp;
  events: NotificationFeedEvent[];
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

  /** Attribution: the source authority (`datenquelle`, e.g. `"Stadt Karlsruhe"`). */
  source: string;
  /** Source last-modified timestamp (`stand`); change-detection key with `id`. */
  lastModified: ISOTimestamp;
}

/**
 * A record plus its full map geometry, as the pipeline builds it before writing
 * the two output files. Only the pipeline sees both halves at once.
 */
export interface ConstructionSiteWithGeometry extends ConstructionSite {
  /** Full geometry for the map: all non-point parts (GeometryCollection if many). */
  geometry: Geometry;
}

/**
 * Contents of `data/baustellen-geometrie.json`: map geometry keyed by site `id`.
 *
 * Split out of `baustellen.json` because it is by far the largest part of the
 * payload and only the map needs it — every list, search, sort and distance
 * surface works off {@link ConstructionSite.point}. The map chunk is lazily
 * imported, so this file is only fetched once a map is actually shown.
 */
export type ConstructionSiteGeometries = Record<string, Geometry>;

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

/**
 * A modification worth telling someone about.
 *
 * `modified` only says that the source's `stand` moved, which happens for
 * typo fixes too. Notifications need to know whether the *period* or the
 * *closure* changed, so the diff records those explicitly along with the
 * previous values, which are otherwise gone once the run overwrites the data.
 */
export interface ConstructionSiteModification {
  id: string;
  changedFields: ("period" | "closure")[];
  previousClosure: ClosureSeverity;
  previousStartDate: ISODate;
  previousEndDate: ISODate | null;
}

/**
 * Contents of `data/changes.json`: what changed relative to the previous run.
 * `added`, `modified` and `removed` hold `vorgangsnummer` values.
 */
export interface ConstructionSiteChanges {
  /** `fetchedAt` of the previous run, or `null` on the first run. */
  since: ISOTimestamp | null;
  added: string[];
  modified: string[];
  removed: string[];
  /** Subset of `modified` where a field a visitor cares about changed. */
  relevantModifications: ConstructionSiteModification[];
}
