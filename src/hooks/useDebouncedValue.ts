import { useEffect, useState } from "react";

/**
 * The value as it was `delayMs` ago, once it stops changing.
 *
 * Used for the result-count live region: announcing on every keystroke of the
 * search field turns a screen reader into a stream of numbers, while the
 * visible count still updates immediately.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}
