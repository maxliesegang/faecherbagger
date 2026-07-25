import { describe, expect, it } from "vitest";
import {
  createWFSRequestURL,
  WFS_ENDPOINT_URL,
} from "../src/lib/wfs-client.ts";

describe("createWFSRequestURL", () => {
  it("uses the GeoServer parameter names required for geometry and filtering", () => {
    const requestURL = new URL(
      createWFSRequestURL("TBA:baustellen_aktuell"),
    );

    expect(requestURL.origin + requestURL.pathname).toBe(WFS_ENDPOINT_URL);
    expect(requestURL.searchParams.get("typeName")).toBe(
      "TBA:baustellen_aktuell",
    );
    expect(requestURL.searchParams.get("propertyName")?.split(",")).toContain(
      "geom",
    );
    expect(requestURL.searchParams.get("CQL_FILTER")).toBe(
      "gemeinde IS NOT NULL",
    );
    expect(requestURL.searchParams.has("WFS_CQL_FILTER")).toBe(false);
  });
});
