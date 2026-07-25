import { useEffect, useState } from "react";
import type {
  ConstructionSite,
  ConstructionSiteChanges,
  ConstructionSiteMetadata,
} from "../types/index.ts";
import {
  loadConstructionSiteChanges,
  loadConstructionSiteMetadata,
  loadConstructionSites,
} from "../lib/construction-site-data.ts";

export type ConstructionSiteDataState =
  | { status: "loading" }
  | {
      status: "ready";
      metadata: ConstructionSiteMetadata;
      constructionSites: ConstructionSite[];
      changes: ConstructionSiteChanges;
    }
  | { status: "error"; message: string };

const isConstructionSiteRefreshMessage = (event: MessageEvent): boolean =>
  event.data?.type === "DATA_UPDATED" || event.data?.type === "REFRESH_VIEW";

/**
 * Owns the static-data lifecycle and refresh messages from the service worker.
 * Only the most recently requested refresh may update state.
 */
export function useConstructionSiteData(): ConstructionSiteDataState {
  const [dataState, setDataState] = useState<ConstructionSiteDataState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    let latestRequest = 0;

    const refreshConstructionSiteData = async () => {
      const request = ++latestRequest;
      try {
        const [metadata, constructionSites, changes] = await Promise.all([
          loadConstructionSiteMetadata(controller.signal),
          loadConstructionSites(controller.signal),
          loadConstructionSiteChanges(controller.signal),
        ]);
        if (!controller.signal.aborted && request === latestRequest) {
          setDataState({
            status: "ready",
            metadata,
            constructionSites,
            changes,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted && request === latestRequest) {
          setDataState((current) =>
            current.status === "ready"
              ? current
              : {
                  status: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Unbekannter Fehler",
                },
          );
        }
      }
    };

    const onWorkerMessage = (event: MessageEvent) => {
      if (isConstructionSiteRefreshMessage(event)) {
        void refreshConstructionSiteData();
      }
    };

    void refreshConstructionSiteData();
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      controller.abort();
      navigator.serviceWorker?.removeEventListener(
        "message",
        onWorkerMessage,
      );
    };
  }, []);

  return dataState;
}
