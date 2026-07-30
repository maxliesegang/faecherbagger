import type { ConstructionSite, ISOTimestamp } from "../types/index.ts";
import { describeConstructionTiming } from "../shared/construction-site-labels.ts";
import {
  compareByShortNoticeUrgency,
  isShortNoticeConstructionSite,
  SHORT_NOTICE_LEAD_DAYS,
  toBerlinCalendarDate,
} from "../shared/construction-site-timing.ts";

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
 * The message for one subscriber's new construction sites.
 *
 * A notification exists to buy someone lead time, so it leads with when the
 * work starts rather than with the fact that a record appeared: "beginnt
 * morgen" is something a visitor can act on this evening, "neu erfasst" is not.
 * The sites are ordered the same way the surroundings screen orders them, so
 * the one the notification names is the one at the top of the list it opens.
 *
 * A single site is named and linked directly, because that is the case where the
 * visitor can act without opening anything else; several are summarized and link
 * to the overview.
 *
 * Requires at least one site: a notification interrupts someone, so having
 * nothing to say is the caller's case to handle, not a message to compose.
 */
export function createPushNotificationPayload(
  constructionSites: readonly ConstructionSite[],
  appURL: string,
  fetchedAt: ISOTimestamp,
): PushNotificationPayload {
  if (constructionSites.length === 0) {
    throw new Error("A push notification needs at least one construction site");
  }

  const today = toBerlinCalendarDate(fetchedAt);
  const ordered = [...constructionSites].sort(
    (left, right) =>
      compareByShortNoticeUrgency({ site: left }, { site: right }, today) ||
      left.id.localeCompare(right.id),
  );
  const [firstSite] = ordered as [ConstructionSite, ...ConstructionSite[]];
  const shortNoticeCount = ordered.filter((site) =>
    isShortNoticeConstructionSite(site, today),
  ).length;

  const isSingle = ordered.length === 1;
  const target = new URL(appURL);
  if (isSingle) target.searchParams.set("baustelle", firstSite.id);

  if (isSingle) {
    return {
      title: `Neue Baustelle in ${firstSite.municipality}`,
      body: `${firstSite.location} · ${describeConstructionTiming(firstSite, today)}`,
      url: target.href,
      count: 1,
      fetchedAt,
    };
  }

  return {
    title: `${ordered.length} neue Baustellen in Ihrem Umkreis`,
    body:
      shortNoticeCount > 0
        ? `${shortNoticeCount} davon in den nächsten ${SHORT_NOTICE_LEAD_DAYS} Tagen. Zuerst: ${firstSite.location} · ${describeConstructionTiming(firstSite, today)}`
        : `Unter anderem: ${firstSite.location}, ${firstSite.municipality}`,
    url: target.href,
    count: ordered.length,
    fetchedAt,
  };
}
