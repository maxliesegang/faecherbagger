import { useEffect, useState } from "react";
import { MIN_ADDRESS_QUERY_LENGTH } from "../lib/address-search.ts";
import { scheduleAddressSearch } from "../lib/address-search-request.ts";
import type { AddressSearchState } from "../lib/address-search-request.ts";

export function useAddressSearch(query: string): AddressSearchState {
  const trimmedQuery = query.trim();
  const [state, setState] = useState<AddressSearchState>({ query: "", status: "idle", results: [] });

  useEffect(() => {
    if (trimmedQuery.length < MIN_ADDRESS_QUERY_LENGTH) return;
    return scheduleAddressSearch(trimmedQuery, setState);
  }, [trimmedQuery]);

  // Never show results for an earlier query, even before effect cleanup runs.
  if (trimmedQuery.length < MIN_ADDRESS_QUERY_LENGTH) return { query: trimmedQuery, status: "idle", results: [] };
  if (state.query !== trimmedQuery) return { query: trimmedQuery, status: "loading", results: [] };
  return state;
}
