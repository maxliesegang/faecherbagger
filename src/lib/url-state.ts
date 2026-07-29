import type {
  ClosureSeverity,
  ConstructionCategory,
  ConstructionPhase,
} from "../types/index.ts";
import {
  CLOSURE_SEVERITIES,
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_PHASES,
} from "../shared/construction-site-labels.ts";
import {
  serializeConstructionSiteSort,
  parseConstructionSiteSort,
  type ConstructionSiteSort,
} from "./construction-site-sort.ts";
import {
  RECENT_WINDOW_DAYS,
  type RecentWindowDays,
} from "../shared/recency.ts";
import { DEFAULT_SITE_QUERY, type SiteQuery } from "./site-scope.ts";

/** How the result set is presented. */
export type ConstructionSiteResultView = "map" | "list";

export const CONSTRUCTION_SITE_RESULT_VIEWS = ["map", "list"] as const;

/**
 * The two top-level areas of the app. `"surroundings"` is the default and the
 * app's purpose: what is new around the visitor. `"explorer"` is the secondary
 * search over the whole region.
 */
export type AppSection = "surroundings" | "explorer";

export const APP_SECTIONS = ["surroundings", "explorer"] as const;

/**
 * The part of the UI state that belongs in the address bar, so a filtered view
 * can be bookmarked, shared or reloaded. Query keys are German because the URL
 * is user-facing; everything else in the codebase stays English.
 */
export interface AppURLState {
  section: AppSection;
  /** The shareable part of what the explorer is asking to see. */
  query: SiteQuery;
  view: ConstructionSiteResultView;
  sort: ConstructionSiteSort | null;
  detailSiteId?: string;
}

export const DEFAULT_APP_URL_STATE: Readonly<AppURLState> = {
  section: "surroundings",
  query: DEFAULT_SITE_QUERY,
  view: "map",
  sort: null,
};

const URL_SEARCH_PARAMETER_NAMES = {
  section: "bereich",
  search: "q",
  municipality: "ort",
  phase: "status",
  category: "art",
  closure: "sperrung",
  onlyRecent: "neu",
  windowDays: "seit",
  view: "ansicht",
  sort: "sortierung",
  detailSiteId: "baustelle",
} as const;

/**
 * A two-way mapping between an app value and its German URL spelling.
 *
 * The `Record` has to cover the union, and the inverse is derived from
 * `appValues` rather than written out. Each concept used to be two hand-kept
 * tables: adding a value meant editing both, and nothing failed if you only
 * edited one.
 */
function createURLValueCodec<T extends string | number>(
  appValues: readonly T[],
  urlValueByAppValue: Readonly<Record<T, string>>,
) {
  const appValueByURLValue = new Map<string, T>(
    appValues.map((value) => [urlValueByAppValue[value], value]),
  );
  return {
    toURL: (value: T): string => urlValueByAppValue[value],
    fromURL: (raw: string | null): T | undefined =>
      raw === null ? undefined : appValueByURLValue.get(raw),
  };
}

const SECTION_CODEC = createURLValueCodec<AppSection>(APP_SECTIONS, {
  surroundings: "umgebung",
  explorer: "alle",
});

const RESULT_VIEW_CODEC = createURLValueCodec<ConstructionSiteResultView>(
  CONSTRUCTION_SITE_RESULT_VIEWS,
  { map: "karte", list: "liste" },
);

const WINDOW_DAYS_CODEC = createURLValueCodec<RecentWindowDays>(
  RECENT_WINDOW_DAYS,
  { 1: "24h", 7: "7t", 30: "30t" },
);

/** Returns the parameter value when it is one of `allowed`, else `""`. */
function readAllowedParameterValue<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | "" {
  const value = params.get(key);
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : "";
}

/**
 * Reads the shareable state from a query string. Unknown or malformed values
 * fall back to the default rather than throwing, so a hand-edited or outdated
 * link still opens a usable page.
 */
