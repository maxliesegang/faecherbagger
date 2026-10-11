/**
 * `POST /subscriptions/next-push` and the fallback written after a send,
 * against a real D1.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index.ts";
import schemaSql from "../schema.sql?raw";

const ENDPOINT = "https://web.push.apple.com/device-a";

async function applySchema() {
  const statements = schemaSql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
}

const call = (request: Request) =>
  worker.fetch(request as Parameters<typeof worker.fetch>[0], env);

const postJSON = (path: string, body: unknown, headers: HeadersInit = {}) =>
  call(
    new Request(`https://worker.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

const daysFromToday = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const readNextPushOn = async () =>
  (
    await env.DB.prepare(
      "SELECT next_push_on AS nextPushOn FROM subscriptions WHERE endpoint = ?1",
    )
      .bind(ENDPOINT)
      .first<{ nextPushOn: string | null }>()
  )?.nextPushOn;

async function insertSubscription(nextPushOn: string | null = null) {
  await env.DB.prepare(
    `INSERT INTO subscriptions
       (endpoint, p256dh, auth, next_push_on, created_at, updated_at)
     VALUES (?1, 'key', 'auth', ?2, 1000, 1000)`,
  )
    .bind(ENDPOINT, nextPushOn)
    .run();
}

beforeEach(async () => {
  await applySchema();
  await env.DB.prepare("DELETE FROM subscriptions").run();
});

describe("POST /subscriptions/next-push", () => {
  it("stores the date the device reports", async () => {
    await insertSubscription();
    const response = await postJSON("/subscriptions/next-push", {
      endpoint: ENDPOINT,
      nextPushOn: daysFromToday(3),
    });
    expect(response.status).toBe(200);
    expect(await readNextPushOn()).toBe(daysFromToday(3));
  });

  it("postpones a push by about a week at most", async () => {
    await insertSubscription();
    await postJSON("/subscriptions/next-push", {
      endpoint: ENDPOINT,
      nextPushOn: daysFromToday(60),
    });
    expect(await readNextPushOn()).toBe(daysFromToday(8));
  });

  it("rejects malformed and past dates", async () => {
    await insertSubscription();
    for (const nextPushOn of ["2026-02-30", "morgen", daysFromToday(-5)]) {
      const response = await postJSON("/subscriptions/next-push", {
        endpoint: ENDPOINT,
        nextPushOn,
      });
      expect(response.status).toBe(400);
    }
  });

  it("reports an unknown device instead of creating a row", async () => {
    const response = await postJSON("/subscriptions/next-push", {
      endpoint: ENDPOINT,
      nextPushOn: daysFromToday(1),
    });
    expect(response.status).toBe(404);
    expect(await readNextPushOn()).toBeUndefined();
  });
});

describe("POST /subscriptions/notified", () => {
  const markNotified = (today: string) =>
    postJSON(
      "/subscriptions/notified",
      {
        endpoints: [ENDPOINT],
        today,
        fallbackNextPushOn: "2026-10-18",
      },
      { authorization: "Bearer test-admin-token" },
    );

  it("writes the fallback over a date that was due", async () => {
    await insertSubscription("2026-10-11");
    expect((await markNotified("2026-10-11")).status).toBe(200);
    expect(await readNextPushOn()).toBe("2026-10-18");
  });

  it("keeps a date the device reported while the broadcast ran", async () => {
    await insertSubscription("2026-10-14");
    await markNotified("2026-10-11");
    expect(await readNextPushOn()).toBe("2026-10-14");
  });
});
