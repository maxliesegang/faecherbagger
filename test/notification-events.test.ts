import { describe, expect, it } from "vitest";
import {
  collectNotificationEvents,
  selectNotificationEvents as selectEventsForDate,
  createNotificationFeed,
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
const selectNotificationEvents: typeof selectEventsForDate = (
  events,
  preferences,
  today = TODAY,
) => selectEventsForDate(events, preferences, today);

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
  followedSiteIds: [],
  notifyEarly: true,
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
        announcedOn: TODAY,
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

  it("reminds fourteen days and a day before a site starts", () => {
    const inAWeek = createSite("week", { startDate: "2026-08-15" });
    const tomorrow = createSite("tomorrow", { startDate: "2026-08-02" });
    const inTwoWeeks = createSite("later", { startDate: "2026-08-16" });

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
      [createSite("s", { startDate: "2026-08-15" })],
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
    expect(
      selectNotificationEvents(events, { ...preferences, areas: [] }),
    ).toEqual([]);
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
    expect(new URL(payload.url).hash).toBe("#meldungen");
    expect(new URL(payload.url).searchParams.get("bereich")).toBe("fuer-mich");
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

describe("followed sites", () => {
  /** Far outside `home`, and harmless enough to fail the strictest threshold. */
  const distantAndHarmless = createSite("distant", {
    point: [8.4044, 49.4],
    closure: "none",
  });

  const eventsFor = (site: ConstructionSite) =>
    collectNotificationEvents(
      [site],
      createChanges({ added: [site.id] }),
      TODAY,
    );

  it("notifies about a followed site outside every area", () => {
    const selected = selectNotificationEvents(eventsFor(distantAndHarmless), {
      ...preferences,
      followedSiteIds: ["distant"],
    });
    expect(selected.map((event) => event.siteId)).toEqual(["distant"]);
  });

  it("notifies about a followed site below the severity threshold", () => {
    const selected = selectNotificationEvents(eventsFor(distantAndHarmless), {
      ...preferences,
      minSeverity: "closure",
      followedSiteIds: ["distant"],
    });
    expect(selected.map((event) => event.siteId)).toEqual(["distant"]);
  });

  it("still respects a kind the visitor switched off", () => {
    const selected = selectNotificationEvents(eventsFor(distantAndHarmless), {
      ...preferences,
      kinds: ["starts-soon"],
      followedSiteIds: ["distant"],
    });
    expect(selected).toEqual([]);
  });

  it("ignores an unfollowed distant site", () => {
    expect(
      selectNotificationEvents(eventsFor(distantAndHarmless), preferences),
    ).toEqual([]);
  });

  it("notifies a device that has follows but no areas at all", () => {
    // The settings panel gates its "einschalten" button on the same condition;
    // if these two ever disagree someone can subscribe and never hear anything,
    // or be refused a subscription that would have worked.
    const selected = selectNotificationEvents(eventsFor(distantAndHarmless), {
      ...preferences,
      areas: [],
      followedSiteIds: ["distant"],
    });
    expect(selected.map((event) => event.siteId)).toEqual(["distant"]);
  });

  it("selects nothing with no areas and no follows", () => {
    expect(
      selectNotificationEvents(eventsFor(distantAndHarmless), {
        ...preferences,
        areas: [],
      }),
    ).toEqual([]);
  });
});

describe("planning and delivery rules", () => {
  it("keeps long-term announcements quiet by default, but permits explicit early notices", () => {
    const events = collectNotificationEvents(
      [createSite("early")],
      createChanges({ added: ["early"] }),
      TODAY,
    );
    expect(
      selectNotificationEvents(events, { ...preferences, notifyEarly: false }),
    ).toEqual([]);
    expect(
      selectNotificationEvents(events, { ...preferences, notifyEarly: true }),
    ).toHaveLength(1);
    expect(
      selectNotificationEvents(events, {
        ...preferences,
        notifyEarly: false,
        followedSiteIds: ["early"],
      }),
    ).toHaveLength(1);
  });

  it("announces a newly discovered site inside fourteen days even without early notices", () => {
    const events = collectNotificationEvents(
      [createSite("near", { startDate: "2026-08-12" })],
      createChanges({ added: ["near"] }),
      TODAY,
    );
    expect(
      selectNotificationEvents(events, { ...preferences, notifyEarly: false }),
    ).toHaveLength(1);
  });

  it("identifies each reminder separately for an unchanged start date", () => {
    const constructionSite = createSite("reminder", {
      startDate: "2026-08-15",
    });
    const first = collectNotificationEvents(
      [constructionSite],
      createChanges(),
      TODAY,
    )[0]!;
    const second = collectNotificationEvents(
      [constructionSite],
      createChanges({ since: "2026-08-13T16:00:00Z" }),
      "2026-08-14",
    )[0]!;
    expect(first.reminderLeadDays).toBe(14);
    expect(second.reminderLeadDays).toBe(1);
    expect(first.signature).not.toBe(second.signature);
    expect(
      selectNotificationEvents(
        [second],
        { ...preferences, remindDayBefore: false },
        "2026-08-14",
      ),
    ).toEqual([]);
    expect(
      selectNotificationEvents([first], {
        ...preferences,
        remindDayBefore: false,
      }),
    ).toHaveLength(1);
  });

  it("catches up a reminder after a missed pipeline day", () => {
    const events = collectNotificationEvents(
      [createSite("missed", { startDate: "2026-08-14" })],
      createChanges({ since: "2026-07-30T16:00:00Z" }),
      TODAY,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.reminderLeadDays).toBe(14);
  });

  it("includes an improvement below the threshold and a postponement beyond the horizon", () => {
    const constructionSite = createSite("changed", {
      closure: "none",
      startDate: "2026-10-01",
    });
    const events = collectNotificationEvents(
      [constructionSite],
      createChanges({
        relevantModifications: [
          {
            id: "changed",
            changedFields: ["closure", "period"],
            previousClosure: "full",
            previousStartDate: "2026-08-03",
            previousEndDate: null,
          },
        ],
      }),
      TODAY,
    );
    expect(
      selectNotificationEvents(events, {
        ...preferences,
        notifyEarly: false,
        minSeverity: "closure",
      }),
    ).toHaveLength(1);
  });

  it("preserves morning events across the evening run without duplicating or renewing them", () => {
    const constructionSite = createSite("morning");
    const events = collectNotificationEvents(
      [constructionSite],
      createChanges({ added: ["morning"] }),
      TODAY,
    );
    const morning = createNotificationFeed(events, "2026-08-01T04:00:00Z");
    const evening = createNotificationFeed(
      [],
      "2026-08-01T16:00:00Z",
      morning,
      [constructionSite],
    );
    expect(evening.events).toEqual(events);
    expect(
      createNotificationFeed(events, "2026-08-01T17:00:00Z", evening, [
        constructionSite,
      ]).events,
    ).toEqual(events);
    expect(
      createNotificationFeed([], "2026-08-05T16:00:00Z", evening, [
        constructionSite,
      ]).events,
    ).toEqual([]);
  });

  it("removes retained notices whose dates or closure are no longer current", () => {
    const constructionSite = createSite("postponed", {
      startDate: "2026-08-15",
    });
    const previous = createNotificationFeed(
      collectNotificationEvents([constructionSite], createChanges(), TODAY),
      "2026-08-01T04:00:00Z",
    );
    expect(
      createNotificationFeed([], "2026-08-01T16:00:00Z", previous, [
        { ...constructionSite, startDate: "2026-09-15" },
      ]).events,
    ).toEqual([]);
    expect(
      createNotificationFeed([], "2026-08-01T16:00:00Z", previous, []).events,
    ).toEqual([]);
  });
});

describe("extended pipeline outages", () => {
  it("still offers the first reminder when the optional day-before reminder is disabled", () => {
    const events = collectNotificationEvents(
      [createSite("outage", { startDate: "2026-08-02" })],
      createChanges({ since: "2026-07-15T16:00:00Z" }),
      TODAY,
    );
    expect(
      events
        .map((event) => event.reminderLeadDays)
        .sort((left, right) => left! - right!),
    ).toEqual([1, 14]);
    expect(
      selectNotificationEvents(events, {
        ...preferences,
        remindDayBefore: false,
      }),
    ).toHaveLength(1);
    const payload = createNotificationPayload(
      events,
      preferences,
      "https://example.org/faecherbagger/",
    )!;
    expect(payload.count).toBe(1);
    expect(new URL(payload.url).searchParams.get("baustelle")).toBe("outage");
  });
});
