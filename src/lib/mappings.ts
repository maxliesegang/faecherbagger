import type { Category, ClosureSeverity, SiteType } from "../types/index.ts";

/**
 * Maps the free-form `art` vocabulary to normalized {@link Category} values.
 *
 * Only the German (non-Alsace) vocabulary is listed: after excluding Alsace,
 * the observed `art` values are entirely German. French codes
 * (`AK5_encours`, `KC1-route-inondee`, `Travaux`, ...) belong exclusively to
 * Alsace records, which are filtered out before normalization. Anything not
 * listed here falls back to `"other"` and is reported via `onUnknownArt`.
 */
export const ART_TO_CATEGORY: Readonly<Record<string, Category>> = {
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
export const SPERRUNG_TO_CLOSURE: Readonly<Record<string, ClosureSeverity>> = {
  "keine Verkehrsbehinderung": "none",
  "mit Verkehrsbehinderung": "obstruction",
  "mit Sperrung in eine Fahrtrichtung": "one-direction",
  "mit Vollsperrung": "full",
};

/** Maps the `tagesbaustelle` vocabulary to {@link SiteType}; null -> `null`. */
export const TAGESBAUSTELLE_TO_SITETYPE: Readonly<Record<string, SiteType>> = {
  "Stationäre Baustelle": "stationary",
  Wanderbaustelle: "mobile",
};

export function mapCategory(
  art: string | null,
  onUnknown?: (art: string) => void,
): Category {
  if (art == null) return "other";
  const category = ART_TO_CATEGORY[art];
  if (category === undefined) {
    onUnknown?.(art);
    return "other";
  }
  return category;
}

export function mapClosure(sperrung: string | null): ClosureSeverity {
  if (sperrung == null) return "unknown";
  return SPERRUNG_TO_CLOSURE[sperrung] ?? "unknown";
}

export function mapSiteType(tagesbaustelle: string | null): SiteType {
  if (tagesbaustelle == null) return null;
  return TAGESBAUSTELLE_TO_SITETYPE[tagesbaustelle] ?? null;
}
