import type {
  ConstructionSite,
  LngLat,
  NotificationArea,
} from "../types/index.ts";
import { distanceInMeters } from "./distance.ts";
import { distanceToLineMeters, isPointInRing } from "./geometry.ts";
import { findStreetMention } from "./street-names.ts";

/**
 * Whether a construction site lies in a watched area — one rule for every
 * kind of area, shared by the relevance list, the service worker's
 * notification filter and the notification text.
 *
 * Pure and free of browser globals, so it runs in the service worker.
 */

/**
 * The parts of a site (or of a feed event about it) that matching looks at.
 * Feed events carry the same fields, so the service worker never needs the
 * full record set.
 */
export type NotificationAreaTarget = Pick<
  ConstructionSite,
  "point" | "municipality" | "location"
> & { extentPoints?: readonly LngLat[] };

const targetPoints = (target: NotificationAreaTarget): readonly LngLat[] =>
  target.extentPoints && target.extentPoints.length > 0
    ? [target.point, ...target.extentPoints]
    : [target.point];

/**
 * How far into an area a site is, or `undefined` when it is outside.
 *
 * The number orders matches and feeds a card's "350 m entfernt": distance to
 * the centre for a circle, distance to the line for a corridor. Areas without
 * a meaningful distance — an outline, a municipality, a street — report `0`.
 */
export function measureNotificationAreaMatch(
  area: NotificationArea,
  target: NotificationAreaTarget,
): number | undefined {
  switch (area.kind) {
    case "circle": {
      const radiusMeters = area.radiusKm * 1_000;
      let nearest = Number.POSITIVE_INFINITY;
      for (const point of targetPoints(target)) {
        nearest = Math.min(nearest, distanceInMeters(area.center, point));
      }
      // Lists show distance to the representative point: that is the place a
      // card's "350 m" refers to, even when an end of the site matched.
      return nearest <= radiusMeters
        ? Math.min(distanceInMeters(area.center, target.point), radiusMeters)
        : undefined;
    }
    case "corridor": {
      const lines = area.returnLine ? [area.line, area.returnLine] : [area.line];
      let nearest = Number.POSITIVE_INFINITY;
      for (const point of targetPoints(target)) {
        for (const line of lines) {
          nearest = Math.min(nearest, distanceToLineMeters(point, line));
        }
      }
      return nearest <= area.widthMeters ? nearest : undefined;
    }
    case "polygon":
      return targetPoints(target).some((point) => isPointInRing(point, area.ring))
        ? 0
        : undefined;
    case "municipality":
      return target.municipality === area.municipality ? 0 : undefined;
    case "street": {
      if (target.municipality !== area.municipality) return undefined;
      const mention = findStreetMention(target.location, area.street);
      return mention === "on" || (mention === "junction" && area.includeJunctions)
        ? 0
        : undefined;
    }
  }
}

export const isTargetInNotificationArea = (
  area: NotificationArea,
  target: NotificationAreaTarget,
): boolean => measureNotificationAreaMatch(area, target) !== undefined;

/** The first area containing the target, or `undefined` when none does. */
export const findNotificationAreaForTarget = (
  areas: readonly NotificationArea[],
  target: NotificationAreaTarget,
): NotificationArea | undefined =>
  areas.find((area) => isTargetInNotificationArea(area, target));
