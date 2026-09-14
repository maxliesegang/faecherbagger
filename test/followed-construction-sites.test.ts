import { describe, expect, it } from "vitest";
import {
  followConstructionSite,
  isFollowedConstructionSite,
  pruneFollowedConstructionSites,
  toggleFollowedConstructionSite,
  unfollowConstructionSite,
} from "../src/lib/followed-construction-sites.ts";
import { MAX_FOLLOWED_SITES } from "../src/lib/notification-preferences.ts";

describe("followed construction sites", () => {
  it("adds newest first and never duplicates", () => {
    expect(followConstructionSite([], "a")).toEqual(["a"]);
    expect(followConstructionSite(["a"], "b")).toEqual(["b", "a"]);
    expect(followConstructionSite(["a", "b"], "a")).toEqual(["a", "b"]);
  });

  it("refuses a new follow at the cap rather than dropping an old one", () => {
    const full = Array.from({ length: MAX_FOLLOWED_SITES }, (_, i) => `s${i}`);
    expect(followConstructionSite(full, "extra")).toEqual(full);
    // Re-following something already on a full list still succeeds.
    expect(followConstructionSite(full, "s0")).toEqual(full);
  });

  it("removes and reports membership", () => {
    expect(unfollowConstructionSite(["a", "b"], "a")).toEqual(["b"]);
    expect(unfollowConstructionSite(["a"], "missing")).toEqual(["a"]);
    expect(isFollowedConstructionSite(["a"], "a")).toBe(true);
    expect(isFollowedConstructionSite(["a"], "b")).toBe(false);
  });

  it("toggles both ways", () => {
    expect(toggleFollowedConstructionSite([], "a")).toEqual(["a"]);
    expect(toggleFollowedConstructionSite(["a"], "a")).toEqual([]);
  });

  it("prunes to the sites still published, keeping order", () => {
    expect(
      pruneFollowedConstructionSites(["a", "b", "c"], new Set(["c", "a"])),
    ).toEqual(["a", "c"]);
  });

  it("never modifies the list it is given", () => {
    const followed = ["a", "b"];
    followConstructionSite(followed, "c");
    unfollowConstructionSite(followed, "a");
    expect(followed).toEqual(["a", "b"]);
  });
});
