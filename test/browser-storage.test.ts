import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readStoredJSON,
  readStoredText,
  removeStoredText,
  writeStoredJSON,
  writeStoredText,
} from "../src/lib/browser-storage.ts";

/** Installs a storage stand-in for the duration of one test. */
function useStorage(storage: Partial<Storage>) {
  vi.stubGlobal("localStorage", storage);
}

/** A storage that rejects everything, as in private mode or a full quota. */
const unavailableStorage: Partial<Storage> = {
  getItem: () => {
    throw new Error("access denied");
  },
  setItem: () => {
    throw new Error("quota exceeded");
  },
  removeItem: () => {
    throw new Error("access denied");
  },
};

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    } satisfies Partial<Storage>,
  };
}

const isPoint = (value: unknown): value is { x: number } =>
  typeof value === "object" && value !== null && "x" in value;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser storage", () => {
  it("reads and writes through the underlying storage", () => {
    const { storage, values } = createMemoryStorage();
    useStorage(storage);

    writeStoredText("key", "value");
    expect(readStoredText("key")).toBe("value");
    removeStoredText("key");
    expect(values.has("key")).toBe(false);
  });

  it("treats an unavailable storage as empty instead of throwing", () => {
    useStorage(unavailableStorage);

    expect(readStoredText("key")).toBeNull();
    expect(() => writeStoredText("key", "value")).not.toThrow();
    expect(() => removeStoredText("key")).not.toThrow();
  });

  it("survives a missing storage entirely", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(readStoredText("key")).toBeNull();
    expect(() => writeStoredText("key", "value")).not.toThrow();
  });

  it("round-trips a validated JSON value", () => {
    useStorage(createMemoryStorage().storage);

    writeStoredJSON("point", { x: 1 });
    expect(readStoredJSON("point", isPoint)).toEqual({ x: 1 });
  });

  it("discards stored JSON that no longer matches the expected shape", () => {
    useStorage(
      createMemoryStorage({
        broken: "{not json",
        outdated: JSON.stringify({ y: 2 }),
      }).storage,
    );

    expect(readStoredJSON("broken", isPoint)).toBeNull();
    expect(readStoredJSON("outdated", isPoint)).toBeNull();
    expect(readStoredJSON("missing", isPoint)).toBeNull();
  });
});
