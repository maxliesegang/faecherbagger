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
  notifications: "Benachrichtigungen",
  surroundings: "Mein Umkreis",
  explorer: "Alle Baustellen",
};

/**
 * The tabs are icon-first on mobile, where they are the bottom bar and there is
 * no room for a sentence. Drawn inline rather than loaded as an icon font: it
 * is three shapes, and they must be there on the very first paint.
 */
const SECTION_ICONS: Record<AppSection, ReactNode> = {
  // A radius around a point, the same shape the map draws — the icon says what
  // the section is about rather than repeating the explorer's pin.
  surroundings: (
    <>
      <circle cx="12" cy="12" r="8" strokeDasharray="2.6 2.2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
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
 * Both are the same list in the same order: notifications first, because that
 * switch is the one setting that keeps working after the app is closed, then the
 * visitor's radius with the count of changes they have not seen yet, then the
 * region-wide search.
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
