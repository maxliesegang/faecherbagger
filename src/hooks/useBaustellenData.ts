import { useEffect, useState } from "react";
import type { Baustelle, Meta } from "../types/index.ts";
import { loadBaustellen, loadMeta } from "../lib/data.ts";

export type BaustellenDataState =
  | { status: "loading" }
  | { status: "ready"; meta: Meta; baustellen: Baustelle[] }
  | { status: "error"; message: string };

const requestsDataRefresh = (event: MessageEvent): boolean =>
  event.data?.type === "DATA_UPDATED" || event.data?.type === "REFRESH_VIEW";

/**
 * Owns the static-data lifecycle and refresh messages from the service worker.
 * Only the most recently requested refresh may update state.
 */
export function useBaustellenData(): BaustellenDataState {
  const [state, setState] = useState<BaustellenDataState>({
    status: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    let latestRequest = 0;

    const refresh = async () => {
      const request = ++latestRequest;
      try {
        const [meta, baustellen] = await Promise.all([
          loadMeta(controller.signal),
          loadBaustellen(controller.signal),
        ]);
        if (!controller.signal.aborted && request === latestRequest) {
          setState({ status: "ready", meta, baustellen });
        }
      } catch (error) {
        if (!controller.signal.aborted && request === latestRequest) {
          setState((current) =>
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
      if (requestsDataRefresh(event)) void refresh();
    };

    void refresh();
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      controller.abort();
      navigator.serviceWorker?.removeEventListener(
        "message",
        onWorkerMessage,
      );
    };
  }, []);

  return state;
}
