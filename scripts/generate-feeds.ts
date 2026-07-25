/**
 * Regenerates RSS and Atom feeds from normalized local JSON without fetching
 * the WFS. The regular data pipeline writes the same artifacts.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ConstructionSite,
  ConstructionSiteMetadata,
} from "../src/types/index.ts";
import {
  CONSTRUCTION_SITE_FEED_FILENAMES,
  createConstructionSiteFeeds,
} from "../src/lib/construction-site-feeds.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_APP_URL = "https://maxliesegang.github.io/faecherbagger/";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

const [constructionSites, metadata] = await Promise.all([
  readJson<ConstructionSite[]>(
    join(ROOT, "public", "data", "baustellen.json"),
  ),
  readJson<ConstructionSiteMetadata>(
    join(ROOT, "public", "data", "meta.json"),
  ),
]);

const feeds = createConstructionSiteFeeds(
  constructionSites,
  metadata,
  process.env.APP_URL ?? DEFAULT_APP_URL,
);

await Promise.all([
  writeFile(
    join(ROOT, "public", CONSTRUCTION_SITE_FEED_FILENAMES.rss),
    feeds.rss,
    "utf8",
  ),
  writeFile(
    join(ROOT, "public", CONSTRUCTION_SITE_FEED_FILENAMES.atom),
    feeds.atom,
    "utf8",
  ),
]);

console.log(
  `Wrote RSS and Atom feeds with ${constructionSites.length} construction sites.`,
);
