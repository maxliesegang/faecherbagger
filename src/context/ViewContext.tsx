import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  useAppURLState,
  type AppURLStateController,
} from "../hooks/useAppURLState.ts";
import { createRecentWindow, type RecentWindow } from "../lib/site-scope.ts";
import { useDatasetState } from "./DatasetContext.tsx";

/**
 * The shareable view: everything the address bar carries, plus the time window
 * derived from it.
 *
 * A provider and not a hook per screen, for the same reason as the dataset:
 * {@link useAppURLState} owns real state and the History API, so two callers
 * would be two disagreeing copies of the current view.
 */
export interface View extends AppURLStateController {
  /**
   * Derived once here so every screen measures against the same instants —
   * it needs both the visitor's chosen `windowDays` and the dataset's
   * `fetchedAt`, which is the one place that has both.
   */
  recentWindow: RecentWindow;
}

const ViewContext = createContext<View | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const urlState = useAppURLState();
  const dataState = useDatasetState();
  const fetchedAt =
    dataState.status === "ready" ? dataState.metadata.fetchedAt : null;

  const recentWindow = useMemo(
    () => createRecentWindow(fetchedAt, urlState.query.windowDays),
    [fetchedAt, urlState.query.windowDays],
  );

  const view = useMemo<View>(
    () => ({ ...urlState, recentWindow }),
    [recentWindow, urlState],
  );

  return <ViewContext.Provider value={view}>{children}</ViewContext.Provider>;
}

export function useView(): View {
  const view = useContext(ViewContext);
  if (view === null) {
    throw new Error("useView must be used inside a ViewProvider");
  }
  return view;
}
