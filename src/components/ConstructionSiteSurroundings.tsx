import { useMemo, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernHeading,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type {
  ConstructionSite,
  ConstructionSiteChanges,
  ConstructionSiteMetadata,
  ISOTimestamp,
  NotificationArea,
} from "../types/index.ts";
import type { NearbyConstructionSite } from "../lib/nearby-construction-sites.ts";
import { CHANGES_RETENTION_DAYS } from "../lib/construction-site-changes.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import {
  canOfferPushNotifications,
  type PushNotificationController,
} from "../hooks/usePushNotifications.ts";
import { LazyConstructionSiteMap } from "./LazyConstructionSiteMap.tsx";
import { NearbyConstructionSiteList } from "./NearbyConstructionSiteList.tsx";
import { NotificationAreaSetup } from "./NotificationAreaSetup.tsx";
import "./ConstructionSiteSurroundings.css";

interface ConstructionSiteSurroundingsProps {
  /** Complete dataset; only needed for the municipality fallback in the setup. */
  constructionSites: readonly ConstructionSite[];
  /** Everything inside the area, nearest first. */
  nearbyConstructionSites: readonly NearbyConstructionSite[];
  /** The subset in the change window, newest first — the primary content. */
  changedNearbyConstructionSites: readonly NearbyConstructionSite[];
  /** How many of the changes the visitor has not acknowledged. */
  unseenCount: number;
  changes: Readonly<ConstructionSiteChanges>;
  metadata: ConstructionSiteMetadata;
  notificationArea: NotificationArea | null;
  onNotificationAreaChange: (area: NotificationArea) => void;
  onNotificationAreaClear: () => void;
  locationController: CurrentLocationController;
  pushController: PushNotificationController;
  isInstalled: boolean;
  seenAt: ISOTimestamp | null;
  onMarkChangesSeen: () => void;
  getSiteDetailsHref: (siteId: string) => string;
  onShowSiteDetails: (siteId: string) => void;
  onShowSiteOnMap: (siteId: string) => void;
  onExploreAllConstructionSites: () => void;
}

/**
 * The app's primary screen: what is new around the visitor. Everything else —
 * the complete regional data, filters, the full map — is one step away in the
 * explorer, so this view answers only "muss ich hier etwas wissen?".
 */
