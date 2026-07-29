/**
 * Data pipeline: fetch the two TRK construction-site WFS layers, normalize and
 * deduplicate them, and write the static JSON files the client consumes.
 *
 * Outputs (in public/data/, so Vite ships them verbatim to the build output):
 *   public/data/baustellen.json – normalized, deduplicated, Karlsruhe-region records
 *   public/data/meta.json       – fetch timestamp, counts, source attribution
 *   public/data/changes.json    – records first seen inside the recent window
 *   public/baustellen.xml       – RSS 2.0 feed of current records and revisions
 *   public/baustellen.atom      – Atom 1.0 feed of current records and revisions
 *
 * Run with: `npm run data`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ConstructionPhase,
  ConstructionSite,
  ConstructionSiteMetadata,
} from "../src/types/index.ts";
import { assignFirstSeenAt } from "../src/pipeline/construction-site-first-seen.ts";
import { buildConstructionSiteAdditions } from "../src/pipeline/construction-site-additions.ts";
import { normalizeConstructionSites } from "../src/pipeline/construction-site-normalization.ts";
import {
  CONSTRUCTION_SITE_FEED_FILENAMES,
  createConstructionSiteFeeds,
} from "../src/pipeline/construction-site-feeds.ts";
import {
  WFS_ENDPOINT_URL,
  WFS_LAYER_NAME_BY_PHASE,
  fetchConstructionSiteLayer,
} from "../src/pipeline/wfs-client.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data");
const DEFAULT_APP_URL = "https://maxliesegang.github.io/faecherbagger/";
const CONSTRUCTION_PHASES: ConstructionPhase[] = ["active", "upcoming"];

async function readJSONIfExists<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJSON(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const unknownArt = new Set<string>();
  const onUnknownArt = (art: string) => unknownArt.add(art);
  const onWarn = (message: string) => console.warn(`  warn: ${message}`);

  const sitesByPhase = await Promise.all(
    CONSTRUCTION_PHASES.map(async (phase) => {
      console.log(`Fetching ${WFS_LAYER_NAME_BY_PHASE[phase]} ...`);
      const featureCollection = await fetchConstructionSiteLayer(phase);
      const normalizedSites = normalizeConstructionSites(
        featureCollection.features,
        phase,
        {
          onUnknownArt,
          onWarn,
        },
      );
      console.log(
        `  ${featureCollection.features.length} features -> ${normalizedSites.length} records`,
      );
      return normalizedSites;
    }),
  );
  const normalizedSites = sitesByPhase.flat();

  if (unknownArt.size > 0) {
    console.warn(
      `Unknown 'art' values mapped to "other": ${[...unknownArt]
        .map((art) => JSON.stringify(art))
        .join(", ")}`,
    );
  }

  await mkdir(DATA_DIR, { recursive: true });

  const fetchedAt = new Date().toISOString();

  // The pipeline's only memory of earlier runs: which ids we had already seen.
  const previousSites =
    (await readJSONIfExists<ConstructionSite[]>(
      join(DATA_DIR, "baustellen.json"),
    )) ?? [];
  const constructionSites = assignFirstSeenAt(
    normalizedSites,
    previousSites,
    fetchedAt,
  );
  constructionSites.sort((left, right) => left.id.localeCompare(right.id));

  const additions = buildConstructionSiteAdditions(constructionSites, fetchedAt);
  const attribution = [
    ...new Set(constructionSites.map((site) => site.source)),
  ].sort();
  const metadata: ConstructionSiteMetadata = {
    fetchedAt,
    recordCount: constructionSites.length,
    counts: {
      active: constructionSites.filter((site) => site.phase === "active").length,
      upcoming: constructionSites.filter((site) => site.phase === "upcoming")
        .length,
    },
    source: {
      name: "TechnologieRegion Karlsruhe (TRK) – Mobilitätsportal",
      url: WFS_ENDPOINT_URL,
      layers: CONSTRUCTION_PHASES.map(
        (phase) => WFS_LAYER_NAME_BY_PHASE[phase],
      ),
    },
    attribution,
  };

  await writeJSON(join(DATA_DIR, "baustellen.json"), constructionSites);
  await writeJSON(join(DATA_DIR, "meta.json"), metadata);
  await writeJSON(join(DATA_DIR, "changes.json"), additions);
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
    `Wrote ${constructionSites.length} records (active ${metadata.counts.active}, ` +
      `upcoming ${metadata.counts.upcoming}). ${additions.added.length} first seen ` +
      `in the last ${additions.windowDays} days, of which ` +
      `${constructionSites.filter((site) => site.firstSeenAt === fetchedAt).length} ` +
      `in this run.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
