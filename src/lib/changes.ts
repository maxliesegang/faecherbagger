import type { Baustelle, Changes, IsoTimestamp } from "../types/index.ts";

/**
 * Computes what changed between the previous and current record sets, keyed by
 * `id` (`vorgangsnummer`). A record counts as "modified" when its `lastModified`
 * (`stand`) timestamp changed. This is the basis for later notifications.
 */
export function computeChanges(
  previous: readonly Baustelle[],
  current: readonly Baustelle[],
  since: IsoTimestamp | null,
): Changes {
  const previousById = new Map(previous.map((record) => [record.id, record]));
  const currentById = new Map(current.map((record) => [record.id, record]));

  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [id, record] of currentById) {
    const before = previousById.get(id);
    if (!before) added.push(id);
    else if (before.lastModified !== record.lastModified) modified.push(id);
  }
  for (const id of previousById.keys()) {
    if (!currentById.has(id)) removed.push(id);
  }

  added.sort();
  modified.sort();
  removed.sort();
  return { since, added, modified, removed };
}
