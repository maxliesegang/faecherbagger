/**
 * Names of the generated files in `public/data/`.
 *
 * Shared by the pipeline that writes them, the app that fetches them and the
 * service worker that caches them, so a rename cannot leave one of the three
 * behind.
 */
export const CONSTRUCTION_SITE_DATA_FILENAMES = {
  metadata: "meta.json",
  constructionSites: "baustellen.json",
  changes: "changes.json",
  geometries: "baustellen-geometrie.json",
  /** What this run has to announce; read by the service worker on a push. */
  notificationFeed: "ereignisse.json",
} as const;

/**
 * Files fetched on every start and kept fresh in the background.
 *
 * Geometry is excluded on purpose: it is an order of magnitude larger than the
 * rest and is only needed once a map is opened, where the runtime cache picks
 * it up.
 */
export const CONSTRUCTION_SITE_CORE_DATA_FILENAMES = [
  CONSTRUCTION_SITE_DATA_FILENAMES.metadata,
  CONSTRUCTION_SITE_DATA_FILENAMES.constructionSites,
  CONSTRUCTION_SITE_DATA_FILENAMES.changes,
] as const;
