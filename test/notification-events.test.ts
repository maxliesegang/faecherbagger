import { describe, expect, it } from "vitest";
import {
  collectNotificationEvents,
  selectNotificationEvents,
} from "../src/lib/notification-events.ts";
import {
  createNotificationPayload,
  isWithinNotificationWindow,
} from "../src/lib/notification-message.ts";
import type {
  ClosureSeverity,
  ConstructionSite,
  ConstructionSiteChanges,
  NotificationArea,
  NotificationPreferences,
} from "../src/types/index.ts";

const TODAY = "2026-08-01";

const home: NotificationArea = {
  id: "home",
  label: "Zuhause",
  center: [8.4044, 49.0069],
  radiusKm: 5,
};

const preferences: NotificationPreferences = {
  areas: [home],
  kinds: ["new", "starts-soon", "changed"],
  minSeverity: "all",
};

function createSite(
  id: string,
  overrides: Partial<ConstructionSite> = {},
): ConstructionSite {
  return {
    id,
    phase: "upcoming",
    category: "road-construction",
    artRaw: "Straßenbau",
    closure: "full",
    siteType: "stationary",
    municipality: "Karlsruhe",
    location: `Teststraße ${id}`,
    notes: null,
    cause: null,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    point: [8.41, 49.01],
    source: "Test",
    lastModified: "2026-07-30T00:00:00Z",
    ...overrides,
  };
}

const createChanges = (
  overrides: Partial<ConstructionSiteChanges> = {},
): ConstructionSiteChanges => ({
  since: "2026-07-31T00:00:00Z",
  added: [],
  modified: [],
  removed: [],
  relevantModifications: [],
  ...overrides,
});

describe("collectNotificationEvents", () => {
  it("announces newly added sites", () => {
    const site = createSite("new-1");
    const events = collectNotificationEvents(
      [site],
      createChanges({ added: ["new-1"] }),
      TODAY,
    );
    expect(events).toEqual([
      {
        kind: "new",
        signature: "new:new-1",
        siteId: "new-1",
        point: site.point,
        closure: site.closure,
        startDate: site.startDate,
        endDate: site.endDate,
        municipality: site.municipality,
        location: site.location,
      },
    ]);
  });

  it("reminds a week and a day before a site starts", () => {
    const inAWeek = createSite("week", { startDate: "2026-08-08" });
    const tomorrow = createSite("tomorrow", { startDate: "2026-08-02" });
    const inTwoWeeks = createSite("later", { startDate: "2026-08-15" });

    const events = collectNotificationEvents(
      [inAWeek, tomorrow, inTwoWeeks],
      createChanges(),
      TODAY,
    );

    expect(events.map((event) => event.siteId).sort()).toEqual([
      "tomorrow",
      "week",
    ]);
    expect(events.every((event) => event.kind === "starts-soon")).toBe(true);
  });

  it("re-arms a start reminder when the start date moves", () => {
    const [first] = collectNotificationEvents(
      [createSite("s", { startDate: "2026-08-08" })],
      createChanges(),
      TODAY,
    );
    const [second] = collectNotificationEvents(
      [createSite("s", { startDate: "2026-08-02" })],
      createChanges(),
      TODAY,
    );
    expect(first!.signature).not.toBe(second!.signature);
  });

  it("does not remind about a site that was only just announced", () => {
    // Its "new" notification already said when it starts.
    const site = createSite("both", { startDate: "2026-08-08" });
    const events = collectNotificationEvents(
      [site],
      createChanges({ added: ["both"] }),
      TODAY,
    );
    expect(events.map((event) => event.kind)).toEqual(["new"]);
  });

  it("announces only modifications that change the period or the closure", () => {
    const site = createSite("m1");
    const events = collectNotificationEvents(
      [site, createSite("m2")],
      createChanges({
        modified: ["m1", "m2"],
        relevantModifications: [
          {
            id: "m1",
            changedFields: ["closure"],
            previousClosure: "obstruction",
            previousStartDate: "2026-09-01",
            previousEndDate: "2026-09-30",
          },
        ],
      }),
      TODAY,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "changed" });
    expect(events[0]!.signature).toContain("m1");
  });

  it("treats nothing as new on a first run", () => {
    // Without a previous run every record looks added; announcing all of them
    // would be the worst possible first impression.
    expect(
      collectNotificationEvents(
        [createSite("a"), createSite("b")],
        createChanges({ since: null, added: ["a", "b"] }),
        TODAY,
      ),
    ).toEqual([]);
  });
});

