import { useState } from "react";
import { KernButton } from "@kern-ux-annex/kern-react-kit";
import { MAX_FOLLOWED_SITES } from "../lib/notification-preferences.ts";

interface FollowConstructionSiteButtonProps {
  siteId: string;
  isFollowed: boolean;
  /** Returns false when the follow list is full; see the preferences hook. */
  onToggleFollowed: (siteId: string) => boolean;
}

/**
 * Follow or unfollow one construction site.
 *
 * Worth its own control next to "teilen" because it is the only way to keep
 * hold of a site that sits outside every watched area — a closure on a route
 * someone drives weekly but does not live near. A followed site notifies
 * regardless of distance, so the label says what happens rather than naming an
 * abstraction ("merken" would not explain why a notification arrived).
 */
export function FollowConstructionSiteButton({
  siteId,
  isFollowed,
  onToggleFollowed,
}: FollowConstructionSiteButtonProps) {
  const [isFull, setIsFull] = useState(false);

  return (
    <>
      <KernButton
        type="button"
        variant={isFollowed ? "primary" : "secondary"}
        label={isFollowed ? "Wird beobachtet" : "Baustelle beobachten"}
        aria-pressed={isFollowed}
        onClick={() => setIsFull(!onToggleFollowed(siteId))}
      />
      {isFull && (
        /*
          `alert` rather than a toast: the button did not do what it looks like
          it did, and that has to reach a screen reader at the moment it
          happens.
        */
        <p role="alert" className="construction-site-detail__follow-limit">
          Es lassen sich höchstens {MAX_FOLLOWED_SITES} Baustellen beobachten.
          Entfernen Sie zuerst eine andere.
        </p>
      )}
    </>
  );
}
