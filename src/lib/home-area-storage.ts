import type { HomeArea } from "../types/index.ts";
import { isHomeArea } from "../shared/home-area-validation.ts";
import {
  readStoredJSON,
  removeStoredText,
  writeStoredJSON,
} from "./browser-storage.ts";

export const HOME_AREA_STORAGE_KEY = "faecherbagger-home-area";

export function loadHomeArea(): HomeArea | null {
  return readStoredJSON(HOME_AREA_STORAGE_KEY, isHomeArea);
}

export function saveHomeArea(area: HomeArea): void {
  writeStoredJSON(HOME_AREA_STORAGE_KEY, area);
}

export function clearHomeArea(): void {
  removeStoredText(HOME_AREA_STORAGE_KEY);
}
