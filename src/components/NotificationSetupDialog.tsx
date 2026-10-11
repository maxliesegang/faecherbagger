import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KernAlert,
  KernButton,
  KernInput,
  KernLoader,
  KernText,
} from "@kern-ux-annex/kern-react-kit";
import type {
  ConstructionSite,
  LngLat,
  NotificationArea,
  NotificationAreaKind,
  NotificationPreferences,
  NotificationSeverityThreshold,
  RouteTravelMode,
} from "../types/index.ts";
import {
  createNotificationAreaId,
  NOTIFICATION_AREA_LABEL_SUGGESTIONS,
  upsertNotificationArea,
} from "../lib/notification-area.ts";
import {
  BUSY_AREA_NOTIFICATION_COUNT,
  countUpcomingNotifications,
  formatUpcomingNotificationCount,
  PREVIEW_HORIZON_DAYS,
  previewNotificationArea,
} from "../lib/notification-area-preview.ts";
import {
  formatConstructionPeriod,
  getClosureLabel,
} from "../lib/construction-site-labels.ts";
import {
  CORRIDOR_WIDTH_STEPS_METERS,
  DEFAULT_CORRIDOR_WIDTH_METERS,
  DEFAULT_NOTIFICATION_RADIUS_KM,
  findNearestNotificationRadiusStepIndex,
  formatCorridorWidth,
  formatNotificationRadius,
  MAX_CORRIDOR_VERTICES,
  MAX_NOTIFICATION_AREA_LABEL_LENGTH,
  MAX_POLYGON_VERTICES,
  NOTIFICATION_RADIUS_STEPS_KM,
} from "../lib/notification-preferences.ts";
import type { NotificationAreaShape } from "../lib/map-geojson.ts";
import { roundLngLat, simplifyToVertexLimit } from "../lib/geometry.ts";
import { distanceInMeters, formatDistance } from "../lib/distance.ts";
import { suggestMunicipalities } from "../lib/street-names.ts";
import type { CurrentLocationController } from "../hooks/useCurrentLocation.ts";
import type { PushNotificationsController } from "../hooks/usePushNotifications.ts";
import { createRouteKey, useRouteSearch } from "../hooks/useRouteSearch.ts";
import {
  formatConstructionPeriodRelativeToToday,
  getBerlinCalendarDate,
} from "../lib/construction-site-timeframe.ts";
import type {
  PickerDrawMode,
  PickerMarker,
} from "./NotificationAreaPickerMap.tsx";
import "./NotificationSetupDialog.css";
import { AddressSearch } from "./AddressSearch.tsx";
import {
  RouteEndpointPicker,
  type RouteEndpoint,
} from "./RouteEndpointPicker.tsx";
import { StreetSearch } from "./StreetSearch.tsx";
import { AppIcon, NOTIFICATION_AREA_ICON } from "./AppIcon.tsx";

const NotificationAreaPickerMap = lazy(() =>
  import("./NotificationAreaPickerMap.tsx").then((module) => ({
    default: module.NotificationAreaPickerMap,
  })),
);

/** Karlsruhe's Marktplatz — a sensible first guess for the region. */
const FALLBACK_CENTER: LngLat = [8.4044, 49.0094];
const FALLBACK_MUNICIPALITY = "Karlsruhe";

const NOTIFICATION_STEP = "Benachrichtigen?";

/**
 * The four tabs. A municipality has no tab of its own: it is what someone
 * types into the place search ("Ettlingen"), so it is offered there.
 */
type AreaKindTab = Exclude<NotificationAreaKind, "municipality">;

const AREA_KIND_TABS: readonly {
  value: AreaKindTab;
  label: string;
  /** One line under the tabs, so the abstract ones read at a glance. */
  description: string;
}[] = [
  { value: "circle", label: "Ort", description: "Umkreis um eine Adresse." },
  { value: "corridor", label: "Strecke", description: "Ein Weg, z. B. zur Arbeit." },
  { value: "polygon", label: "Fläche", description: "Ein Gebiet, das Sie einzeichnen." },
  { value: "street", label: "Straße", description: "Eine Straße in einer Gemeinde." },
];

const TRAVEL_MODE_OPTIONS: readonly { value: RouteTravelMode; label: string }[] = [
  { value: "car", label: "Auto" },
  { value: "bike", label: "Fahrrad" },
  { value: "foot", label: "Zu Fuß" },
];

const DEFAULT_LABEL: Record<NotificationAreaKind, string> = {
  circle: "Mein Ort",
  corridor: "Meine Strecke",
  polygon: "Meine Fläche",
  municipality: "Meine Gemeinde",
  street: "Meine Straße",
};

/** What a route end picked by tapping the map is called. */
const MAP_POINT_LABEL = "Punkt auf der Karte";

