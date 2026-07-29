import { useCallback, useState } from "react";
import type { ISOTimestamp } from "../types/index.ts";
import {
  loadSeenConstructionSiteChangesAt,
  saveSeenConstructionSiteChangesAt,
} from "../lib/seen-construction-site-changes.ts";

/**
 * Remembers when the visitor last acknowledged the new construction sites in
 * their surroundings, so a return visit can highlight only what arrived since.
 */
export function useSeenConstructionSiteChanges() {
  const [seenAt, setSeenAt] = useState<ISOTimestamp | null>(
    loadSeenConstructionSiteChangesAt,
  );

  const markChangesSeen = useCallback((acknowledgedAt: ISOTimestamp) => {
    saveSeenConstructionSiteChangesAt(acknowledgedAt);
    setSeenAt(acknowledgedAt);
    // A push sets an app badge with the number of new sites. Acknowledging them
    // in the app has to clear it too, not only opening the notification itself.
    if ("clearAppBadge" in navigator) {
      void navigator.clearAppBadge().catch(() => undefined);
    }
  }, []);

  return { seenAt, markChangesSeen };
}

export type SeenConstructionSiteChangesController = ReturnType<
  typeof useSeenConstructionSiteChanges
>;
