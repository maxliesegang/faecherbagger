import type {
  ConstructionSite,
  ConstructionSiteChangeEntry,
  ConstructionSiteChanges,
  ISOTimestamp,
} from "../types/index.ts";

export const CHANGES_RETENTION_DAYS = 7;

function computeCutoff(fetchedAt: ISOTimestamp): ISOTimestamp {
  return new Date(
    new Date(fetchedAt).getTime() - CHANGES_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function isValidChangeEntry(
  entry: unknown,
): entry is ConstructionSiteChangeEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "id" in entry &&
    typeof (entry as Record<string, unknown>).id === "string" &&
    "detectedAt" in entry &&
    typeof (entry as Record<string, unknown>).detectedAt === "string"
  );
}

interface AccumulatorEntry {
  status: "added" | "modified";
  detectedAt: ISOTimestamp;
}

/**
 * Computes what changed between previous and current construction sites, keyed
 * by `id` (`vorgangsnummer`), and merges the per-run diff with entries carried
 * forward from the previous `changes.json` that are still within the 7-day
 * retention window. A record counts as "modified" when its `lastModified`
 * (`stand`) timestamp changed.
 */
export function computeConstructionSiteChanges(
  previousSites: readonly ConstructionSite[],
  currentSites: readonly ConstructionSite[],
  previousChanges: ConstructionSiteChanges | null,
  fetchedAt: ISOTimestamp,
): ConstructionSiteChanges {
  const cutoff = computeCutoff(fetchedAt);
  const hasPreviousData = previousSites.length > 0;
  const previousSitesById = new Map(
    previousSites.map((site) => [site.id, site]),
  );
  const currentSitesById = new Map(
    currentSites.map((site) => [site.id, site]),
  );

  const currentAdded = new Set<string>();
  const currentModified = new Set<string>();
  const removed: string[] = [];

  for (const [id, site] of currentSitesById) {
    const previousSite = previousSitesById.get(id);
    if (!previousSite) currentAdded.add(id);
    else if (previousSite.lastModified !== site.lastModified) {
      currentModified.add(id);
    }
  }
  for (const id of previousSitesById.keys()) {
    if (!currentSitesById.has(id)) removed.push(id);
  }

  const accumulated = new Map<string, AccumulatorEntry>();

  if (previousChanges && hasPreviousData) {
    for (const entry of previousChanges.added) {
      if (isValidChangeEntry(entry) && entry.detectedAt >= cutoff) {
        accumulated.set(entry.id, {
          status: "added",
          detectedAt: entry.detectedAt,
        });
      }
    }
    for (const entry of previousChanges.modified) {
      if (
        isValidChangeEntry(entry) &&
        entry.detectedAt >= cutoff &&
        !accumulated.has(entry.id)
      ) {
        accumulated.set(entry.id, {
          status: "modified",
          detectedAt: entry.detectedAt,
        });
      }
    }
  }

  for (const id of currentAdded) {
    const existing = accumulated.get(id);
    accumulated.set(id, {
      status: "added",
      detectedAt:
        existing && existing.detectedAt < fetchedAt
          ? existing.detectedAt
          : fetchedAt,
    });
  }

  for (const id of currentModified) {
    if (!accumulated.has(id)) {
      accumulated.set(id, {
        status: "modified",
        detectedAt: fetchedAt,
      });
    }
  }

  const added: ConstructionSiteChangeEntry[] = [];
  const modified: ConstructionSiteChangeEntry[] = [];

  for (const [id, entry] of accumulated) {
    if (!currentSitesById.has(id)) continue;
    if (entry.status === "added") {
      added.push({ id, detectedAt: entry.detectedAt });
    } else {
      modified.push({ id, detectedAt: entry.detectedAt });
    }
  }

  added.sort((a, b) => a.id.localeCompare(b.id));
  modified.sort((a, b) => a.id.localeCompare(b.id));
  removed.sort();

  return {
    since: hasPreviousData ? cutoff : null,
    added,
    modified,
    removed,
  };
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
    : new Set([
        ...changes.added.map((entry) => entry.id),
        ...changes.modified.map((entry) => entry.id),
      ]);
}
