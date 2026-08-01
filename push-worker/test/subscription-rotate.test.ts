/**
 * `POST /subscriptions/rotate`, against a real D1.
 *
 * Rotation is the one path that moves a row between endpoints, so it is the one
 * place the per-device bookkeeping — the daily cap's `last_notified_at` and the
 * test cooldown's `last_test_at` — can silently go missing. These tests exist
 * to hold both to the row.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index.ts";
import schemaSql from "../schema.sql?raw";

const OLD_ENDPOINT = "https://push.example.test/endpoint/old";
const NEW_ENDPOINT = "https://push.example.test/endpoint/new";

interface Row {
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
  last_notified_at: number | null;
  last_test_at: number | null;
  created_at: number;
}

async function applySchema() {
  const statements = schemaSql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
}

async function insert(
  endpoint: string,
  bookkeeping: { lastNotifiedAt?: number; lastTestAt?: number } = {},
) {
  await env.DB.prepare(
    `INSERT INTO subscriptions
       (endpoint, p256dh, auth, expiration_time,
        last_notified_at, last_test_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, NULL, ?4, ?5, 1000, 1000)`,
  )
    .bind(
      endpoint,
      `key-for-${endpoint}`,
      `auth-for-${endpoint}`,
      bookkeeping.lastNotifiedAt ?? null,
      bookkeeping.lastTestAt ?? null,
    )
    .run();
}

const readRow = (endpoint: string) =>
  env.DB.prepare("SELECT * FROM subscriptions WHERE endpoint = ?1")
    .bind(endpoint)
    .first<Row>();

const countRows = async () =>
  (
    await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions").first<{
      n: number;
    }>()
  )?.n;

async function rotate(oldEndpoint: string, endpoint: string) {
  const request = new Request("https://worker.test/subscriptions/rotate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      oldEndpoint,
      subscription: {
        endpoint,
        keys: { p256dh: "rotated-p256dh", auth: "rotated-auth" },
        expirationTime: null,
      },
    }),
  });
  return worker.fetch(request as Parameters<typeof worker.fetch>[0], env);
}

beforeEach(async () => {
  await applySchema();
  await env.DB.prepare("DELETE FROM subscriptions").run();
});

describe("POST /subscriptions/rotate", () => {
  it("carries the rate-limit bookkeeping across to the new endpoint", async () => {
    await insert(OLD_ENDPOINT, { lastNotifiedAt: 5000, lastTestAt: 6000 });

    const response = await rotate(OLD_ENDPOINT, NEW_ENDPOINT);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rotated: true });

    const moved = await readRow(NEW_ENDPOINT);
    expect(moved?.last_notified_at).toBe(5000);
    expect(moved?.last_test_at).toBe(6000);
    // The new keys land, and the row keeps its original identity.
    expect(moved?.p256dh).toBe("rotated-p256dh");
    expect(moved?.auth).toBe("rotated-auth");
    expect(moved?.created_at).toBe(1000);

    expect(await readRow(OLD_ENDPOINT)).toBeNull();
    expect(await countRows()).toBe(1);
  });

  it("keeps the bookkeeping when the endpoint is unchanged", async () => {
    await insert(OLD_ENDPOINT, { lastNotifiedAt: 5000, lastTestAt: 6000 });

    const response = await rotate(OLD_ENDPOINT, OLD_ENDPOINT);

    expect(response.status).toBe(200);
    const row = await readRow(OLD_ENDPOINT);
    expect(row?.last_notified_at).toBe(5000);
    expect(row?.last_test_at).toBe(6000);
    expect(row?.p256dh).toBe("rotated-p256dh");
    expect(await countRows()).toBe(1);
  });

  it("keeps the later timestamps when rotating onto a registered endpoint", async () => {
    await insert(OLD_ENDPOINT, { lastNotifiedAt: 5000, lastTestAt: 9000 });
    await insert(NEW_ENDPOINT, { lastNotifiedAt: 7000, lastTestAt: 2000 });

    const response = await rotate(OLD_ENDPOINT, NEW_ENDPOINT);

    expect(response.status).toBe(200);
    const merged = await readRow(NEW_ENDPOINT);
    // Neither row's limit is shed: the newer of each pair survives.
    expect(merged?.last_notified_at).toBe(7000);
    expect(merged?.last_test_at).toBe(9000);
    expect(await readRow(OLD_ENDPOINT)).toBeNull();
    expect(await countRows()).toBe(1);
  });

  it("leaves NULL bookkeeping as NULL", async () => {
    await insert(OLD_ENDPOINT);

    await rotate(OLD_ENDPOINT, NEW_ENDPOINT);

    const moved = await readRow(NEW_ENDPOINT);
    expect(moved?.last_notified_at).toBeNull();
    expect(moved?.last_test_at).toBeNull();
  });

  it("reports an unknown old endpoint without disturbing other rows", async () => {
    await insert(NEW_ENDPOINT, { lastNotifiedAt: 7000, lastTestAt: 2000 });

    const response = await rotate(OLD_ENDPOINT, NEW_ENDPOINT);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rotated: false });

    // The bystander row must survive untouched — it is a live subscription.
    const untouched = await readRow(NEW_ENDPOINT);
    expect(untouched?.last_notified_at).toBe(7000);
    expect(untouched?.p256dh).toBe(`key-for-${NEW_ENDPOINT}`);
    expect(await countRows()).toBe(1);
  });

  it("rejects a malformed rotation", async () => {
    const request = new Request("https://worker.test/subscriptions/rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldEndpoint: "http://insecure.test/x" }),
    });
    const response = await worker.fetch(
      request as Parameters<typeof worker.fetch>[0],
      env,
    );
    expect(response.status).toBe(400);
  });
});
