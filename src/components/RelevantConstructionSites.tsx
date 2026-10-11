import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { KernAlert, KernButton } from "@kern-ux-annex/kern-react-kit";
import type {
  NotificationArea,
  NotificationFeedEvent,
} from "../types/index.ts";
import type { PushNotificationsController } from "../hooks/usePushNotifications.ts";
import {
  describeConstructionPeriod,
  SHORT_NOTICE_LEAD_DAYS,
} from "../lib/construction-site-timeframe.ts";
import { formatISODate } from "../lib/construction-site-labels.ts";
import { describeNotificationArea } from "../lib/notification-area.ts";
import {
  describeAreaDistance,
  type RelevanceSelection,
  type RelevantConstructionSite,
  filterRelevanceSelectionByArea,
} from "../lib/relevant-construction-sites.ts";
import { useMediaQuery } from "../hooks/useMediaQuery.ts";
import { AppIcon, NOTIFICATION_AREA_ICON } from "./AppIcon.tsx";
import { ConstructionSiteCard } from "./ConstructionSiteCard.tsx";
import { NotificationSwitch } from "./NotificationSwitch.tsx";
import "./RelevantConstructionSites.css";

const ConstructionSiteMap = lazy(() =>
  import("./ConstructionSiteMap.tsx").then((module) => ({
    default: module.ConstructionSiteMap,
  })),
);

/**
 * Wide enough for the cards and a map side by side. Below it the map is not
 * mounted at all, so phones never download MapLibre for this screen; the
 * "Alle Baustellen" destination is one tap away there.
 */
const SIDE_MAP_QUERY = "(min-width: 64rem)";

/**
 * Remembers that the visitor waved the notification banner away. A per-device
 * convenience, so `localStorage` is enough; the settings still offer the
 * switch. Storage can be missing or blocked, which simply shows the banner.
 */
const BANNER_DISMISSED_STORAGE_KEY = "faecherbagger:notification-banner-dismissed";

const readIsBannerDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(BANNER_DISMISSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const storeIsBannerDismissed = () => {
  try {
    window.localStorage.setItem(BANNER_DISMISSED_STORAGE_KEY, "1");
  } catch {
    // Not remembered; the banner returns on the next visit.
  }
};

/**
 * Cards shown per list before "Alle zeigen". A 5 km circle around the city
 * centre holds about twenty starts within two weeks and over a hundred running
 * sites; nobody reads that as a list.
 */
const PREVIEW_COUNT = { soon: 8, running: 5 } as const;
type ExpandableGroup = keyof typeof PREVIEW_COUNT;

/** Jump targets for the summary tiles. */
const SOON_GROUP_ID = "beginnt-bald";
const RUNNING_GROUP_ID = "laeuft-gerade";
const LATER_GROUP_ID = "spaeter-geplant";

const NOTIFICATION_KIND_LABELS: Record<NotificationFeedEvent["kind"], string> = {
  new: "Neu angekündigt",
  changed: "Geändert",
  "starts-soon": "Beginnt bald",
};

interface RelevantConstructionSitesProps {
  selection: RelevanceSelection;
  areas: readonly NotificationArea[];
  /** False until the device's preferences have loaded; avoids a flash of the welcome. */
  isPreferencesLoaded: boolean;
  notificationEvents: readonly NotificationFeedEvent[];
  unreadSignatures: ReadonlySet<string>;
  onMarkRead: () => void;
  hasInboxError: boolean;
  pushNotifications: PushNotificationsController;
  getDetailHref: (siteId: string) => string;
  onDetailOpen: (siteId: string) => void;
  onAreaSetupOpen: () => void;
  getSettingsHref: () => string;
  onSettingsOpen: () => void;
  getExploreHref: () => string;
  onExploreOpen: () => void;
  staleFollowedCount: number;
  onPruneFollowed: () => void;
}

/** Leaves modified clicks to the browser; returns whether the app handles it. */
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * "Für mich": what affects the visitor, in the order they need it.
 *
 * New notifications first, then what starts soon, then what is already under
 * way, then everything announced for later. Followed sites sit in the same
 * lists, marked with a star, rather than in a section of their own: whether a
 * site matters because of an area or because it was marked changes nothing
 * about when it starts.
 */
export function RelevantConstructionSites({
  selection,
  areas,
  isPreferencesLoaded,
  notificationEvents,
  unreadSignatures,
  onMarkRead,
  hasInboxError,
  pushNotifications,
  getDetailHref,
  onDetailOpen,
  onAreaSetupOpen,
  getSettingsHref,
  onSettingsOpen,
  getExploreHref,
  onExploreOpen,
  staleFollowedCount,
  onPruneFollowed,
}: RelevantConstructionSitesProps) {
  const [expandedGroups, setExpandedGroups] = useState<
    ReadonlySet<ExpandableGroup>
  >(new Set());
  const [isLaterOpen, setIsLaterOpen] = useState(
    () => window.location.hash === `#${LATER_GROUP_ID}`,
  );
  const [isBannerDismissed, setIsBannerDismissed] = useState(
    readIsBannerDismissed,
  );
  const [mapSelectedSiteId, setMapSelectedSiteId] = useState<string>();
  const isSideMapShown = useMediaQuery(SIDE_MAP_QUERY);
  // Narrowing to one place: "what is on my commute" without the rest.
  const [focusedAreaId, setFocusedAreaId] = useState<string>();
  const focusedArea = areas.find((area) => area.id === focusedAreaId);
  const visibleSelection = useMemo(
    () =>
      focusedArea
        ? filterRelevanceSelectionByArea(selection, focusedArea.id)
        : selection,
    [selection, focusedArea],
  );
  // Stable between renders: the map refits whenever this array changes.
  const mapConstructionSites = useMemo(
    () => visibleSelection.all.map((relevant) => relevant.constructionSite),
    [visibleSelection.all],
  );
  // A batch notification opens `?bereich=fuer-mich#meldungen`.
  const [isHistoryOpen, setIsHistoryOpen] = useState(
    () => window.location.hash === "#meldungen",
  );
  useEffect(() => {
    if (isPreferencesLoaded && window.location.hash === "#meldungen") {
      document.getElementById("meldungen")?.scrollIntoView({ block: "start" });
    }
  }, [isPreferencesLoaded]);

  if (!isPreferencesLoaded) return null;

  const hasInterest = areas.length > 0 || selection.followed.length > 0;
  if (!hasInterest) {
    return (
      <section className="welcome" aria-labelledby="welcome-heading">
        <AppIcon name="person-pin" className="welcome__icon" />
        <h2 id="welcome-heading" className="welcome__heading">
          Welche Baustellen betreffen Sie?
        </h2>
        <p className="welcome__text">
          Legen Sie einen Ort fest, z. B. Zuhause oder Arbeit. Sie sehen dann
          die Baustellen dort und werden auf Wunsch benachrichtigt.
        </p>
        <KernButton
          type="button"
          variant="primary"
          label="Ort festlegen"
          onClick={onAreaSetupOpen}
        />
        <a
          className="welcome__secondary"
          href={getExploreHref()}
          onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            onExploreOpen();
          }}
        >
          Alle Baustellen auf der Karte ansehen
        </a>
      </section>
    );
  }

  // Once narrowed to one place, the cards need not name it on every line.
  const isMultiArea = areas.length > 1 && !focusedArea;
  const soon = visibleSelection.shortNotice;
  const running = visibleSelection.running.filter(
    (relevant) => !relevant.isShortNotice,
  );
  const later = visibleSelection.planned.filter(
    (relevant) => !relevant.isShortNotice,
  );
  const unreadEvents = notificationEvents.filter((event) =>
    unreadSignatures.has(event.signature),
  );
  const readEvents = notificationEvents.filter(
    (event) => !unreadSignatures.has(event.signature),
  );
  const relevantSiteIds = new Set(
    selection.all.map((relevant) => relevant.constructionSite.id),
  );

  const renderSiteCards = (
    constructionSites: readonly RelevantConstructionSite[],
  ) => (
    <ul className="site-cards">
      {constructionSites.map((relevant) => {
        const { constructionSite } = relevant;
        const distance = describeAreaDistance(relevant, isMultiArea);
        return (
          <ConstructionSiteCard
            key={constructionSite.id}
            title={constructionSite.location || constructionSite.municipality}
            closure={constructionSite.closure}
            detailsHref={getDetailHref(constructionSite.id)}
            onDetailsOpen={() => onDetailOpen(constructionSite.id)}
            facts={[
              describeConstructionPeriod(constructionSite, selection.today),
              ...(distance ? [distance] : []),
            ]}
            isFollowed={relevant.isFollowed}
            isChanged={relevant.isChanged}
          />
        );
      })}
    </ul>
  );

  const renderCappedSiteCards = (
    group: ExpandableGroup,
    constructionSites: readonly RelevantConstructionSite[],
  ) => {
    const isExpanded = expandedGroups.has(group);
    const limit = PREVIEW_COUNT[group];
    return (
      <>
        {renderSiteCards(
          isExpanded ? constructionSites : constructionSites.slice(0, limit),
        )}
        {constructionSites.length > limit && (
          <button
            type="button"
            className="relevant__text-button"
            aria-expanded={isExpanded}
            onClick={() =>
              setExpandedGroups((current) => {
                const next = new Set(current);
                if (isExpanded) next.delete(group);
                else next.add(group);
                return next;
              })
            }
          >
            {isExpanded
              ? "Weniger zeigen"
              : `Alle ${constructionSites.length} zeigen`}
          </button>
        )}
      </>
    );
  };

  const renderNotificationEvents = (
    events: readonly NotificationFeedEvent[],
  ) => (
    <ul className="site-cards">
      {events.map((event) => {
        // A site that has left the data has no detail page to open.
        const isKnown = relevantSiteIds.has(event.siteId);
        return (
          <ConstructionSiteCard
            key={event.signature}
            title={event.location || event.municipality}
            closure={event.closure}
            detailsHref={isKnown ? getDetailHref(event.siteId) : undefined}
            onDetailsOpen={isKnown ? () => onDetailOpen(event.siteId) : undefined}
            lead={NOTIFICATION_KIND_LABELS[event.kind]}
            facts={[`ab ${formatISODate(event.startDate)}`]}
          />
        );
      })}
    </ul>
  );

  const summaryTiles = [
    { targetId: SOON_GROUP_ID, count: soon.length, label: "beginnen bald" },
    { targetId: RUNNING_GROUP_ID, count: running.length, label: "laufen" },
    { targetId: LATER_GROUP_ID, count: later.length, label: "später" },
  ];

  return (
    <div className="relevant-layout">
      <div className="relevant">
        <div className="relevant__overview">
          {/*
            Three numbers instead of a sentence: what the visitor scans for
            first. Each one jumps to its list, so the tiles are not a dead end.
          */}
          <ul className="relevant__summary" aria-label="Übersicht">
            {summaryTiles.map((tile) => (
              <li key={tile.targetId}>
                {tile.count > 0 ? (
                  <a
                    className="relevant__tile"
                    href={`#${tile.targetId}`}
                    onClick={() => {
                      if (tile.targetId === LATER_GROUP_ID) setIsLaterOpen(true);
                    }}
                  >
                    <strong>{tile.count}</strong> {tile.label}
                  </a>
                ) : (
                  <span className="relevant__tile">
                    <strong>0</strong> {tile.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <ul className="relevant__areas" aria-label="Ihre Orte">
            {areas.map((area) => (
              <li key={area.id}>
                {/*
                  A single place needs no filter; with several, each chip
                  narrows the lists and the map to that place.
                */}
                {areas.length > 1 ? (
                  <button
                    type="button"
                    className="relevant__area"
                    aria-pressed={area.id === focusedAreaId}
                    onClick={() =>
                      setFocusedAreaId((current) =>
                        current === area.id ? undefined : area.id,
                      )
                    }
                  >
                    <AppIcon
                      name={NOTIFICATION_AREA_ICON[area.kind]}
                      className="relevant__area-icon"
                    />
                    {area.label}
                    <span className="relevant__area-detail">
                      {" "}
                      · {describeNotificationArea(area)}
                    </span>
                  </button>
                ) : (
                  <span className="relevant__area">
                    <AppIcon
                      name={NOTIFICATION_AREA_ICON[area.kind]}
                      className="relevant__area-icon"
                    />
                    {area.label} · {describeNotificationArea(area)}
                  </span>
                )}
              </li>
            ))}
            <li>
              <a
                className="relevant__edit"
                href={getSettingsHref()}
                onClick={(event) => {
                  if (!isPlainClick(event)) return;
                  event.preventDefault();
                  onSettingsOpen();
                }}
              >
                {areas.length > 0 ? "Orte ändern" : "Ort festlegen"}
              </a>
            </li>
          </ul>
          <p className="kern-sr-only" role="status">
            {focusedArea ? `Nur Baustellen für „${focusedArea.label}“.` : ""}
          </p>
        </div>

        {!isBannerDismissed && (
          <NotificationSwitch
            pushNotifications={pushNotifications}
            variant="banner"
            onDismiss={() => {
              storeIsBannerDismissed();
              setIsBannerDismissed(true);
            }}
          />
        )}

        {hasInboxError && (
          <KernAlert variant="warning" title="Meldungen nicht geladen" />
        )}

        {unreadEvents.length > 0 && (
          <section
            id="meldungen"
            className="relevant__group relevant__group--inbox"
            aria-labelledby="inbox-heading"
          >
            <div className="relevant__group-header">
              <h2 id="inbox-heading">Neue Meldungen</h2>
              <button type="button" className="relevant__text-button" onClick={onMarkRead}>
                Alle gelesen
              </button>
            </div>
            {renderNotificationEvents(unreadEvents)}
          </section>
        )}

        <section
          id={SOON_GROUP_ID}
          className="relevant__group"
          aria-labelledby="soon-heading"
        >
          <h2 id="soon-heading">
            Beginnt bald
            {soon.length > 0 && (
              <span className="relevant__count">{soon.length}</span>
            )}
          </h2>
          {soon.length > 0 ? (
            renderCappedSiteCards("soon", soon)
          ) : (
            <p className="relevant__empty">
              In den nächsten {SHORT_NOTICE_LEAD_DAYS} Tagen beginnt nichts.
            </p>
          )}
        </section>

        {running.length > 0 && (
          <section
            id={RUNNING_GROUP_ID}
            className="relevant__group"
            aria-labelledby="running-heading"
          >
            <h2 id="running-heading">
              Läuft gerade <span className="relevant__count">{running.length}</span>
            </h2>
            {renderCappedSiteCards("running", running)}
          </section>
        )}

        {later.length > 0 && (
          <details
            id={LATER_GROUP_ID}
            className="relevant__disclosure"
            open={isLaterOpen}
            onToggle={(event) => setIsLaterOpen(event.currentTarget.open)}
          >
            <summary>
              Später geplant <span className="relevant__count">{later.length}</span>
            </summary>
            {renderSiteCards(later)}
          </details>
        )}

        {readEvents.length > 0 && (
          <details
            id={unreadEvents.length === 0 ? "meldungen" : undefined}
            className="relevant__disclosure"
            open={isHistoryOpen}
            onToggle={(event) => setIsHistoryOpen(event.currentTarget.open)}
          >
            <summary>
              Frühere Meldungen{" "}
              <span className="relevant__count">{readEvents.length}</span>
            </summary>
            {renderNotificationEvents(readEvents)}
          </details>
        )}

        {staleFollowedCount > 0 && (
          <p className="relevant__stale">
            {staleFollowedCount === 1
              ? "1 gemerkte Baustelle ist nicht mehr in den Daten."
              : `${staleFollowedCount} gemerkte Baustellen sind nicht mehr in den Daten.`}
            <button type="button" className="relevant__text-button" onClick={onPruneFollowed}>
              Entfernen
            </button>
          </p>
        )}
      </div>
      {isSideMapShown && (
        <aside className="relevant__map" aria-label="Karte Ihrer Baustellen">
          <Suspense fallback={null}>
            <ConstructionSiteMap
              constructionSites={mapConstructionSites}
              selectedSiteId={mapSelectedSiteId}
              notificationAreas={areas}
              focusedArea={focusedArea}
              onSiteSelect={setMapSelectedSiteId}
              getSiteDetailsHref={getDetailHref}
              onSiteDetailsRequest={onDetailOpen}
              onListViewRequest={() =>
                document
                  .querySelector<HTMLAnchorElement>(".relevant .site-card__link")
                  ?.focus()
              }
            />
          </Suspense>
        </aside>
      )}
    </div>
  );
}
