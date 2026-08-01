import type { NotificationArea } from "../types/index.ts";
import { MAX_NOTIFICATION_AREAS } from "./notification-preferences.ts";

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
