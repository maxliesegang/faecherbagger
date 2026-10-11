/**
 * How a visitor adds the web app to their device when the browser offers no
 * install prompt of its own. Chromium's `beforeinstallprompt` is handled
 * separately; this only picks which manual steps to describe.
 *
 * - `apple-mobile`: iPhone or iPad, any browser — "Teilen" › "Zum Home-Bildschirm".
 * - `safari-mac`: Safari on macOS — "Ablage" › "Zum Dock hinzufügen".
 * - `other`: everything else — the browser menu.
 */
export type InstallPlatform = "apple-mobile" | "safari-mac" | "other";

/**
 * iPhone, iPod or iPad. iPadOS 13+ reports a Mac user agent, so an iPad is
 * told apart from a Mac by its touch screen.
 */
export const isAppleMobileDevice = (
  userAgent: string,
  maxTouchPoints: number,
): boolean =>
  /iphone|ipad|ipod/i.test(userAgent) ||
  (/macintosh/i.test(userAgent) && maxTouchPoints > 1);

export function getInstallPlatform(
  userAgent: string,
  maxTouchPoints: number,
): InstallPlatform {
  if (isAppleMobileDevice(userAgent, maxTouchPoints)) return "apple-mobile";
  const isSafari =
    /safari/i.test(userAgent) &&
    !/chrome|chromium|crios|edg|opr|firefox|fxios/i.test(userAgent);
  if (/macintosh/i.test(userAgent) && isSafari) return "safari-mac";
  return "other";
}
