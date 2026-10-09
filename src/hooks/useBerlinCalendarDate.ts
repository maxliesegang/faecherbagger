import { useEffect, useState } from "react";
import { getBerlinCalendarDate } from "../lib/construction-site-timeframe.ts";

/** Keep relative dates current across midnight and suspended browser tabs. */
export function useBerlinCalendarDate(): string {
  const [today, setToday] = useState(() => getBerlinCalendarDate());
  useEffect(() => {
    const refresh = () => setToday(getBerlinCalendarDate());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
