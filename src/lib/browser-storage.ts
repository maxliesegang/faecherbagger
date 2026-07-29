/**
 * Access to `localStorage` that cannot break the app. Private browsing modes,
 * a full quota and blocked third-party storage all make the API throw, and none
 * of the personal state kept here — the home area, the acknowledgement,
 * the notification flag — is worth a blank page. A failed read is treated as
 * "nothing stored", a failed write as "not remembered".
 */

export function readStoredText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the value simply is not remembered for the next visit.
  }
}

export function removeStoredText(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // See writeStoredText.
  }
}

/**
 * Reads a stored JSON value and validates it before returning it. Anything
 * unparsable or no longer matching the expected shape — an older release's
 * format, a hand-edited entry — is discarded rather than fed into the app.
 */
export function readStoredJSON<T>(
  key: string,
  isValid: (value: unknown) => value is T,
): T | null {
  const stored = readStoredText(key);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredJSON(key: string, value: unknown): void {
  writeStoredText(key, JSON.stringify(value));
}
