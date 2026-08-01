import type {
  ConstructionSite,
  ConstructionSiteChanges,
  ConstructionSiteGeometries,
  ConstructionSiteMetadata,
} from "../types/index.ts";
import { CONSTRUCTION_SITE_DATA_FILENAMES } from "./construction-site-data-files.ts";

/**
 * Loads construction-site JSON produced by the pipeline. Files live in `public/data/`
 * and are served under the app's base path (see `BASE_URL`). Plain `fetch` is
 * enough here — no data-fetching library.
 */
const STATIC_DATA_BASE_URL = `${import.meta.env.BASE_URL}data/`;

async function loadJSON<T>(filename: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${STATIC_DATA_BASE_URL}${filename}`, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to load ${filename}: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

export const loadConstructionSiteMetadata = (
  signal?: AbortSignal,
): Promise<ConstructionSiteMetadata> =>
  loadJSON<ConstructionSiteMetadata>(
    CONSTRUCTION_SITE_DATA_FILENAMES.metadata,
    signal,
  );

export const loadConstructionSites = (
  signal?: AbortSignal,
): Promise<ConstructionSite[]> =>
  loadJSON<ConstructionSite[]>(
    CONSTRUCTION_SITE_DATA_FILENAMES.constructionSites,
    signal,
  );

export const loadConstructionSiteChanges = (
  signal?: AbortSignal,
): Promise<ConstructionSiteChanges> =>
  loadJSON<ConstructionSiteChanges>(
    CONSTRUCTION_SITE_DATA_FILENAMES.changes,
    signal,
  );

/**
 * Map geometry, keyed by site id. Deliberately not part of the initial load:
 * only a mounted map needs it, and it is the bulk of the published data.
 */
export const loadConstructionSiteGeometries = (
  signal?: AbortSignal,
): Promise<ConstructionSiteGeometries> =>
  loadJSON<ConstructionSiteGeometries>(
    CONSTRUCTION_SITE_DATA_FILENAMES.geometries,
    signal,
  );
