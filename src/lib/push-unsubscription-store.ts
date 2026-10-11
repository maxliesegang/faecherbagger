/** Durable deletion requests, separate from the device's notification choices. */
export interface PendingPushUnsubscription {
  apiURL: string;
  endpoint: string;
}

const DATABASE_NAME = "faecherbagger-push-unsubscriptions";
const STORE_NAME = "pending";

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, {
        keyPath: ["apiURL", "endpoint"],
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function loadPendingPushUnsubscriptions(): Promise<PendingPushUnsubscription[]> {
  const stored: unknown = await withStore("readonly", (store) => store.getAll());
  if (!Array.isArray(stored)) return [];
  return stored.filter((value: unknown): value is PendingPushUnsubscription =>
    value !== null && typeof value === "object" &&
    "apiURL" in value && typeof value.apiURL === "string" &&
    "endpoint" in value && typeof value.endpoint === "string",
  );
}

export async function savePendingPushUnsubscription(
  subscription: PendingPushUnsubscription,
): Promise<void> {
  await withStore("readwrite", (store) => store.put(subscription));
}

export async function removePendingPushUnsubscription(
  subscription: PendingPushUnsubscription,
): Promise<void> {
  await withStore("readwrite", (store) =>
    store.delete([subscription.apiURL, subscription.endpoint]),
  );
}
