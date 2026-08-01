import { useState } from "react";
import { KernButton } from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite } from "../types/index.ts";
import { getClosureHeadline } from "../lib/construction-site-labels.ts";

interface ShareConstructionSiteButtonProps {
  site: ConstructionSite;
}

const SHARE_CONFIRMATION_MS = 4_000;

/**
 * Passes the current page to the platform share sheet, falling back to the
 * clipboard where `navigator.share` is missing (most desktop browsers).
 *
 * "Diese Straße ist gesperrt" is something people forward to a household or a
 * neighbourhood chat, so the link has to be one press away rather than a
 * URL-bar copy.
 */
export function ShareConstructionSiteButton({
  site,
}: ShareConstructionSiteButtonProps) {
  const [confirmation, setConfirmation] = useState<string>();

  const confirm = (message: string) => {
    setConfirmation(message);
    window.setTimeout(() => setConfirmation(undefined), SHARE_CONFIRMATION_MS);
  };

  const share = async () => {
    const shareData = {
      title: `${site.location} – ${site.municipality}`,
      text: `${getClosureHeadline(site.closure)}: ${site.location}, ${site.municipality}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
      confirm("Link wurde kopiert.");
    } catch (error) {
      // A cancelled share sheet rejects too; only report real failures.
      if (error instanceof DOMException && error.name === "AbortError") return;
      confirm("Teilen hat nicht geklappt. Kopieren Sie die Adresse manuell.");
    }
  };

  return (
    <>
      <KernButton
        type="button"
        variant="tertiary"
        label="Teilen"
        onClick={() => void share()}
      />
      {confirmation && (
        <span className="construction-site-detail__share-feedback" role="status">
          {confirmation}
        </span>
      )}
    </>
  );
}
