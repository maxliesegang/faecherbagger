/**
 * The standalone legal pages and the URL value each is reachable under
 * (`?seite=datenschutz`).
 */
export type LegalPageId = "privacy";

export const LEGAL_PAGES: readonly {
  id: LegalPageId;
  urlValue: string;
  title: string;
}[] = [
  { id: "privacy", urlValue: "datenschutz", title: "Datenschutzerklärung" },
];

export const getLegalPageIdFromURLValue = (
  value: string | null | undefined,
): LegalPageId | undefined =>
  LEGAL_PAGES.find((page) => page.urlValue === value)?.id;

export const getLegalPageURLValue = (id: LegalPageId): string =>
  LEGAL_PAGES.find((page) => page.id === id)!.urlValue;

export const getLegalPageTitle = (id: LegalPageId): string =>
  LEGAL_PAGES.find((page) => page.id === id)!.title;
