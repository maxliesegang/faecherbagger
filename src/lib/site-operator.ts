/**
 * Who runs this deployment.
 *
 * A German public-facing site needs an Impressum (§5 DDG), a
 * Datenschutzerklärung (Art. 13 DSGVO) and — for public bodies — a
 * Barrierefreiheitserklärung (§12b BITV 2.0). All three are statements about
 * the *operator*, which the source tree cannot know, so they come from build
 * variables. Nothing is invented: when they are unset the legal pages say so
 * plainly instead of showing a placeholder that reads like a real address.
 *
 * Set these in `.env` / the Pages build environment:
 *   VITE_OPERATOR_NAME, VITE_OPERATOR_ADDRESS, VITE_OPERATOR_EMAIL,
 *   VITE_OPERATOR_ACCESSIBILITY_CONTACT (optional; defaults to the email)
 */
export interface SiteOperator {
  name: string;
  /** Postal address, newline-separated. */
  address: string;
  email: string;
  accessibilityContact: string;
}

const readEnvironmentValue = (value: string | undefined): string =>
  value?.trim() ?? "";

const name = readEnvironmentValue(import.meta.env.VITE_OPERATOR_NAME);
const address = readEnvironmentValue(import.meta.env.VITE_OPERATOR_ADDRESS);
const email = readEnvironmentValue(import.meta.env.VITE_OPERATOR_EMAIL);

export const SITE_OPERATOR: SiteOperator = {
  name,
  address,
  email,
  accessibilityContact:
    readEnvironmentValue(import.meta.env.VITE_OPERATOR_ACCESSIBILITY_CONTACT) ||
    email,
};

/** True once the deployment has declared who is responsible for it. */
export const isSiteOperatorConfigured = Boolean(name && address && email);

/**
 * This is not a service of the city or of the TRK, and the KERN styling makes
 * it look like one, so every legal page and the page header say otherwise.
 */
export const UNOFFICIAL_NOTICE =
  "Unabhängiges Angebot – keine amtliche Auskunft der Stadt Karlsruhe oder der TechnologieRegion Karlsruhe.";
