import type { ReactNode } from "react";
import { useNotificationState } from "../hooks/useNotificationState.ts";
import { APP_SECTIONS, type AppSection } from "../lib/url-state.ts";
import "./AppSectionTabs.css";

interface AppSectionTabsProps {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  /** Unacknowledged changes around the visitor; hidden when zero. */
  unseenCount: number;
}

const SECTION_LABELS: Record<AppSection, string> = {
  surroundings: "Umgebung",
  explorer: "Alle Baustellen",
  notifications: "Melden",
};

/**
 * The tabs are icon-first on mobile, where they are the bottom bar and there is
 * no room for a sentence. Drawn inline rather than loaded as an icon font: it
 * is three shapes, and they must be there on the very first paint.
 */
const SECTION_ICONS: Record<AppSection, ReactNode> = {
  surroundings: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  explorer: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  notifications: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </>
  ),
};

/**
 * Top-level navigation: a tab row above the content on tablet and desktop, and
 * a fixed bottom bar on phones, where notifications are the reason the app is
 * installed and the switch has to stay within thumb reach.
 *
 * Both are the same list of links in the same order, so the surroundings — the
 * app's purpose — stay first and keep the count of changes the visitor has not
 * seen yet.
 */
export function AppSectionTabs({
  section,
  onSectionChange,
  unseenCount,
}: AppSectionTabsProps) {
  // Read here rather than passed in: the dot is one of the surfaces that state
  // the notification state, and they all take it from the same hook.
  const notificationState = useNotificationState();

  return (
    <nav className="section-tabs" aria-label="Bereiche">
      {APP_SECTIONS.map((value) => (
        <button
          key={value}
          type="button"
          className="section-tabs__tab"
          aria-current={section === value ? "page" : undefined}
          onClick={() => onSectionChange(value)}
        >
          <svg
            className="section-tabs__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {SECTION_ICONS[value]}
          </svg>
          <span className="section-tabs__label">{SECTION_LABELS[value]}</span>
          {value === "surroundings" && unseenCount > 0 && (
            <span className="section-tabs__badge">
              {unseenCount}
              <span className="kern-sr-only"> ungelesene Änderungen</span>
            </span>
          )}
          {value === "notifications" && (
            <span
              className={`section-tabs__state notification-tone--${notificationState.tone}`}
            >
              <span className="kern-sr-only">
                Benachrichtigungen: {notificationState.shortLabel}
              </span>
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
