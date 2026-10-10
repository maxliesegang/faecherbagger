import { useEffect, useState } from "react";
import type { LngLat, RouteTravelMode } from "../types/index.ts";
import { getDistinctReturnLine, searchRoute } from "../lib/route-search.ts";

export type RouteSearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; line: LngLat[]; returnLine?: LngLat[]; key: string }
  | { status: "error" };

const ROUTE_TIMEOUT_MS = 10_000;
/** The FOSSGIS servers ask for at most one request per second. */
const REQUEST_SPACING_MS = 1_100;

/** Identity of a request, so a stored line can be matched to its inputs. */
export const createRouteKey = (
  start: LngLat,
  destination: LngLat,
  travelMode: RouteTravelMode,
  includeReturn = false,
): string => JSON.stringify([start, destination, travelMode, includeReturn]);

const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("aborted"));
    });
  });

/**
 * Asks for a route whenever start, destination, mode or the return option
 * change — and only then: one request per decision the visitor makes, never
 * per keystroke or map move. A late answer for inputs that have since changed
 * is dropped.
 */
export function useRouteSearch(
  start: LngLat | undefined,
  destination: LngLat | undefined,
  travelMode: RouteTravelMode,
  includeReturn: boolean,
  /** A line already known for these inputs (an area being edited). */
  knownKey?: string,
): RouteSearchState {
  const [state, setState] = useState<RouteSearchState>({ status: "idle" });
  const key =
    start && destination
      ? createRouteKey(start, destination, travelMode, includeReturn)
      : undefined;

  useEffect(() => {
    if (!start || !destination || !key || key === knownKey) {
      setState({ status: "idle" });
      return;
    }
    // A timeout aborts too, but must still end in "error"; only a superseded
    // request stays silent.
    let isCurrent = true;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ROUTE_TIMEOUT_MS * (includeReturn ? 2 : 1),
    );
    setState({ status: "loading" });
    (async () => {
      const line = await searchRoute(start, destination, travelMode, controller.signal);
      if (!includeReturn) return { line };
      await wait(REQUEST_SPACING_MS, controller.signal);
      const back = await searchRoute(destination, start, travelMode, controller.signal);
      return { line, returnLine: getDistinctReturnLine(line, back) };
    })()
      .then(
        (result) => {
          if (isCurrent) setState({ status: "ready", ...result, key });
        },
        () => {
          if (isCurrent) setState({ status: "error" });
        },
      )
      .finally(() => clearTimeout(timeout));
    return () => {
      isCurrent = false;
      clearTimeout(timeout);
      controller.abort();
    };
    // `key` captures start, destination, mode and the return option.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, knownKey]);

  return state;
}
