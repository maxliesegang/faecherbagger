import type { LngLat } from "../types/index.ts";
import { isLngLat } from "./notification-preferences.ts";

export interface AddressSearchResult {
  label: string;
  point: LngLat;
}

export const MIN_ADDRESS_QUERY_LENGTH = 3;
const MAX_ADDRESS_RESULTS = 5;
// Keep the provider boundary here so it can be replaced independently of the UI.
const PHOTON_SEARCH_URL = "https://photon.komoot.io/api/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getText(properties: Record<string, unknown>, key: string): string {
  const value = properties[key];
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

/** Validate untrusted GeoJSON and retain only display text and a valid point. */
export function parseAddressSearchResults(response: unknown): AddressSearchResult[] {
  if (!isRecord(response) || response.type !== "FeatureCollection" || !Array.isArray(response.features)) {
    throw new Error("Invalid address search response");
  }
  const results: AddressSearchResult[] = [];
  const seen = new Set<string>();
  for (const feature of response.features) {
    if (!isRecord(feature) || feature.type !== "Feature" || !isRecord(feature.geometry) ||
      feature.geometry.type !== "Point" || !isLngLat(feature.geometry.coordinates) ||
      !isRecord(feature.properties)) continue;
    const properties = feature.properties;
    const street = getText(properties, "street");
    const houseNumber = getText(properties, "housenumber");
    const streetAddress = [street, houseNumber].filter(Boolean).join(" ");
    const name = getText(properties, "name");
    const locality = getText(properties, "city") || getText(properties, "town") ||
      getText(properties, "village") || getText(properties, "county");
    const postalLocality = [getText(properties, "postcode"), locality].filter(Boolean).join(" ");
    const label = [...new Set([name, streetAddress, postalLocality].filter(Boolean))].join(", ");
    if (!label) continue;
    const point: LngLat = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
    const identity = JSON.stringify([label, point]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    results.push({ label, point });
    if (results.length === MAX_ADDRESS_RESULTS) break;
  }
  return results;
}

/** No credentials, persistent query cache, GPS or saved area coordinates. */
export async function searchAddresses(query: string, signal: AbortSignal): Promise<AddressSearchResult[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < MIN_ADDRESS_QUERY_LENGTH) return [];
  const searchURL = new URL(PHOTON_SEARCH_URL);
  searchURL.search = new URLSearchParams({
    q: trimmedQuery,
    lang: "de",
    limit: String(MAX_ADDRESS_RESULTS),
    lon: "8.4044",
    lat: "49.0094",
    zoom: "12",
  }).toString();
  const response = await fetch(searchURL, {
    signal,
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Address search unavailable");
  const responseJSON: unknown = await response.json();
  return parseAddressSearchResults(responseJSON);
}
