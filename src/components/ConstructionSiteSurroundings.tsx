import { useState } from "react";
import { KernAlert, KernText } from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import { useView } from "../context/ViewContext.tsx";
import type {
  ConstructionSiteSelection,
  ScopedConstructionSite,
} from "../lib/select-construction-sites.ts";
import { FALLBACK_HOME_AREA_LABEL } from "../shared/home-area.ts";
import { SHORT_NOTICE_LEAD_DAYS } from "../shared/construction-site-timing.ts";
import { NearbyConstructionSiteList } from "./NearbyConstructionSiteList.tsx";
import "./ConstructionSiteSurroundings.css";

interface ConstructionSiteSurroundingsProps {
  /** Everything inside the visitor's radius, derived once by the caller. */
  surroundings: ConstructionSiteSelection;
  onMarkConstructionSitesSeen: () => void;
}

/**
 * Which part of the surroundings the list shows.
 *
 * Ordered by how soon the visitor has to do something about it. The old order
 * led with "Neu", which meant "the pipeline had not seen this record before" —
 * true, invisible to a visitor, and unhelpfully independent of whether the work
 * starts tomorrow or next March. What someone can act on is the week around
 * today, so that is what the screen opens on; "neu" survives as the marker on a
 * card that says they could not have known earlier.
 */
type SurroundingsView = "short-notice" | "running" | "planned" | "all";

const SURROUNDINGS_VIEWS: SurroundingsView[] = [
  "short-notice",
  "running",
  "planned",
  "all",
];

const VIEW_LABELS: Record<SurroundingsView, string> = {
  "short-notice": "Kurzfristig",
  running: "Läuft",
  planned: "Geplant",
  all: "Alle",
};

/** The accessible name of the list, which changes with the view. */
const VIEW_LIST_LABELS: Record<SurroundingsView, string> = {
  "short-notice": "Kurzfristige Baustellen in Ihrem Umkreis",
  running: "Laufende Baustellen in Ihrem Umkreis",
  planned: "Geplante Baustellen in Ihrem Umkreis",
  all: "Alle Baustellen in Ihrem Umkreis",
};

/** What the visible list is, in one sentence under the control. */
const VIEW_DESCRIPTIONS: Record<SurroundingsView, string> = {
  "short-notice": `Beginnt in den nächsten ${SHORT_NOTICE_LEAD_DAYS} Tagen oder hat gerade erst begonnen — das, wofür sich Umplanen lohnt.`,
  running: "Wird gerade gebaut.",
  planned: "Angekündigt, aber noch nicht begonnen.",
  all: "Alles, was für diesen Umkreis erfasst ist, einschließlich abgeschlossener Baustellen.",
};

/**
 * What the number above the list counts. Spelled out per view rather than
 * assembled from fragments: German plural and adjective agreement do not
 * survive concatenation, and this is the sentence the screen is judged on.
 */
function describeCount(view: SurroundingsView, count: number): string {
  const isSingular = count === 1;
  switch (view) {
    case "short-notice":
      return isSingular ? "kurzfristige Baustelle" : "kurzfristige Baustellen";
    case "running":
      return isSingular ? "Baustelle im Bau" : "Baustellen im Bau";
    case "planned":
      return isSingular ? "geplante Baustelle" : "geplante Baustellen";
    case "all":
      return isSingular ? "Baustelle im Umkreis" : "Baustellen im Umkreis";
  }
}

/** The empty state per view — each one names the way on rather than stopping. */
function describeEmptyView(view: SurroundingsView, radiusKm: number): string {
  switch (view) {
    case "short-notice":
      return `Im Umkreis von ${radiusKm} km beginnt in den nächsten ${SHORT_NOTICE_LEAD_DAYS} Tagen keine neue Baustelle.`;
    case "running":
      return `Im Umkreis von ${radiusKm} km wird derzeit nicht gebaut.`;
    case "planned":
      return `Für den Umkreis von ${radiusKm} km ist derzeit nichts angekündigt.`;
    case "all":
      return `Im Umkreis von ${radiusKm} km ist keine Baustelle erfasst. Vergrößern Sie den Umkreis oder wählen Sie einen anderen Mittelpunkt.`;
  }
}

/**
 * The app's primary screen: what is about to happen around the visitor, soon
 * enough that they can still plan around it.
 *
 * It shows the area but no longer edits it: the radius is a notification
 * setting and lives with the switch it drives. There is no map here either. A
 * radius is a number the list already sorts by, and the map that used to sit
 * above the answer pushed it below the fold on a phone while adding nothing the
 * distance on each card does not say. The explorer has the map, one tab away,
 * for the questions that are actually spatial.
 */
