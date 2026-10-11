import { describe, expect, it } from "vitest";
import {
  describeNotificationArea,
  describeNotificationAreaScope,
  removeNotificationArea,
  upsertNotificationArea,
} from "../src/lib/notification-area.ts";
import {
  findNotificationAreaForTarget,
  isTargetInNotificationArea,
} from "../src/lib/notification-area-match.ts";
import {
  coerceNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  findNearestNotificationRadiusStepIndex,
  formatNotificationRadius,
  isLngLat,
  isNotificationArea,
  isNotificationPreferences,
  MAX_NOTIFICATION_AREAS,
  MAX_POLYGON_VERTICES,
  meetsSeverityThreshold,
  MAX_NOTIFICATION_RADIUS_KM,
  MIN_NOTIFICATION_RADIUS_KM,
  NOTIFICATION_RADIUS_STEPS_KM,
} from "../src/lib/notification-preferences.ts";
import type { LngLat, NotificationArea } from "../src/types/index.ts";

const area: NotificationArea = {
  id: "home",
  label: "Zuhause",
  kind: "circle",
  center: [8.4044, 49.0069],
  radiusKm: 5,
};

const at = (point: LngLat) => ({ point, municipality: "Karlsruhe", location: "" });

describe("notification area", () => {
  it("validates GeoJSON coordinates", () => {
    expect(isLngLat([8.4044, 49.0069])).toBe(true);
    expect(isLngLat([181, 49])).toBe(false);
    expect(isLngLat([8.4, Number.NaN])).toBe(false);
    expect(isLngLat([8.4])).toBe(false);
  });

  it("requires an identity, a label and coordinate and radius bounds", () => {
    expect(isNotificationArea(area)).toBe(true);
    expect(isNotificationArea({ ...area, radiusKm: 0 })).toBe(false);
    expect(isNotificationArea({ ...area, center: [181, 49] })).toBe(false);
    expect(isNotificationArea({ ...area, label: "" })).toBe(false);
    expect(isNotificationArea({ ...area, label: "   " })).toBe(false);
    expect(isNotificationArea({ ...area, id: undefined })).toBe(false);
  });

  it("accepts sub-kilometre radii down to the minimum", () => {
    expect(isNotificationArea({ ...area, radiusKm: 0.5 })).toBe(true);
    expect(isNotificationArea({ ...area, radiusKm: 0.1 })).toBe(false);
    expect(isNotificationArea({ ...area, radiusKm: 51 })).toBe(false);
  });

  it("offers radius steps that are sorted and within the bounds", () => {
    const steps = [...NOTIFICATION_RADIUS_STEPS_KM];
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps[0]).toBe(MIN_NOTIFICATION_RADIUS_KM);
    expect(steps.at(-1)).toBe(MAX_NOTIFICATION_RADIUS_KM);
    expect(steps.filter((step) => step < 1).length).toBeGreaterThan(1);
  });

  it("snaps a saved radius to the nearest offered step", () => {
    const stepAt = (radiusKm: number) =>
      NOTIFICATION_RADIUS_STEPS_KM[
        findNearestNotificationRadiusStepIndex(radiusKm)
      ];
    expect(stepAt(0.5)).toBe(0.5);
    expect(stepAt(11)).toBe(10);
    expect(stepAt(45)).toBeOneOf([40, 50]);
  });

  it("formats radii with a German decimal comma", () => {
    expect(formatNotificationRadius(0.5)).toBe("0,5 km");
    expect(formatNotificationRadius(5)).toBe("5 km");
  });

  it("matches points inside the configured radius", () => {
    expect(isTargetInNotificationArea(area, at([8.45, 49.0069]))).toBe(true);
    expect(isTargetInNotificationArea(area, at([8.5, 49.0069]))).toBe(false);
  });

  it("reports which of several areas a site falls into", () => {
    const work: NotificationArea = {
      id: "work",
      label: "Arbeit",
      kind: "circle",
      center: [8.6, 49.01],
      radiusKm: 2,
    };
    expect(
      findNotificationAreaForTarget([area, work], at([8.6, 49.011]))?.label,
    ).toBe("Arbeit");
    expect(
      findNotificationAreaForTarget([area, work], at([9.5, 49.01])),
    ).toBeUndefined();
  });
});

