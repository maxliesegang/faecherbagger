import type {
  ConstructionSite,
  ConstructionSiteChanges,
  ConstructionSiteMetadata,
} from "../types/index.ts";

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
  loadJSON<ConstructionSiteMetadata>("meta.json", signal);

export const loadConstructionSites = (
  signal?: AbortSignal,
): Promise<ConstructionSite[]> =>
  loadJSON<ConstructionSite[]>("baustellen.json", signal);

export const loadConstructionSiteChanges = (
  signal?: AbortSignal,
): Promise<ConstructionSiteChanges> =>
  loadJSON<ConstructionSiteChanges>("changes.json", signal);
