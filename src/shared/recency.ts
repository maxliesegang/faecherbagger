import type { ConstructionSite, ISOTimestamp } from "../types/index.ts";

/**
 * Selectable time windows in days, shortest first. The single source of truth:
 * {@link RecentWindowDays} is derived from it, and the label and URL tables are
 * `Record`s over that union, so adding an option here fails to compile until
 * every table covers it.
 */
export const RECENT_WINDOW_DAYS = [1, 7, 30] as const;

/** How far back a "was hat sich geändert?" view reaches, in days. */
export type RecentWindowDays = (typeof RECENT_WINDOW_DAYS)[number];

/** The window the app opens with. */
export const DEFAULT_RECENT_WINDOW_DAYS: RecentWindowDays = 7;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Start of the window ending at `fetchedAt`.
 *
 * Anchored to the data's own timestamp rather than the browser clock: the
 * dataset is up to twelve hours old, so measuring from "now" would silently
 * shrink the window between two pipeline runs.
 */
export function recentWindowSince(
  fetchedAt: ISOTimestamp,
  windowDays: number,
): ISOTimestamp {
  return new Date(
    new Date(fetchedAt).getTime() - windowDays * MILLISECONDS_PER_DAY,
  ).toISOString();
}

/**
 * Whether a construction site is new to this visitor: `"new"` when the pipeline
 * first saw it inside the window, `null` otherwise.
 *
 * Deliberately keyed on `firstSeenAt` alone. The app has exactly one notion of
 * "neu", and it is the same one the push pipeline acts on: a construction site
 * that was not here before. An edit the source makes to a record someone has
 * already been told about does not make it new again — it used to surface as a
 * separate "Aktualisiert" state, which meant the badge, the list and the
 * notification each answered a slightly different question.
 *
 * The cost is real and worth stating: a site whose closure escalates from
 * "mit Verkehrsbehinderung" to "mit Vollsperrung" is an edit, so it does not
 * resurface anywhere. `lastModified` still rides along on the record for the
 * feeds and the sort presets, which is where revisions remain visible.
 */
export type ConstructionSiteRecency = "new" | null;

/**
 * The one place that classifies a record against a window. Every badge, filter
 * and count derives from this, so they cannot drift apart.
 */
export function getConstructionSiteRecency(
  constructionSite: ConstructionSite,
  since: ISOTimestamp,
): ConstructionSiteRecency {
  return constructionSite.firstSeenAt >= since ? "new" : null;
}

/** True when the pipeline first saw the site within the window. */
export function isRecentConstructionSite(
  constructionSite: ConstructionSite,
  since: ISOTimestamp,
): boolean {
  return getConstructionSiteRecency(constructionSite, since) !== null;
}

/**
 * Most recently sighted first.
 *
 * Every record introduced by the same pipeline run shares one `firstSeenAt`, so
 * ties are the normal case rather than the exception: `stand` orders within a
 * run, and the id makes the order total and stable across runs.
 */
function compareByFirstSeenDescending(
  left: ConstructionSite,
  right: ConstructionSite,
): number {
  return (
    right.firstSeenAt.localeCompare(left.firstSeenAt) ||
    right.lastModified.localeCompare(left.lastModified) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * The construction sites that appeared within the window, newest first. Pure:
 * neither the input array nor its records are modified.
 */
export function selectRecentConstructionSites(
  constructionSites: readonly ConstructionSite[],
  since: ISOTimestamp,
): ConstructionSite[] {
  return constructionSites
    .filter((constructionSite) =>
      isRecentConstructionSite(constructionSite, since),
    )
    .sort(compareByFirstSeenDescending);
}

/**
 * True when the pipeline first saw a site after the visitor last acknowledged
 * the surroundings view. Without an acknowledgement everything counts as
 * unseen, which is what a first visit should show.
 */
export function isUnseenConstructionSite(
  firstSeenAt: ISOTimestamp,
  seenAt: ISOTimestamp | null,
): boolean {
  return seenAt === null || firstSeenAt > seenAt;
}
