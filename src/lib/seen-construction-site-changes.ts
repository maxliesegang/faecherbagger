import type { ISOTimestamp } from "../types/index.ts";
import { readStoredText, writeStoredText } from "./browser-storage.ts";

export const SEEN_CHANGES_STORAGE_KEY = "faecherbagger-changes-seen-at";

const isISOTimestamp = (value: string): boolean =>
  !Number.isNaN(new Date(value).getTime());

/**
 * When the visitor last acknowledged the new construction sites around them.
 * `null` means "never", which makes every change in the window count as unseen.
 */
export function loadSeenConstructionSiteChangesAt(): ISOTimestamp | null {
  const stored = readStoredText(SEEN_CHANGES_STORAGE_KEY);
  return stored && isISOTimestamp(stored) ? stored : null;
}

export function saveSeenConstructionSiteChangesAt(seenAt: ISOTimestamp): void {
  writeStoredText(SEEN_CHANGES_STORAGE_KEY, seenAt);
}
