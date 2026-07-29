import { useCallback, useState, useMemo } from "react";
import type { ISOTimestamp } from "../types/index.ts";
import {
  loadSeenConstructionSitesAt,
  saveSeenConstructionSitesAt,
} from "../lib/seen-construction-sites.ts";

/**
 * Remembers when the visitor last acknowledged the new construction sites in
 * their surroundings, so a return visit can highlight only what arrived since.
 */
export function useSeenConstructionSites() {
  const [seenAt, setSeenAt] = useState<ISOTimestamp | null>(
    loadSeenConstructionSitesAt,
  );

  const markSitesSeen = useCallback((acknowledgedAt: ISOTimestamp) => {
    saveSeenConstructionSitesAt(acknowledgedAt);
    setSeenAt(acknowledgedAt);
    // A push sets an app badge with the number of new sites. Acknowledging them
    // in the app has to clear it too, not only opening the notification itself.
    if ("clearAppBadge" in navigator) {
      void navigator.clearAppBadge().catch(() => undefined);
    }
  }, []);

  return useMemo(
    () => ({ seenAt, markSitesSeen }),
    [markSitesSeen, seenAt],
  );
}

export type SeenConstructionSitesController = ReturnType<
  typeof useSeenConstructionSites
>;
