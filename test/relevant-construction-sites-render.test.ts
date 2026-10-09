import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RelevantConstructionSites } from "../src/components/RelevantConstructionSites.tsx";
import { selectRelevantConstructionSites } from "../src/lib/relevant-construction-sites.ts";
import type { PushNotificationsController } from "../src/hooks/usePushNotifications.ts";
import type {
  ConstructionSite,
  NotificationArea,
  NotificationFeedEvent,
} from "../src/types/index.ts";

const pushNotifications: PushNotificationsController = {
  subscriptionState: "inactive",
  isActive: false,
  isBusy: false,
  enable: async () => true,
  disable: async () => undefined,
  sendTest: async () => undefined,
  isInstalled: false,
  refreshData: () => undefined,
};

const area: NotificationArea = {
  id: "home",
  label: "Zuhause",
  center: [8.4, 49],
  radiusKm: 2,
};
const createConstructionSite = (
  id: string,
  startDate: string,
): ConstructionSite => ({
  id,
  startDate,
  endDate: null,
  point: [8.4, 49],
  phase: "upcoming",
  category: "other",
  artRaw: "",
  closure: "full",
  siteType: null,
  municipality: "Karlsruhe",
  location: id,
  notes: null,
  cause: null,
  source: "Test",
  lastModified: "2026-08-01T00:00:00Z",
});
const render = (
  hash = "",
  notificationEvents: NotificationFeedEvent[] = [],
  areas: NotificationArea[] = [area],
  followedSiteIds: ReadonlySet<string> = new Set(),
  unreadSignatures: ReadonlySet<string> = new Set(
    notificationEvents.map((event) => event.signature),
  ),
) => {
  vi.stubGlobal("window", { location: { hash } });
  return renderToStaticMarkup(
    createElement(RelevantConstructionSites, {
      selection: selectRelevantConstructionSites(
        [
          createConstructionSite("Start-in-14-Tagen", "2026-08-15"),
          createConstructionSite("Später-im-November", "2026-11-01"),
          createConstructionSite("Läuft-bereits", "2026-07-01"),
        ],
        areas,
        { today: "2026-08-01", followedSiteIds },
      ),
      areas,
      isPreferencesLoaded: true,
      notificationEvents,
      unreadSignatures,
      onMarkRead: () => undefined,
      hasInboxError: false,
      pushNotifications,
      getDetailHref: (id) => `?baustelle=${id}`,
      onDetailOpen: () => undefined,
      onAreaSetupOpen: () => undefined,
      getSettingsHref: () => "?bereich=einstellungen",
      onSettingsOpen: () => undefined,
      getExploreHref: () => "?bereich=alle",
      onExploreOpen: () => undefined,
      staleFollowedCount: 0,
      onPruneFollowed: () => undefined,
    }),
  );
};

afterEach(() => vi.unstubAllGlobals());

const reminder: NotificationFeedEvent = {
  kind: "starts-soon",
  signature: "reminder",
  siteId: "Start-in-14-Tagen",
  point: [8.4, 49],
  closure: "full",
  startDate: "2026-08-15",
  endDate: null,
  municipality: "Karlsruhe",
  location: "Zugestellter-Hinweis",
};

describe("personal view rendering", () => {
  it("asks for a place, and nothing else, before anything is set up", () => {
    const html = render("", [], []);
    expect(html).toContain("Welche Baustellen betreffen Sie?");
    expect(html).toContain("Ort festlegen");
    expect(html).toContain('href="?bereich=alle"');
    expect(html).not.toContain("soon-heading");
    expect(html).not.toContain("Später geplant");
  });

  it("renders nothing until the device preferences have loaded", () => {
    vi.stubGlobal("window", { location: { hash: "" } });
    const html = renderToStaticMarkup(
      createElement(RelevantConstructionSites, {
        selection: selectRelevantConstructionSites([], [], { today: "2026-08-01" }),
        areas: [],
        isPreferencesLoaded: false,
        notificationEvents: [],
        unreadSignatures: new Set<string>(),
        onMarkRead: () => undefined,
        hasInboxError: false,
        pushNotifications,
        getDetailHref: (id) => `?baustelle=${id}`,
        onDetailOpen: () => undefined,
        onAreaSetupOpen: () => undefined,
        getSettingsHref: () => "",
        onSettingsOpen: () => undefined,
        getExploreHref: () => "",
        onExploreOpen: () => undefined,
        staleFollowedCount: 0,
        onPruneFollowed: () => undefined,
      }),
    );
    expect(html).toBe("");
  });

  it("puts a followed site in the timeline even without a place", () => {
    const html = render("", [], [], new Set(["Später-im-November"]));
    expect(html).toContain("Später-im-November");
    expect(html).toContain("Gemerkt");
    expect(html).not.toContain("Welche Baustellen betreffen Sie?");
  });

  it("orders soon, running and later, with later collapsed", () => {
    const html = render();
    expect(html.indexOf("Beginnt bald")).toBeLessThan(html.indexOf("Läuft gerade"));
    expect(html.indexOf("Läuft gerade")).toBeLessThan(html.indexOf("Später geplant"));
    expect(html).toContain("Start-in-14-Tagen");
    expect(html).toMatch(/<details[^>]*><summary>Später geplant/);
  });

  it("leads with unread notifications and offers to mark them read", () => {
    const html = render("", [reminder]);
    expect(html.indexOf("Neue Meldungen")).toBeLessThan(html.indexOf("Beginnt bald"));
    expect(html).toContain("Zugestellter-Hinweis");
    expect(html).toContain(">Gelesen<");
  });

  it("opens read notifications from a batch notification link", () => {
    const html = render("#meldungen", [reminder], [area], new Set(), new Set());
    expect(html).toMatch(/<details id="meldungen"[^>]*open=""/);
    expect(html).toContain("Zugestellter-Hinweis");
  });

  it("offers to switch notifications on", () => {
    const html = render();
    expect(html).toContain("Benachrichtigungen sind aus");
    expect(html).toContain("Einschalten");
  });
});
