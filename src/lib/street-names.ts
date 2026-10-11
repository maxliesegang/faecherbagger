import type { ConstructionSite } from "../types/index.ts";

/**
 * Street names in the source's free-text `location`.
 *
 * The source writes the same street as "Herrenalber Straße", "Herrenalberstr."
 * or "herrenalberstrasse", so names are compared as a sequence of lower-case
 * word tokens, joined without separators. Matching a run of tokens rather than
 * a substring keeps "Herrenstraße" from matching inside "Oberherrenstraße".
 */

const MAX_STREET_TOKENS = 4;

/** Lower-case tokens with `ß` and the `str.` abbreviation spelled out. */
function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase("de-DE")
    .replaceAll("ß", "ss")
    .replace(/str\.(?=\s|$|[,;/)])/gu, "strasse")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The comparable form of a street name: "Herrenalber Str." → "herrenalberstrasse". */
export const normalizeStreetName = (street: string): string =>
  tokenize(street).join("");

/** Whether `location` names `street` as a whole word or word sequence. */
export function locationMentionsStreet(location: string, street: string): boolean {
  const target = normalizeStreetName(street);
  if (!target) return false;
  const tokens = tokenize(location);
  for (let start = 0; start < tokens.length; start += 1) {
    let joined = "";
    for (
      let end = start;
      end < Math.min(tokens.length, start + MAX_STREET_TOKENS);
      end += 1
    ) {
      joined += tokens[end];
      if (joined === target) return true;
      if (joined.length >= target.length) break;
    }
  }
  return false;
}

/**
 * Where a street appears in a location text.
 *
 * - `on`: the works are on that street — "Kaiserstraße zw. …", or one of a
 *   list such as "Kronenstraße, Kaiserstraße".
 * - `junction`: it only bounds the works on another street — the "Kaiserstraße"
 *   in "Herrenstraße zw. Kaiserstraße und Zirkel". Usually just the junction
 *   itself is affected.
 *
 * The source phrases boundaries with "zw.", "zwischen", "ab", "bis", "Höhe" or
 * "Einmündung"; whatever follows such a word within one clause is a boundary.
 */
export type StreetMention = "on" | "junction";

const BOUNDARY_WORD = /(?:^|\s)(?:zw\.?|zwischen|ab|bis|höhe|einmündung)(?=\s|$)/iu;

export function findStreetMention(
  location: string,
  street: string,
): StreetMention | undefined {
  let mention: StreetMention | undefined;
  for (const clause of location.split(/[,;]/u)) {
    const boundary = BOUNDARY_WORD.exec(clause);
    const subject = boundary ? clause.slice(0, boundary.index) : clause;
    if (locationMentionsStreet(subject, street)) return "on";
    if (boundary && locationMentionsStreet(clause.slice(boundary.index), street)) {
      mention = "junction";
    }
  }
  return mention;
}

/**
 * Compound names ("Kaiserstraße", "Hans-Thoma-Straße") and the two-word
 * pattern of places named after a town ("Ettlinger Allee", "Mühlburger Tor").
 */
const STREET_NAME_PATTERN =
  /\p{Lu}[\p{L}-]*(?:[Ss]tra(?:ße|sse)|[Ss]tr\.|[Ww]eg|[Aa]llee|[Pp]latz|[Rr]ing|[Gg]asse|[Dd]amm|[Uu]fer|[Gg]raben|[Ss]teig|[Pp]fad)(?![\p{L}])|\p{Lu}[\p{L}-]*er (?:Straße|Strasse|Str\.|Allee|Weg|Platz|Ring|Tor|Damm)(?![\p{L}])/gu;

/** Street names a location text mentions, in source spelling. */
export function extractStreetNames(location: string): string[] {
  return [...location.matchAll(STREET_NAME_PATTERN)].map((match) =>
    match[0].replace(/str\.$/u, "straße"),
  );
}

export interface StreetSuggestion {
  street: string;
  municipality: string;
  /** Sites in the current data that mention the street. */
  constructionSiteCount: number;
}

/**
 * Streets from the current data whose name starts with or contains `query`,
 * most-mentioned first. Only offers what the data actually names: a street
 * nobody is digging up today can still be typed in full and saved.
 */
export function suggestStreets(
  constructionSites: readonly ConstructionSite[],
  query: string,
  limit = 6,
): StreetSuggestion[] {
  const normalizedQuery = normalizeStreetName(query);
  if (normalizedQuery.length < 3) return [];
  const suggestions = new Map<string, StreetSuggestion>();
  for (const constructionSite of constructionSites) {
    for (const street of new Set(extractStreetNames(constructionSite.location))) {
      const normalized = normalizeStreetName(street);
      if (!normalized.includes(normalizedQuery)) continue;
      const key = `${normalized}|${constructionSite.municipality}`;
      const existing = suggestions.get(key);
      if (existing) existing.constructionSiteCount += 1;
      else
        suggestions.set(key, {
          street,
          municipality: constructionSite.municipality,
          constructionSiteCount: 1,
        });
    }
  }
  return [...suggestions.values()]
    .sort(
      (left, right) =>
        Number(normalizeStreetName(right.street).startsWith(normalizedQuery)) -
          Number(normalizeStreetName(left.street).startsWith(normalizedQuery)) ||
        right.constructionSiteCount - left.constructionSiteCount ||
        left.street.localeCompare(right.street, "de"),
    )
    .slice(0, limit);
}

export interface MunicipalitySuggestion {
  municipality: string;
  constructionSiteCount: number;
}

/** Municipalities in the data whose name starts with `query`. */
export function suggestMunicipalities(
  constructionSites: readonly ConstructionSite[],
  query: string,
): MunicipalitySuggestion[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("de-DE");
  if (normalizedQuery.length < 3) return [];
  const counts = new Map<string, number>();
  for (const { municipality } of constructionSites) {
    if (municipality.toLocaleLowerCase("de-DE").startsWith(normalizedQuery)) {
      counts.set(municipality, (counts.get(municipality) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([municipality, constructionSiteCount]) => ({
      municipality,
      constructionSiteCount,
    }))
    .sort((left, right) => left.municipality.localeCompare(right.municipality, "de"));
}
