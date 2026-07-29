import {
  RECENT_WINDOW_DAYS,
  type RecentWindowDays,
} from "../shared/recency.ts";
import { getRecentWindowLabel } from "../shared/construction-site-labels.ts";
import "./RecentWindowSelect.css";

interface RecentWindowSelectProps {
  recentWindowDays: RecentWindowDays;
  onWindowDaysChange: (recentWindowDays: RecentWindowDays) => void;
  /** Accessible name; the two screens ask the same question about different sets. */
  label: string;
}

/**
 * How far back the "neue Baustellen" lists reach. A segmented control rather
 * than a select: three options that are worth seeing at a glance, and the
 * choice is shareable through the URL (`?seit=`).
 */
export function RecentWindowSelect({
  recentWindowDays,
  onWindowDaysChange,
  label,
}: RecentWindowSelectProps) {
  return (
    <div className="recent-window" role="group" aria-label={label}>
      <span className="recent-window__label">Zeitraum</span>
      {RECENT_WINDOW_DAYS.map((days) => (
        <button
          key={days}
          type="button"
          className="recent-window__button"
          aria-pressed={days === recentWindowDays}
          onClick={() => onWindowDaysChange(days)}
        >
          {getRecentWindowLabel(days)}
        </button>
      ))}
    </div>
  );
}
