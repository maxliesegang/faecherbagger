import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppNavigation } from "../src/components/AppNavigation.tsx";
import { ConstructionSiteFilter } from "../src/components/ConstructionSiteFilter.tsx";
import { ConstructionSiteTable } from "../src/components/ConstructionSiteTable.tsx";
import { EMPTY_CONSTRUCTION_SITE_FILTERS } from "../src/lib/construction-site-filter.ts";
import type { ConstructionSite } from "../src/types/index.ts";

const constructionSite: ConstructionSite = {
  id: "2026V1",
  location: "Hauptstraße",
  municipality: "Karlsruhe",
  startDate: "2026-10-01",
  endDate: null,
  phase: "active",
  closure: "full",
  category: "sewer",
  artRaw: "",
  siteType: null,
  notes: null,
  cause: null,
  source: "Test",
  lastModified: "2026-10-01T00:00:00Z",
  point: [8.4, 49],
};

const noop = () => undefined;

describe("minimal interface", () => {
  it("leads with the personal view and uses real navigation links", () => {
    const html = renderToStaticMarkup(createElement(AppNavigation, {
      section: "relevant",
      onSectionChange: noop,
      getSectionHref: (section) =>
        section === "relevant" ? "./" : `?bereich=${section}`,
      unreadCount: 2,
    }));
    const text = html.replace(/<[^>]*>/g, "");
    expect(text.indexOf("Für mich")).toBeLessThan(text.indexOf("Karte"));
    expect(text.indexOf("Karte")).toBeLessThan(text.indexOf("Einstellungen"));
    expect(html).toContain('href="./" aria-current="page"');
    expect(html).toContain('href="?bereich=explore"');
    expect(text).toContain("2 neue Meldungen");
  });

  it("keeps narrowing controls collapsed while making restored filters observable", () => {
    const html = renderToStaticMarkup(createElement(ConstructionSiteFilter, {
      constructionSites: [constructionSite],
      filters: { ...EMPTY_CONSTRUCTION_SITE_FILTERS, municipality: "Karlsruhe", timeframe: "week" },
      phaseCounts: { total: 1, active: 1, upcoming: 0 },
      showOnlyChanged: false,
      changedCount: 0,
      onFiltersChange: noop,
      onShowOnlyChangedChange: noop,
      onFiltersReset: noop,
      locationControl: null,
    }));
    expect(html).toMatch(/<details class="kern-accordion filter-panel__advanced">/);
    expect(html).toContain("2 aktiv");
    expect(html).toContain('aria-label="Aktive Filter"');
    expect(html).toContain("Karlsruhe");
    expect(html).toContain("Zurücksetzen");
    expect(html).toContain('type="search"');
    expect(html).toContain('for="filter-search">Straße oder Ort suchen</label>');
  });

  it.each(["table", "cards"] as const)("renders one compact %s result with a details link", (layout) => {
    const html = renderToStaticMarkup(createElement(ConstructionSiteTable, {
      constructionSites: [constructionSite],
      layout,
      sort: null,
      onSortChange: noop,
      getSiteDetailsHref: (siteId) => `?baustelle=${siteId}`,
      onShowSiteDetails: noop,
    }));
    expect(html).toContain('href="?baustelle=2026V1"');
    expect(html).toContain("Vollsperrung");
    expect(html).toContain("Karlsruhe");
    expect(html).not.toContain('data-column="category"');
    expect(html).not.toContain("<dt>Art</dt>");
    expect(html.match(/href="\?baustelle=2026V1"/g)).toHaveLength(1);
  });
});
