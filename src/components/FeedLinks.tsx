import { KernLink } from "@kern-ux-annex/kern-react-kit";

/**
 * The two feeds of new construction sites, as one inline pair.
 *
 * Shared by the footer and the notification section because both offer them as
 * the way to hear about new sites without granting anything — and because the
 * URLs have to stay resolved against `BASE_URL` for the project base path in
 * every place they appear.
 */
export function FeedLinks() {
  return (
    <>
      <KernLink
        href={`${import.meta.env.BASE_URL}baustellen.xml`}
        label="RSS-Feed abonnieren"
      />
      {" · "}
      <KernLink
        href={`${import.meta.env.BASE_URL}baustellen.atom`}
        label="Atom-Feed abonnieren"
      />
    </>
  );
}
