import { createContext, useContext, type ReactNode } from "react";
import type {
  ConstructionSite,
  ConstructionSiteMetadata,
} from "../types/index.ts";
import {
  useConstructionSiteData,
  type ConstructionSiteDataState,
} from "../hooks/useConstructionSiteData.ts";

/** The dataset once it has arrived. */
export interface Dataset {
  constructionSites: readonly ConstructionSite[];
  metadata: ConstructionSiteMetadata;
}

const DatasetContext = createContext<ConstructionSiteDataState | null>(null);

/**
 * Loads the published dataset once for the whole app.
 *
 * It is a provider rather than a hook called per screen because the data is
 * fetched, refreshed by the service worker, and shared: two callers of
 * `useConstructionSiteData` would mean two fetches and two versions of "now".
 */
export function DatasetProvider({ children }: { children: ReactNode }) {
  const dataState = useConstructionSiteData();
  return (
    <DatasetContext.Provider value={dataState}>
      {children}
    </DatasetContext.Provider>
  );
}

/** The load state, including loading and error — for the shell that renders them. */
export function useDatasetState(): ConstructionSiteDataState {
  const dataState = useContext(DatasetContext);
  if (dataState === null) {
    throw new Error("useDatasetState must be used inside a DatasetProvider");
  }
  return dataState;
}

/**
 * The loaded dataset, for the screens that only ever render once it is there.
 *
 * Throws otherwise. That is deliberate: the alternative is every screen
 * handling a `null` it can never actually receive, and the check silently
 * rotting into dead code the day the shell changes.
 */
export function useDataset(): Dataset {
  const dataState = useDatasetState();
  if (dataState.status !== "ready") {
    throw new Error(
      `useDataset requires loaded data, but the dataset is "${dataState.status}"`,
    );
  }
  return {
    constructionSites: dataState.constructionSites,
    metadata: dataState.metadata,
  };
}
