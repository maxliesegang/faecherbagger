import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingPushUnsubscription } from "../src/lib/push-unsubscription-store.ts";
import { savePendingPushUnsubscription } from "../src/lib/push-unsubscription-store.ts";

const pending = vi.hoisted(() => ({ subscriptions: [] as PendingPushUnsubscription[] }));
vi.mock("../src/lib/push-unsubscription-store.ts", () => ({
  loadPendingPushUnsubscriptions: vi.fn(async () => [...pending.subscriptions]),
  savePendingPushUnsubscription: vi.fn(async (subscription: PendingPushUnsubscription) => {
    pending.subscriptions.push(subscription);
  }),
  removePendingPushUnsubscription: vi.fn(async (subscription: PendingPushUnsubscription) => {
    pending.subscriptions = pending.subscriptions.filter((value) => value !== subscription);
  }),
}));

const API_URL = "https://worker.example.test";
const ENDPOINT = "https://push.example.test/browser-a";
const request = vi.fn<typeof fetch>();
let current: Pick<PushSubscription, "endpoint" | "unsubscribe" | "toJSON"> | null;
let unsubscribe: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_PUSH_API_URL", API_URL);
  pending.subscriptions = [];
  unsubscribe = vi.fn(async () => { current = null; return true; });
  current = { endpoint: ENDPOINT, unsubscribe, toJSON: () => ({ endpoint: ENDPOINT }) };
  vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({
    pushManager: { getSubscription: async () => current },
  }) } });
  vi.stubGlobal("window", { PushManager: class {} });
  vi.stubGlobal("fetch", request);
  request.mockReset();
  request.mockImplementation(async () => new Response("{}"));
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("push privacy and deletion", () => {
  it("sends status identifiers in the body without credentials or referrers", async () => {
    request.mockResolvedValueOnce(new Response('{"registered":true}'));
    const { getServerSubscriptionState } = await import("../src/lib/push.ts");
    expect(await getServerSubscriptionState()).toMatchObject({ state: "registered" });
    expect(request).toHaveBeenCalledWith(`${API_URL}/subscriptions/status`, expect.objectContaining({
      method: "POST", body: JSON.stringify({ endpoint: ENDPOINT }),
      cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
    }));
  });

  it("retains a failed deletion after unsubscribing and retries after an app restart", async () => {
    request.mockRejectedValueOnce(new TypeError("Offline"));
    const { unsubscribeFromPush } = await import("../src/lib/push.ts");
    expect(await unsubscribeFromPush()).toBe(false);
    expect(current).toBeNull();
    expect(pending.subscriptions).toEqual([{ apiURL: API_URL, endpoint: ENDPOINT }]);
    vi.resetModules();
    const { retryPendingPushUnsubscriptions } = await import("../src/lib/push.ts");
    expect(await retryPendingPushUnsubscriptions()).toBe(true);
    expect(pending.subscriptions).toEqual([]);
    expect(request).toHaveBeenLastCalledWith(`${API_URL}/subscriptions`, expect.objectContaining({
      method: "DELETE", body: JSON.stringify({ endpoint: ENDPOINT }),
    }));
  });

  it("persists the request before trying to unsubscribe", async () => {
    unsubscribe.mockImplementationOnce(async () => {
      expect(pending.subscriptions).toEqual([{ apiURL: API_URL, endpoint: ENDPOINT }]);
      current = null;
      return true;
    });
    const { unsubscribeFromPush } = await import("../src/lib/push.ts");
    expect(await unsubscribeFromPush()).toBe(true);
    expect(pending.subscriptions).toEqual([]);
  });

  it("does not claim success or delete the retry request when the browser cannot unsubscribe", async () => {
    unsubscribe.mockResolvedValue(false);
    const { unsubscribeFromPush } = await import("../src/lib/push.ts");
    await expect(unsubscribeFromPush()).rejects.toThrow("nicht ausgeschaltet");
    expect(pending.subscriptions).toHaveLength(1);
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the browser subscription when durable storage fails", async () => {
    vi.mocked(savePendingPushUnsubscription).mockRejectedValueOnce(new Error("Storage unavailable"));
    const { unsubscribeFromPush } = await import("../src/lib/push.ts");
    await expect(unsubscribeFromPush()).rejects.toThrow("Löschauftrag nicht speichern");
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(current?.endpoint).toBe(ENDPOINT);
    expect(request).not.toHaveBeenCalled();
  });

  it("does not send an old deletion request to a different API", async () => {
    current = null;
    pending.subscriptions = [{ apiURL: "https://old.example.test", endpoint: ENDPOINT }];
    const { retryPendingPushUnsubscriptions } = await import("../src/lib/push.ts");
    expect(await retryPendingPushUnsubscriptions()).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(pending.subscriptions).toHaveLength(1);
  });

  it("prevents reactivation while server deletion is still pending", async () => {
    current = null;
    pending.subscriptions = [{ apiURL: API_URL, endpoint: ENDPOINT }];
    request.mockResolvedValue(new Response("{}", { status: 503 }));
    const { subscribeToPush } = await import("../src/lib/push.ts");
    await expect(subscribeToPush()).rejects.toThrow("noch gelöscht");
    expect(request.mock.calls.every(([URL]) => URL === `${API_URL}/subscriptions`)).toBe(true);
  });
});
