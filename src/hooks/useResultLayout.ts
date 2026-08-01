import { useEffect, useState, type RefObject } from "react";

/**
 * How the result set is presented: the full table, or one card per record.
 *
 * The choice follows the width the results column actually has, not the
 * viewport's — with the control rail beside it a 70rem window leaves the table
 * barely 48rem.
 */
export type ResultLayout = "table" | "cards";

/** Below this the table's columns no longer fit without horizontal scrolling. */
const TABLE_MIN_WIDTH_PX = 896; // 56rem at the default root font size

/**
 * Observes the element's width and reports the layout it can carry.
 *
 * This deliberately replaces the CSS container query that used to toggle
 * `display`: both layouts then existed in the DOM at all times, so every record
 * was rendered twice. Deciding in React means only the chosen one is built.
 */
export function useResultLayout(
  containerRef: RefObject<HTMLElement | null>,
): ResultLayout {
  const [layout, setLayout] = useState<ResultLayout>(() =>
    // Best guess for the very first paint; the observer corrects it immediately.
    typeof window !== "undefined" && window.innerWidth < TABLE_MIN_WIDTH_PX
      ? "cards"
      : "table",
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const width =
        entry?.contentRect.width ?? element.getBoundingClientRect().width;
      setLayout(width < TABLE_MIN_WIDTH_PX ? "cards" : "table");
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  return layout;
}
