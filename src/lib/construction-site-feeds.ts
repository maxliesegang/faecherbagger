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

/**
 * The timestamp an entry is dated, sorted and versioned by.
 *
 * `lastModified` mirrors the source's `stand`, which some records simply do not
 * carry (normalization turns those into `""`). Feed entries still need a date,
 * so fall back to the record's start date — normalization guarantees one, and
 * unlike the run's `fetchedAt` it does not change between runs, so an undated
 * record keeps a stable revision ID instead of resurfacing in readers every
 * time the pipeline runs.
 */
function getFeedItemTimestamp(site: ConstructionSite): string {
  return site.lastModified || site.startDate;
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
    .map((site) => ({
      site,
      timestamp: getFeedItemTimestamp(site),
    }))
    .sort((left, right) => {
      const byModified = right.timestamp.localeCompare(left.timestamp);
      return byModified || left.site.id.localeCompare(right.site.id);
    })
    .forEach(({ site, timestamp }) => {
      const link = new URL(baseURL);
      link.searchParams.set("baustelle", site.id);
      const title = `${getConstructionPhaseLabel(site.phase)}: ${site.location} – ${site.municipality}`;
      const revisionId = `faecherbagger:${site.id}:${timestamp}`;

      feed.addItem({
        title,
        id: revisionId,
        guid: revisionId,
        link: link.href,
        date: parseFeedDate(timestamp),
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