describe("notification area kinds", () => {
  const identity = { id: "area", label: "Bereich" };

  it("validates each kind's shape", () => {
    expect(
      isNotificationArea({ ...identity, kind: "polygon", ring: [[8.39, 49], [8.41, 49], [8.4, 49.01]] }),
    ).toBe(true);
    expect(
      isNotificationArea({ ...identity, kind: "polygon", ring: [[8.39, 49], [8.41, 49]] }),
    ).toBe(false);
    expect(
      isNotificationArea({
        ...identity,
        kind: "polygon",
        ring: Array.from({ length: MAX_POLYGON_VERTICES + 1 }, () => [8.4, 49]),
      }),
    ).toBe(false);
    const corridor = {
      ...identity,
      kind: "corridor",
      line: [[8.39, 49], [8.41, 49]],
      widthMeters: 250,
    };
    expect(isNotificationArea(corridor)).toBe(true);
    expect(isNotificationArea({ ...corridor, widthMeters: 10 })).toBe(false);
    expect(
      isNotificationArea({
        ...corridor,
        route: { start: [8.39, 49], destination: [8.41, 49], travelMode: "bike" },
      }),
    ).toBe(true);
    expect(
      isNotificationArea({
        ...corridor,
        route: { start: [8.39, 49], destination: [8.41, 49], travelMode: "tram" },
      }),
    ).toBe(false);
    expect(isNotificationArea({ ...identity, kind: "municipality", municipality: "Ettlingen" })).toBe(true);
    expect(isNotificationArea({ ...identity, kind: "municipality", municipality: " " })).toBe(false);
    expect(
      isNotificationArea({ ...identity, kind: "street", street: "Kaiserstraße", municipality: "Karlsruhe" }),
    ).toBe(true);
    expect(isNotificationArea({ ...identity, kind: "street", street: "Kaiserstraße" })).toBe(false);
    expect(isNotificationArea({ ...identity, kind: "hexagon" })).toBe(false);
    expect(isNotificationArea({ ...area, minSeverity: "closure" })).toBe(true);
    expect(isNotificationArea({ ...area, minSeverity: "loud" })).toBe(false);
    expect(isNotificationArea({ ...corridor, returnLine: [[8.41, 49], [8.39, 49]] })).toBe(true);
    expect(isNotificationArea({ ...corridor, returnLine: [[8.41, 49]] })).toBe(false);
    expect(
      isNotificationArea({
        ...corridor,
        route: {
          start: [8.39, 49],
          destination: [8.41, 49],
          travelMode: "car",
          startLabel: "Zuhause",
          destinationLabel: "Punkt auf der Karte",
        },
      }),
    ).toBe(true);
  });

  it("reads areas saved before kinds existed as circles", () => {
    const { kind: _kind, ...legacy } = area;
    const coerced = coerceNotificationPreferences({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      areas: [legacy],
    });
    expect(coerced.areas).toEqual([area]);
  });

  it("describes each kind for lists", () => {
    expect(describeNotificationArea(area)).toBe("5 km Umkreis");
    expect(
      describeNotificationArea({ ...identity, kind: "corridor", line: [[8.39, 49], [8.41, 49]], widthMeters: 250 }),
    ).toBe("Strecke · 250 m Abstand");
    expect(
      describeNotificationArea({ ...identity, kind: "municipality", municipality: "Ettlingen" }),
    ).toBe("Ganz Ettlingen");
    expect(
      describeNotificationArea({ ...identity, kind: "street", street: "Kaiserstraße", municipality: "Karlsruhe" }),
    ).toBe("Kaiserstraße, Karlsruhe");
  });

  it("names a threshold that differs from the usual one", () => {
    expect(describeNotificationArea({ ...area, minSeverity: "closure" })).toBe(
      "5 km Umkreis · nur Sperrungen",
    );
    expect(describeNotificationArea({ ...area, minSeverity: "obstruction" })).toBe(
      "5 km Umkreis",
    );
    expect(
      describeNotificationArea({
        ...identity,
        kind: "corridor",
        line: [[8.39, 49], [8.41, 49]],
        returnLine: [[8.41, 49.01], [8.39, 49.01]],
        widthMeters: 100,
      }),
    ).toBe("Hin und zurück · 100 m Abstand");
  });

  it("does not repeat what the name already says", () => {
    expect(
      describeNotificationArea({
        id: "street",
        label: "Kaiserstr.",
        kind: "street",
        street: "Kaiserstraße",
        municipality: "Karlsruhe",
        includeJunctions: true,
      }),
    ).toBe("Straße in Karlsruhe, mit Einmündungen");
    expect(
      describeNotificationArea({ id: "e", label: "Ettlingen", kind: "municipality", municipality: "Ettlingen" }),
    ).toBe("Ganze Gemeinde");
  });

  it("phrases where notifications happened by kind", () => {
    const street = (name: string) => ({
      ...identity,
      kind: "street" as const,
      street: name,
      municipality: "Karlsruhe",
    });
    expect(describeNotificationAreaScope(area)).toBe("bei „Zuhause“");
    expect(
      describeNotificationAreaScope({
        ...identity,
        label: "Arbeitsweg",
        kind: "corridor",
        line: [[8.39, 49], [8.41, 49]],
        widthMeters: 250,
      }),
    ).toBe("entlang „Arbeitsweg“");
    expect(
      describeNotificationAreaScope({ ...identity, kind: "municipality", municipality: "Ettlingen" }),
    ).toBe("in Ettlingen");
    expect(describeNotificationAreaScope(street("Kaiserstraße"))).toBe("in der Kaiserstraße");
    expect(describeNotificationAreaScope(street("Marktplatz"))).toBe("am Marktplatz");
    expect(describeNotificationAreaScope(street("Fächerweg"))).toBe("im Fächerweg");
    expect(describeNotificationAreaScope(street("Zirkel"))).toBe("für „Bereich“");
  });
});

