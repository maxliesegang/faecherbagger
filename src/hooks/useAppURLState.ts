import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConstructionSiteFilters } from "../lib/construction-site-filter.ts";
import type { ConstructionSiteSort } from "../lib/construction-site-sort.ts";
import {
  DEFAULT_APP_URL_STATE,
  parseAppURLState,
  serializeAppURLState,
  type AppSection,
  type AppURLState,
  type ConstructionSiteResultView,
} from "../lib/url-state.ts";

/** Keeps a fast typist under the browsers' rate limit for history updates. */
const URL_SYNC_DELAY_MS = 300;

/** Marks a history entry this app pushed, so Back can be preferred over a new one. */
const DETAIL_HISTORY_MARKER = "faecherbaggerDetail";

export interface AppURLStateController extends AppURLState {
  setSection: (section: AppSection) => void;
  setFilters: (filters: ConstructionSiteFilters) => void;
  setShowOnlyChanged: (showOnlyChanged: boolean) => void;
  setView: (view: ConstructionSiteResultView) => void;
  setSort: (sort: ConstructionSiteSort | null) => void;
  /** Clears every narrowing filter, including the change scope. */
  resetFilters: () => void;
  /** The shareable link to one construction site, or back to the overview. */
  getDetailHref: (siteId: string | undefined) => string;
  openSiteDetails: (siteId: string) => void;
  closeSiteDetails: () => void;
  /** Opens the explorer's map on one site, from anywhere in the app. */
  showSiteOnMap: (siteId: string | undefined) => void;
  showExplorer: () => void;
  /** Selection inside the explorer map; deliberately not part of the URL. */
  mapSelectedSiteId: string | undefined;
  setMapSelectedSiteId: (siteId: string | undefined) => void;
}

/**
 * Owns the part of the view that belongs in the address bar, and the
 * navigation between screens that changes it. Keeping the History API in one
 * place is what lets every link be a real link: the address bar, Back/Forward
 * and a pasted URL always describe the same view.
 */
export function useAppURLState(): AppURLStateController {
  const initialURLState = useMemo(
    () => parseAppURLState(window.location.search),
    [],
  );

  const [section, setSection] = useState<AppSection>(initialURLState.section);
  const [filters, setFilters] = useState<ConstructionSiteFilters>(
    initialURLState.filters,
  );
  const [showOnlyChanged, setShowOnlyChanged] = useState(
    initialURLState.showOnlyChanged,
  );
  const [view, setView] = useState<ConstructionSiteResultView>(
    initialURLState.view,
  );
  const [sort, setSort] = useState<ConstructionSiteSort | null>(
    initialURLState.sort,
  );
  const [detailSiteId, setDetailSiteId] = useState<string | undefined>(
    initialURLState.detailSiteId,
  );
  const [mapSelectedSiteId, setMapSelectedSiteId] = useState<string>();

  const urlState: AppURLState = useMemo(
    () => ({ section, filters, showOnlyChanged, view, sort, detailSiteId }),
    [detailSiteId, filters, section, showOnlyChanged, sort, view],
  );

  // Keep the address bar in step with the view so it can be shared or reloaded.
  // `replaceState` keeps typing out of the history stack.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = serializeAppURLState(urlState);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query}${window.location.hash}`,
      );
    }, URL_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [urlState]);

  // Detail links use the History API so Back/Forward restores the complete
  // overview state without a full application reload.
  useEffect(() => {
    const restoreURLState = () => {
      const state = parseAppURLState(window.location.search);
      setSection(state.section);
      setFilters(state.filters);
      setShowOnlyChanged(state.showOnlyChanged);
      setView(state.view);
      setSort(state.sort);
      setDetailSiteId(state.detailSiteId);
    };
    window.addEventListener("popstate", restoreURLState);
    return () => window.removeEventListener("popstate", restoreURLState);
  }, []);

  const buildHref = useCallback(
    (overrides: Partial<AppURLState>) =>
      `${window.location.pathname}${serializeAppURLState({
        ...urlState,
        ...overrides,
      })}${window.location.hash}`,
    [urlState],
  );

  const getDetailHref = useCallback(
    (siteId: string | undefined) => buildHref({ detailSiteId: siteId }),
    [buildHref],
  );

  const openSiteDetails = useCallback(
    (siteId: string) => {
      window.history.pushState(
        { [DETAIL_HISTORY_MARKER]: siteId },
        "",
        getDetailHref(siteId),
      );
      setDetailSiteId(siteId);
    },
    [getDetailHref],
  );

  const closeSiteDetails = useCallback(() => {
    // Prefer Back when this app pushed the detail entry, so leaving a detail
    // page does not grow the history stack with every visit.
    if (window.history.state?.[DETAIL_HISTORY_MARKER] === detailSiteId) {
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", getDetailHref(undefined));
    setDetailSiteId(undefined);
  }, [getDetailHref, detailSiteId]);

  const showSiteOnMap = useCallback(
    (siteId: string | undefined) => {
      window.history.replaceState(
        null,
        "",
        buildHref({
          section: "explorer",
          view: "map",
          detailSiteId: undefined,
        }),
      );
      setSection("explorer");
      setView("map");
      setDetailSiteId(undefined);
      setMapSelectedSiteId(siteId);
    },
    [buildHref],
  );

  const showExplorer = useCallback(() => setSection("explorer"), []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_APP_URL_STATE.filters);
    setShowOnlyChanged(false);
  }, []);

  return {
    section,
    setSection,
    filters,
    setFilters,
    showOnlyChanged,
    setShowOnlyChanged,
    view,
    setView,
    sort,
    setSort,
    detailSiteId,
    resetFilters,
    getDetailHref,
    openSiteDetails,
    closeSiteDetails,
    showSiteOnMap,
    showExplorer,
    mapSelectedSiteId,
    setMapSelectedSiteId,
  };
}
