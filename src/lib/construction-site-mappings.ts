import type {
  ConstructionCategory,
  ConstructionSiteMobility,
  ClosureSeverity,
} from "../types/index.ts";

/**
 * Maps the source system's free-form `art` vocabulary to normalized
 * {@link ConstructionCategory} values.
 *
 * Only the German (non-Alsace) vocabulary is listed: after excluding Alsace,
 * the observed `art` values are entirely German. French codes
 * (`AK5_encours`, `KC1-route-inondee`, `Travaux`, ...) belong exclusively to
 * Alsace records, which are filtered out before normalization. Anything not
 * listed here falls back to `"other"` and is reported via `onUnknownArt`.
 */
export const CONSTRUCTION_CATEGORY_BY_SOURCE_ART: Readonly<Record<string, ConstructionCategory>> = {
  "Bauliche Sondernutzung": "special-use",
  "Strom bzw. TK-Versorgung": "power-telecom",
  Fernwärmeversorgung: "district-heating",
  "Gas bzw. Wasserversorgung": "gas-water",
  Straßenbau: "road-construction",
  Straßenunterhaltung: "road-maintenance",
  Kanalbau: "sewer",
  Gleisbau: "rail",
  Brückenbau: "bridge",
  Tunnel: "tunnel",
  Tunnelbau: "tunnel",
  Tunnelwartung: "tunnel",
  Stützwand: "retaining-wall",
  "Abbruch/Rückbau": "demolition",
  "Haltestellenumbau mit Straßenumgestaltung": "stop-rebuild",
  "geänderte Verkehrsführung im Zuge von Baumaßnahmen": "traffic-reroute",
  Kraneinsatz: "crane",
  Baugrunduntersuchung: "soil-survey",
  Grünpflegearbeiten: "green-maintenance",
};

/** Maps the `sperrung` vocabulary to {@link ClosureSeverity}; null -> `"unknown"`. */
export const CLOSURE_SEVERITY_BY_SOURCE_VALUE: Readonly<Record<string, ClosureSeverity>> = {
  "keine Verkehrsbehinderung": "none",
  "mit Verkehrsbehinderung": "obstruction",
  "mit Sperrung in eine Fahrtrichtung": "one-direction",
  "mit Vollsperrung": "full",
};

/** Maps `tagesbaustelle` to {@link ConstructionSiteMobility}; null -> `null`. */
export const CONSTRUCTION_SITE_TYPE_BY_SOURCE_VALUE: Readonly<
  Record<string, ConstructionSiteMobility>
> = {
  "Stationäre Baustelle": "stationary",
  Wanderbaustelle: "mobile",
};

export function normalizeConstructionCategory(
  art: string | null,
  onUnknown?: (art: string) => void,
): ConstructionCategory {
  if (art == null) return "other";
  const category = CONSTRUCTION_CATEGORY_BY_SOURCE_ART[art];
  if (category === undefined) {
    onUnknown?.(art);
    return "other";
  }
  return category;
}

export function normalizeClosureSeverity(sperrung: string | null): ClosureSeverity {
  if (sperrung == null) return "unknown";
  return CLOSURE_SEVERITY_BY_SOURCE_VALUE[sperrung] ?? "unknown";
}

export function normalizeConstructionSiteType(
  tagesbaustelle: string | null,
): ConstructionSiteMobility {
  if (tagesbaustelle == null) return null;
  return CONSTRUCTION_SITE_TYPE_BY_SOURCE_VALUE[tagesbaustelle] ?? null;
}
