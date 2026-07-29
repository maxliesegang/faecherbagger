import { useMemo, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernHeading,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { useDataset } from "../context/DatasetContext.tsx";
import { usePersonal } from "../context/PersonalContext.tsx";
import type { SiteSelection } from "../lib/select-sites.ts";
import { useView } from "../context/ViewContext.tsx";
import { canOfferPushNotifications } from "../hooks/usePushNotifications.ts";
import { LazyConstructionSiteMap } from "./LazyConstructionSiteMap.tsx";
import { NearbyConstructionSiteList } from "./NearbyConstructionSiteList.tsx";
import { HomeAreaSetup } from "./HomeAreaSetup.tsx";
import { RecentWindowSelect } from "./RecentWindowSelect.tsx";
import "./ConstructionSiteSurroundings.css";

interface ConstructionSiteSurroundingsProps {
  /** Everything inside the visitor's area, derived once by the caller. */
  surroundings: SiteSelection;
  onMarkSitesSeen: () => void;
}

/**
 * The app's primary screen: what is new around the visitor. Everything else —
 * the complete regional data, filters, the full map — is one step away in the
 * explorer, so this view answers only "muss ich hier etwas wissen?".
 */
export function ConstructionSiteSurroundings({
  surroundings,
  onMarkSitesSeen,
}: ConstructionSiteSurroundingsProps) {
  const { metadata } = useDataset();
  const {
    recentWindow,
    setWindowDays: onWindowDaysChange,
    getDetailHref: getSiteDetailsHref,
    openSiteDetails: onShowSiteDetails,
    showSiteOnMap: onShowSiteOnMap,
    showExplorer: onExploreAllConstructionSites,
  } = useView();
  const {
    area: homeArea,
    hasAcknowledged,
    location: locationController,
    push: pushController,
    isInstalled,
  } = usePersonal();
  const [isAreaMapOpen, setIsAreaMapOpen] = useState(false);
  const [mapSelectedSiteId, setMapSelectedSiteId] = useState<string>();

  const nearbySites = useMemo(
    () => surroundings.all.map((entry) => entry.site),
    [surroundings],
  );
  const canOfferNotifications = canOfferPushNotifications(
    pushController.status,
    isInstalled,
  );

  if (!homeArea) {
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
          <HomeAreaSetup />
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
            Umkreis {homeArea.radiusKm} km
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
            {surroundings.all.length} Baustellen im Gebiet
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
              void pushController.enableNotifications(homeArea)
            }
          />
        </KernAlert>
      )}

      <div className="surroundings__result">
        <RecentWindowSelect
          recentWindowDays={recentWindow.days}
          onWindowDaysChange={onWindowDaysChange}
          label="Zeitraum für Baustellen in Ihrer Umgebung"
        />
        <p
          className="surroundings__count"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>{surroundings.recent.length}</strong>{" "}
          {surroundings.recent.length === 1
            ? "neue Baustelle"
            : "neue Baustellen"}
          {surroundings.unseenCount > 0 && (
            <span className="surroundings__unseen">
              {surroundings.unseenCount}{" "}
              {hasAcknowledged ? "seit Ihrem letzten Besuch" : "davon ungelesen"}
            </span>
          )}
        </p>
        {surroundings.unseenCount > 0 && (
          <KernButton
            type="button"
            variant="tertiary"
            label="Als gelesen markieren"
            onClick={onMarkSitesSeen}
          />
        )}
      </div>

      {surroundings.recent.length > 0 ? (
        <NearbyConstructionSiteList
          scopedSites={surroundings.recent}
          label="Neue Baustellen in Ihrer Umgebung"
          getSiteDetailsHref={getSiteDetailsHref}
          onShowSiteDetails={onShowSiteDetails}
          onShowSiteOnMap={onShowSiteOnMap}
        />
      ) : (
        <KernAlert variant="success" title="Nichts Neues in Ihrer Umgebung">
          <KernText>
            {`Im Umkreis von ${homeArea.radiusKm} km ist in diesem Zeitraum keine neue Baustelle dazugekommen.`}
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
              homeArea={homeArea}
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
            Alle {surroundings.all.length} Baustellen im Gebiet
          </span>
        </summary>
        <section className="kern-accordion__body">
          {surroundings.all.length > 0 ? (
            <NearbyConstructionSiteList
              scopedSites={surroundings.all}
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
          <HomeAreaSetup />
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