describe("notification area list", () => {
  it("replaces by id and appends new areas", () => {
    const renamed = { ...area, label: "Daheim" };
    expect(upsertNotificationArea([area], renamed)).toEqual([renamed]);
    expect(
      upsertNotificationArea([area], { ...area, id: "work" }),
    ).toHaveLength(2);
    expect(removeNotificationArea([area], "home")).toEqual([]);
  });

  it("refuses to add beyond the cap rather than dropping an existing area", () => {
    const areas = Array.from({ length: MAX_NOTIFICATION_AREAS }, (_, index) => ({
      ...area,
      id: `area-${index}`,
    }));
    const result = upsertNotificationArea(areas, { ...area, id: "one-too-many" });
    expect(result).toHaveLength(MAX_NOTIFICATION_AREAS);
    expect(result.map(({ id }) => id)).toEqual(areas.map(({ id }) => id));
  });
});

describe("severity threshold", () => {
  it("keeps the more disruptive severities at each level", () => {
    expect(meetsSeverityThreshold("none", "all")).toBe(true);
    expect(meetsSeverityThreshold("none", "obstruction")).toBe(false);
    expect(meetsSeverityThreshold("obstruction", "obstruction")).toBe(true);
    expect(meetsSeverityThreshold("obstruction", "closure")).toBe(false);
    expect(meetsSeverityThreshold("one-direction", "closure")).toBe(true);
    expect(meetsSeverityThreshold("full", "closure")).toBe(true);
  });

  it("always passes an unstated severity, at every threshold", () => {
    // The source leaves `sperrung` empty on real closures; a missed full
    // closure costs more than a surplus notification.
    expect(meetsSeverityThreshold("unknown", "closure")).toBe(true);
    expect(meetsSeverityThreshold("unknown", "all")).toBe(true);
  });
});

