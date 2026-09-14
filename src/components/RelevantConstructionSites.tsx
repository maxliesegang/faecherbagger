import { useState } from "react";
import {
  KernAlert,
  KernButton,
  KernHeading,
} from "@kern-ux-annex/kern-react-kit";
import type { NotificationArea } from "../types/index.ts";
import {
  SHORT_NOTICE_LEAD_DAYS,
  formatConstructionPeriodRelativeToToday,
} from "../lib/construction-site-timeframe.ts";
import {
  getClosureBadgeVariant,
  getClosureLabel,
} from "../lib/construction-site-labels.ts";
import { formatDistance } from "../lib/distance.ts";
import type {
  RelevanceSelection,
  RelevantConstructionSite,
} from "../lib/relevant-construction-sites.ts";
import "./RelevantConstructionSites.css";

/** Which slice of the personal set is listed. */
type RelevanceView = "short-notice" | "running" | "planned" | "followed";

const RELEVANCE_VIEWS: readonly RelevanceView[] = [
  "short-notice",
  "running",
  "planned",
  "followed",
];

const VIEW_LABELS: Record<RelevanceView, string> = {
  "short-notice": "Kurzfristig",
  running: "Läuft",
  planned: "Geplant",
  followed: "Beobachtet",
};

/** What the visible list is, in one sentence under the control. */
const VIEW_DESCRIPTIONS: Record<RelevanceView, string> = {
  "short-notice": `Beginnt in den nächsten ${SHORT_NOTICE_LEAD_DAYS} Tagen oder hat gerade erst begonnen — das, wofür sich Umplanen lohnt.`,
  running: "Wird gerade gebaut.",
  planned: "Angekündigt, aber noch nicht begonnen.",
  followed: "Baustellen, die Sie selbst ausgewählt haben — unabhängig vom Ort.",
};

/**
 * German plural and adjective agreement does not survive concatenation, so the
 * counted noun is spelled out per view rather than assembled from fragments.
 */
function describeCount(view: RelevanceView, count: number): string {
  const isSingular = count === 1;
  switch (view) {
    case "short-notice":
      return isSingular ? "kurzfristige Baustelle" : "kurzfristige Baustellen";
    case "running":
      return isSingular ? "Baustelle im Bau" : "Baustellen im Bau";
    case "planned":
      return isSingular ? "geplante Baustelle" : "geplante Baustellen";
    case "followed":
      return isSingular
        ? "beobachtete Baustelle"
        : "beobachtete Baustellen";
  }
}

/** Each empty state names the way on rather than stopping at "nichts". */
function describeEmptyView(view: RelevanceView): string {
  switch (view) {
    case "short-notice":
      return `In Ihren Gebieten beginnt in den nächsten ${SHORT_NOTICE_LEAD_DAYS} Tagen keine Baustelle. Das ist die gute Nachricht.`;
    case "running":
      return "In Ihren Gebieten wird derzeit nicht gebaut.";
    case "planned":
      return "Für Ihre Gebiete ist derzeit nichts angekündigt.";
    case "followed":
      return "Sie beobachten noch keine einzelne Baustelle. Öffnen Sie eine Baustelle und wählen Sie „Baustelle beobachten“, um auch außerhalb Ihrer Gebiete benachrichtigt zu werden.";
  }
}

/**
 * Why this site is on the list: the nearest watched area, or the fact that it
 * was followed by hand. Always says something — a card with no reason on it
 * leaves the visitor wondering why they are being shown it.
 */
function describeRelevance(relevant: RelevantConstructionSite): string {
  const nearest = relevant.areas[0];
  if (nearest) {
    return `${formatDistance(nearest.distanceMeters)} von ${nearest.area.label}`;
  }
  return "Von Ihnen beobachtet";
}

interface RelevantConstructionSitesProps {
  selection: RelevanceSelection;
  areas: readonly NotificationArea[];
  getDetailHref: (siteId: string) => string;
  onDetailOpen: (siteId: string) => void;
  /** Opens the area setup, for the empty state and the "Gebiete" action. */
  onEditAreas: () => void;
}

