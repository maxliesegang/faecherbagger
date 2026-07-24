import type { Baustelle, Changes, Meta } from "../types/index.ts";

/**
 * Loads the static JSON produced by the pipeline. Files live in `public/data/`
 * and are served under the app's base path (see `BASE_URL`). Plain `fetch` is
 * enough here — no data-fetching library.
 */
const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

async function loadJson<T>(file: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${DATA_BASE}${file}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load ${file}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const loadMeta = (signal?: AbortSignal): Promise<Meta> =>
  loadJson<Meta>("meta.json", signal);

export const loadBaustellen = (signal?: AbortSignal): Promise<Baustelle[]> =>
  loadJson<Baustelle[]>("baustellen.json", signal);

export const loadChanges = (signal?: AbortSignal): Promise<Changes> =>
  loadJson<Changes>("changes.json", signal);
