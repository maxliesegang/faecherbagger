import { useEffect, useState } from "react";
import type { LngLat, RouteTravelMode } from "../types/index.ts";
import { searchRoute } from "../lib/route-search.ts";

export type RouteSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; line: LngLat[]; key: string }
  | { status: "error" };

const ROUTE_TIMEOUT_MS = 10_000;

/** Identity of a request, so a stored line can be matched to its inputs. */
export const createRouteKey = (
  start: LngLat,
  destination: LngLat,
  travelMode: RouteTravelMode,
): string => JSON.stringify([start, destination, travelMode]);

/**
 * Asks for a route whenever start, destination or mode change — and only
 * then: one request per decision the visitor makes, never per keystroke or map
 * move. A late answer for inputs that have since changed is dropped.
 */
export function useRouteSearch(
  start: LngLat | undefined,
  destination: LngLat | undefined,
  travelMode: RouteTravelMode,
  /** A line already known for these inputs (an area being edited). */
  knownKey?: string,
): RouteSearchState {
  const [state, setState] = useState<RouteSearchState>({ status: "idle" });
  const key =
    start && destination ? createRouteKey(start, destination, travelMode) : undefined;

  useEffect(() => {
    if (!start || !destination || !key || key === knownKey) {
      setState({ status: "idle" });
      return;
    }
    // A timeout aborts too, but must still end in "error"; only a superseded
    // request stays silent.
    let isCurrent = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
    setState({ status: "loading" });
    searchRoute(start, destination, travelMode, controller.signal).then(
      (line) => {
        if (isCurrent) setState({ status: "ready", line, key });
      },
      () => {
        if (isCurrent) setState({ status: "error" });
      },
    ).finally(() => clearTimeout(timeout));
    return () => {
      isCurrent = false;
      clearTimeout(timeout);
      controller.abort();
    };
    // `key` captures start, destination and mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, knownKey]);

  return state;
}
