import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAddressSearchResults, searchAddresses } from "../src/lib/address-search.ts";
import { scheduleAddressSearch } from "../src/lib/address-search-request.ts";

function addressFeature(properties: Record<string, unknown>, coordinates: unknown = [8.4, 49]) {
  return { type: "Feature", geometry: { type: "Point", coordinates }, properties };
}

const addressResponse = {
  type: "FeatureCollection",
  features: [addressFeature({ street: "Kaiserstraße", housenumber: "12", postcode: "76133", city: "Karlsruhe" })],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("address search boundary", () => {
  it("formats house numbers and locality without changing coordinate order", () => {
    expect(parseAddressSearchResults(addressResponse)).toEqual([
      { label: "Kaiserstraße 12, 76133 Karlsruhe", point: [8.4, 49] },
    ]);
  });

  it("supports named places, streets and missing optional address fields", () => {
    expect(parseAddressSearchResults({ type: "FeatureCollection", features: [
      addressFeature({ name: "Marktplatz", street: "Marktplatz", city: "Karlsruhe" }),
      addressFeature({ street: "Hauptstraße", village: "Dorf" }),
      addressFeature({ name: "Karlsruhe" }),
    ] }).map((result) => result.label)).toEqual(["Marktplatz, Karlsruhe", "Hauptstraße, Dorf", "Karlsruhe"]);
  });

  it("skips malformed features, invalid points and unlabeled results", () => {
    expect(parseAddressSearchResults({ type: "FeatureCollection", features: [
      null,
      { type: "Feature", geometry: { type: "LineString", coordinates: [8, 49] }, properties: { name: "Wrong geometry" } },
      addressFeature({ name: "Invalid" }, [181, 49]),
      addressFeature({ name: "Invalid" }, [8, Number.NaN]),
      addressFeature({ name: "Invalid" }, [8]),
      addressFeature({ name: 123 }),
      ...addressResponse.features,
    ] })).toHaveLength(1);
  });

  it("deduplicates results and caps the visible result count", () => {
    expect(parseAddressSearchResults({ type: "FeatureCollection", features: [
      ...addressResponse.features, ...addressResponse.features,
    ] })).toHaveLength(1);
    expect(parseAddressSearchResults({ type: "FeatureCollection", features: Array.from({ length: 10 }, (_, index) => addressFeature({ name: `Place ${index}` })) })).toHaveLength(5);
  });

  it("rejects an invalid envelope rather than reporting no matches", () => {
    for (const response of [null, {}, { type: "FeatureCollection", features: {} }]) {
      expect(() => parseAddressSearchResults(response)).toThrow();
    }
    expect(parseAddressSearchResults({ type: "FeatureCollection", features: [] })).toEqual([]);
  });

  it("does not send empty or short queries", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchAddresses("  ab  ", new AbortController().signal)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("encodes queries safely and uses a fixed Karlsruhe bias without credentials or caching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(addressResponse)));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    await searchAddresses("  Kaiserstraße & Ort  ", signal);
    const [searchURL, options] = fetchMock.mock.calls[0];
    expect(searchURL.origin).toBe("https://photon.komoot.io");
    expect(Object.fromEntries(searchURL.searchParams)).toEqual({
      q: "Kaiserstraße & Ort", lang: "de", limit: "5", lon: "8.4044", lat: "49.0094", zoom: "12",
    });
    expect(options).toMatchObject({ signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  });

  it("rejects throttling, network failures and malformed JSON", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValueOnce(new Response("not JSON"));
    vi.stubGlobal("fetch", fetchMock);
    for (let index = 0; index < 3; index++) {
      await expect(searchAddresses("Karlsruhe", new AbortController().signal)).rejects.toThrow();
    }
  });
});

describe("address search request lifecycle", () => {
  it("waits for a typing pause and cancels pending searches", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(addressResponse)));
    vi.stubGlobal("fetch", fetchMock);
    const onStateChange = vi.fn();
    const cancel = scheduleAddressSearch("Kaiser", onStateChange);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).not.toHaveBeenCalled();
    cancel();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const cancelNext = scheduleAddressSearch("Kaiserstraße", onStateChange);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onStateChange.mock.calls.map(([state]) => state.status)).toEqual(["loading", "ready"]);
    cancelNext();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts old requests and ignores their late responses", async () => {
    vi.useFakeTimers();
    let resolveOldRequest!: (response: Response) => void;
    const oldRequest = new Promise<Response>((resolve) => { resolveOldRequest = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(oldRequest).mockResolvedValueOnce(new Response(JSON.stringify(addressResponse)));
    vi.stubGlobal("fetch", fetchMock);
    const onStateChange = vi.fn();
    const cancelOld = scheduleAddressSearch("Older", onStateChange);
    await vi.advanceTimersByTimeAsync(500);
    cancelOld();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    const cancelNew = scheduleAddressSearch("Newer", onStateChange);
    await vi.advanceTimersByTimeAsync(500);
    resolveOldRequest(new Response(JSON.stringify({ type: "FeatureCollection", features: [] })));
    await vi.advanceTimersByTimeAsync(0);
    expect(onStateChange.mock.calls.map(([state]) => [state.query, state.status])).toEqual([
      ["Older", "loading"], ["Newer", "loading"], ["Newer", "ready"],
    ]);
    cancelNew();
  });

  it("times out without retrying and reports a recoverable error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_URL: URL, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onStateChange = vi.fn();
    const cancel = scheduleAddressSearch("Karlsruhe", onStateChange);
    await vi.advanceTimersByTimeAsync(8_500);
    expect(onStateChange.mock.calls.map(([state]) => state.status)).toEqual(["loading", "error"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    cancel();
  });
});
