import type { AppSection } from "../lib/url-state.ts";

interface AppSectionTabsProps {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  /** Unacknowledged changes around the visitor; hidden when zero. */
  unseenCount: number;
}

const SECTION_LABELS: Record<AppSection, string> = {
  surroundings: "Meine Umgebung",
  explorer: "Alle Baustellen",
};

const SECTIONS: readonly AppSection[] = ["surroundings", "explorer"];

/**
 * Top-level navigation. Rendered as a tab list so the primary purpose of the
 * app — what is new nearby — is always the first thing to reach, and carries
 * the count of changes the visitor has not seen yet.
 */
export function AppSectionTabs({
  section,
  onSectionChange,
  unseenCount,
}: AppSectionTabsProps) {
  return (
    <nav className="section-tabs" aria-label="Bereiche">
      {SECTIONS.map((value) => (
        <button
          key={value}
          type="button"
          className="section-tabs__tab"
          aria-current={section === value ? "page" : undefined}
          onClick={() => onSectionChange(value)}
        >
          {SECTION_LABELS[value]}
          {value === "surroundings" && unseenCount > 0 && (
            <span className="section-tabs__badge">
              {unseenCount}
              <span className="kern-sr-only"> ungelesene Änderungen</span>
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
