import { useCallback, useEffect, useState } from "react";

/** Records rendered before the first "show more", and per press after that. */
export const INCREMENTAL_LIST_PAGE_SIZE = 50;

export interface IncrementalList<T> {
  visibleItems: readonly T[];
  remainingCount: number;
  showMore: () => void;
}

/**
 * Renders a long result set in pages.
 *
 * The region regularly has several hundred simultaneous construction sites, and
 * nobody reads past the first screen — building every row up front only costs
 * layout time on the phones this has to work on. The window resets whenever the
 * result set itself changes, so a new filter always starts at the top.
 */
export function useIncrementalList<T>(
  items: readonly T[],
  pageSize: number = INCREMENTAL_LIST_PAGE_SIZE,
): IncrementalList<T> {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  const showMore = useCallback(
    () => setVisibleCount((current) => current + pageSize),
    [pageSize],
  );

  return {
    visibleItems:
      items.length <= visibleCount ? items : items.slice(0, visibleCount),
    remainingCount: Math.max(items.length - visibleCount, 0),
    showMore,
  };
}