/**
 * The app's primary screen: what is about to happen around the places someone
 * watches, soon enough that they can still plan around it.
 *
 * It shows the areas but does not edit them — that belongs with the
 * notification settings the radius actually drives. There is no map here
 * either: a distance is a number every card already carries, and a map above
 * the answer pushes it below the fold on a phone. The explorer has the map, one
 * tab away, for the questions that are genuinely spatial.
 */
export function RelevantConstructionSites({
  selection,
  areas,
  getDetailHref,
  onDetailOpen,
  onEditAreas,
}: RelevantConstructionSitesProps) {
  const [view, setView] = useState<RelevanceView>("short-notice");

  const lists: Record<RelevanceView, readonly RelevantConstructionSite[]> = {
    "short-notice": selection.shortNotice,
    running: selection.running,
    planned: selection.planned,
    followed: selection.followed,
  };
  const visible = lists[view];

  // Nothing watched and nothing followed: the screen has no question to answer
  // yet, so it asks one instead of rendering four empty lists.
  if (areas.length === 0 && selection.followed.length === 0) {
    return (
      <section className="relevant" aria-labelledby="relevant-heading">
        <KernHeading level={2} id="relevant-heading">
          Was betrifft mich?
        </KernHeading>
        <KernAlert variant="info" title="Noch kein Gebiet festgelegt">
          Legen Sie fest, wo Sie wohnen oder arbeiten. Fächerbagger zeigt Ihnen
          dann nur die Baustellen in diesen Gebieten — und kann Sie
          benachrichtigen, wenn dort kurzfristig gebaut wird.
        </KernAlert>
        <KernButton
          type="button"
          variant="primary"
          label="Gebiet festlegen"
          onClick={onEditAreas}
        />
      </section>
    );
  }

  return (
    <section className="relevant" aria-labelledby="relevant-heading">
      <div className="relevant__header">
        <KernHeading level={2} id="relevant-heading">
          Was betrifft mich?
        </KernHeading>
        <p className="relevant__areas">
          {areas.length > 0
            ? areas.map((area) => area.label).join(" · ")
            : "Keine Gebiete"}
          <KernButton
            type="button"
            variant="tertiary"
            label="Gebiete ändern"
            onClick={onEditAreas}
          />
        </p>
      </div>

      <fieldset className="relevant__views">
        <legend className="kern-sr-only">Auswahl anzeigen</legend>
        {RELEVANCE_VIEWS.map((candidate) => (
          <label key={candidate} className="relevant__view">
            <input
              className="kern-sr-only"
              type="radio"
              name="relevance-view"
              value={candidate}
              checked={candidate === view}
              onChange={() => setView(candidate)}
            />
            <span>
              {VIEW_LABELS[candidate]}
              {" "}
              <span className="relevant__view-count">
                {lists[candidate].length}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="relevant__description">{VIEW_DESCRIPTIONS[view]}</p>

      <p className="relevant__count" aria-live="polite" aria-atomic="true">
        <strong>{visible.length}</strong> {describeCount(view, visible.length)}
      </p>

      {visible.length === 0 ? (
        <p className="relevant__empty">{describeEmptyView(view)}</p>
      ) : (
        <ul className="relevant__list" aria-label={VIEW_LABELS[view]}>
          {visible.map((relevant) => {
            const { constructionSite } = relevant;
            const period = formatConstructionPeriodRelativeToToday(
              constructionSite,
              selection.today,
            );
            return (
              <li key={constructionSite.id} className="relevant__item">
                <a
                  className="relevant__link"
                  href={getDetailHref(constructionSite.id)}
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
                    onDetailOpen(constructionSite.id);
                  }}
                >
                  <span className="relevant__location">
                    {constructionSite.location || constructionSite.municipality}
                  </span>
                </a>
                <p className="relevant__meta">
                  <span
                    className="relevant__closure"
                    data-variant={getClosureBadgeVariant(
                      constructionSite.closure,
                    )}
                  >
                    {getClosureLabel(constructionSite.closure)}
                  </span>
                  <span className="relevant__reason">
                    {describeRelevance(relevant)}
                  </span>
                  {period && <span className="relevant__period">{period}</span>}
                  {relevant.isChanged && (
                    <span className="relevant__changed">Geändert</span>
                  )}
                  {relevant.isFollowed && view !== "followed" && (
                    <span className="relevant__followed">Beobachtet</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
