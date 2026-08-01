import { useEffect, useState } from "react";
import type { ConstructionSiteGeometries } from "../types/index.ts";
import { loadConstructionSiteGeometries } from "../lib/construction-site-data.ts";

/**
 * Loads the detailed map geometry on demand.
 *
 * Every map mounts with points only and fills in the exact shapes when this
 * resolves, so a slow or failed geometry request degrades to a usable map
 * rather than an empty one. The result is memoized per document, so switching
 * between the overview map and a detail map fetches it once.
 */
let cachedGeometries: Promise<ConstructionSiteGeometries> | undefined;

const getConstructionSiteGeometries =
  (): Promise<ConstructionSiteGeometries> => {
    cachedGeometries ??= loadConstructionSiteGeometries().catch((error) => {
      // Do not memoize a failure: the next map should be able to retry.
      cachedGeometries = undefined;
      throw error;
    });
    return cachedGeometries;
  };

export function useConstructionSiteGeometries():
  | ConstructionSiteGeometries
  | undefined {
  const [geometries, setGeometries] = useState<ConstructionSiteGeometries>();

  useEffect(() => {
    let isCurrent = true;
    void getConstructionSiteGeometries()
      .then((loaded) => {
        if (isCurrent) setGeometries(loaded);
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, []);

  return geometries;
}