export function ConstructionSiteSurroundings({
  surroundings,
  onMarkConstructionSitesSeen,
}: ConstructionSiteSurroundingsProps) {
  const {
    getConstructionSiteDetailHref,
    openConstructionSiteDetail,
    showNotificationSettings,
  } = useView();
  const { effectiveArea, hasChosenArea, hasAcknowledged } = usePersonal();
  const [view, setView] = useState<SurroundingsView>("short-notice");

  const viewLists: Record<
    SurroundingsView,
    readonly ScopedConstructionSite[]
  > = {
    "short-notice": surroundings.shortNotice,
    running: surroundings.running,
    planned: surroundings.planned,
    all: surroundings.all,
  };
  const visibleSites = viewLists[view];
  const countLabel = describeCount(view, visibleSites.length);

  return (
    <section
      className="surroundings app-screen"
      aria-labelledby="surroundings-heading"
    >
      <h2 id="surroundings-heading" className="kern-sr-only">
        Baustellen in Ihrem Umkreis
      </h2>

      {/* What this screen is answering for, and the one way to change it. The
          tab above already says "Mein Umkreis", so this states the value
          rather than repeating the title. */}
      <p className="surroundings__scope">
        <span className="surroundings__chip">
          {effectiveArea.radiusKm} km
          {hasChosenArea ? "" : ` um ${FALLBACK_HOME_AREA_LABEL}`}
        </span>
        <button
          type="button"
          className="surroundings__scope-edit"
          onClick={showNotificationSettings}
        >
          Umkreis ändern
        </button>
      </p>

      {/*
       * The guess, stated plainly and small. It replaces the setup form that
       * used to stand in front of this screen: a visitor now arrives at an
       * answer and can correct where it is centred, instead of configuring one
       * before seeing anything. Deliberately not an alert — nothing has gone
       * wrong, and a full alert box cost as much of the first screen as the
       * empty state it replaced.
       */}
      {!hasChosenArea && (
        <p className="surroundings__fallback">
          Voreinstellung, bis Sie einen eigenen Mittelpunkt festlegen — der auch
          Benachrichtigungen möglich macht.{" "}
          <button
            type="button"
            className="surroundings__fallback-action"
            onClick={showNotificationSettings}
          >
            Jetzt festlegen
          </button>
        </p>
      )}

      {/*
       * The one control that picks what the list answers, ordered by urgency.
       * The counts sit in the control so the visitor can see what a tab holds
       * before taking it.
       */}
      <div
        className="surroundings__views"
        role="group"
        aria-label="Baustellen im Umkreis eingrenzen"
      >
        {SURROUNDINGS_VIEWS.map((value) => (
          <button
            key={value}
            type="button"
            className="surroundings__view"
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {VIEW_LABELS[value]}
            <span className="surroundings__view-count">
              {viewLists[value].length}
            </span>
          </button>
        ))}
      </div>

      <div className="surroundings__block">
        <div className="surroundings__tally">
          <p className="surroundings__description">
            {VIEW_DESCRIPTIONS[view]}
            {surroundings.unseenCount > 0 && (
              <span className="surroundings__unseen">
                {surroundings.unseenCount}{" "}
                {hasAcknowledged ? "seit Ihrem letzten Besuch" : "ungelesen"}
              </span>
            )}
          </p>
          {/* Only offered when there is something to acknowledge. */}
          {surroundings.unseenCount > 0 && (
            <button
              type="button"
              className="surroundings__mark-seen"
              onClick={onMarkConstructionSitesSeen}
            >
              Als gelesen markieren
            </button>
          )}
        </div>

        {/* The count itself is on the control; this exists so a screen reader
            hears the result change when the view does. */}
        <p className="kern-sr-only" aria-live="polite" aria-atomic="true">
          {visibleSites.length} {countLabel}
        </p>

        {visibleSites.length > 0 ? (
          <NearbyConstructionSiteList
            scopedConstructionSites={visibleSites}
            label={VIEW_LIST_LABELS[view]}
            today={surroundings.today}
            getConstructionSiteDetailHref={getConstructionSiteDetailHref}
            onOpenConstructionSiteDetail={openConstructionSiteDetail}
          />
        ) : view === "short-notice" ? (
          /* The good news, and the way on: what is already there is one tap
             away, and the counts on the control say how much. */
          <KernAlert variant="success" title="Nichts Kurzfristiges bei Ihnen">
            <KernText>{describeEmptyView(view, effectiveArea.radiusKm)}</KernText>
          </KernAlert>
        ) : (
          <KernText className="surroundings__nothing">
            {describeEmptyView(view, effectiveArea.radiusKm)}
          </KernText>
        )}
      </div>
    </section>
  );
}