describe("notification preferences", () => {
  const preferences = {
    areas: [area],
    kinds: ["new" as const],
    minSeverity: "closure" as const,
    followedSiteIds: ["2026V2026"],
  };

  it("upgrades saved areas without enabling early announcements", () => {
    const upgraded = coerceNotificationPreferences(preferences);
    expect(upgraded.areas).toEqual([area]);
    expect(upgraded.followedSiteIds).toEqual(["2026V2026"]);
    expect(upgraded.remindDayBefore).toBe(true);
    expect(upgraded.notifyEarly).toBe(false);
  });

  it("preserves explicit reminder choices and rejects malformed values", () => {
    const chosen = coerceNotificationPreferences({
      ...preferences,
      remindDayBefore: false,
      notifyEarly: true,
    });
    expect(chosen.remindDayBefore).toBe(false);
    expect(chosen.notifyEarly).toBe(true);
    expect(isNotificationPreferences({ ...preferences, notifyEarly: "yes" })).toBe(false);
    expect(isNotificationPreferences({ ...preferences, remindDayBefore: 1 })).toBe(false);
  });

  it("validates the whole shape", () => {
    expect(isNotificationPreferences(preferences)).toBe(true);
    expect(isNotificationPreferences({ ...preferences, kinds: [] })).toBe(
      false,
    );
    expect(
      isNotificationPreferences({ ...preferences, areas: [area, area] }),
    ).toBe(false);
    expect(
      isNotificationPreferences({ ...preferences, minSeverity: "sometimes" }),
    ).toBe(false);
    expect(isNotificationPreferences({ ...preferences, kinds: ["nope"] })).toBe(
      false,
    );
    expect(
      isNotificationPreferences({ ...preferences, followedSiteIds: ["a", "a"] }),
    ).toBe(false);
    expect(
      isNotificationPreferences({ ...preferences, followedSiteIds: [""] }),
    ).toBe(false);
  });

  it("keeps the valid parts when coercing damaged input", () => {
    const coerced = coerceNotificationPreferences({
      areas: [area, { id: "broken" }],
      kinds: ["new", "not-a-kind"],
      minSeverity: "closure",
    });
    expect(coerced.areas).toEqual([area]);
    expect(coerced.kinds).toEqual(["new"]);
    expect(coerced.minSeverity).toBe("closure");
  });

  it("upgrades a record stored before follows existed", () => {
    // Every device that set preferences before this field was added has one of
    // these; it must read as "follows nothing", never as unusable.
    const coerced = coerceNotificationPreferences({
      areas: [area],
      kinds: ["new"],
      minSeverity: "closure",
    });
    expect(coerced.followedSiteIds).toEqual([]);
    expect(coerced.areas).toEqual([area]);
  });

  it("deduplicates and bounds the follow list when coercing", () => {
    const coerced = coerceNotificationPreferences({
      ...preferences,
      followedSiteIds: ["a", "a", "", 7, "b"],
    });
    expect(coerced.followedSiteIds).toEqual(["a", "b"]);
  });

  it("deduplicates stored areas by their stable identity", () => {
    expect(
      coerceNotificationPreferences({ ...preferences, areas: [area, area] })
        .areas,
    ).toEqual([area]);
  });

  it("falls back to the defaults for unusable input", () => {
    expect(coerceNotificationPreferences(null)).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
    // An empty kind list would mean "never notify me", which is what switching
    // notifications off is for.
    expect(coerceNotificationPreferences({ areas: [], kinds: [] }).kinds).toEqual(
      DEFAULT_NOTIFICATION_PREFERENCES.kinds,
    );
  });
});
