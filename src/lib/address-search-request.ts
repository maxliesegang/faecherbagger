import { searchAddresses } from "./address-search.ts";
import type { AddressSearchResult } from "./address-search.ts";

export interface AddressSearchState {
  query: string;
  status: "idle" | "loading" | "ready" | "error";
  results: AddressSearchResult[];
}

const SEARCH_DELAY_MS = 500;
const SEARCH_TIMEOUT_MS = 8_000;

/** Cancel on query changes/unmount; late responses cannot update the caller. */
export function scheduleAddressSearch(query: string, onStateChange: (state: AddressSearchState) => void): () => void {
  const controller = new AbortController();
  let isCurrent = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const delay = setTimeout(() => {
    onStateChange({ query, status: "loading", results: [] });
    timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    void searchAddresses(query, controller.signal).then(
      (results) => {
        if (isCurrent) onStateChange({ query, status: "ready", results });
      },
      () => {
        if (isCurrent) onStateChange({ query, status: "error", results: [] });
      },
    ).finally(() => clearTimeout(timeout));
  }, SEARCH_DELAY_MS);
  return () => {
    isCurrent = false;
    clearTimeout(delay);
    clearTimeout(timeout);
    controller.abort();
  };
}
