/**
 * `POST /notifications/test` end to end, inside workerd.
 *
 * The node suite covers the encryption and the pure helpers; what it cannot
 * reach is the handler itself — VAPID configuration, the subscription lookup,
 * the cooldown UPDATE and the disposal of dead subscriptions all need a real
 * D1 and a real outbound `fetch`. Both are provided here.
 *
 * The Worker is imported rather than driven through `SELF` so that it runs in
 * this isolate, where the push service can be replaced with a stub that records
 * what it was sent. Nothing leaves the test.
 */

import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import schemaSql from "../schema.sql?raw";
import { base64UrlEncode } from "../src/web-push.ts";

const ENDPOINT = "https://push.example.test/endpoint/device-a";

/** Cooldown enforced by the handler, mirrored from the Worker source. */
const COOLDOWN_SECONDS = 60;

type PushStub = ReturnType<typeof stubPushService>;

/** Replaces the push service, capturing the single request the Worker sends. */
function stubPushService(status: number) {
  const stub = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status }),
  );
  vi.stubGlobal("fetch", stub);
  return stub;
}

const sentRequest = (stub: PushStub) => {
  expect(stub).toHaveBeenCalledOnce();
  const [url, init] = stub.mock.calls[0]!;
  return { url: String(url), init: init ?? {} };
};

/**
 * A subscription the encryption will actually accept: `p256dh` has to be a
 * genuine uncompressed P-256 point or the ECDH in `encryptPushPayload` throws
 * long before the handler's own logic is reached.
 */
async function createSubscriptionKeys() {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey(
    "raw",
    keyPair.publicKey,
  )) as ArrayBuffer;
  return {
    p256dh: base64UrlEncode(new Uint8Array(raw)),
    auth: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))),
  };
}

async function applySchema() {
  const statements = schemaSql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
}

async function storeSubscription(endpoint = ENDPOINT) {
  const keys = await createSubscriptionKeys();
  await env.DB.prepare(
    `INSERT INTO subscriptions
       (endpoint, p256dh, auth, expiration_time, created_at, updated_at)
     VALUES (?1, ?2, ?3, NULL, unixepoch(), unixepoch())`,
  )
    .bind(endpoint, keys.p256dh, keys.auth)
    .run();
}

const readLastTestAt = (endpoint = ENDPOINT) =>
  env.DB.prepare("SELECT last_test_at FROM subscriptions WHERE endpoint = ?1")
    .bind(endpoint)
    .first<{ last_test_at: number | null }>();

async function requestTest(endpoint: unknown = ENDPOINT, method = "POST") {
  const request = new Request("https://worker.test/notifications/test", {
    method,
    ...(method === "POST"
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }
      : {}),
  });
  // The handler declares only (request, env) — it never defers work to
  // `ctx.waitUntil`, so there is no execution context to wait on.
  // A constructed Request lacks the `cf` properties Workers attach to inbound
  // ones; the handler never reads them.
  return worker.fetch(request as Parameters<typeof worker.fetch>[0], env);
}

beforeEach(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM subscriptions"),
    env.DB.prepare("DELETE FROM notified_events"),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /notifications/test", () => {
  it("sends a VAPID-signed, encrypted push and reports acceptance", async () => {
    await storeSubscription();
    const stub = stubPushService(201);

    const response = await requestTest();

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });

    const { url, init } = sentRequest(stub);
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");

    const headers = new Headers(init.headers);
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("ttl")).toBe("60");
    expect(headers.get("urgency")).toBe("high");

    // A VAPID JWT plus the public key the Worker is configured with.
    const authorization = headers.get("authorization") ?? "";
    expect(authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(authorization).toContain(`k=${env.VAPID_PUBLIC_KEY}`);

    // The payload is ciphertext, so the guarantee is that the plaintext the
    // handler composed is nowhere in what went over the wire.
    const body = new Uint8Array(init.body as ArrayBuffer);
    expect(body.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(body)).not.toContain("Zustellung");
  });

  it("records the send, so the cooldown rejects an immediate retry", async () => {
    await storeSubscription();
    const first = stubPushService(201);
    await requestTest();
    expect(first).toHaveBeenCalledOnce();

    const stamped = await readLastTestAt();
    expect(stamped?.last_test_at).toBeTypeOf("number");

    const second = stubPushService(201);
    const response = await requestTest();

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Too many requests" });
    // The rejection has to happen before the push, not after it.
    expect(second).not.toHaveBeenCalled();
  });

  it("allows another test once the cooldown has elapsed", async () => {
    await storeSubscription();
    stubPushService(201);
    await requestTest();

    await env.DB.prepare(
      "UPDATE subscriptions SET last_test_at = unixepoch() - ?2 WHERE endpoint = ?1",
    )
      .bind(ENDPOINT, COOLDOWN_SECONDS + 1)
      .run();

    const later = stubPushService(201);
    const response = await requestTest();

    expect(response.status).toBe(202);
    expect(later).toHaveBeenCalledOnce();
  });

  it("drops a subscription the push service reports as gone", async () => {
    await storeSubscription();
    stubPushService(410);

    const response = await requestTest();

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "Subscription expired" });
    expect(await readLastTestAt()).toBeNull();
  });

  it("reports a push service failure without discarding the subscription", async () => {
    await storeSubscription();
    stubPushService(500);

    const response = await requestTest();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Push service responded 500",
    });
    expect(await readLastTestAt()).not.toBeNull();
  });

  it("answers 404 for an endpoint that was never stored", async () => {
    const stub = stubPushService(201);

    const response = await requestTest();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Unknown subscription" });
    expect(stub).not.toHaveBeenCalled();
  });

  it("rejects a malformed endpoint before touching the database", async () => {
    const stub = stubPushService(201);

    const response = await requestTest("http://insecure.test/x");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid endpoint" });
    expect(stub).not.toHaveBeenCalled();
  });

  it("refuses anything but POST", async () => {
    const response = await requestTest(ENDPOINT, "GET");
    expect(response.status).toBe(405);
  });
});