const SEVERITY_OPTIONS: readonly {
  value: NotificationSeverityThreshold;
  label: string;
}[] = [
  { value: "all", label: "Alles" },
  { value: "obstruction", label: "Ab Behinderung" },
  { value: "closure", label: "Nur Sperrungen" },
];

/** "Strecke: 4,9 km" or "Hin 4,9 km · zurück 5,3 km". */
function describeCorridorLength(
  line: readonly LngLat[],
  returnLine: readonly LngLat[] | undefined,
  isReturnRequested: boolean,
): string {
  const there = formatDistance(lineLengthMeters(line));
  if (returnLine) {
    return `Hin ${there} · zurück ${formatDistance(lineLengthMeters(returnLine))}`;
  }
  return isReturnRequested
    ? `Strecke: ${there}, zurück auf demselben Weg`
    : `Strecke: ${there}`;
}

/** The expandable list stays a list, not a second results page. */
const MAX_LISTED_MATCHES = 40;

/** A tap without a drag, or a scribble too small to mean an area. */
const MIN_DRAWN_LINE_METERS = 50;

const lineLengthMeters = (line: readonly LngLat[]): number =>
  line.reduce(
    (total, point, index) =>
      index === 0 ? 0 : total + distanceInMeters(line[index - 1]!, point),
    0,
  );

interface NotificationSetupDialogProps {
  constructionSites: readonly ConstructionSite[];
  preferences: NotificationPreferences;
  onPreferencesChange: (preferences: NotificationPreferences) => void;
  /** The area being edited; a new one when `undefined`. */
  editedArea?: NotificationArea;
  locationController: CurrentLocationController;
  pushNotifications: PushNotificationsController;
  onClose: () => void;
  /** Called once the visitor finishes the flow and the area has been saved. */
  onComplete: () => void;
}

/**
 * Guided setup for a watched place.
 *
 * First where — a place with a radius, a route, a drawn outline or a street —
 * then how far or what to call it, each with the map showing what the answer
 * means. Then, if notifications are still off and could be switched on, a
 * last step asks whether to be told; that is the point of the whole app, so it
 * is asked here rather than left on the settings screen.
 */
