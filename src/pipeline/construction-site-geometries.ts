import type {
  ConstructionSite,
  ConstructionSiteGeometries,
  ConstructionSiteWithGeometry,
} from "../types/index.ts";

/** What one pipeline run publishes, as two files instead of one. */
export interface SplitConstructionSites {
  /** `data/baustellen.json`: everything a list, a card and a distance need. */
  constructionSites: ConstructionSite[];
  /** `data/geometrien.json`: what only the map needs, by record id. */
  geometries: ConstructionSiteGeometries;
}

/**
 * Separates the map geometry from the published record.
 *
 * The geometry is about seven eighths of the bytes and has exactly one reader.
 * Splitting it off means the default screen — which has no map at all — no
 * longer downloads it, and the explorer pays for it once, when a map is
 * actually opened.
 *
 * Written as a destructuring rest so the split is enforced by the language
 * rather than by a `delete` someone can forget: `geometry` is named here and
 * therefore cannot ride along in `constructionSites`.
 */
export function splitConstructionSiteGeometries(
  sitesWithGeometry: readonly ConstructionSiteWithGeometry[],
): SplitConstructionSites {
  const constructionSites: ConstructionSite[] = [];
  const geometries: ConstructionSiteGeometries = {};

  for (const { geometry, ...constructionSite } of sitesWithGeometry) {
    constructionSites.push(constructionSite);
    geometries[constructionSite.id] = geometry;
  }

  return { constructionSites, geometries };
}
