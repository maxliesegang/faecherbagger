import type { AppSection } from "../lib/url-state.ts";
import { AppIcon, type AppIconName } from "./AppIcon.tsx";
import "./AppNavigation.css";

interface AppNavigationProps {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  getSectionHref: (section: AppSection) => string;
  /** Delivered notifications the visitor has not marked as read. */
  unreadCount: number;
}

const DESTINATIONS: readonly {
  section: AppSection;
  label: string;
  icon: AppIconName;
}[] = [
  { section: "relevant", label: "Für mich", icon: "person-pin" },
  { section: "explore", label: "Alle Baustellen", icon: "map" },
  { section: "settings", label: "Einstellungen", icon: "settings" },
];

/**
 * The app's three destinations: a bottom bar on phones, where the thumb is,
 * and a row of tabs above the content on wider screens.
 *
 * Real links rather than ARIA tabs: each section is a distinct address that can
 * be bookmarked, opened in a new tab and reached with Back, and the tab
 * keyboard model would work against that. The click handler keeps the
 * navigation in-app.
 */
export function AppNavigation({
  section,
  onSectionChange,
  getSectionHref,
  unreadCount,
}: AppNavigationProps) {
  return (
    <nav className="app-navigation" aria-label="Hauptnavigation">
      <ul className="app-navigation__list">
        {DESTINATIONS.map((destination) => {
          const isCurrent = destination.section === section;
          const showBadge = destination.section === "relevant" && unreadCount > 0;
          return (
            <li key={destination.section}>
              <a
                className="app-navigation__link"
                href={getSectionHref(destination.section)}
                aria-current={isCurrent ? "page" : undefined}
                onClick={(event) => {
                  // Leave modified clicks to the browser so "open in new tab"
                  // and "copy link" keep working on a real href.
                  if (
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey ||
                    event.button !== 0
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onSectionChange(destination.section);
                  window.scrollTo({ top: 0 });
                }}
              >
                <span className="app-navigation__icon">
                  <AppIcon name={destination.icon} isFilled={false} />
                  {showBadge && (
                    <span className="app-navigation__badge">{unreadCount}</span>
                  )}
                </span>
                <span className="app-navigation__label">
                  {destination.label}
                </span>
                {showBadge && (
                  <span className="kern-sr-only">
                    {unreadCount === 1
                      ? ", 1 neue Meldung"
                      : `, ${unreadCount} neue Meldungen`}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
