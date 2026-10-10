import { useEffect, useState } from "react";

/**
 * Whether a CSS media query currently matches. For deciding what to *mount*,
 * e.g. to keep the map bundle off phones; plain layout belongs in CSS.
 */
export function useMediaQuery(query: string): boolean {
  // `matchMedia` is missing outside a browser, e.g. in server-rendered tests.
  const [isMatching, setIsMatching] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const update = () => setIsMatching(mediaQueryList.matches);
    update();
    mediaQueryList.addEventListener("change", update);
    return () => mediaQueryList.removeEventListener("change", update);
  }, [query]);

  return isMatching;
}
