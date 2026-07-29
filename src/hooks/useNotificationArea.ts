import { useCallback, useState } from "react";
import type { NotificationArea } from "../types/index.ts";
import {
  clearNotificationArea,
  loadNotificationArea,
  saveNotificationArea,
} from "../lib/notification-area.ts";

/**
 * The visitor's surroundings: a center and a radius, persisted in the browser.
 * It drives the primary view, the map overlay and the push subscription, so it
 * is owned in one place rather than by the settings panel.
 */
export function useNotificationArea() {
  const [notificationArea, setNotificationArea] =
    useState<NotificationArea | null>(loadNotificationArea);

  const saveArea = useCallback((area: NotificationArea) => {
    saveNotificationArea(area);
    setNotificationArea(area);
  }, []);

  const clearArea = useCallback(() => {
    clearNotificationArea();
    setNotificationArea(null);
  }, []);

  return {
    notificationArea,
    saveNotificationArea: saveArea,
    clearNotificationArea: clearArea,
  };
}

export type NotificationAreaController = ReturnType<typeof useNotificationArea>;
