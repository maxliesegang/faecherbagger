import { useMemo, useState } from "react";
import {
  KernAlert,
  KernButton,
  KernHeading,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import type { SiteSelection } from "../lib/select-sites.ts";
import { useView } from "../context/ViewContext.tsx";
import { LazyConstructionSiteMap } from "./LazyConstructionSiteMap.tsx";
import { NearbyConstructionSiteList } from "./NearbyConstructionSiteList.tsx";
import { HomeAreaSetup } from "./HomeAreaSetup.tsx";
import { RecentWindowSelect } from "./RecentWindowSelect.tsx";
import "./ConstructionSiteSurroundings.css";

interface ConstructionSiteSurroundingsProps {
  /** Everything inside the visitor's radius, derived once by the caller. */
  surroundings: SiteSelection;
  onMarkSitesSeen: () => void;
}

/**
 * The app's primary screen: what is new inside the visitor's radius.
 *
 * It owns the radius as well as the answer, because the two are read together —
 * "drei neue Baustellen" only means something once you can see how far the
 * circle reaches. The map right under the heading is that picture, and the
 * editor below it moves the same circle. Everything region-wide stays in the
 * explorer, one tab away.
 */
export function ConstructionSiteSurroundings({
  surroundings,
  onMarkSitesSeen,
}: ConstructionSiteSurroundingsProps) {
  const {
    recentWindow,
    setWindowDays,
    getDetailHref: getSiteDetailsHref,
    openSiteDetails: onShowSiteDetails,
    showSiteOnMap: onShowSiteOnMap,
    showExplorer,
  } = useView();
  const { area: homeArea, hasAcknowledged, currentLocation } = usePersonal();
  const [mapSelectedSiteId, setMapSelectedSiteId] = useState<string>();
  const [draftRadiusKm, setDraftRadiusKm] = useState<number>();
  /** Bumped to remount the editor, which resets its uncommitted radius. */
  const [areaEditorGeneration, setAreaEditorGeneration] = useState(0);

  const nearbySites = useMemo(
    () => surroundings.all.map((entry) => entry.site),
    [surroundings],
  );

  /**
   * The circle the map draws: the saved radius, or the one under the visitor's
   * thumb while they drag the slider. Memoized because the map refits whenever
   * this object changes identity — a fresh object per render would keep the
   * camera moving forever.
   *
   * Only the map follows the draft. The list keeps answering for the saved
   * radius until the visitor commits, so the count below never describes an area
   * they have not chosen yet.
   */
  const mapArea = useMemo(() => {
    if (!homeArea) return undefined;
    return draftRadiusKm === undefined || draftRadiusKm === homeArea.radiusKm
      ? homeArea
      : { ...homeArea, radiusKm: draftRadiusKm };
  }, [draftRadiusKm, homeArea]);

  if (!homeArea) {
    return (
      <section className="surroundings" aria-labelledby="surroundings-heading">
        <header className="surroundings__header">
          <KernHeading level={2} id="surroundings-heading">
            Welche Baustellen sind bei Ihnen neu?
          </KernHeading>
          <KernText className="surroundings__intro">
            Legen Sie einmalig einen Mittelpunkt und einen Umkreis fest.
            Fächerbagger zeigt Ihnen dann, welche Baustellen dort neu sind — auf
            Wunsch auch als Benachrichtigung auf dieses Gerät.
          </KernText>
        </header>

        <div className="surroundings__panel">
          <HomeAreaSetup />
        </div>

        <p className="surroundings__aside">
          <KernButton
            type="button"
            variant="tertiary"
            label="Ohne Umkreis: alle Baustellen der Region durchsuchen"
            onClick={showExplorer}
          />
        </p>
      </section>
    );
  }

  const newCount = surroundings.recent.length;

  return (
    <section className="surroundings" aria-labelledby="surroundings-heading">
      <header className="surroundings__header">
        <KernHeading level={2} id="surroundings-heading">
          Neu in Ihrem Umkreis
        </KernHeading>
        <p className="surroundings__scope">
          <span className="surroundings__chip">{homeArea.radiusKm} km</span>
          <span className="surroundings__chip">
            {surroundings.all.length}{" "}
            {surroundings.all.length === 1 ? "Baustelle" : "Baustellen"} darin
          </span>
        </p>
      </header>

      {/*
       * Says which circle is on the map whenever it is not the saved one. The
       * map cannot say it itself — it only ever gets one radius — and a preview
       * that looks like the real setting is worse than no preview.
       */}
      {mapArea !== homeArea && (
        <p className="surroundings__preview" role="status">
          Vorschau: {mapArea?.radiusKm} km. Die Liste unten gilt weiter für{" "}
          {homeArea.radiusKm} km, bis Sie den neuen Umkreis übernehmen.
        </p>
      )}

      {/*
       * The picture of the radius, and the only place in the app where "5 km"
       * becomes a distance you can see. Not a disclosure: it is the answer's
       * context, and a visitor who has to open it never learns what the number
       * means.
       */}
      <LazyConstructionSiteMap
        constructionSites={nearbySites}
        selectedSiteId={mapSelectedSiteId}
        currentLocation={currentLocation}
        homeArea={mapArea}
        fitMode="homeArea"
        variant="compact"
        onSiteSelect={setMapSelectedSiteId}
        getSiteDetailsHref={getSiteDetailsHref}
        onSiteDetailsRequest={onShowSiteDetails}
        onListViewRequest={showExplorer}
      />

      {/*
       * Directly under the map, and closed by default: the radius is set once,
       * but when it is being changed the circle has to be in view — the slider
       * previews into the map above it.
       */}
      <details
        className="kern-accordion surroundings__section"
        // Closing the editor discards an uncommitted radius, on the map and in
        // the panel alike: a preview circle with no slider in sight is just a
        // wrong map, and a reopened panel must show what is actually saved.
        onToggle={(event) => {
          if (event.currentTarget.open) return;
          setDraftRadiusKm(undefined);
          setAreaEditorGeneration((generation) => generation + 1);
        }}
      >
        <summary className="kern-accordion__header">
          <span className="kern-title">Umkreis ändern</span>
        </summary>
        <section className="kern-accordion__body">
          <HomeAreaSetup
            key={areaEditorGeneration}
            onDraftRadiusChange={setDraftRadiusKm}
          />
        </section>
      </details>

      <div className="surroundings__result">
        <RecentWindowSelect
          recentWindowDays={recentWindow.days}
          onWindowDaysChange={setWindowDays}
          label="Zeitraum für neue Baustellen in Ihrem Umkreis"
        />
        <p
          className="surroundings__count"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>{newCount}</strong>{" "}
          {newCount === 1 ? "neue Baustelle" : "neue Baustellen"}
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

      {newCount > 0 ? (
        <NearbyConstructionSiteList
          scopedSites={surroundings.recent}
          label="Neue Baustellen in Ihrem Umkreis"
          getSiteDetailsHref={getSiteDetailsHref}
          onShowSiteDetails={onShowSiteDetails}
          onShowSiteOnMap={onShowSiteOnMap}
        />
      ) : (
        <KernAlert variant="success" title="Nichts Neues in Ihrem Umkreis">
          <KernText>
            {`Im Umkreis von ${homeArea.radiusKm} km ist in diesem Zeitraum keine neue Baustelle dazugekommen.`}
          </KernText>
        </KernAlert>
      )}

      <details className="kern-accordion surroundings__section">
        <summary className="kern-accordion__header">
          <span className="kern-title">
            Alle {surroundings.all.length} Baustellen im Umkreis
          </span>
        </summary>
        <section className="kern-accordion__body">
          {surroundings.all.length > 0 ? (
            <NearbyConstructionSiteList
              scopedSites={surroundings.all}
              label="Alle Baustellen in Ihrem Umkreis"
              getSiteDetailsHref={getSiteDetailsHref}
              onShowSiteDetails={onShowSiteDetails}
              onShowSiteOnMap={onShowSiteOnMap}
            />
          ) : (
            <KernText>
              In diesem Umkreis ist derzeit keine Baustelle erfasst. Vergrößern
              Sie den Umkreis oder wählen Sie einen anderen Mittelpunkt.
            </KernText>
          )}
        </section>
      </details>
    </section>
  );
}
