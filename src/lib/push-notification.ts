import type { ConstructionSite, ISOTimestamp } from "../types/index.ts";
import { formatISODate } from "./construction-site-labels.ts";

/** What the service worker receives and turns into a device notification. */
export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Where opening the notification takes the visitor. */
  url: string;
  /** Drives the app badge, so it matches what the notification announced. */
  count: number;
  fetchedAt: ISOTimestamp;
}

/**
 * The message for one subscriber's new construction sites. A single site is
 * named and linked directly, because that is the case where the visitor can act
 * on the notification without opening anything else; several are summarized and
 * link to the overview, where the surroundings screen ranks them.
 *
 * Requires at least one site: a notification interrupts someone, so having
 * nothing to say is the caller's case to handle, not a message to compose.
 */
export function createPushNotificationPayload(
  constructionSites: readonly ConstructionSite[],
  appURL: string,
  fetchedAt: ISOTimestamp,
): PushNotificationPayload {
  const [firstSite] = constructionSites;
  if (!firstSite) {
    throw new Error("A push notification needs at least one construction site");
  }
  const isSingle = constructionSites.length === 1;

  const target = new URL(appURL);
  if (isSingle) target.searchParams.set("baustelle", firstSite.id);

  return {
    title: isSingle
      ? `Neue Baustelle in ${firstSite.municipality}`
      : `${constructionSites.length} neue Baustellen in Ihrem Umkreis`,
    body: isSingle
      ? `${firstSite.location} · ab ${formatISODate(firstSite.startDate)}`
      : `Unter anderem: ${firstSite.location}, ${firstSite.municipality}`,
    url: target.href,
    count: constructionSites.length,
    fetchedAt,
  };
}
