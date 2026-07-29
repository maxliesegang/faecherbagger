import { useCallback, useState, useMemo } from "react";
import type { HomeArea } from "../types/index.ts";
import {
  clearHomeArea,
  loadHomeArea,
  saveHomeArea,
} from "../lib/home-area-storage.ts";

/**
 * The visitor's surroundings: a center and a radius, persisted in the browser.
 * It drives the primary view, the map overlay and the push subscription, so it
 * is owned in one place rather than by the settings panel.
 */
export function useHomeArea() {
  const [homeArea, setHomeArea] = useState<HomeArea | null>(loadHomeArea);

  const saveArea = useCallback((area: HomeArea) => {
    saveHomeArea(area);
    setHomeArea(area);
  }, []);

  const clearArea = useCallback(() => {
    clearHomeArea();
    setHomeArea(null);
  }, []);

  return useMemo(
    () => ({ homeArea, saveHomeArea: saveArea, clearHomeArea: clearArea }),
    [clearArea, homeArea, saveArea],
  );
}

export type HomeAreaController = ReturnType<typeof useHomeArea>;