export function parseAppURLState(search: string): AppURLState {
  const params = new URLSearchParams(search);
  return {
    section:
      SECTION_CODEC.fromURL(params.get(URL_SEARCH_PARAMETER_NAMES.section)) ??
      DEFAULT_APP_URL_STATE.section,
    query: {
      filters: {
        search:
          params.get(URL_SEARCH_PARAMETER_NAMES.search)?.slice(0, 200) ?? "",
        municipality:
          params.get(URL_SEARCH_PARAMETER_NAMES.municipality)?.slice(0, 200) ??
          "",
        phase: readAllowedParameterValue<ConstructionPhase>(
          params,
          URL_SEARCH_PARAMETER_NAMES.phase,
          CONSTRUCTION_PHASES,
        ),
        category: readAllowedParameterValue<ConstructionCategory>(
          params,
          URL_SEARCH_PARAMETER_NAMES.category,
          CONSTRUCTION_CATEGORIES,
        ),
        closure: readAllowedParameterValue<ClosureSeverity>(
          params,
          URL_SEARCH_PARAMETER_NAMES.closure,
          CLOSURE_SEVERITIES,
        ),
      },
      onlyRecent: params.get(URL_SEARCH_PARAMETER_NAMES.onlyRecent) === "1",
      windowDays:
        WINDOW_DAYS_CODEC.fromURL(
          params.get(URL_SEARCH_PARAMETER_NAMES.windowDays),
        ) ?? DEFAULT_SITE_QUERY.windowDays,
    },
    view:
      RESULT_VIEW_CODEC.fromURL(params.get(URL_SEARCH_PARAMETER_NAMES.view)) ??
      DEFAULT_APP_URL_STATE.view,
    sort: parseConstructionSiteSort(
      params.get(URL_SEARCH_PARAMETER_NAMES.sort),
    ),
    detailSiteId:
      params.get(URL_SEARCH_PARAMETER_NAMES.detailSiteId)?.slice(0, 200) ||
      undefined,
  };
}

/**
 * Serializes the shareable state, omitting everything at its default so the
 * unfiltered page keeps a clean URL. Returns `""` or a leading `?`.
 */
export function serializeAppURLState(state: AppURLState): string {
  const params = new URLSearchParams();
  const { filters, onlyRecent, windowDays } = state.query;
  const search = filters.search.trim();

  if (state.section !== DEFAULT_APP_URL_STATE.section) {
    params.set(
      URL_SEARCH_PARAMETER_NAMES.section,
      SECTION_CODEC.toURL(state.section),
    );
  }
  if (search) params.set(URL_SEARCH_PARAMETER_NAMES.search, search);
  if (filters.phase) {
    params.set(URL_SEARCH_PARAMETER_NAMES.phase, filters.phase);
  }
  if (filters.municipality) {
    params.set(URL_SEARCH_PARAMETER_NAMES.municipality, filters.municipality);
  }
  if (filters.category) {
    params.set(URL_SEARCH_PARAMETER_NAMES.category, filters.category);
  }
  if (filters.closure) {
    params.set(URL_SEARCH_PARAMETER_NAMES.closure, filters.closure);
  }
  if (onlyRecent) {
    params.set(URL_SEARCH_PARAMETER_NAMES.onlyRecent, "1");
  }
  if (windowDays !== DEFAULT_SITE_QUERY.windowDays) {
    params.set(
      URL_SEARCH_PARAMETER_NAMES.windowDays,
      WINDOW_DAYS_CODEC.toURL(windowDays),
    );
  }
  if (state.view !== DEFAULT_APP_URL_STATE.view) {
    params.set(
      URL_SEARCH_PARAMETER_NAMES.view,
      RESULT_VIEW_CODEC.toURL(state.view),
    );
  }
  if (state.sort) {
    params.set(
      URL_SEARCH_PARAMETER_NAMES.sort,
      serializeConstructionSiteSort(state.sort),
    );
  }
  if (state.detailSiteId) {
    params.set(URL_SEARCH_PARAMETER_NAMES.detailSiteId, state.detailSiteId);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}
