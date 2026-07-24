/**
 * Data pipeline: fetch the two TRK Baustellen WFS layers, normalize and
 * deduplicate them, diff against the previous run, and write the static JSON
 * files the client consumes.
 *
 * Outputs (in public/data/, so Vite ships them verbatim to the build output):
 *   public/data/baustellen.json – normalized, deduplicated, Karlsruhe-region records
 *   public/data/meta.json       – fetch timestamp, counts, source attribution
 *   public/data/changes.json    – records added / modified / removed since last run
 *
 * Run with: `npm run data`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Baustelle, Meta, Phase } from "../src/types/index.ts";
import { computeChanges } from "../src/lib/changes.ts";
import { normalizeFeatures } from "../src/lib/normalize.ts";
import { LAYERS, WFS_BASE, fetchLayer } from "../src/lib/wfs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data");
const PHASES: Phase[] = ["active", "upcoming"];

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const unknownArt = new Set<string>();
  const onUnknownArt = (art: string) => unknownArt.add(art);
  const onWarn = (message: string) => console.warn(`  warn: ${message}`);

  const recordsByPhase = await Promise.all(PHASES.map(async (phase) => {
    console.log(`Fetching ${LAYERS[phase]} ...`);
    const collection = await fetchLayer(phase);
    const normalized = normalizeFeatures(collection.features, phase, {
      onUnknownArt,
      onWarn,
    });
    console.log(
      `  ${collection.features.length} features -> ${normalized.length} records`,
    );
    return normalized;
  }));
  const records: Baustelle[] = recordsByPhase.flat();
  records.sort((a, b) => a.id.localeCompare(b.id));

  if (unknownArt.size > 0) {
    console.warn(
      `Unknown 'art' values mapped to "other": ${[...unknownArt]
        .map((a) => JSON.stringify(a))
        .join(", ")}`,
    );
  }

  await mkdir(DATA_DIR, { recursive: true });

  const previous =
    (await readJsonIfExists<Baustelle[]>(join(DATA_DIR, "baustellen.json"))) ??
    [];
  const previousMeta = await readJsonIfExists<Meta>(join(DATA_DIR, "meta.json"));
  const changes = computeChanges(previous, records, previousMeta?.fetchedAt ?? null);

  const fetchedAt = new Date().toISOString();
  const attribution = [...new Set(records.map((r) => r.source))].sort();
  const meta: Meta = {
    fetchedAt,
    recordCount: records.length,
    counts: {
      active: records.filter((r) => r.phase === "active").length,
      upcoming: records.filter((r) => r.phase === "upcoming").length,
    },
    source: {
      name: "TechnologieRegion Karlsruhe (TRK) – Mobilitätsportal",
      url: WFS_BASE,
      layers: PHASES.map((p) => LAYERS[p]),
    },
    attribution,
  };

  await writeJson(join(DATA_DIR, "baustellen.json"), records);
  await writeJson(join(DATA_DIR, "meta.json"), meta);
  await writeJson(join(DATA_DIR, "changes.json"), changes);

  console.log(
    `Wrote ${records.length} records (active ${meta.counts.active}, ` +
      `upcoming ${meta.counts.upcoming}). Changes: +${changes.added.length} ` +
      `~${changes.modified.length} -${changes.removed.length}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
