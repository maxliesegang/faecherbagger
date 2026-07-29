import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { HomeArea, ISOTimestamp, LngLat } from "../types/index.ts";
import { useCurrentLocation } from "../hooks/useCurrentLocation.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import { useHomeArea } from "../hooks/useHomeArea.ts";
import { useProgressiveWebApp } from "../hooks/useProgressiveWebApp.ts";
import type { ProgressiveWebAppController } from "../hooks/useProgressiveWebApp.ts";
import { usePushNotifications } from "../hooks/usePushNotifications.ts";
import type { PushNotificationController } from "../hooks/usePushNotifications.ts";
import { useSeenConstructionSites } from "../hooks/useSeenConstructionSites.ts";

/**
 * Everything the app knows about this visitor and this device. None of it is
 * shareable, which is exactly what separates it from the URL state: an area, an
 * acknowledgement and a push subscription belong to one browser and must never
 * ride along in a link.
 */
export interface Personal {
  /** The visitor's surroundings; `null` until they define one. */
  area: HomeArea | null;
  /** Persists the area and keeps an existing push subscription in step. */
  setArea: (area: HomeArea) => void;
  /** Forgets the area and ends the subscription that depended on it. */
  clearArea: () => void;
  /** When the visitor last acknowledged the surroundings screen. */
  seenAt: ISOTimestamp | null;
  /** Whether they ever have; only the wording of the unread hint depends on it. */
  hasAcknowledged: boolean;
  markSitesSeen: (acknowledgedAt: ISOTimestamp) => void;
  /** The device location, when the visitor has granted and requested it. */
  currentLocation: LngLat | undefined;
  location: CurrentLocationController;
  push: PushNotificationController;
  progressiveWebApp: ProgressiveWebAppController;
  isInstalled: boolean;
}

const PersonalContext = createContext<Personal | null>(null);

/**
 * Owns the device-local state and the rules that tie its parts together.
 *
 * Those rules used to live in the page shell as callbacks passed down two
 * levels: saving an area has to re-sync the push subscription, and clearing one
 * has to end it, because a subscription without an area has nothing to match
 * new construction sites against. They belong with the state they govern.
 */
export function PersonalProvider({ children }: { children: ReactNode }) {
  const location = useCurrentLocation();
  const progressiveWebApp = useProgressiveWebApp();
  const push = usePushNotifications();
  const { homeArea, saveHomeArea, clearHomeArea } = useHomeArea();
  const { seenAt, markSitesSeen } = useSeenConstructionSites();

  const {
    trackHomeArea,
    syncHomeArea,
    setFeedbackMessage,
    disableNotifications,
    isEnabled: areNotificationsEnabled,
  } = push;

  // The push subscription stores the area, so the hook needs the current one
  // when the service worker becomes ready after a reload.
  useEffect(() => {
    trackHomeArea(homeArea);
  }, [homeArea, trackHomeArea]);

  const setArea = useCallback(
    (area: HomeArea) => {
      saveHomeArea(area);
      trackHomeArea(area);
      void syncHomeArea(area).catch((error: unknown) => {
        setFeedbackMessage(
          error instanceof Error
            ? error.message
            : "Das Gebiet konnte nicht an den Benachrichtigungsdienst übertragen werden.",
        );
      });
    },
    [saveHomeArea, setFeedbackMessage, syncHomeArea, trackHomeArea],
  );

  const clearArea = useCallback(() => {
    clearHomeArea();
    trackHomeArea(null);
    if (areNotificationsEnabled) void disableNotifications();
  }, [
    areNotificationsEnabled,
    clearHomeArea,
    disableNotifications,
    trackHomeArea,
  ]);

  const currentLocation =
    location.locationState.status === "ready"
      ? location.locationState.point
      : undefined;

  const personal = useMemo<Personal>(
    () => ({
      area: homeArea,
      setArea,
      clearArea,
      seenAt,
      hasAcknowledged: seenAt !== null,
      markSitesSeen,
      currentLocation,
      location,
      push,
      progressiveWebApp,
      isInstalled: progressiveWebApp.isInstalled,
    }),
    [
      clearArea,
      currentLocation,
      location,
      markSitesSeen,
      homeArea,
      progressiveWebApp,
      push,
      seenAt,
      setArea,
    ],
  );

  return (
    <PersonalContext.Provider value={personal}>
      {children}
    </PersonalContext.Provider>
  );
}

export function usePersonal(): Personal {
  const personal = useContext(PersonalContext);
  if (personal === null) {
    throw new Error("usePersonal must be used inside a PersonalProvider");
  }
  return personal;
}
