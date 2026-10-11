import { describe, expect, it } from "vitest";
import type { ConstructionSite } from "../src/types/index.ts";
import {
  extractStreetNames,
  findStreetMention,
  locationMentionsStreet,
  normalizeStreetName,
  suggestMunicipalities,
  suggestStreets,
} from "../src/lib/street-names.ts";

const site = (location: string, municipality = "Karlsruhe") =>
  ({ location, municipality }) as ConstructionSite;

describe("street name matching", () => {
  it("treats common spellings of the same street as equal", () => {
    expect(normalizeStreetName("Herrenalber Straße")).toBe("herrenalberstrasse");
    expect(normalizeStreetName("Herrenalberstr.")).toBe("herrenalberstrasse");
    expect(normalizeStreetName("herrenalber-strasse")).toBe("herrenalberstrasse");
  });

  it("finds a street anywhere in a location text", () => {
    const location = "Kaiserstraße zw. Kronenstraße und Adlerstraße";
    expect(locationMentionsStreet(location, "Kaiserstraße")).toBe(true);
    expect(locationMentionsStreet(location, "Adlerstr.")).toBe(true);
    expect(
      locationMentionsStreet("Herrenalber Straße zwischen Battstraße", "Herrenalberstraße"),
    ).toBe(true);
  });

  it("does not match part of a longer name", () => {
    expect(locationMentionsStreet("Oberherrenstraße 4", "Herrenstraße")).toBe(false);
    expect(locationMentionsStreet("Kaiserstraße", "Kaiser")).toBe(false);
  });

  it("extracts compound and two-word street names", () => {
    expect(
      extractStreetNames(
        "Hans-Thoma-Straße zwischen Stephanienstraße und Ettlinger Allee, Mühlburger Tor",
      ),
    ).toEqual([
      "Hans-Thoma-Straße",
      "Stephanienstraße",
      "Ettlinger Allee",
      "Mühlburger Tor",
    ]);
  });
});

describe("findStreetMention", () => {
  it("tells works on a street from works that only end at it", () => {
    const location = "Herrenstraße zw. Kaiserstraße und Zirkel";
    expect(findStreetMention(location, "Herrenstraße")).toBe("on");
    expect(findStreetMention(location, "Kaiserstraße")).toBe("junction");
    expect(findStreetMention(location, "Waldstraße")).toBeUndefined();
  });

  it("reads every street of a list as affected", () => {
    expect(findStreetMention("Kronenstraße, Kaiserstraße, Kronenplatz", "Kaiserstraße")).toBe("on");
    expect(
      findStreetMention("Knoten Brauerstraße / Kriegsstraße / Gartenstraße", "Kriegsstraße"),
    ).toBe("on");
  });

  it("judges each clause on its own", () => {
    const location =
      "Kriegsstraße zw. Leopoldstraße u. Lessingstraße, Reinhold-Frank-Straße zwischen Kriegsstraße u. Viktoriastraße";
    expect(findStreetMention(location, "Reinhold-Frank-Straße")).toBe("on");
    expect(findStreetMention(location, "Viktoriastraße")).toBe("junction");
    expect(findStreetMention("Hirschstraße bis Höhe Hausnummer 4", "Hirschstraße")).toBe("on");
  });
});

describe("suggestions", () => {
  const constructionSites = [
    site("Kaiserstraße zw. Kronenstraße und Adlerstraße"),
    site("Kaiserstraße zw. Waldstraße und Herrenstraße"),
    site("Kaiserallee 12"),
    site("Kaiserstraße 3", "Ettlingen"),
  ];

  it("offers streets from the data, prefix matches and frequent ones first", () => {
    expect(suggestStreets(constructionSites, "kaiser")).toEqual([
      { street: "Kaiserstraße", municipality: "Karlsruhe", constructionSiteCount: 2 },
      { street: "Kaiserallee", municipality: "Karlsruhe", constructionSiteCount: 1 },
      { street: "Kaiserstraße", municipality: "Ettlingen", constructionSiteCount: 1 },
    ]);
  });

  it("waits for three characters", () => {
    expect(suggestStreets(constructionSites, "ka")).toEqual([]);
    expect(suggestMunicipalities(constructionSites, "Et")).toEqual([]);
  });

  it("offers municipalities by prefix with their site count", () => {
    expect(suggestMunicipalities(constructionSites, "ettl")).toEqual([
      { municipality: "Ettlingen", constructionSiteCount: 1 },
    ]);
  });
});