describe("selectNotificationEvents", () => {
  const events = collectNotificationEvents(
    [
      createSite("near-full", { point: [8.41, 49.01], closure: "full" }),
      createSite("near-mild", { point: [8.41, 49.01], closure: "none" }),
      createSite("far", { point: [9.5, 49.01], closure: "full" }),
    ],
    createChanges({ added: ["near-full", "near-mild", "far"] }),
    TODAY,
  );

  it("keeps only what is inside an area", () => {
    expect(
      selectNotificationEvents(events, preferences).map(
        (event) => event.siteId,
      ),
    ).toEqual(["near-full", "near-mild"]);
  });

  it("applies the severity threshold", () => {
    expect(
      selectNotificationEvents(events, {
        ...preferences,
        minSeverity: "closure",
      }).map((event) => event.siteId),
    ).toEqual(["near-full"]);
  });

  it("applies the kind selection", () => {
    expect(
      selectNotificationEvents(events, { ...preferences, kinds: ["changed"] }),
    ).toEqual([]);
  });

  it("sends nothing to a subscriber without areas", () => {
    expect(selectNotificationEvents(events, { ...preferences, areas: [] })).toEqual(
      [],
    );
  });
});

describe("createNotificationPayload", () => {
  const appURL = "https://example.org/faecherbagger/";

  it("deep-links to the site when there is exactly one", () => {
    const events = collectNotificationEvents(
      [createSite("only")],
      createChanges({ added: ["only"] }),
      TODAY,
    );
    const payload = createNotificationPayload(events, preferences, appURL)!;

    expect(payload.title).toBe("Neue Baustelle in Karlsruhe");
    expect(new URL(payload.url).searchParams.get("baustelle")).toBe("only");
    expect(payload.count).toBe(1);
  });

  it("aggregates a batch into one push scoped to what is new", () => {
    const events = collectNotificationEvents(
      [createSite("a"), createSite("b"), createSite("c")],
      createChanges({ added: ["a", "b", "c"] }),
      TODAY,
    );
    const payload = createNotificationPayload(events, preferences, appURL)!;

    expect(payload.count).toBe(3);
    expect(payload.title).toBe("3 Meldungen bei Zuhause");
    expect(payload.body).toContain("3× Vollsperrung");
    expect(new URL(payload.url).searchParams.get("neu")).toBe("1");
  });

  it("has nothing to say when there are no events", () => {
    expect(createNotificationPayload([], preferences, appURL)).toBeNull();
  });
});

describe("isWithinNotificationWindow", () => {
  it("defers the early-morning pipeline run", () => {
    // 04:00 UTC is 06:00 in Berlin during summer time — the first data run.
    expect(isWithinNotificationWindow(new Date("2026-08-01T04:00:00Z"))).toBe(
      false,
    );
    // 16:00 UTC is 18:00 in Berlin: the evening run sends.
    expect(isWithinNotificationWindow(new Date("2026-08-01T16:00:00Z"))).toBe(
      true,
    );
  });

  it("stays closed late at night regardless of the runner's timezone", () => {
    expect(isWithinNotificationWindow(new Date("2026-08-01T21:30:00Z"))).toBe(
      false,
    );
    expect(isWithinNotificationWindow(new Date("2026-01-15T05:00:00Z"))).toBe(
      false,
    );
  });
});

describe("severity of the notification set", () => {
  it("does not silently drop a full closure recorded without a severity", () => {
    const unknownSeverity: ClosureSeverity = "unknown";
    const events = collectNotificationEvents(
      [createSite("u", { closure: unknownSeverity })],
      createChanges({ added: ["u"] }),
      TODAY,
    );
    expect(
      selectNotificationEvents(events, {
        ...preferences,
        minSeverity: "closure",
      }),
    ).toHaveLength(1);
  });
});
