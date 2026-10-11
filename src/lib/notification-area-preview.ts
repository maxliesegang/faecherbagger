import type {
  ConstructionSite,
  ISODate,
  NotificationArea,
  NotificationSeverityThreshold,
} from "../types/index.ts";
import { isTargetInNotificationArea } from "./notification-area-match.ts";
import { meetsSeverityThreshold } from "./notification-preferences.ts";
import { addCalendarDays } from "./construction-site-timeframe.ts";

/**
 * What an area would mean before it is saved: which sites it covers today and
 * how much it would notify about.
 *
 * The question someone choosing a radius actually has is "how often will my
 * phone buzz?", not "how many sites are there". The honest answer available
 * from the data is the sites that start within the next month and are
 * disruptive enough for the notification threshold: each of those is
 * announced at least once. Sites announced later at short notice come on top,
 * so this is a floor, worded as an approximation.
 */

export const PREVIEW_HORIZON_DAYS = 30;

/** From here on the setup suggests a smaller area or a higher threshold. */
export const BUSY_AREA_NOTIFICATION_COUNT = 15;

export interface NotificationAreaPreviewOptions {
  today: ISODate;
  minSeverity: NotificationSeverityThreshold;
}

export interface NotificationAreaPreview {
  /** Sites in the area: upcoming soonest first, then those under way. */
  matchingSites: ConstructionSite[];
  /** Matching sites that start within the horizon and pass the threshold. */
  upcomingNotificationCount: number;
}

const isUpcomingNotification = (
  constructionSite: ConstructionSite,
  { today, minSeverity }: NotificationAreaPreviewOptions,
): boolean =>
  constructionSite.startDate >= today &&
  constructionSite.startDate <= addCalendarDays(today, PREVIEW_HORIZON_DAYS) &&
  meetsSeverityThreshold(constructionSite.closure, minSeverity);

/** Just the count, cheap enough to run once per radius or width option. */
export function countUpcomingNotifications(
  area: NotificationArea,
  constructionSites: readonly ConstructionSite[],
  options: NotificationAreaPreviewOptions,
): number {
  let count = 0;
  for (const constructionSite of constructionSites) {
    if (
      isUpcomingNotification(constructionSite, options) &&
      isTargetInNotificationArea(area, constructionSite)
    ) {
      count += 1;
    }
  }
  return count;
}

export function previewNotificationArea(
  area: NotificationArea,
  constructionSites: readonly ConstructionSite[],
  options: NotificationAreaPreviewOptions,
): NotificationAreaPreview {
  const matchingSites = constructionSites.filter((constructionSite) =>
    isTargetInNotificationArea(area, constructionSite),
  );
  const isUpcoming = (constructionSite: ConstructionSite) =>
    constructionSite.startDate >= options.today;
  matchingSites.sort(
    (left, right) =>
      Number(isUpcoming(right)) - Number(isUpcoming(left)) ||
      (isUpcoming(left)
        ? left.startDate.localeCompare(right.startDate)
        : right.startDate.localeCompare(left.startDate)) ||
      left.id.localeCompare(right.id),
  );
  return {
    matchingSites,
    upcomingNotificationCount: matchingSites.filter((constructionSite) =>
      isUpcomingNotification(constructionSite, options),
    ).length,
  };
}

/** "etwa 3 Meldungen" — the count as a short German phrase. */
export function formatUpcomingNotificationCount(count: number): string {
  if (count === 0) return "keine Meldung";
  if (count === 1) return "etwa 1 Meldung";
  return `etwa ${count} Meldungen`;
}
