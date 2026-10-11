import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstallAppHint } from "../src/components/InstallAppHint.tsx";
import {
  getInstallPlatform,
  isAppleMobileDevice,
} from "../src/lib/install-platform.ts";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1";
// iPadOS and macOS Safari send the same user agent.
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const MAC_FIREFOX =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0";
const ANDROID_FIREFOX =
  "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0";

describe("isAppleMobileDevice", () => {
  it("recognizes an iPhone in any browser", () => {
    expect(isAppleMobileDevice(IPHONE_SAFARI, 5)).toBe(true);
    expect(isAppleMobileDevice(IPHONE_CHROME, 5)).toBe(true);
  });

  it("tells an iPad with a Mac user agent apart by its touch screen", () => {
    expect(isAppleMobileDevice(MAC_SAFARI, 5)).toBe(true);
    expect(isAppleMobileDevice(MAC_SAFARI, 0)).toBe(false);
  });
});

describe("getInstallPlatform", () => {
  it("describes the share sheet on iPhone and iPad", () => {
    expect(getInstallPlatform(IPHONE_CHROME, 5)).toBe("apple-mobile");
    expect(getInstallPlatform(MAC_SAFARI, 5)).toBe("apple-mobile");
  });

  it("describes the Dock only for Safari on a Mac", () => {
    expect(getInstallPlatform(MAC_SAFARI, 0)).toBe("safari-mac");
    expect(getInstallPlatform(MAC_CHROME, 0)).toBe("other");
    expect(getInstallPlatform(MAC_FIREFOX, 0)).toBe("other");
  });

  it("falls back to the browser menu elsewhere", () => {
    expect(getInstallPlatform(ANDROID_FIREFOX, 5)).toBe("other");
  });
});

describe("InstallAppHint", () => {
  const render = (props: Parameters<typeof InstallAppHint>[0]) =>
    renderToStaticMarkup(createElement(InstallAppHint, props));

  it("offers the browser's install prompt when there is one", () => {
    const markup = render({
      install: async () => undefined,
      installPlatform: "other",
    });
    expect(markup).toContain("App installieren");
    expect(markup).not.toContain("Browsermenü");
  });

  it("lists the share-sheet steps on iPhone and iPad", () => {
    const markup = render({ installPlatform: "apple-mobile" });
    expect(markup).toContain("<ol");
    expect(markup).toContain("Zum Home-Bildschirm");
  });

  it("starts folded away", () => {
    expect(render({ installPlatform: "other" })).not.toContain("open");
  });
});
