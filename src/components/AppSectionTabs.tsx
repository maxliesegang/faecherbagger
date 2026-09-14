import type { AppSection } from "../lib/url-state.ts";
import "./AppSectionTabs.css";

interface AppSectionTabsProps {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  getSectionHref: (section: AppSection) => string;
  /**
   * How many relevant sites need attention in the next days, shown on the
   * personal tab. `0` renders no badge at all rather than a zero — a badge
   * that is always there stops being read.
   */
  shortNoticeCount: number;
}

const SECTION_LABELS: Record<AppSection, string> = {
  relevant: "Für mich",
  explore: "Alle Baustellen",
};

const SECTIONS: readonly AppSection[] = ["relevant", "explore"];

/**
 * The app's two sections.
 *
 * Real links rather than ARIA tabs: each section is a distinct address that can
 * be bookmarked, opened in a new tab and reached with Back, and the tab
 * keyboard model (arrow keys, one stop in the tab order) would work against
 * that. The click handler keeps the navigation in-app.
 */
export function AppSectionTabs({
  section,
  onSectionChange,
  getSectionHref,
  shortNoticeCount,
}: AppSectionTabsProps) {
  return (
    <nav className="app-sections" aria-label="Bereiche">
      {SECTIONS.map((candidate) => {
        const isCurrent = candidate === section;
        const showBadge = candidate === "relevant" && shortNoticeCount > 0;
        return (
          <a
            key={candidate}
            className="app-sections__tab"
            href={getSectionHref(candidate)}
            aria-current={isCurrent ? "page" : undefined}
            onClick={(event) => {
              // Leave the modified clicks to the browser so "open in new tab"
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
              onSectionChange(candidate);
            }}
          >
            {SECTION_LABELS[candidate]}
            {showBadge ? (
              <span className="app-sections__badge">
                {shortNoticeCount}
                <span className="kern-sr-only">
                  {shortNoticeCount === 1
                    ? " Baustelle in den nächsten Tagen"
                    : " Baustellen in den nächsten Tagen"}
                </span>
              </span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}
