/**
 * The standalone pages a German public-facing portal has to carry, and the URL
 * value each is reachable under (`?seite=impressum`).
 */
export type LegalPageId = "imprint" | "privacy" | "accessibility";

export const LEGAL_PAGES: readonly {
  id: LegalPageId;
  urlValue: string;
  title: string;
}[] = [
  { id: "imprint", urlValue: "impressum", title: "Impressum" },
  { id: "privacy", urlValue: "datenschutz", title: "Datenschutzerklärung" },
  {
    id: "accessibility",
    urlValue: "barrierefreiheit",
    title: "Barrierefreiheitserklärung",
  },
];

export const getLegalPageIdFromURLValue = (
  value: string | null | undefined,
): LegalPageId | undefined =>
  LEGAL_PAGES.find((page) => page.urlValue === value)?.id;

export const getLegalPageURLValue = (id: LegalPageId): string =>
  LEGAL_PAGES.find((page) => page.id === id)!.urlValue;

export const getLegalPageTitle = (id: LegalPageId): string =>
  LEGAL_PAGES.find((page) => page.id === id)!.title;
