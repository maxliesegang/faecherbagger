import { Feed } from "feed";
import type {
  ConstructionSite,
  ConstructionSiteMetadata,
} from "../types/index.ts";
import {
  getConstructionCategoryLabel,
  getClosureLabel,
  formatConstructionPeriod,
  getConstructionPhaseLabel,
} from "./construction-site-labels.ts";

export const CONSTRUCTION_SITE_FEED_FILENAMES = {
  rss: "baustellen.xml",
  atom: "baustellen.atom",
} as const;

export interface ConstructionSiteFeeds {
  rss: string;
  atom: string;
}

function parseFeedDate(timestamp: string): Date {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid feed timestamp: ${timestamp}`);
  }
  return date;
}

const normalizeBaseURL = (url: string): string =>
  `${url.replace(/\/+$/, "")}/`;

function createFeedItemDescription(site: ConstructionSite): string {
  return [
    `${getConstructionPhaseLabel(site.phase)} · ${getConstructionCategoryLabel(site.category)} · ${getClosureLabel(site.closure)}`,
    `Zeitraum: ${formatConstructionPeriod(site.startDate, site.endDate)}`,
    site.notes ? `Hinweis: ${site.notes}` : null,
    site.cause ? `Verantwortlich: ${site.cause}` : null,
    `Quelle: ${site.source}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Builds RSS 2.0 and Atom 1.0 from one shared feed model. Revision-aware item
 * IDs make source modifications appear as new entries while site links remain
 * stable.
 */
export function createConstructionSiteFeeds(
  constructionSites: readonly ConstructionSite[],
  metadata: ConstructionSiteMetadata,
  appURL: string,
): ConstructionSiteFeeds {
  const baseURL = normalizeBaseURL(appURL);
  const feed = new Feed({
    title: "Fächerbagger – Baustellen in der Region Karlsruhe",
    description:
      "Aktuelle und geplante Straßenbaustellen in der Region Karlsruhe.",
    id: baseURL,
    link: baseURL,
    language: "de",
    updated: parseFeedDate(metadata.fetchedAt),
    generator: "Fächerbagger",
    feedLinks: {
      rss: new URL(CONSTRUCTION_SITE_FEED_FILENAMES.rss, baseURL).href,
      atom: new URL(CONSTRUCTION_SITE_FEED_FILENAMES.atom, baseURL).href,
    },
    author: {
      name: metadata.source.name,
      link: metadata.source.url,
    },
  });

  [...constructionSites]
    .sort((left, right) => {
      const byModified = right.lastModified.localeCompare(left.lastModified);
      return byModified || left.id.localeCompare(right.id);
    })
    .forEach((site) => {
      const link = new URL(baseURL);
      link.searchParams.set("baustelle", site.id);
      const title = `${getConstructionPhaseLabel(site.phase)}: ${site.location} – ${site.municipality}`;
      const revisionId = `faecherbagger:${site.id}:${site.lastModified}`;

      feed.addItem({
        title,
        id: revisionId,
        guid: revisionId,
        link: link.href,
        date: parseFeedDate(site.lastModified),
        description: createFeedItemDescription(site),
        category: [
          {
            name: getConstructionCategoryLabel(site.category),
            term: site.category,
          },
        ],
      });
    });

  return {
    rss: feed.rss2(),
    atom: feed.atom1(),
  };
}