export function NotificationSetupDialog({
  constructionSites,
  preferences,
  onPreferencesChange,
  editedArea,
  locationController,
  pushNotifications,
  onClose,
  onComplete,
}: NotificationSetupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<NotificationAreaKind>(
    editedArea?.kind ?? "circle",
  );
  const [label, setLabel] = useState(editedArea?.label ?? "");
  // A name the visitor typed or picked is never replaced by a default.
  const [isLabelChosen, setIsLabelChosen] = useState(editedArea !== undefined);

  // Each kind keeps its own answer, so a look at another tab loses nothing.
  const [center, setCenter] = useState<LngLat>(
    editedArea?.kind === "circle"
      ? editedArea.center
      : locationController.locationState.status === "ready"
        ? locationController.locationState.point
        : FALLBACK_CENTER,
  );
  const [radiusKm, setRadiusKm] = useState(
    editedArea?.kind === "circle"
      ? editedArea.radiusKm
      : DEFAULT_NOTIFICATION_RADIUS_KM,
  );
  const [municipality, setMunicipality] = useState(
    editedArea?.kind === "municipality" ? editedArea.municipality : undefined,
  );
  // What the "Ort" tab last answered, so returning to it restores that answer.
  const [placeKind, setPlaceKind] = useState<"circle" | "municipality">(
    editedArea?.kind === "municipality" ? "municipality" : "circle",
  );
  const choosePlaceKind = (nextKind: "circle" | "municipality") => {
    setPlaceKind(nextKind);
    setKind(nextKind);
  };
  const editedCorridor = editedArea?.kind === "corridor" ? editedArea : undefined;
  const [corridorLine, setCorridorLine] = useState(editedCorridor?.line);
  const [corridorReturnLine, setCorridorReturnLine] = useState(
    editedCorridor?.returnLine,
  );
  const [widthMeters, setWidthMeters] = useState(
    editedCorridor?.widthMeters ?? DEFAULT_CORRIDOR_WIDTH_METERS,
  );
  const savedRoute = editedCorridor?.route;
  const [routeStart, setRouteStart] = useState<RouteEndpoint | undefined>(
    savedRoute && {
      point: savedRoute.start,
      label: savedRoute.startLabel ?? MAP_POINT_LABEL,
    },
  );
  const [routeDestination, setRouteDestination] = useState<
    RouteEndpoint | undefined
  >(
    savedRoute && {
      point: savedRoute.destination,
      label: savedRoute.destinationLabel ?? MAP_POINT_LABEL,
    },
  );
  const [travelMode, setTravelMode] = useState<RouteTravelMode>(
    savedRoute?.travelMode ?? "bike",
  );
  // By car one-way streets often send the way back elsewhere; on foot and by
  // bike it is nearly always the same road. Follows the mode until set.
  const [includeReturn, setIncludeReturn] = useState(
    editedCorridor ? editedCorridor.returnLine !== undefined : false,
  );
  const [isIncludeReturnChosen, setIsIncludeReturnChosen] = useState(
    editedCorridor !== undefined,
  );
  // The saved line already answers the saved inputs; no need to ask again.
  const [knownRouteKey, setKnownRouteKey] = useState(
    savedRoute
      ? createRouteKey(
          savedRoute.start,
          savedRoute.destination,
          savedRoute.travelMode,
          editedCorridor?.returnLine !== undefined,
        )
      : undefined,
  );
  const [areaMinSeverity, setAreaMinSeverity] = useState<NotificationSeverityThreshold>(
    editedArea?.minSeverity ?? preferences.minSeverity,
  );
  // Like the name: once picked, a threshold is not replaced by a kind's default.
  const [isMinSeverityChosen, setIsMinSeverityChosen] = useState(
    editedArea?.minSeverity !== undefined,
  );
  const savedPlaces = useMemo(
    (): RouteEndpoint[] =>
      preferences.areas.flatMap((area) =>
        area.kind === "circle" && area.id !== editedArea?.id
          ? [{ point: area.center, label: area.label }]
          : [],
      ),
    [preferences.areas, editedArea?.id],
  );
  const [ring, setRing] = useState(
    editedArea?.kind === "polygon" ? editedArea.ring : undefined,
  );
  const municipalities = useMemo(
    () =>
      [...new Set(constructionSites.map((site) => site.municipality))].sort(
        (left, right) => left.localeCompare(right, "de"),
      ),
    [constructionSites],
  );
  const [street, setStreet] = useState(
    editedArea?.kind === "street" ? editedArea.street : "",
  );
  const [includeJunctions, setIncludeJunctions] = useState(
    editedArea?.kind === "street" ? editedArea.includeJunctions === true : false,
  );
  const [streetMunicipality, setStreetMunicipality] = useState(
    editedArea?.kind === "street"
      ? editedArea.municipality
      : municipalities.includes(FALLBACK_MUNICIPALITY)
        ? FALLBACK_MUNICIPALITY
        : (municipalities[0] ?? FALLBACK_MUNICIPALITY),
  );

  const [drawMode, setDrawMode] = useState<PickerDrawMode>();
  const [viewport, setViewport] = useState<[LngLat, LngLat]>();
  const [locationError, setLocationError] = useState<string>();
  const routeState = useRouteSearch(
    routeStart?.point,
    routeDestination?.point,
    travelMode,
    includeReturn,
    knownRouteKey,
  );

  useEffect(() => {
    if (routeState.status !== "ready") return;
    setCorridorLine(routeState.line);
    setCorridorReturnLine(routeState.returnLine);
  }, [routeState]);

  // Decided once on open, so switching notifications on in the last step does
  // not make that step vanish under the visitor's finger.
  const [isNotificationStepOffered] = useState(
    () => !pushNotifications.isActive && !pushNotifications.unavailableReason,
  );

  // `showModal` rather than the `open` attribute: only the modal form makes the
  // browser trap focus, handle Escape and render the backdrop for us.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.isConnected || dialog.open) return;
    dialog.showModal();
    // The platform focuses "Schließen" first; the kind is the first question.
    dialog
      .querySelector<HTMLInputElement>('input[name="notification-area-kind"]:checked')
      ?.focus();
    return () => dialog.close();
  }, []);

  // A new step replaces everything under the heading, so focus moves there:
  // it announces the step and keeps a second Enter from pressing the next
  // button that happens to sit where the last one was.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef(step);
  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    headingRef.current?.focus();
  }, [step]);

  const shape = useMemo((): NotificationAreaShape | undefined => {
    switch (kind) {
      case "circle":
        return { kind, center, radiusKm };
      case "municipality":
        return municipality ? { kind, municipality } : undefined;
      case "corridor":
        return corridorLine
          ? {
              kind,
              line: corridorLine,
              ...(corridorReturnLine ? { returnLine: corridorReturnLine } : {}),
              widthMeters,
            }
          : undefined;
      case "polygon":
        return ring ? { kind, ring } : undefined;
      case "street":
        return street.trim().length >= 3
          ? {
              kind,
              street: street.trim(),
              municipality: streetMunicipality,
              ...(includeJunctions ? { includeJunctions } : {}),
            }
          : undefined;
    }
  }, [kind, center, radiusKm, municipality, corridorLine, corridorReturnLine, widthMeters, ring, street, streetMunicipality, includeJunctions]);

  const today = getBerlinCalendarDate();
  const previewOptions = useMemo(
    () => ({ today, minSeverity: areaMinSeverity }),
    [today, areaMinSeverity],
  );
  const toPreviewArea = (areaShape: NotificationAreaShape): NotificationArea =>
    ({ ...areaShape, id: "preview", label: "Vorschau" }) as NotificationArea;
  const preview = useMemo(
    () =>
      shape
        ? previewNotificationArea(toPreviewArea(shape), constructionSites, previewOptions)
        : { matchingSites: [], upcomingNotificationCount: 0 },
    [shape, constructionSites, previewOptions],
  );
  const matchingSites = preview.matchingSites;
  // What each width would mean, so the choice shows its cost before it is made.
  const upcomingCountByWidth = useMemo(
    () =>
      corridorLine
        ? CORRIDOR_WIDTH_STEPS_METERS.map((option) =>
            countUpcomingNotifications(
              toPreviewArea({
                kind: "corridor",
                line: corridorLine,
                ...(corridorReturnLine ? { returnLine: corridorReturnLine } : {}),
                widthMeters: option,
              }),
              constructionSites,
              previewOptions,
            ),
          )
        : [],
    [corridorLine, corridorReturnLine, constructionSites, previewOptions],
  );
  const junctionOnlyCount = useMemo(() => {
    if (kind !== "street" || street.trim().length < 3) return 0;
    const streetArea = (withJunctions: boolean) =>
      toPreviewArea({
        kind: "street",
        street: street.trim(),
        municipality: streetMunicipality,
        includeJunctions: withJunctions,
      });
    return (
      previewNotificationArea(streetArea(true), constructionSites, previewOptions)
        .matchingSites.length -
      previewNotificationArea(streetArea(false), constructionSites, previewOptions)
        .matchingSites.length
    );
  }, [kind, street, streetMunicipality, constructionSites, previewOptions]);
  const matchingPoints = useMemo(
    () => matchingSites.map((site) => site.point),
    [matchingSites],
  );

  const markers = useMemo((): PickerMarker[] => {
    if (kind === "circle") return [{ point: center, text: "" }];
    if (kind !== "corridor") return [];
    return [
      ...(routeStart ? [{ point: routeStart.point, text: "A" }] : []),
      ...(routeDestination ? [{ point: routeDestination.point, text: "B" }] : []),
    ];
  }, [kind, center, routeStart, routeDestination]);

  // Without any way to be notified on this device, a threshold means nothing.
  const canNotify =
    pushNotifications.unavailableReason !== "unconfigured" &&
    pushNotifications.unavailableReason !== "unsupported";
  const previewId = useId();
  const steps = [
    "Wo?",
    kind === "circle" || kind === "corridor"
      ? "Wie weit?"
      : canNotify
        ? "Was melden?"
        : "Name",
    ...(isNotificationStepOffered ? [NOTIFICATION_STEP] : []),
  ];
  const isLastStep = step === steps.length - 1;
  // Names where the button leads, so "Weiter" is not the only clue. The
  // second step always saves, even when a notification question follows.
  const nextLabel =
    step === 0
      ? kind === "circle"
        ? "Zum Radius"
        : kind === "corridor"
          ? "Zum Abstand"
          : "Zur Vorschau"
      : "Speichern";
  const isNotificationStep = steps[step] === NOTIFICATION_STEP;
  const canLeaveFirstStep =
    shape !== undefined &&
    drawMode === undefined &&
    !(kind === "corridor" && routeState.status === "loading");

  const useCurrentLocationAsCenter = async () => {
    setLocationError(undefined);
    try {
      setCenter(await locationController.requestLocation());
      choosePlaceKind("circle");
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : "Standort konnte nicht ermittelt werden.",
      );
    }
  };

  const clearCorridorLines = () => {
    setKnownRouteKey(undefined);
    setCorridorLine(undefined);
    setCorridorReturnLine(undefined);
  };

  const setRouteEnd = (
    end: "start" | "destination",
    endpoint: RouteEndpoint | undefined,
  ) => {
    clearCorridorLines();
    if (end === "start") setRouteStart(endpoint);
    else setRouteDestination(endpoint);
  };

  const chooseTravelMode = (nextTravelMode: RouteTravelMode) => {
    setKnownRouteKey(undefined);
    setTravelMode(nextTravelMode);
    if (!isIncludeReturnChosen) setIncludeReturn(nextTravelMode === "car");
  };

  const handleMapClick = (() => {
    if (kind === "circle" || kind === "municipality") {
      return (point: LngLat) => {
        setCenter(point);
        choosePlaceKind("circle");
      };
    }
    if (kind === "corridor") {
      // First tap is the start, every later one moves the destination.
      return (point: LngLat) =>
        setRouteEnd(routeStart ? "destination" : "start", {
          point,
          label: MAP_POINT_LABEL,
        });
    }
    return undefined;
  })();

  const handleDrawComplete = (coordinates: LngLat[]) => {
    if (drawMode === "line" || kind === "corridor") {
      if (coordinates.length < 2 || lineLengthMeters(coordinates) < MIN_DRAWN_LINE_METERS) return;
      // A drawn line replaces the calculated one, and with it the two markers.
      clearCorridorLines();
      setRouteStart(undefined);
      setRouteDestination(undefined);
      setCorridorLine(simplifyToVertexLimit(coordinates, MAX_CORRIDOR_VERTICES / 2));
      return;
    }
    if (coordinates.length < 3 || lineLengthMeters(coordinates) < MIN_DRAWN_LINE_METERS) return;
    const simplified = simplifyToVertexLimit(coordinates, MAX_POLYGON_VERTICES);
    if (simplified.length >= 3) setRing(simplified);
  };

  const useViewportAsArea = () => {
    if (!viewport) return;
    const [[west, south], [east, north]] = viewport;
    setRing(
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
      ].map((point) => roundLngLat(point as LngLat)),
    );
  };

  const saveArea = () => {
    if (!shape) return;
    const area: NotificationArea = {
      ...(shape.kind === "circle"
        ? { ...shape, center: roundLngLat(shape.center) }
        : shape.kind === "corridor" && routeStart && routeDestination
          ? {
              ...shape,
              route: {
                start: roundLngLat(routeStart.point),
                destination: roundLngLat(routeDestination.point),
                travelMode,
                startLabel: routeStart.label.slice(0, 100),
                destinationLabel: routeDestination.label.slice(0, 100),
              },
            }
          : shape),
      minSeverity: areaMinSeverity,
      id: editedArea?.id ?? createNotificationAreaId(),
      label:
        label.trim() ||
        (shape.kind === "municipality"
          ? shape.municipality
          : shape.kind === "street"
            ? shape.street
            : DEFAULT_LABEL[shape.kind]
        ).slice(0, MAX_NOTIFICATION_AREA_LABEL_LENGTH),
    };
    const updated: NotificationPreferences = {
      // Spread first: this dialog owns the areas and must carry everything else
      // (the follow list, the settings screen's options) through untouched.
      ...preferences,
      areas: upsertNotificationArea(preferences.areas, area),
      // No screen offers a choice of kinds; this repairs records saved by
      // older versions that did.
      kinds: ["new", "starts-soon", "changed"],
    };
    onPreferencesChange(updated);
  };

  // Saved before asking, so closing the question or refusing the permission
  // cannot lose the place.
  const saveAndContinue = () => {
    saveArea();
    if (isLastStep) onComplete();
    else setStep((current) => current + 1);
  };

  const finish = async (shouldEnableNotifications: boolean) => {
    if (shouldEnableNotifications) await pushNotifications.enable();
    onComplete();
  };

  // Once saved, leaving the dialog any way is finishing it.
  const close = isNotificationStep ? onComplete : onClose;

  const matchScope =
    kind === "circle"
      ? "im Umkreis"
      : kind === "corridor"
        ? "an der Strecke"
        : kind === "municipality"
          ? `in ${municipality}`
          : kind === "street"
            ? "in dieser Straße"
            : "in der Fläche";

  const goToSecondStep = () => {
    // Municipalities and streets are best called by their own name; the
    // other kinds get one-tap suggestions instead of a guess.
    if (!isLabelChosen && shape?.kind === "municipality") setLabel(shape.municipality);
    else if (!isLabelChosen && shape?.kind === "street") setLabel(shape.street);
    else if (!isLabelChosen) setLabel("");
    // A route is about getting through: by default only closures notify there.
    if (!isMinSeverityChosen) {
      setAreaMinSeverity(shape?.kind === "corridor" ? "closure" : preferences.minSeverity);
    }
    setStep(1);
  };

  const kindTab: AreaKindTab = kind === "municipality" ? "circle" : kind;
  const drawAction =
    step !== 0
      ? undefined
      : kind === "corridor"
        ? {
            label: corridorLine && !routeStart ? "Neu zeichnen" : "Selbst zeichnen",
            mode: "line" as const,
          }
        : kind === "polygon"
          ? { label: ring ? "Neu zeichnen" : "Fläche zeichnen", mode: "polygon" as const }
          : undefined;

  return (
    <dialog
      ref={dialogRef}
      className="notification-setup"
      aria-labelledby={headingId}
      /*
        `cancel` (Escape, platform dismissal) rather than `close`: `close` also
        fires for the `close()` in this component's effect cleanup, which would
        call back into the parent and unmount the dialog the moment it opened.
        `preventDefault` leaves the closing to the state change instead.
      */
      onCancel={(event) => {
        event.preventDefault();
        if (drawMode) setDrawMode(undefined);
        else close();
      }}
    >
      <div className="notification-setup__header">
        <div>
          <p className="notification-setup__step-count">
            Schritt {step + 1} von {steps.length}
          </p>
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            aria-describedby={step === 1 ? previewId : undefined}
          >
            {steps[step]}
          </h2>
        </div>
        <button
          type="button"
          className="notification-setup__close"
          aria-label="Schließen"
          onClick={close}
        >
          ×
        </button>
      </div>

      <ol className="notification-setup__progress" aria-hidden="true">
        {steps.map((title, index) => (
          <li key={title} data-state={index <= step ? "done" : "todo"} />
        ))}
      </ol>

      {/*
        The controls scroll on their own beside the map on a wide screen; on a
        narrow one the wrapper dissolves and the map sits between them.
      */}
      <div className="notification-setup__controls">
        <div className="notification-setup__body">
          {step === 0 && (
            <>
              <fieldset className="view-switcher notification-setup__kinds">
                <legend className="kern-sr-only">Was möchten Sie beobachten?</legend>
                {AREA_KIND_TABS.map((option) => (
                  <label key={option.value} className="view-switcher__item">
                    <input
                      className="view-switcher__input kern-sr-only"
                      type="radio"
                      name="notification-area-kind"
                      value={option.value}
                      checked={kindTab === option.value}
                      onChange={() => {
                        setDrawMode(undefined);
                        setKind(option.value === "circle" ? placeKind : option.value);
                      }}
                    />
                    <AppIcon name={NOTIFICATION_AREA_ICON[option.value]} />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <p className="notification-setup__hint">
                {AREA_KIND_TABS.find((option) => option.value === kindTab)?.description}
              </p>

              {kindTab === "circle" && (
                <>
                  <AddressSearch
                    label="Adresse oder Gemeinde"
                    onAddressSelect={(result) => {
                      setCenter(result.point);
                      choosePlaceKind("circle");
                    }}
                    suggestMunicipalities={(query) =>
                      suggestMunicipalities(constructionSites, query)
                    }
                    onMunicipalitySelect={(selected) => {
                      setMunicipality(selected);
                      choosePlaceKind("municipality");
                    }}
                  />
                  <div className="notification-setup__place-choices">
                    <button
                      type="button"
                      className="notification-setup__chip"
                      disabled={
                        locationController.locationState.status === "requesting"
                      }
                      onClick={() => void useCurrentLocationAsCenter()}
                    >
                      {locationController.locationState.status === "requesting"
                        ? "Standort …"
                        : "Mein Standort"}
                    </button>
                    <span className="notification-setup__hint">
                      oder auf die Karte tippen
                    </span>
                  </div>
                  {locationError && (
                    <KernAlert variant="warning" title="Standort nicht verfügbar">
                      {locationError}
                    </KernAlert>
                  )}
                </>
              )}

              {kind === "corridor" && (
                <>
                  <div className="notification-setup__route">
                    <RouteEndpointPicker
                      label="Start"
                      marker="A"
                      value={routeStart}
                      savedPlaces={savedPlaces}
                      requestCurrentLocation={locationController.requestLocation}
                      onChange={(endpoint) => setRouteEnd("start", endpoint)}
                    />
                    <RouteEndpointPicker
                      label="Ziel"
                      marker="B"
                      value={routeDestination}
                      savedPlaces={savedPlaces}
                      requestCurrentLocation={locationController.requestLocation}
                      waitingText={routeStart ? undefined : "Wählen Sie zuerst den Start."}
                      onChange={(endpoint) => setRouteEnd("destination", endpoint)}
                    />
                  </div>
                  <fieldset className="view-switcher notification-setup__travel-mode">
                    <legend className="kern-sr-only">Unterwegs mit</legend>
                    {TRAVEL_MODE_OPTIONS.map((option) => (
                      <label key={option.value} className="view-switcher__item">
                        <input
                          className="view-switcher__input kern-sr-only"
                          type="radio"
                          name="route-travel-mode"
                          value={option.value}
                          checked={travelMode === option.value}
                          onChange={() => chooseTravelMode(option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>
                  <label className="notification-setup__choice">
                    <input
                      type="checkbox"
                      checked={includeReturn}
                      onChange={(event) => {
                        setKnownRouteKey(undefined);
                        setIsIncludeReturnChosen(true);
                        setIncludeReturn(event.currentTarget.checked);
                      }}
                    />
                    <span>
                      Rückweg einbeziehen
                      {travelMode === "car" && (
                        <span className="notification-setup__hint">
                          {" "}
                          (mit dem Auto oft ein anderer Weg)
                        </span>
                      )}
                    </span>
                  </label>
                  <p role="status" className="notification-setup__route-status">
                    {routeState.status === "loading"
                      ? includeReturn
                        ? "Hin- und Rückweg werden berechnet …"
                        : "Strecke wird berechnet …"
                      : routeState.status === "error"
                        ? "Strecke nicht verfügbar. Zeichnen Sie sie selbst ein."
                        : corridorLine
                          ? describeCorridorLength(corridorLine, corridorReturnLine, includeReturn && routeStart !== undefined)
                          : routeStart
                            ? "Wählen Sie das Ziel."
                            : "Oder tippen Sie auf die Karte: erst Start, dann Ziel."}
                  </p>
                  <p className="notification-setup__hint">
                    Adresssuche: Photon (komoot) · Route: FOSSGIS
                  </p>
                </>
              )}

              {kind === "polygon" && (
                <>
                  <KernText>
                    Zeichnen Sie den Bereich ein oder übernehmen Sie den
                    Kartenausschnitt.
                  </KernText>
                  <KernButton
                    type="button"
                    variant="secondary"
                    label="Kartenausschnitt übernehmen"
                    disabled={!viewport || drawMode !== undefined}
                    onClick={useViewportAsArea}
                  />
                </>
              )}

              {kind === "street" && (
                <>
                  <StreetSearch
                    constructionSites={constructionSites}
                    street={street}
                    municipality={streetMunicipality}
                    municipalities={
                      municipalities.includes(streetMunicipality)
                        ? municipalities
                        : [...municipalities, streetMunicipality]
                    }
                    onChange={(nextStreet, nextMunicipality) => {
                      setStreet(nextStreet);
                      setStreetMunicipality(nextMunicipality);
                    }}
                  />
                  <label className="notification-setup__choice">
                    <input
                      type="checkbox"
                      checked={includeJunctions}
                      onChange={(event) =>
                        setIncludeJunctions(event.currentTarget.checked)
                      }
                    />
                    <span>
                      Auch Querstraßen, die hier einmünden
                      {junctionOnlyCount > 0 && (
                        <span className="notification-setup__hint">
                          {" "}
                          ({junctionOnlyCount} weitere)
                        </span>
                      )}
                    </span>
                  </label>
                </>
              )}
            </>
          )}

          {step === 1 && (
            <>
              {kind === "circle" && (
                <div className="notification-setup__radius">
                  <label htmlFor="notification-radius">
                    Radius: <strong>{formatNotificationRadius(radiusKm)}</strong>
                  </label>
                  <input
                    id="notification-radius"
                    type="range"
                    min={0}
                    max={NOTIFICATION_RADIUS_STEPS_KM.length - 1}
                    step="1"
                    value={findNearestNotificationRadiusStepIndex(radiusKm)}
                    aria-valuetext={formatNotificationRadius(radiusKm)}
                    onChange={(event) =>
                      setRadiusKm(
                        NOTIFICATION_RADIUS_STEPS_KM[
                          Number(event.currentTarget.value)
                        ],
                      )
                    }
                  />
                  <p className="notification-setup__radius-scale" aria-hidden="true">
                    <span>{formatNotificationRadius(NOTIFICATION_RADIUS_STEPS_KM[0])}</span>
                    <span>
                      {formatNotificationRadius(
                        NOTIFICATION_RADIUS_STEPS_KM[
                          NOTIFICATION_RADIUS_STEPS_KM.length - 1
                        ],
                      )}
                    </span>
                  </p>
                </div>
              )}
              {kind === "corridor" && (
                <fieldset className="notification-setup__segmented">
                  <legend className="notification-setup__field-label">
                    Abstand zur Strecke
                  </legend>
                  <div className="view-switcher">
                    {CORRIDOR_WIDTH_STEPS_METERS.map((option, index) => (
                      <label key={option} className="view-switcher__item">
                        <input
                          className="view-switcher__input kern-sr-only"
                          type="radio"
                          name="corridor-width"
                          value={option}
                          checked={widthMeters === option}
                          onChange={() => setWidthMeters(option)}
                        />
                        <span>{formatCorridorWidth(option)}</span>
                        {canNotify && upcomingCountByWidth[index] !== undefined && (
                          <span className="notification-setup__option-count">
                            ~{upcomingCountByWidth[index]}
                            <span className="kern-sr-only"> Meldungen in 30 Tagen</span>
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </>
          )}

          {isNotificationStep && (
            <>
              <KernText>
                Gespeichert. Sollen wir Sie benachrichtigen, wenn hier eine
                Baustelle angekündigt wird oder sich ändert?
              </KernText>
              <p className="notification-setup__hint">
                Der Ort bleibt auf diesem Gerät. Ausschalten können Sie
                jederzeit in den Einstellungen.
              </p>
            </>
          )}
        </div>

        {/*
          Below the map on a phone (see the CSS `order`): first what the shape
          above catches, then what to be told about, then a name.
        */}
        {step === 1 && (
          <div className="notification-setup__body notification-setup__body--after-map">
            <div className="notification-setup__preview">
              <p id={previewId} role="status">
                {matchingSites.length === 0 ? (
                  <>Derzeit keine Baustellen {matchScope}.</>
                ) : canNotify ? (
                  <>
                    <strong>
                      {formatUpcomingNotificationCount(
                        preview.upcomingNotificationCount,
                      )}
                    </strong>{" "}
                    in {PREVIEW_HORIZON_DAYS} Tagen
                    <span className="notification-setup__preview-detail">
                      {matchingSites.length} Baustellen {matchScope}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>{matchingSites.length} Baustellen</strong> {matchScope}
                  </>
                )}
              </p>
              {canNotify &&
                preview.upcomingNotificationCount >= BUSY_AREA_NOTIFICATION_COUNT && (
                  <p className="notification-setup__preview-warning">
                    Das sind viele. Verkleinern Sie den Bereich oder wählen Sie
                    „Nur Sperrungen“.
                  </p>
                )}
                {matchingSites.length > 0 && (
                  <details className="notification-setup__matches">
                    <summary>Baustellen ansehen</summary>
                    <ul>
                      {matchingSites.slice(0, MAX_LISTED_MATCHES).map((site) => (
                        <li key={site.id}>
                          <strong>{site.location || site.municipality}</strong>
                          <span>
                            {getClosureLabel(site.closure)} ·{" "}
                            {formatConstructionPeriodRelativeToToday(site, today) ??
                              formatConstructionPeriod(site.startDate, site.endDate)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {matchingSites.length > MAX_LISTED_MATCHES && (
                      <p className="notification-setup__hint">
                        und {matchingSites.length - MAX_LISTED_MATCHES} weitere
                      </p>
                    )}
                  </details>
                )}
            </div>
            {canNotify && (
              <fieldset className="notification-setup__segmented">
                <legend className="notification-setup__field-label">
                  Benachrichtigen bei
                </legend>
                <div className="view-switcher">
                  {SEVERITY_OPTIONS.map((option) => (
                    <label key={option.value} className="view-switcher__item">
                      <input
                        className="view-switcher__input kern-sr-only"
                        type="radio"
                        name="area-min-severity"
                        value={option.value}
                        checked={areaMinSeverity === option.value}
                        onChange={() => {
                          setIsMinSeverityChosen(true);
                          setAreaMinSeverity(option.value);
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <KernInput
              id="notification-area-label"
              label="Name"
              maxLength={MAX_NOTIFICATION_AREA_LABEL_LENGTH}
              value={label}
              onChange={(event) => {
                setIsLabelChosen(true);
                setLabel(event.currentTarget.value);
              }}
            />
            {NOTIFICATION_AREA_LABEL_SUGGESTIONS[kind].length > 0 && (
              <ul className="notification-setup__label-suggestions" aria-label="Namensvorschläge">
                {NOTIFICATION_AREA_LABEL_SUGGESTIONS[kind].map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      aria-pressed={label === suggestion}
                      onClick={() => {
                        setIsLabelChosen(true);
                        setLabel(suggestion);
                      }}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/*
        The map stays mounted across all steps: it is the only thing that makes
        "5 km" concrete, and remounting it would refetch tiles each time.
      */}
      <Suspense
        fallback={
          <div className="notification-setup__map-fallback">
            <KernLoader />
          </div>
        }
      >
        <NotificationAreaPickerMap
          shape={shape}
          markers={markers}
          matchingPoints={matchingPoints}
          onMapClick={step === 0 ? handleMapClick : undefined}
          drawAction={drawAction}
          drawMode={drawMode}
          onDrawModeChange={setDrawMode}
          onDrawComplete={handleDrawComplete}
          onViewportChange={setViewport}
          initialCenter={center}
          ariaLabel={
            kind === "corridor"
              ? "Karte: Start und Ziel wählen oder Strecke selbst zeichnen"
              : kind === "polygon"
                ? "Karte: Fläche zeichnen"
                : kind === "street" || kind === "municipality"
                  ? "Karte: betroffene Baustellen"
                  : "Karte: Mittelpunkt wählen"
          }
        />
      </Suspense>

      <div className="notification-setup__actions">
        {isNotificationStep ? (
          // The place is saved by now; only the answer is left, so no "Zurück".
          <>
            <KernButton
              type="button"
              key="later"
              variant="secondary"
              label="Nicht jetzt"
              disabled={pushNotifications.isBusy}
              onClick={() => void finish(false)}
            />
            <KernButton
              type="button"
              variant="primary"
              label="Benachrichtigen"
              disabled={pushNotifications.isBusy}
              onClick={() => void finish(true)}
            />
          </>
        ) : (
          <>
            {step > 0 ? (
              <KernButton
                type="button"
                key={`back-${step}`}
                variant="tertiary"
                label="Zurück"
                onClick={() => setStep((current) => current - 1)}
              />
            ) : (
              <KernButton
                type="button"
                key="cancel"
                variant="tertiary"
                label="Abbrechen"
                onClick={onClose}
              />
            )}
            <KernButton
              type="button"
              key={`next-${step}`}
              variant="primary"
              label={nextLabel}
              disabled={step === 0 && !canLeaveFirstStep}
              onClick={step === 0 ? goToSecondStep : saveAndContinue}
            />
          </>
        )}
      </div>
    </dialog>
  );
}
