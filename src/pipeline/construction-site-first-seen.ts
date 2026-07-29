import type {
  ConstructionSite,
  ISOTimestamp,
  NormalizedConstructionSite,
} from "../types/index.ts";

/**
 * Stamps every record with the instant this pipeline first saw it.
 *
 * A record keeps the `firstSeenAt` it was given on the run that introduced it;
 * anything absent from `previousSites` is new and gets `fetchedAt`. This is the
 * pipeline's only memory of earlier runs, and it exists for one reason: the
 * source publishes no creation date, so without it an addition and an edit are
 * indistinguishable — and the push pipeline must only interrupt people for
 * additions.
 *
 * A record that disappears from the source and returns later counts as new
 * again. That is the honest reading: we genuinely did not see it in between,
 * and the alternative is retaining ids forever for a case the source treats as
 * a fresh Vorgang anyway.
 *
 * A previous record without a `firstSeenAt` gets
 * {@link FIRST_SEEN_BEFORE_TRACKING} — the migration path from data written
 * before the field existed. All we know about those records is that we already
 * had them, not since when, and that is exactly what the sentinel encodes: they
 * never claim to be new and they never notify anyone. Stamping `fetchedAt`
 * instead would declare the whole dataset new and push the backlog to every
 * subscriber; stamping their own `stand` would make every one of them read
 * "Neu" for a full window, because that is what `firstSeenAt === lastModified`
 * means.
 *
 * Pure: neither input array nor its records are modified.
 */
/**
 * Stands for "we had this before we started tracking first sightings". Older
 * than any window, so such a record is never new and never notifiable.
 */
export const FIRST_SEEN_BEFORE_TRACKING = new Date(0).toISOString();

export function assignFirstSeenAt(
  constructionSites: readonly NormalizedConstructionSite[],
  previousSites: readonly ConstructionSite[],
  fetchedAt: ISOTimestamp,
): ConstructionSite[] {
  const firstSeenAtById = new Map<string, ISOTimestamp>(
    previousSites.map((site): [string, ISOTimestamp] => [
      site.id,
      site.firstSeenAt || FIRST_SEEN_BEFORE_TRACKING,
    ]),
  );

  return constructionSites.map((site) => ({
    ...site,
    firstSeenAt: firstSeenAtById.get(site.id) ?? fetchedAt,
  }));
}
