/**
 * Puts the push database under `wrangler d1 migrations` tracking, once.
 *
 * Until now migrations were applied by hand, so the production database has
 * no `d1_migrations` ledger and `wrangler d1 migrations apply` would replay
 * every file, failing on the first ALTER that already ran. This script writes
 * that ledger from what the database actually contains:
 *
 * - no `subscriptions` table: a fresh database. Load `schema.sql` and record
 *   every migration as applied, because the schema already includes them.
 * - `subscriptions` but no ledger: a hand-managed database. Record the
 *   migrations whose effect is visible, so only the missing ones run.
 * - a ledger already present: nothing to do.
 *
 * Usage: tsx scripts/prepare-push-database.ts [--remote|--local] [wrangler flags]
 * Run `wrangler d1 migrations apply` afterwards; the deploy workflow does both.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const DATABASE = "faecherbagger-push";
const CONFIG = "push-worker/wrangler.jsonc";
const MIGRATIONS_DIRECTORY = "push-worker/migrations";

const targetArguments = process.argv.slice(2);
if (!targetArguments.includes("--remote") && !targetArguments.includes("--local")) {
  throw new Error("Pass --remote or --local.");
}

interface D1Result<Row> {
  results: Row[];
}

function wrangler(extraArguments: string[]) {
  return execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      DATABASE,
      ...targetArguments,
      "--config",
      CONFIG,
      ...extraArguments,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
}

function query<Row>(sql: string): Row[] {
  const output = JSON.parse(
    wrangler(["--json", "--command", sql]),
  ) as D1Result<Row>[];
  return output[0]?.results ?? [];
}

function recordAsApplied(migrationNames: string[]) {
  const values = migrationNames
    .map((name) => {
      if (!/^[\w.-]+$/.test(name)) throw new Error(`Bad name: ${name}`);
      return `('${name}')`;
    })
    .join(", ");
  // Same definition wrangler creates, so its later runs adopt this table.
  wrangler([
    "--command",
    `CREATE TABLE IF NOT EXISTS d1_migrations(
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT UNIQUE,
       applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
     );` +
      (values ? ` INSERT OR IGNORE INTO d1_migrations (name) VALUES ${values};` : ""),
  ]);
  console.log(
    `Recorded as applied: ${migrationNames.join(", ") || "(none)"}`,
  );
}

const tables = new Set(
  query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  ).map((row) => row.name),
);

if (tables.has("d1_migrations")) {
  console.log("Migrations are already tracked; nothing to prepare.");
} else if (!tables.has("subscriptions")) {
  console.log("Empty database: loading schema.sql.");
  wrangler(["--file", "push-worker/schema.sql"]);
  recordAsApplied(
    readdirSync(MIGRATIONS_DIRECTORY)
      .filter((name) => name.endsWith(".sql"))
      .sort(),
  );
} else {
  const columns = new Set(
    query<{ name: string }>("PRAGMA table_info(subscriptions)").map(
      (row) => row.name,
    ),
  );
  // Only the migrations that existed before tracking began. Anything newer is
  // left to `wrangler d1 migrations apply`.
  const applied = ["0001_notification_radius.sql"];
  const isPreferencesMigrationApplied =
    tables.has("notified_events") && !columns.has("notification_radius_m");
  if (isPreferencesMigrationApplied) {
    applied.push("0002_notification_preferences.sql");
    // 0002 rebuilds the table, so 0003's column only counts after it.
    if (columns.has("next_push_on")) applied.push("0003_next_push_on.sql");
  }
  recordAsApplied(applied);
}
