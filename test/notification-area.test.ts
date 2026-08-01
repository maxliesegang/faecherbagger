import { describe, expect, it } from "vitest";
import {
  removeNotificationArea,
  upsertNotificationArea,
} from "../src/lib/notification-area.ts";
import {
  findNotificationAreaForPoint,
  isPointInNotificationArea,
} from "../src/lib/notification-events.ts";
import {
  coerceNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  isLngLat,
  isNotificationArea,
  isNotificationPreferences,
  MAX_NOTIFICATION_AREAS,
  meetsSeverityThreshold,
} from "../src/lib/notification-preferences.ts";
import type { NotificationArea } from "../src/types/index.ts";

const area: NotificationArea = {
  id: "home",
  label: "Zuhause",
  center: [8.4044, 49.0069],
  radiusKm: 5,
};

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

  it("matches points inside the configured radius", () => {
    expect(isPointInNotificationArea(area, [8.45, 49.0069])).toBe(true);
    expect(isPointInNotificationArea(area, [8.5, 49.0069])).toBe(false);
  });

  it("reports which of several areas a site falls into", () => {
    const work: NotificationArea = {
      id: "work",
      label: "Arbeit",
      center: [8.6, 49.01],
      radiusKm: 2,
    };
    expect(
      findNotificationAreaForPoint([area, work], [8.6, 49.011])?.label,
    ).toBe("Arbeit");
    expect(
      findNotificationAreaForPoint([area, work], [9.5, 49.01]),
    ).toBeUndefined();
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
  };

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
