import type {
  NotificationArea,
  NotificationAreaKind,
} from "../types/index.ts";
import { normalizeStreetName } from "./street-names.ts";
import {
  formatCorridorWidth,
  formatNotificationRadius,
  MAX_NOTIFICATION_AREAS,
} from "./notification-preferences.ts";

/**
 * Notification-area list handling.
 *
 * Persistence lives in `notification-preferences-store.ts` (IndexedDB, shared
 * with the service worker); validation and limits live in
 * `notification-preferences.ts`. This module is the list arithmetic.
 */

/** Local identity for a new area. */
export const createNotificationAreaId = (): string => crypto.randomUUID();

/**
 * Adds or replaces an area by id, capped at {@link MAX_NOTIFICATION_AREAS}.
 * Returns the list unchanged when a *new* area would exceed the cap, so the
 * caller can say so instead of silently dropping one.
 */
export function upsertNotificationArea(
  areas: readonly NotificationArea[],
  area: NotificationArea,
): NotificationArea[] {
  const index = areas.findIndex((candidate) => candidate.id === area.id);
  if (index >= 0) {
    return areas.map((candidate, position) =>
      position === index ? area : candidate,
    );
  }
  if (areas.length >= MAX_NOTIFICATION_AREAS) return [...areas];
  return [...areas, area];
}

export const removeNotificationArea = (
  areas: readonly NotificationArea[],
  areaId: string,
): NotificationArea[] => areas.filter((area) => area.id !== areaId);

/**
 * What kind of place an area is, for lists next to its name: "1 km Umkreis",
 * "Strecke · 250 m Abstand". Leaves out what the name already says, so a
 * street saved as "Kaiserstraße" does not read "Kaiserstraße · Kaiserstraße".
 */
export function describeNotificationArea(area: NotificationArea): string {
  const place = describeNotificationAreaPlace(area);
  return area.minSeverity && area.minSeverity !== "obstruction"
    ? `${place} · ${SEVERITY_SUFFIX[area.minSeverity]}`
    : place;
}

/** Only the thresholds that differ from the usual "ab Behinderung" are named. */
const SEVERITY_SUFFIX: Record<"all" | "closure", string> = {
  all: "alle Baustellen",
  closure: "nur Sperrungen",
};

function describeNotificationAreaPlace(area: NotificationArea): string {
  switch (area.kind) {
    case "circle":
      return `${formatNotificationRadius(area.radiusKm)} Umkreis`;
    case "corridor":
      return `${area.returnLine ? "Hin und zurück" : "Strecke"} · ${formatCorridorWidth(area.widthMeters)} Abstand`;
    case "polygon":
      return "Gezeichnete Fläche";
    case "municipality":
      return area.label === area.municipality
        ? "Ganze Gemeinde"
        : `Ganz ${area.municipality}`;
    case "street": {
      const isNamedAfterStreet =
        normalizeStreetName(area.label) === normalizeStreetName(area.street);
      const place = isNamedAfterStreet
        ? `Straße in ${area.municipality}`
        : `${area.street}, ${area.municipality}`;
      return area.includeJunctions ? `${place}, mit Einmündungen` : place;
    }
  }
}

/** "in der Kaiserstraße", "am Marktplatz", "im Fächerweg", else `undefined`. */
function withStreetPreposition(street: string): string | undefined {
  const normalized = normalizeStreetName(street);
  if (/(strasse|allee|gasse)$/u.test(normalized)) return `in der ${street}`;
  if (/(platz|ring|damm|ufer|graben|tor|markt)$/u.test(normalized)) {
    return `am ${street}`;
  }
  if (/(weg|pfad|steig)$/u.test(normalized)) return `im ${street}`;
  return undefined;
}

/**
 * Where a batch of notifications happened, for a title: "3 Meldungen bei
 * „Zuhause“", "… entlang „Arbeitsweg“", "… in Ettlingen", "… in der
 * Kaiserstraße". The preposition depends on the kind of place; the name is
 * quoted because it is whatever the visitor typed.
 */
export function describeNotificationAreaScope(area: NotificationArea): string {
  switch (area.kind) {
    case "circle":
      return `bei „${area.label}“`;
    case "corridor":
      return `entlang „${area.label}“`;
    case "polygon":
      return `in „${area.label}“`;
    case "municipality":
      return `in ${area.municipality}`;
    case "street":
      return withStreetPreposition(area.street) ?? `für „${area.label}“`;
  }
}

/**
 * Names offered as one-tap choices in the setup. Municipalities and streets
 * get their own name as the default instead.
 */
export const NOTIFICATION_AREA_LABEL_SUGGESTIONS: Record<
  NotificationAreaKind,
  readonly string[]
> = {
  circle: ["Zuhause", "Arbeit", "Schule", "Kita"],
  corridor: ["Arbeitsweg", "Schulweg", "Pendelstrecke"],
  polygon: ["Mein Viertel", "Wohngebiet"],
  municipality: [],
  street: [],
};
