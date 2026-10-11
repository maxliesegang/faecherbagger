import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ConstructionSiteMap } from "../src/components/ConstructionSiteMap.tsx";
import { MAP_SOURCE_IDS } from "../src/lib/construction-site-map-layers.ts";
import type { ConstructionSite, NotificationArea } from "../src/types/index.ts";

// Run the component's effects across prop updates without a browser or WebGL.
const lifecycle = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  effects: [] as {
    dependencies: readonly unknown[];
    cleanup?: () => void;
  }[],
  pending: [] as (() => void)[],
  refIndex: 0,
  effectIndex: 0,
}));
const map = vi.hoisted(() => ({
  load: () => {},
  fitBounds: vi.fn(),
  easeTo: vi.fn(),
  setFilter: vi.fn(),
  remove: vi.fn(),
  sources: new globalThis.Map<string, { setData: ReturnType<typeof vi.fn> }>(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useRef: (initial: unknown) => {
    const index = lifecycle.refIndex++;
    return (lifecycle.refs[index] ??= { current: index === 0 ? {} : initial });
  },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (
    effect: () => void | (() => void),
    dependencies: readonly unknown[],
  ) => {
    const index = lifecycle.effectIndex++;
    const previous = lifecycle.effects[index];
    if (
      previous && dependencies.length === previous.dependencies.length &&
      dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))
    ) {
      return;
    }
    lifecycle.pending.push(() => {
      previous?.cleanup?.();
      lifecycle.effects[index] = { dependencies, cleanup: effect() ?? undefined };
    });
  },
}));
vi.mock("maplibre-gl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("maplibre-gl")>()),
  NavigationControl: class {},
  AttributionControl: class {},
  setWorkerUrl: vi.fn(),
  Map: class {
    addControl() {}
    on(event: string, ...arguments_: unknown[]) {
      if (event === "load") map.load = arguments_[0] as () => void;
    }
    getSource(id: string) {
      if (!map.sources.has(id)) map.sources.set(id, { setData: vi.fn() });
      return map.sources.get(id);
    }
    fitBounds = map.fitBounds;
    easeTo = map.easeTo;
    setFilter = map.setFilter;
    remove = map.remove;
  },
}));
vi.mock("../src/hooks/useConstructionSiteGeometries.ts", () => ({
  useConstructionSiteGeometries: () => undefined,
}));
vi.mock("../src/lib/construction-site-map-layers.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/construction-site-map-layers.ts")>()),
  addConstructionSiteMapLayers: vi.fn(),
}));

const constructionSite: ConstructionSite = {
  id: "001",
  startDate: "2026-10-01",
  endDate: null,
  point: [8.4, 49],
  phase: "active",
  category: "other",
  artRaw: "",
  closure: "full",
  siteType: null,
  municipality: "Karlsruhe",
  location: "Kaiserstraße",
  notes: null,
  cause: null,
  source: "Test",
  lastModified: "2026-10-01T00:00:00Z",
};
const constructionSites = [constructionSite, { ...constructionSite, id: "002" }];
const notificationArea: NotificationArea = {
  id: "home",
  label: "Zuhause",
  kind: "circle",
  center: [8.4, 49],
  radiusKm: 2,
};
type MapProps = ComponentProps<typeof ConstructionSiteMap>;
const defaultProps: MapProps = {
  constructionSites,
  notificationAreas: [],
  onSiteSelect: vi.fn(),
  getSiteDetailsHref: (id) => `#${id}`,
  onSiteDetailsRequest: vi.fn(),
  onListViewRequest: vi.fn(),
};
function render(overrides: Partial<MapProps> = {}) {
  lifecycle.refIndex = 0;
  lifecycle.effectIndex = 0;
  ConstructionSiteMap({ ...defaultProps, ...overrides });
  lifecycle.pending.splice(0).forEach((effect) => effect());
}
function expectStationaryViewport() {
  expect(map.fitBounds).not.toHaveBeenCalled();
  expect(map.easeTo).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  lifecycle.refs = [];
  lifecycle.effects = [];
  lifecycle.pending = [];
  map.sources.clear();
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  lifecycle.effects.forEach((effect) => effect.cleanup?.());
  vi.unstubAllGlobals();
});

describe("construction site map viewport", () => {
  it("frames the initial results once without an animated zoom", () => {
    render();
    map.load();
    expect(map.fitBounds).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ duration: 0 }),
    );
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("updates filtered and refreshed results without moving the viewport", () => {
    render();
    map.load();
    vi.clearAllMocks();
    render({ constructionSites: [{ ...constructionSite }] });
    render({ constructionSites: [] });
    expect(map.sources.get(MAP_SOURCE_IDS.points)?.setData).toHaveBeenCalledTimes(2);
    expectStationaryViewport();
    expect(map.remove).not.toHaveBeenCalled();
  });

  it("selects and closes a site without zooming or returning to the location", () => {
    const currentLocation: [number, number] = [8.41, 49.01];
    render({ currentLocation });
    map.load();
    vi.clearAllMocks();
    render({ currentLocation, selectedSiteId: constructionSite.id });
    render({ currentLocation });
    expect(map.setFilter).toHaveBeenCalledTimes(2);
    expectStationaryViewport();
  });

  it("opens a preselected site directly without first framing all results", () => {
    render({ selectedSiteId: constructionSite.id });
    map.load();
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.easeTo).toHaveBeenCalledExactlyOnceWith({
      center: constructionSite.point,
      zoom: 15,
      duration: 0,
    });
  });

  it("frames an explicitly chosen area only when the area changes", () => {
    render();
    map.load();
    vi.clearAllMocks();
    render({ focusedArea: notificationArea });
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    render({ focusedArea: notificationArea, constructionSites: [] });
    expectStationaryViewport();
  });

  it("frames an area already selected before map load without animation", () => {
    render({ focusedArea: notificationArea });
    map.load();
    expect(map.fitBounds).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ duration: 0, maxZoom: 15 }),
    );
  });
});
