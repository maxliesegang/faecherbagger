import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import schemaSQL from "../schema.sql?raw";

const ENDPOINT = "https://push.example.test/device-a";
const ORIGIN = "https://maxliesegang.github.io";

const call = (path: string, body?: unknown, headers: HeadersInit = {}) =>
  worker.fetch(new Request(`https://worker.test${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as Parameters<typeof worker.fetch>[0], env);

beforeEach(async () => {
  const statements = schemaSQL.replace(/^\s*--.*$/gm, "").split(";")
    .map((statement) => statement.trim()).filter(Boolean);
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  await env.DB.prepare("DELETE FROM subscriptions").run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (endpoint, p256dh, auth, created_at, updated_at)
     VALUES (?1, 'test-key', 'test-auth', 1000, 1000)`,
  ).bind(ENDPOINT).run();
});

describe("subscription privacy", () => {
  it("checks registration from a body and prevents caching", async () => {
    const response = await call("/subscriptions/status", { endpoint: ENDPOINT }, { origin: ORIGIN });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await response.json()).toEqual({ registered: true });
    expect(await (await call("/subscriptions/status", {
      endpoint: "https://push.example.test/unknown",
    })).json()).toEqual({ registered: false });
  });

  it("rejects query-based checks, malformed bodies and disallowed origins", async () => {
    expect((await call(`/subscriptions/status?endpoint=${encodeURIComponent(ENDPOINT)}`)).status).toBe(405);
    for (const body of [null, [], "endpoint", {}, { endpoint: 42 }]) {
      expect((await call("/subscriptions/status", body)).status).toBe(400);
    }
    expect((await call("/subscriptions/status", { endpoint: ENDPOINT }, {
      origin: "https://other.test",
    })).status).toBe(403);
  });

  it("requires administrator access and paginates from the request body", async () => {
    expect((await call("/subscriptions/list", { limit: 1 })).status).toBe(401);
    const headers = { authorization: `Bearer ${env.ADMIN_TOKEN}` };
    const response = await call("/subscriptions/list", { limit: 1, after: "" }, headers);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const page = await response.json() as { subscriptions: { endpoint: string }[]; nextCursor: string };
    expect(page.subscriptions.map((subscription) => subscription.endpoint)).toEqual([ENDPOINT]);
    const next = await call("/subscriptions/list", { limit: 1, after: page.nextCursor }, headers);
    expect(await next.json()).toEqual({ subscriptions: [], nextCursor: null });
    expect((await call("/subscriptions?after=secret", undefined, headers)).status).toBe(405);
    for (const body of [null, { after: 2 }, { limit: "1" }, { after: "secret" }]) {
      expect((await call("/subscriptions/list", body, headers)).status).toBe(400);
    }
  });

  it("deletes idempotently without caching", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await worker.fetch(new Request("https://worker.test/subscriptions", {
        method: "DELETE",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ endpoint: ENDPOINT }),
      }) as Parameters<typeof worker.fetch>[0], env);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(await (await call("/subscriptions/status", { endpoint: ENDPOINT })).json())
      .toEqual({ registered: false });
  });

  it("logs only an error code when a database failure contains sensitive values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const prepare = vi.spyOn(env.DB, "prepare").mockImplementation(() => {
      throw new Error(`Database failure for ${ENDPOINT}, test-auth`);
    });
    try {
      const response = await call("/subscriptions/status", { endpoint: ENDPOINT });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Internal error" });
      expect(log.mock.calls).toEqual([[{ code: "PUSH_API_REQUEST_FAILED" }]]);
    } finally {
      log.mockRestore();
      prepare.mockRestore();
    }
  });
});
