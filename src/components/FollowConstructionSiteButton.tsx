import { useState } from "react";
import { KernButton } from "@kern-ux-annex/kern-react-kit";
import { MAX_FOLLOWED_SITES } from "../lib/notification-preferences.ts";
import { AppIcon } from "./AppIcon.tsx";

interface FollowConstructionSiteButtonProps {
  siteId: string;
  isFollowed: boolean;
  /** Returns false when the follow list is full; see the preferences hook. */
  onToggleFollowed: (siteId: string) => boolean;
}

/**
 * Marks a construction site on this device. A marked site appears under
 * "Für mich" wherever it is and is included in notifications.
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
        variant="secondary"
        className="follow-button"
        aria-pressed={isFollowed}
        onClick={() => setIsFull(!onToggleFollowed(siteId))}
      >
        <AppIcon name="star" isFilled={isFollowed} />
        <span>{isFollowed ? "Gemerkt" : "Merken"}</span>
      </KernButton>
      {isFull && (
        /*
          `alert` rather than a toast: the button did not do what it looks like
          it did, and that has to reach a screen reader at the moment it
          happens.
        */
        <p role="alert" className="construction-site-detail__follow-limit">
          Sie können höchstens {MAX_FOLLOWED_SITES} Baustellen merken.
          Entfernen Sie zuerst eine.
        </p>
      )}
    </>
  );
}
