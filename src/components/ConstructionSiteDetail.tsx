import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import {
  KernBadge,
  KernButton,
  KernIcon,
  KernLink,
  KernLoader,
} from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite } from "../types/index.ts";
import {
  CLOSURE_SEVERITY_COLORS,
  formatConstructionPeriod,
  formatISODate,
  getClosureBadgeVariant,
  getClosureDescription,
  getClosureHeadline,
  getClosureLabel,
  getConstructionCategoryDescription,
  getConstructionCategoryLabel,
  getConstructionPhaseBadgeVariant,
  getConstructionPhaseLabel,
} from "../lib/construction-site-labels.ts";
import { ShareConstructionSiteButton } from "./ShareConstructionSiteButton.tsx";
import {
  formatConstructionPeriodRelativeToToday,
  getBerlinCalendarDate,
} from "../lib/construction-site-timeframe.ts";
import "./ConstructionSiteDetail.css";

const ConstructionSiteLocationMap = lazy(() =>
  import("./ConstructionSiteLocationMap.tsx").then((module) => ({
    default: module.ConstructionSiteLocationMap,
  })),
);

interface ConstructionSiteDetailProps {
  site: ConstructionSite;
  overviewHref: string;
  onBack: () => void;
  onShowOnMap: () => void;
}

export function ConstructionSiteDetail({
  site,
  overviewHref,
  onBack,
  onShowOnMap,
}: ConstructionSiteDetailProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const today = useMemo(() => getBerlinCalendarDate(), []);
  const relativePeriod = formatConstructionPeriodRelativeToToday(site, today);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${site.location} – Fächerbagger`;
    return () => {
      document.title = previousTitle;
    };
  }, [site.location]);

  // The overview is replaced in place, so without this a keyboard or screen
  // reader user is left at the top of the document with nothing announced.
  useEffect(() => {
    headingRef.current?.focus();
  }, [site.id]);

  return (
    <article className="construction-site-detail" aria-labelledby="detail-title">
      <a
        className="construction-site-detail__back"
        href={overviewHref}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          onBack();
        }}
      >
        <KernIcon icon="arrow-back" />
        Zur Baustellenübersicht
      </a>

      <header className="construction-site-detail__header">
        <div className="construction-site-detail__badges">
          <KernBadge
            variant={getConstructionPhaseBadgeVariant(site.phase)}
            label={getConstructionPhaseLabel(site.phase)}
          />
          <KernBadge
            variant={getClosureBadgeVariant(site.closure)}
            label={getClosureLabel(site.closure)}
          />
        </div>
        {/*
          The site is what this page is about, so it owns the h1. `tabIndex={-1}`
          exists only so focus can be moved here on entry.
        */}
        <h1 id="detail-title" ref={headingRef} tabIndex={-1}>
          {site.location}
        </h1>
        <p className="construction-site-detail__municipality">
          {site.municipality}
        </p>
      </header>

      {/*
        The lead answer. A visitor arrives asking "komme ich hier durch?", so
        that is what the page says first, in words rather than in the source's
        category name. `data-closure` carries the severity to CSS, which repeats
        it as a coloured rule — the text stands on its own without the colour.
      */}
      <section
        className="construction-site-detail__verdict"
        style={
          {
            "--verdict-color": CLOSURE_SEVERITY_COLORS[site.closure],
          } as CSSProperties
        }
      >
        <h2 className="construction-site-detail__verdict-headline">
          {getClosureHeadline(site.closure)}
        </h2>
        <p className="construction-site-detail__verdict-detail">
          {getClosureDescription(site.closure)}
        </p>
        <p className="construction-site-detail__summary">
          {site.endDate
            ? `Voraussichtlich bis ${formatISODate(site.endDate)}`
            : `Seit ${formatISODate(site.startDate)}, Ende offen`}
          {relativePeriod && ` · ${relativePeriod}`}
        </p>
      </section>

      <Suspense fallback={<KernLoader />}>
        <ConstructionSiteLocationMap constructionSite={site} />
      </Suspense>

      <div className="construction-site-detail__actions">
        <KernButton
          type="button"
          variant="secondary"
          label="In der großen Karte zeigen"
          onClick={onShowOnMap}
        />
        {/*
          A plain `geo:` link hands the coordinates to whichever map application
          the device actually uses, instead of picking a vendor for the visitor.
        */}
        <KernLink
          href={`geo:${site.point[1]},${site.point[0]}?q=${site.point[1]},${site.point[0]}`}
          label="In Karten-App öffnen"
        />
        <ShareConstructionSiteButton site={site} />
      </div>

      {site.notes && (
        <section className="construction-site-detail__notice">
          <h2>Hinweis</h2>
          <p>{site.notes}</p>
        </section>
      )}

      <dl className="construction-site-detail__facts">
        <div>
          <dt>Zeitraum</dt>
          <dd>{formatConstructionPeriod(site.startDate, site.endDate)}</dd>
        </div>
        <div>
          <dt>Art der Baustelle</dt>
          <dd>
            {getConstructionCategoryLabel(site.category)}
            <span className="construction-site-detail__gloss">
              {getConstructionCategoryDescription(site.category)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Verkehrseinschränkung</dt>
          <dd>{getClosureLabel(site.closure)}</dd>
        </div>
      </dl>

      <details className="kern-accordion construction-site-detail__technical">
        <summary className="kern-accordion__header">
          <h2 className="kern-title">Technische Angaben</h2>
        </summary>
        <section className="kern-accordion__body">
          <dl className="construction-site-detail__facts">
            <div>
              <dt>Datenquelle</dt>
              <dd>{site.source}</dd>
            </div>
            {/* Source vocabulary ("Privat", "Eigenbetrieb") — meaningless as a
                headline fact, but useful when checking a record. */}
            <div>
              <dt>Veranlasser</dt>
              <dd>{site.cause ?? "Keine Angabe"}</dd>
            </div>
            <div>
              <dt>Vorgangsnummer</dt>
              <dd>{site.id}</dd>
            </div>
            <div>
              <dt>Stand der Angaben</dt>
              <dd>{formatISODate(site.lastModified)}</dd>
            </div>
          </dl>
        </section>
      </details>
    </article>
  );
}
