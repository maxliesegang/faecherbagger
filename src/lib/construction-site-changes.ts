import type {
  ConstructionSite,
  ConstructionSiteChanges,
  ConstructionSiteModification,
  ISOTimestamp,
} from "../types/index.ts";

/**
 * Computes what changed between previous and current construction sites, keyed by
 * `id` (`vorgangsnummer`). A record counts as "modified" when its `lastModified`
 * (`stand`) timestamp changed. This is the basis for later notifications.
 */
export function computeConstructionSiteChanges(
  previousSites: readonly ConstructionSite[],
  currentSites: readonly ConstructionSite[],
  since: ISOTimestamp | null,
): ConstructionSiteChanges {
  const previousSitesById = new Map(
    previousSites.map((site) => [site.id, site]),
  );
  const currentSitesById = new Map(
    currentSites.map((site) => [site.id, site]),
  );

  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];
  const relevantModifications: ConstructionSiteModification[] = [];

  for (const [id, site] of currentSitesById) {
    const previousSite = previousSitesById.get(id);
    if (!previousSite) {
      added.push(id);
      continue;
    }
    if (previousSite.lastModified === site.lastModified) continue;
    modified.push(id);

    // Which fields moved decides whether this is worth a notification: a
    // corrected spelling bumps `stand` just like a new full closure does.
    const changedFields: ConstructionSiteModification["changedFields"] = [];
    if (
      previousSite.startDate !== site.startDate ||
      previousSite.endDate !== site.endDate
    ) {
      changedFields.push("period");
    }
    if (previousSite.closure !== site.closure) changedFields.push("closure");
    if (changedFields.length > 0) {
      relevantModifications.push({
        id,
        changedFields,
        previousClosure: previousSite.closure,
        previousStartDate: previousSite.startDate,
        previousEndDate: previousSite.endDate,
      });
    }
  }
  for (const id of previousSitesById.keys()) {
    if (!currentSitesById.has(id)) removed.push(id);
  }

  added.sort();
  modified.sort();
  removed.sort();
  relevantModifications.sort((left, right) => left.id.localeCompare(right.id));
  return { since, added, modified, removed, relevantModifications };
}

/**
 * IDs that can still be shown in the current dataset's "new/changed" mode.
 * A first-run diff has no comparison point and must not label every record new.
 */
export function getChangedConstructionSiteIds(
  changes: Readonly<ConstructionSiteChanges>,
): Set<string> {
  return changes.since === null
    ? new Set()
    : new Set([...changes.added, ...changes.modified]);
}
