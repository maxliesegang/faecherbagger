import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_URL_STATE,
  parseAppURLState,
  serializeAppURLState,
  type AppURLState,
} from "../src/lib/url-state.ts";

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
        "&sperrung=full&neu=1&ansicht=liste&sortierung=period%3Adescending" +
        "&baustelle=2026V1",
    );

    expect(state).toEqual({
      section: "explorer",
      filters: {
        search: "Hauptstraße",
        municipality: "Karlsruhe",
        phase: "upcoming",
        category: "sewer",
        closure: "full",
      },
      showOnlyChanged: true,
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

    expect(state.filters.phase).toBe("");
    expect(state.filters.category).toBe("");
    expect(state.filters.closure).toBe("");
    expect(state.section).toBe("surroundings");
    expect(state.view).toBe("map");
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
      serializeAppURLState({
        ...DEFAULT_APP_URL_STATE,
        filters: { ...DEFAULT_APP_URL_STATE.filters, phase: "active" },
      }),
    ).toBe("?status=active");
  });

  it("drops whitespace-only searches", () => {
    expect(
      serializeAppURLState({
        ...DEFAULT_APP_URL_STATE,
        filters: { ...DEFAULT_APP_URL_STATE.filters, search: "   " },
      }),
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
      filters: {
        search: "Hauptstraße",
        municipality: "Bruchsal",
        phase: "active",
        category: "bridge",
        closure: "one-direction",
      },
      showOnlyChanged: true,
      view: "list",
      sort: { key: "distance", direction: "ascending" },
      detailSiteId: "2026V42",
    };

    expect(parseAppURLState(serializeAppURLState(state))).toEqual(state);
  });
});
