import { useMemo } from "react";
import { usePersonal } from "../context/PersonalContext.tsx";
import {
  describeNotificationState,
  type NotificationStateDescription,
} from "../lib/notification-state.ts";
import { isIosDevice } from "./useProgressiveWebApp.ts";

/**
 * The one description of the notification state for this device, derived from
 * the personal state. Every surface that mentions notifications — the tab bar,
 * the surroundings card, the settings screen — renders this, so they cannot
 * describe the same device differently.
 */
export function useNotificationState(): NotificationStateDescription {
  const { push, area, progressiveWebApp } = usePersonal();
  const { isInstalled } = progressiveWebApp;
  // Only whether there is an area matters here, so editing its center or radius
  // must not invalidate the description every keystroke of the radius slider.
  const hasHomeArea = area !== null;

  return useMemo(
    () =>
      describeNotificationState({
        status: push.status,
        isInstalled,
        hasHomeArea,
        isIosDevice,
      }),
    [hasHomeArea, isInstalled, push.status],
  );
}
