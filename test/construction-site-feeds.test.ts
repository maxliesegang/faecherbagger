import { describe, expect, it } from "vitest";
import type {
  ConstructionSite,
  ConstructionSiteMetadata,
} from "../src/types/index.ts";
import { createConstructionSiteFeeds } from "../src/lib/construction-site-feeds.ts";

const metadata: ConstructionSiteMetadata = {
  fetchedAt: "2026-07-24T18:16:58.659Z",
  recordCount: 2,
  counts: { active: 1, upcoming: 1 },
  source: { name: "TRK", url: "https://example.test/wfs", layers: [] },
  attribution: ["Stadt Karlsruhe"],
};

function createConstructionSite(
  id: string,
  lastModified: string,
  location: string,
): ConstructionSite {
  return {
    id,
    phase: "active",
    category: "road-construction",
    artRaw: "Straßenbau",
    closure: "full",
    siteType: null,
    municipality: "Karlsruhe",
    location,
    notes: "Hinweis & Umleitung",
    cause: "Tiefbauamt",
    startDate: "2026-07-25",
    endDate: "2026-08-01",
    point: [8.4, 49],
    source: "Stadt Karlsruhe",
    lastModified,
  };
}

describe("createConstructionSiteFeeds", () => {
  it("builds RSS and Atom with stable links and revision-aware IDs", () => {
    const feeds = createConstructionSiteFeeds(
      [
        createConstructionSite("older", "2026-07-20T10:00:00Z", "Alte Straße"),
        createConstructionSite("newer", "2026-07-23T12:00:00Z", "A & B <Platz>"),
      ],
      metadata,
      "https://example.test/faecherbagger",
    );

    expect(feeds.rss).toContain('<rss version="2.0"');
    expect(feeds.rss).toContain(
      '<atom:link href="https://example.test/faecherbagger/baustellen.xml"',
    );
    expect(feeds.rss).toContain("A & B <Platz>");
    expect(feeds.rss).toContain("Hinweis: Hinweis & Umleitung");
    expect(feeds.rss).toContain(
      "https://example.test/faecherbagger/?baustelle=newer",
    );
    expect(feeds.rss).toContain(
      "<guid isPermaLink=\"false\">faecherbagger:newer:2026-07-23T12:00:00Z</guid>",
    );
    expect(feeds.rss.indexOf("baustelle=newer")).toBeLessThan(
      feeds.rss.indexOf("baustelle=older"),
    );

    expect(feeds.atom).toContain(
      '<feed xmlns="http://www.w3.org/2005/Atom">',
    );
    expect(feeds.atom).toContain(
      '<link rel="self" href="https://example.test/faecherbagger/baustellen.atom"/>',
    );
    expect(feeds.atom).toContain(
      "<id>faecherbagger:newer:2026-07-23T12:00:00Z</id>",
    );
    expect(feeds.atom).toContain(
      '<category label="Straßenbau" term="road-construction"/>',
    );
    expect(feeds.atom.indexOf("baustelle=newer")).toBeLessThan(
      feeds.atom.indexOf("baustelle=older"),
    );
  });

  it("falls back to the start date when the source carries no 'stand'", () => {
    const feeds = createConstructionSiteFeeds(
      [createConstructionSite("undated", "", "Ohne Stand")],
      metadata,
      "https://example.test/faecherbagger",
    );

    expect(feeds.atom).toContain("<id>faecherbagger:undated:2026-07-25</id>");
    expect(feeds.rss).toContain("<pubDate>Sat, 25 Jul 2026 00:00:00 GMT</pubDate>");
  });

  it("keeps an undated entry's revision ID stable across runs", () => {
    const sites = [createConstructionSite("undated", "", "Ohne Stand")];
    const laterRun = { ...metadata, fetchedAt: "2026-07-31T06:00:00.000Z" };

    const first = createConstructionSiteFeeds(
      sites,
      metadata,
      "https://example.test/faecherbagger",
    );
    const second = createConstructionSiteFeeds(
      sites,
      laterRun,
      "https://example.test/faecherbagger",
    );

    expect(second.atom).toContain("<id>faecherbagger:undated:2026-07-25</id>");
    expect(first.atom).toContain("<id>faecherbagger:undated:2026-07-25</id>");
  });
});