export function ConstructionSiteSurroundings({
  constructionSites,
  nearbyConstructionSites,
  changedNearbyConstructionSites,
  unseenCount,
  changes,
  metadata,
  notificationArea,
  onNotificationAreaChange,
  onNotificationAreaClear,
  locationController,
  pushController,
  isInstalled,
  seenAt,
  onMarkChangesSeen,
  getSiteDetailsHref,
  onShowSiteDetails,
  onShowSiteOnMap,
  onExploreAllConstructionSites,
}: ConstructionSiteSurroundingsProps) {
  const [isAreaMapOpen, setIsAreaMapOpen] = useState(false);
  const [mapSelectedSiteId, setMapSelectedSiteId] = useState<string>();

  const nearbySites = useMemo(
    () => nearbyConstructionSites.map((entry) => entry.site),
    [nearbyConstructionSites],
  );
  const canOfferNotifications = canOfferPushNotifications(
    pushController.status,
    isInstalled,
  );

  if (!notificationArea) {
    return (
      <section className="surroundings" aria-labelledby="surroundings-heading">
        <header className="surroundings__header">
          <KernHeading level={2} id="surroundings-heading">
            Baustellen in Ihrer Umgebung
          </KernHeading>
          <KernText className="surroundings__intro">
            Legen Sie einmalig ein Gebiet fest. Fächerbagger zeigt Ihnen dann,
            welche Baustellen dort neu sind — auf Wunsch als Benachrichtigung
            auf dieses Gerät.
          </KernText>
        </header>

        <div className="surroundings__panel surroundings__panel--onboarding">
          <NotificationAreaSetup
            constructionSites={constructionSites}
            notificationArea={notificationArea}
            onNotificationAreaChange={onNotificationAreaChange}
            onNotificationAreaClear={onNotificationAreaClear}
            locationController={locationController}
            pushController={pushController}
            isInstalled={isInstalled}
          />
        </div>

        <p className="surroundings__explore">
          <KernButton
            type="button"
            variant="tertiary"
            label="Ohne Gebiet: alle Baustellen der Region durchsuchen"
            onClick={onExploreAllConstructionSites}
          />
        </p>
      </section>
    );
  }

  return (
    <section className="surroundings" aria-labelledby="surroundings-heading">
      <header className="surroundings__header">
        <KernHeading level={2} id="surroundings-heading">
          Neu in Ihrer Umgebung
        </KernHeading>
        <p className="surroundings__scope">
          <span className="surroundings__chip">
            Umkreis {notificationArea.radiusKm} km
          </span>
          <span
            className={`surroundings__chip surroundings__chip--${
              pushController.isEnabled ? "on" : "off"
            }`}
          >
            Benachrichtigungen{" "}
            {pushController.isEnabled ? "eingeschaltet" : "aus"}
          </span>
          <span className="surroundings__chip">
            {nearbyConstructionSites.length} Baustellen im Gebiet
          </span>
        </p>
      </header>

      {canOfferNotifications && !pushController.isEnabled && (
        <KernAlert variant="info" title="Nichts mehr verpassen">
          <KernText>
            Mit eingeschalteten Benachrichtigungen melden wir Ihnen neue
            Baustellen in Ihrem Gebiet, auch wenn die App geschlossen ist.
          </KernText>
          <KernButton
            type="button"
            label="Benachrichtigungen einschalten"
            disabled={pushController.isBusy}
            onClick={() =>
              void pushController.enableNotifications(notificationArea)
            }
          />
        </KernAlert>
      )}

      <div className="surroundings__result">
        <p
          className="surroundings__count"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>{changedNearbyConstructionSites.length}</strong>{" "}
          {changedNearbyConstructionSites.length === 1
            ? "neue oder geänderte Baustelle"
            : "neue oder geänderte Baustellen"}{" "}
          in den letzten {CHANGES_RETENTION_DAYS} Tagen
          {unseenCount > 0 && (
            <span className="surroundings__unseen">
              {unseenCount}{" "}
              {seenAt === null ? "davon ungelesen" : "seit Ihrem letzten Besuch"}
            </span>
          )}
        </p>
        {unseenCount > 0 && (
          <KernButton
            type="button"
            variant="tertiary"
            label="Als gelesen markieren"
            onClick={onMarkChangesSeen}
          />
        )}
      </div>

      {changedNearbyConstructionSites.length > 0 ? (
        <NearbyConstructionSiteList
          nearbyConstructionSites={changedNearbyConstructionSites}
          seenAt={seenAt}
          label="Neue und geänderte Baustellen in Ihrer Umgebung"
          getSiteDetailsHref={getSiteDetailsHref}
          onShowSiteDetails={onShowSiteDetails}
          onShowSiteOnMap={onShowSiteOnMap}
        />
      ) : (
        <KernAlert variant="success" title="Nichts Neues in Ihrer Umgebung">
          <KernText>
            {changes.since === null
              ? "Für diesen Datenstand liegt noch kein Vergleich mit einem früheren Abruf vor."
              : `In den letzten ${CHANGES_RETENTION_DAYS} Tagen ist im Umkreis von ${notificationArea.radiusKm} km keine Baustelle hinzugekommen.`}
          </KernText>
        </KernAlert>
      )}

      <details
        className="kern-accordion surroundings__section"
        onToggle={(event) => setIsAreaMapOpen(event.currentTarget.open)}
      >
        <summary className="kern-accordion__header">
          <span className="kern-title">Karte meiner Umgebung</span>
        </summary>
        <section className="kern-accordion__body">
          {isAreaMapOpen && (
            <LazyConstructionSiteMap
              constructionSites={nearbySites}
              selectedSiteId={mapSelectedSiteId}
              currentLocation={
                locationController.locationState.status === "ready"
                  ? locationController.locationState.point
                  : undefined
              }
              notificationArea={notificationArea}
              onSiteSelect={setMapSelectedSiteId}
              getSiteDetailsHref={getSiteDetailsHref}
              onSiteDetailsRequest={onShowSiteDetails}
              onListViewRequest={onExploreAllConstructionSites}
            />
          )}
        </section>
      </details>

      <details className="kern-accordion surroundings__section">
        <summary className="kern-accordion__header">
          <span className="kern-title">
            Alle {nearbyConstructionSites.length} Baustellen im Gebiet
          </span>
        </summary>
        <section className="kern-accordion__body">
          {nearbyConstructionSites.length > 0 ? (
            <NearbyConstructionSiteList
              nearbyConstructionSites={nearbyConstructionSites}
              seenAt={seenAt}
              label="Alle Baustellen in Ihrer Umgebung"
              getSiteDetailsHref={getSiteDetailsHref}
              onShowSiteDetails={onShowSiteDetails}
              onShowSiteOnMap={onShowSiteOnMap}
            />
          ) : (
            <KernText>
              In diesem Gebiet ist derzeit keine Baustelle erfasst. Vergrößern
              Sie den Radius oder wählen Sie einen anderen Mittelpunkt.
            </KernText>
          )}
        </section>
      </details>

      <details className="kern-accordion surroundings__section">
        <summary className="kern-accordion__header">
          <span className="kern-title">Gebiet und Benachrichtigungen</span>
        </summary>
        <section className="kern-accordion__body">
          <NotificationAreaSetup
            constructionSites={constructionSites}
            notificationArea={notificationArea}
            onNotificationAreaChange={onNotificationAreaChange}
            onNotificationAreaClear={onNotificationAreaClear}
            locationController={locationController}
            pushController={pushController}
            isInstalled={isInstalled}
          />
        </section>
      </details>

      <p className="surroundings__explore">
        <KernButton
          type="button"
          variant="tertiary"
          label="Alle Baustellen der Region durchsuchen"
          onClick={onExploreAllConstructionSites}
        />
        <span className="surroundings__updated">
          Stand{" "}
          {new Date(metadata.fetchedAt).toLocaleString("de-DE", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
      </p>
    </section>
  );
}
