import type {
  ClosureSeverity,
  ConstructionCategory,
  ConstructionPhase,
} from "../types/index.ts";
import {
  CLOSURE_SEVERITIES,
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_PHASES,
} from "./construction-site-labels.ts";
import {
  EMPTY_CONSTRUCTION_SITE_FILTERS,
  type ConstructionSiteFilters,
} from "./construction-site-filter.ts";
import {
  serializeConstructionSiteSort,
  parseConstructionSiteSort,
  type ConstructionSiteSort,
} from "./construction-site-sort.ts";

/** How the result set is presented. */
export type ConstructionSiteResultView = "map" | "list";

/**
 * The part of the UI state that belongs in the address bar, so a filtered view
 * can be bookmarked, shared or reloaded. Query keys are German because the URL
 * is user-facing; everything else in the codebase stays English.
 */
export interface AppURLState {
  filters: ConstructionSiteFilters;
  showOnlyChanged: boolean;
  view: ConstructionSiteResultView;
  sort: ConstructionSiteSort | null;
  detailSiteId?: string;
}

export const DEFAULT_APP_URL_STATE: Readonly<AppURLState> = {
  filters: EMPTY_CONSTRUCTION_SITE_FILTERS,
  showOnlyChanged: false,
  view: "map",
  sort: null,
};

const URL_SEARCH_PARAMETER_NAMES = {
  search: "q",
  municipality: "ort",
  phase: "status",
  category: "art",
  closure: "sperrung",
  showOnlyChanged: "neu",
  view: "ansicht",
  sort: "sortierung",
  detailSiteId: "baustelle",
} as const;

const RESULT_VIEW_BY_URL_VALUE: Record<string, ConstructionSiteResultView> = {
  karte: "map",
  liste: "list",
};

const URL_VALUE_BY_RESULT_VIEW: Record<ConstructionSiteResultView, string> = {
  map: "karte",
  list: "liste",
};

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
  const view =
    RESULT_VIEW_BY_URL_VALUE[
      params.get(URL_SEARCH_PARAMETER_NAMES.view) ?? ""
    ];
  return {
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
    showOnlyChanged:
      params.get(URL_SEARCH_PARAMETER_NAMES.showOnlyChanged) === "1",
    view: view ?? DEFAULT_APP_URL_STATE.view,
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
  const { filters } = state;
  const search = filters.search.trim();

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
  if (state.showOnlyChanged) {
    params.set(URL_SEARCH_PARAMETER_NAMES.showOnlyChanged, "1");
  }
  if (state.view !== DEFAULT_APP_URL_STATE.view) {
    params.set(
      URL_SEARCH_PARAMETER_NAMES.view,
      URL_VALUE_BY_RESULT_VIEW[state.view],
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
