import type { ISOTimestamp } from "../types/index.ts";
import { readStoredText, writeStoredText } from "./browser-storage.ts";

export const SEEN_CONSTRUCTION_SITES_STORAGE_KEY =
  "faecherbagger-seen-construction-sites-at";

const isISOTimestamp = (value: string): boolean =>
  !Number.isNaN(new Date(value).getTime());

/**
 * When the visitor last acknowledged the new construction sites around them.
 * `null` means "never", which makes every site in the window count as unseen.
 */
export function loadSeenConstructionSitesAt(): ISOTimestamp | null {
  const stored = readStoredText(SEEN_CONSTRUCTION_SITES_STORAGE_KEY);
  return stored && isISOTimestamp(stored) ? stored : null;
}

export function saveSeenConstructionSitesAt(seenAt: ISOTimestamp): void {
  writeStoredText(SEEN_CONSTRUCTION_SITES_STORAGE_KEY, seenAt);
}
