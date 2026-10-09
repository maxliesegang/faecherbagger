import { useCallback, useEffect, useMemo, useState } from "react";
import { createNotificationDeliveryState } from "../lib/notification-delivery.ts";
import {
  loadNotificationDeliveryState,
  updateNotificationDeliveryState,
} from "../lib/notification-preferences-store.ts";

/** Read the same device-only inbox that the service worker writes. */
export function useNotificationInbox() {
  const [state, setState] = useState(createNotificationDeliveryState);
  const [hasError, setHasError] = useState(false);
  useEffect(() => {
    let isCurrent = true;
    const refresh = () => {
      void loadNotificationDeliveryState()
        .then((loaded) => {
          if (isCurrent) {
            setState(loaded);
            setHasError(false);
          }
        })
        .catch(() => {
          if (isCurrent) setHasError(true);
        });
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type === "DATA_UPDATED" ||
        event.data?.type === "REFRESH_VIEW"
      )
        refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      isCurrent = false;
      window.removeEventListener("focus", refresh);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);
  const markRead = useCallback(() => {
    void updateNotificationDeliveryState((loaded) => ({
      ...loaded,
      readSignatures: loaded.events.map((event) => event.signature),
    }))
      .then((updated) => {
        setState(updated);
        setHasError(false);
        if ("clearAppBadge" in navigator) {
          void navigator.clearAppBadge().catch(() => undefined);
        }
      })
      .catch(() => setHasError(true));
  }, []);
  const unreadSignatures = useMemo(
    () =>
      new Set(
        state.events
          .filter((event) => !state.readSignatures.includes(event.signature))
          .map((event) => event.signature),
      ),
    [state],
  );
  return {
    events: state.events,
    unreadSignatures,
    unreadCount: unreadSignatures.size,
    markRead,
    hasError,
  };
}
