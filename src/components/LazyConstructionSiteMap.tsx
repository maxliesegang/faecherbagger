import { lazy, Suspense } from "react";
import type { ConstructionSiteMapProps } from "./ConstructionSiteMap.tsx";
import { LoadingStatus } from "./LoadingStatus.tsx";

// MapLibre and its style are by far the largest dependency, and both screens
// can be useful without ever showing a map. The type-only import above is
// erased, so nothing of the module reaches the initial bundle.
const ConstructionSiteMap = lazy(() =>
  import("./ConstructionSiteMap.tsx").then((module) => ({
    default: module.ConstructionSiteMap,
  })),
);

/** The map, loaded on demand, with the app's shared waiting indicator. */
export function LazyConstructionSiteMap(props: ConstructionSiteMapProps) {
  return (
    <Suspense fallback={<LoadingStatus message="Karte wird geladen …" />}>
      <ConstructionSiteMap {...props} />
    </Suspense>
  );
}
