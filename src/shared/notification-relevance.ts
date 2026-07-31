import type {
  ClosureSeverity,
  ConstructionSite,
  ISODate,
  NotificationClosureLevel,
} from "../types/index.ts";
import { isShortNoticeConstructionSite } from "./construction-site-timing.ts";

/**
 * What a notification is allowed to be about.
 *
 * The level is a subscription's own setting, because the answer is personal: a
 * delivery driver wants every dug-up side street, most people want the closures
 * they cannot drive through. It exists at all because "neu im Umkreis" turned
 * out to be a far weaker filter than it sounds — a fifth of the published
 * records are private scaffolding permits at a single house number, and one in
 * thirty explicitly obstructs nothing.
 */

/** Every level, most talkative first (for the settings control). */
export const NOTIFICATION_CLOSURE_LEVELS: readonly NotificationClosureLevel[] = [
  "all",
  "obstruction",
  "full",
];

/**
 * What a subscription reports on unless it says otherwise.
 *
 * Not `"all"`. A notification's only currency is that it was worth reading, and
 * the level that spends it on a skip container in a side street is the one that
 * gets notifications switched off altogether.
 */
export const DEFAULT_NOTIFICATION_CLOSURE_LEVEL: NotificationClosureLevel =
  "obstruction";

/**
 * Which closures each level reports, spelled out rather than compared as
 * ordinals.
 *
 * `"unknown"` — a record whose source left `sperrung` empty — is deliberately
 * included below the strictest level: the app does not know that it is harmless,
 * and silently dropping it would be a guess made against the visitor. Only
 * `"full"`, which is an explicit request for Vollsperrungen and nothing else,
 * leaves it out.
 */
const NOTIFIED_CLOSURES: Record<
  NotificationClosureLevel,
  ReadonlySet<ClosureSeverity>
> = {
  all: new Set<ClosureSeverity>([
    "none",
    "obstruction",
    "one-direction",
    "full",
    "unknown",
  ]),
  obstruction: new Set<ClosureSeverity>([
    "obstruction",
    "one-direction",
    "full",
    "unknown",
  ]),
  full: new Set<ClosureSeverity>(["full"]),
};

/** Validates a level from storage or from an API request body. */
export function isNotificationClosureLevel(
  value: unknown,
): value is NotificationClosureLevel {
  return (
    typeof value === "string" &&
    (NOTIFICATION_CLOSURE_LEVELS as readonly string[]).includes(value)
  );
}

/** The level to act on, for a stored value that may be missing or stale. */
export function toNotificationClosureLevel(
  value: unknown,
): NotificationClosureLevel {
  return isNotificationClosureLevel(value)
    ? value
    : DEFAULT_NOTIFICATION_CLOSURE_LEVEL;
}

/**
 * Whether a newly published record is worth a notification.
 *
 * Two conditions, and the timing one is not optional. `firstSeenAt` says when
 * *the pipeline* learned about a construction site, which is not when the work
 * happens: a source that backfills a record can hand the app something that
 * started eighteen months ago, and announcing that as a "neue Baustelle" is how
 * a notification stops being believed. What survives here is what
 * {@link isShortNoticeConstructionSite} already defines as the product — the
 * week around today — narrowed to the disruption the subscriber asked about.
 *
 * The caller supplies `today` from the dataset's own `fetchedAt`, never from a
 * clock, so the fan-out classifies records exactly as the screen it links to.
 */
export function isNotifiableConstructionSite(
  constructionSite: ConstructionSite,
  today: ISODate,
  level: NotificationClosureLevel,
): boolean {
  return (
    isShortNoticeConstructionSite(constructionSite, today) &&
    NOTIFIED_CLOSURES[level].has(constructionSite.closure)
  );
}

/** {@link isNotifiableConstructionSite} over a list, order preserved. */
export function selectNotifiableConstructionSites(
  constructionSites: readonly ConstructionSite[],
  today: ISODate,
  level: NotificationClosureLevel,
): ConstructionSite[] {
  return constructionSites.filter((constructionSite) =>
    isNotifiableConstructionSite(constructionSite, today, level),
  );
}
