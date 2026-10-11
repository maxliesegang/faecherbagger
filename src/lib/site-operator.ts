/**
 * Who runs this deployment.
 *
 * The Datenschutzerklärung (Art. 13 DSGVO) names the controller, and
 * §18 MStV asks for name and address on any public site. Both are statements
 * about the *operator*, which the source tree cannot know, so they come from
 * build variables. Nothing is invented: when they are unset the privacy page
 * says so plainly instead of showing a placeholder that reads like a real
 * address.
 *
 * Set these in `.env` / the Pages build environment:
 *   VITE_OPERATOR_NAME, VITE_OPERATOR_ADDRESS, VITE_OPERATOR_EMAIL
 */
export interface SiteOperator {
  name: string;
  /** Postal address, newline-separated. */
  address: string;
  email: string;
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
};

/** True once the deployment has declared who is responsible for it. */
export const isSiteOperatorConfigured = Boolean(name && address && email);
