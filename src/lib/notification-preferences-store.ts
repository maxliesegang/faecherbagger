import type { NotificationPreferences } from "../types/index.ts";
import {
  coerceNotificationPreferences,
  createDefaultNotificationPreferences,
} from "./notification-preferences.ts";

/**
 * Where the notification preferences live: IndexedDB, on the device only.
 *
 * IndexedDB rather than `localStorage` because the *service worker* is what
 * reads them — it decides which of a run's events to show, with no page open
 * and no server involved, and workers have no access to `localStorage`.
 *
 * Hand-rolled rather than pulling in a wrapper: this is one object store with
 * one record.
 */

const DATABASE_NAME = "faecherbagger";
const DATABASE_VERSION = 1;
const STORE_NAME = "preferences";
const PREFERENCES_KEY = "notification";

/** Pre-IndexedDB single-area storage, imported once so nobody loses their area. */
const LEGACY_AREA_STORAGE_KEY = "faecherbagger-notification-area";

const promisifyRequest = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const result = await promisifyRequest(run(transaction.objectStore(STORE_NAME)));
    return result;
  } finally {
    database.close();
  }
}

/**
 * The stored preferences, or the defaults.
 *
 * Never rejects: a device whose storage is unavailable (private mode, quota,
 * a corrupted record) should fall back to sensible defaults rather than break
 * the page or the push handler.
 */
export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const stored = await withStore<unknown>("readonly", (store) =>
      store.get(PREFERENCES_KEY),
    );
    if (stored !== undefined) return coerceNotificationPreferences(stored);
  } catch {
    return createDefaultNotificationPreferences();
  }
  return migrateLegacyNotificationArea();
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<void> {
  try {
    await withStore("readwrite", (store) =>
      store.put(preferences, PREFERENCES_KEY),
    );
  } catch {
    // Losing the write is survivable — the in-memory state still applies for
    // this visit, and the server-side subscription is unaffected.
  }
}

/**
 * Imports the one area an earlier version kept in `localStorage`.
 *
 * Runs only when IndexedDB holds nothing yet, and only in a window: a service
 * worker has no `localStorage` to import from.
 */
function migrateLegacyNotificationArea(): NotificationPreferences {
  const defaults = createDefaultNotificationPreferences();
  if (typeof localStorage === "undefined") return defaults;
  try {
    const stored = localStorage.getItem(LEGACY_AREA_STORAGE_KEY);
    if (!stored) return defaults;
    const legacy = JSON.parse(stored) as {
      center?: unknown;
      radiusKm?: unknown;
    };
    const migrated = coerceNotificationPreferences({
      ...defaults,
      areas: [
        {
          id: "migrated",
          label: "Mein Gebiet",
          center: legacy.center,
          radiusKm: legacy.radiusKm,
        },
      ],
    });
    if (migrated.areas.length > 0) {
      void saveNotificationPreferences(migrated);
      localStorage.removeItem(LEGACY_AREA_STORAGE_KEY);
    }
    return migrated;
  } catch {
    return defaults;
  }
}
