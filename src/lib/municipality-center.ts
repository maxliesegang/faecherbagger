import type { ConstructionSite, LngLat } from "../types/index.ts";
import { roundHomeAreaCenter } from "../shared/home-area-validation.ts";

/**
 * Mean position of the construction sites in a municipality — the fallback
 * center for visitors who cannot or do not want to share a device location.
 * Rounded like every other home-area center, so a fallback area is
 * indistinguishable from one derived from a device position.
 * Returns `undefined` when the municipality has no records in the dataset.
 */
export function getMunicipalityCenter(
  constructionSites: readonly ConstructionSite[],
  municipality: string,
): LngLat | undefined {
  let longitudeSum = 0;
  let latitudeSum = 0;
  let count = 0;

  for (const site of constructionSites) {
    if (site.municipality !== municipality) continue;
    longitudeSum += site.point[0];
    latitudeSum += site.point[1];
    count += 1;
  }

  return count === 0
    ? undefined
    : roundHomeAreaCenter([longitudeSum / count, latitudeSum / count]);
}
