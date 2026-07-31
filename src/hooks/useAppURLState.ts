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
import type { RecentWindowDays } from "../shared/recency.ts";
import type { ConstructionSiteQuery } from "../lib/construction-site-scope.ts";

/** Keeps a fast typist under the browsers' rate limit for history updates. */
const URL_SYNC_DELAY_MS = 300;

/** Marks a history entry this app pushed, so Back can be preferred over a new one. */
const DETAIL_HISTORY_MARKER = "faecherbaggerDetail";

export interface AppURLStateController extends AppURLState {
  setSection: (section: AppSection) => void;
  setFilters: (filters: ConstructionSiteFilters) => void;
  setOnlyRecent: (onlyRecent: boolean) => void;
  setWindowDays: (windowDays: RecentWindowDays) => void;
  setView: (view: ConstructionSiteResultView) => void;
  setSort: (sort: ConstructionSiteSort | null) => void;
  /** Clears every narrowing filter, including the recency scope. */
  resetQuery: () => void;
  /** The shareable link to one construction site, or back to the overview. */
  getConstructionSiteDetailHref: (
    constructionSiteId: string | undefined,
  ) => string;
  openConstructionSiteDetail: (constructionSiteId: string) => void;
  closeConstructionSiteDetail: () => void;
  /** Opens the explorer's map on one site, from anywhere in the app. */
  showConstructionSiteOnMap: (constructionSiteId: string | undefined) => void;
  showExplorer: () => void;
  /** Opens the notification settings from anywhere in the app. */
  showNotificationSettings: () => void;
  /** Opens the surroundings, the app's default answer, from anywhere. */
  showSurroundings: () => void;
  /** Selection inside the explorer map; deliberately not part of the URL. */
  mapSelectedConstructionSiteId: string | undefined;
  setMapSelectedConstructionSiteId: (
    constructionSiteId: string | undefined,
  ) => void;
}

/**
 * Owns the part of the view that belongs in the address bar, and the
 * navigation between screens that changes it. Keeping the History API in one
 * place is what lets every link be a real link: the address bar, Back/Forward
 * and a pasted URL always describe the same view.
 *
 * The whole {@link AppURLState} lives in one `useState`. It used to be one
 * `useState` per field, which meant every new URL parameter had to be added in
 * three places — the initial state, the object handed to the serializer, and
 * the `popstate` restore — with nothing to catch a miss.
 */
export function useAppURLState(): AppURLStateController {
  const [urlState, setURLState] = useState<AppURLState>(() =>
    parseAppURLState(window.location.search),
  );
  const [mapSelectedConstructionSiteId, setMapSelectedConstructionSiteId] =
    useState<string>();

  const updateURLState = useCallback(
    (changes: Partial<AppURLState>) =>
      setURLState((current) => ({ ...current, ...changes })),
    [],
  );

  const updateQuery = useCallback(
    (changes: Partial<ConstructionSiteQuery>) =>
      setURLState((current) => ({
        ...current,
        query: { ...current.query, ...changes },
      })),
    [],
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
    const restoreURLState = () =>
      setURLState(parseAppURLState(window.location.search));
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

  const getConstructionSiteDetailHref = useCallback(
    (constructionSiteId: string | undefined) =>
      buildHref({ detailConstructionSiteId: constructionSiteId }),
    [buildHref],
  );

  const openConstructionSiteDetail = useCallback(
    (constructionSiteId: string) => {
      window.history.pushState(
        { [DETAIL_HISTORY_MARKER]: constructionSiteId },
        "",
        getConstructionSiteDetailHref(constructionSiteId),
      );
      updateURLState({ detailConstructionSiteId: constructionSiteId });
    },
    [getConstructionSiteDetailHref, updateURLState],
  );

  const closeConstructionSiteDetail = useCallback(() => {
    // Prefer Back when this app pushed the detail entry, so leaving a detail
    // page does not grow the history stack with every visit.
    if (
      window.history.state?.[DETAIL_HISTORY_MARKER] ===
      urlState.detailConstructionSiteId
    ) {
      window.history.back();
      return;
    }
    window.history.replaceState(
      null,
      "",
      getConstructionSiteDetailHref(undefined),
    );
    updateURLState({ detailConstructionSiteId: undefined });
  }, [
    getConstructionSiteDetailHref,
    updateURLState,
    urlState.detailConstructionSiteId,
  ]);

  const showConstructionSiteOnMap = useCallback(
    (constructionSiteId: string | undefined) => {
      const target: Partial<AppURLState> = {
        section: "explorer",
        view: "map",
        detailConstructionSiteId: undefined,
      };
      // A new entry, not a replacement. This is the one navigation in the app
      // that changes section, view and selection at once, and replacing the
      // entry meant Back could not undo it: a visitor who tapped it from their
      // surroundings list landed among all 515 records of the region with no
      // way back to where they were.
      window.history.pushState(null, "", buildHref(target));
      updateURLState(target);
      setMapSelectedConstructionSiteId(constructionSiteId);
    },
    [buildHref, updateURLState],
  );

  // The setters only ever close over the two stable updaters, so they are built
  // once. Everything below then hangs off `urlState` alone, which is what makes
  // the controller stable between renders that did not change the view — the
  // providers built on it memoize against this identity.
  const setters = useMemo(() => {
    // Every way into a section goes through here, so none of them can forget to
    // close an open detail: the tabs stay reachable from a detail page, and
    // tapping one has to lead somewhere.
    const setSection = (section: AppSection) =>
      updateURLState({ section, detailConstructionSiteId: undefined });

    return {
      setSection,
      setFilters: (filters: ConstructionSiteFilters) =>
        updateQuery({ filters }),
      setOnlyRecent: (onlyRecent: boolean) => updateQuery({ onlyRecent }),
      setWindowDays: (windowDays: RecentWindowDays) =>
        updateQuery({ windowDays }),
      setView: (view: ConstructionSiteResultView) => updateURLState({ view }),
      setSort: (sort: ConstructionSiteSort | null) => updateURLState({ sort }),
      resetQuery: () => updateURLState({ query: DEFAULT_APP_URL_STATE.query }),
      showExplorer: () => setSection("explorer"),
      showNotificationSettings: () => setSection("notifications"),
      showSurroundings: () => setSection("surroundings"),
    };
  }, [updateQuery, updateURLState]);

  return useMemo(
    () => ({
      ...urlState,
      ...setters,
      getConstructionSiteDetailHref,
      openConstructionSiteDetail,
      closeConstructionSiteDetail,
      showConstructionSiteOnMap,
      mapSelectedConstructionSiteId,
      setMapSelectedConstructionSiteId,
    }),
    [
      closeConstructionSiteDetail,
      getConstructionSiteDetailHref,
      mapSelectedConstructionSiteId,
      openConstructionSiteDetail,
      setters,
      showConstructionSiteOnMap,
      urlState,
    ],
  );
}
