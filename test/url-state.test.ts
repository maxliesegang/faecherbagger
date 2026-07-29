import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_URL_STATE,
  parseAppURLState,
  serializeAppURLState,
  type AppURLState,
} from "../src/lib/url-state.ts";
import type { SiteQuery } from "../src/lib/site-scope.ts";

/** A state at its defaults apart from the query fields named here. */
const withQuery = (query: Partial<SiteQuery>): AppURLState => ({
  ...DEFAULT_APP_URL_STATE,
  query: { ...DEFAULT_APP_URL_STATE.query, ...query },
});

describe("parseAppURLState", () => {
  it("returns the defaults for an empty query", () => {
    expect(parseAppURLState("")).toEqual({
      ...DEFAULT_APP_URL_STATE,
      detailSiteId: undefined,
    });
  });

  it("reads every supported parameter", () => {
    const state = parseAppURLState(
      "?bereich=alle&q=Hauptstra%C3%9Fe&ort=Karlsruhe&status=upcoming&art=sewer" +
        "&sperrung=full&neu=1&seit=30t&ansicht=liste" +
        "&sortierung=period%3Adescending&baustelle=2026V1",
    );

    expect(state).toEqual({
      section: "explorer",
      query: {
        filters: {
          search: "Hauptstraße",
          municipality: "Karlsruhe",
          phase: "upcoming",
          category: "sewer",
          closure: "full",
        },
        onlyRecent: true,
        windowDays: 30,
      },
      view: "list",
      sort: { key: "period", direction: "descending" },
      detailSiteId: "2026V1",
    });
  });

  it("falls back to the default for values outside the known enums", () => {
    const state = parseAppURLState(
      "?bereich=irgendwo&status=irgendwas&art=raumschiffbau&sperrung=vielleicht" +
        "&ansicht=galerie&sortierung=lage%3Aseitwaerts",
    );

    expect(state.query.filters.phase).toBe("");
    expect(state.query.filters.category).toBe("");
    expect(state.query.filters.closure).toBe("");
    expect(state.section).toBe("surroundings");
    expect(state.view).toBe("map");
    expect(state.query.windowDays).toBe(7);
    expect(state.sort).toBeNull();
  });

  it("opens the surroundings by default so a shared link starts there", () => {
    expect(parseAppURLState("").section).toBe("surroundings");
    expect(parseAppURLState("?bereich=alle").section).toBe("explorer");
  });

  it("treats an empty site id as no selection", () => {
    expect(parseAppURLState("?baustelle=").detailSiteId).toBeUndefined();
  });
});

describe("serializeAppURLState", () => {
  it("omits everything that is at its default", () => {
    expect(serializeAppURLState({ ...DEFAULT_APP_URL_STATE })).toBe("");
  });

  it("keeps the map view and the default sort out of the query", () => {
    expect(
      serializeAppURLState(
        withQuery({
          filters: { ...DEFAULT_APP_URL_STATE.query.filters, phase: "active" },
        }),
      ),
    ).toBe("?status=active");
  });

  it("drops whitespace-only searches", () => {
    expect(
      serializeAppURLState(
        withQuery({
          filters: { ...DEFAULT_APP_URL_STATE.query.filters, search: "   " },
        }),
      ),
    ).toBe("");
  });

  it("keeps the default section out of the query", () => {
    expect(
      serializeAppURLState({
        ...DEFAULT_APP_URL_STATE,
        section: "explorer",
      }),
    ).toBe("?bereich=alle");
  });

  it("round-trips a fully populated state", () => {
    const state: AppURLState = {
      section: "explorer",
      query: {
        filters: {
          search: "Hauptstraße",
          municipality: "Bruchsal",
          phase: "active",
          category: "bridge",
          closure: "one-direction",
        },
        onlyRecent: true,
        windowDays: 1,
      },
      view: "list",
      sort: { key: "distance", direction: "ascending" },
      detailSiteId: "2026V42",
    };

    expect(parseAppURLState(serializeAppURLState(state))).toEqual(state);
  });

  it("omits the default time window and rejects an unknown one", () => {
    expect(serializeAppURLState(withQuery({ windowDays: 7 }))).toBe("");
    expect(serializeAppURLState(withQuery({ windowDays: 1 }))).toBe("?seit=24h");
    expect(parseAppURLState("?seit=17t").query.windowDays).toBe(7);
  });
});
