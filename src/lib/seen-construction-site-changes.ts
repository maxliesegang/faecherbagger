import type { ISOTimestamp } from "../types/index.ts";

export const SEEN_CHANGES_STORAGE_KEY = "faecherbagger-changes-seen-at";

const isISOTimestamp = (value: string): boolean =>
  !Number.isNaN(new Date(value).getTime());

/**
 * When the visitor last acknowledged the new construction sites around them.
 * `null` means "never", which makes every change in the window count as unseen.
 */
export function loadSeenConstructionSiteChangesAt(): ISOTimestamp | null {
  try {
    const stored = localStorage.getItem(SEEN_CHANGES_STORAGE_KEY);
    return stored && isISOTimestamp(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveSeenConstructionSiteChangesAt(
  seenAt: ISOTimestamp,
): void {
  try {
    localStorage.setItem(SEEN_CHANGES_STORAGE_KEY, seenAt);
  } catch {
    // A full or blocked storage must not break acknowledging the list.
  }
}
