import { KernBadge } from "@kern-ux-annex/kern-react-kit";
import type { ClosureSeverity, ConstructionPhase } from "../types/index.ts";
import type { ConstructionSiteChangeStatus } from "../lib/construction-site-changes.ts";
import {
  getClosureBadgeVariant,
  getClosureLabel,
  getConstructionPhaseBadgeVariant,
  getConstructionPhaseLabel,
} from "../lib/construction-site-labels.ts";

/** Whether a record is current or planned. */
export function ConstructionPhaseBadge({ phase }: { phase: ConstructionPhase }) {
  return (
    <KernBadge
      variant={getConstructionPhaseBadgeVariant(phase)}
      label={getConstructionPhaseLabel(phase)}
    />
  );
}

/** How severely the site restricts traffic. */
export function ClosureBadge({ closure }: { closure: ClosureSeverity }) {
  return (
    <KernBadge
      variant={getClosureBadgeVariant(closure)}
      label={getClosureLabel(closure)}
    />
  );
}

const CHANGE_STATUS_LABELS: Record<ConstructionSiteChangeStatus, string> = {
  added: "Neu",
  modified: "Aktualisiert",
};

/** How the record entered the change window; nothing when it did not. */
export function ConstructionSiteChangeBadge({
  changeStatus,
}: {
  changeStatus: ConstructionSiteChangeStatus | null;
}) {
  if (changeStatus === null) return null;
  return (
    <KernBadge
      variant={changeStatus === "added" ? "danger" : "warning"}
      label={CHANGE_STATUS_LABELS[changeStatus]}
    />
  );
}

interface ConstructionSiteBadgesProps {
  phase: ConstructionPhase;
  closure: ClosureSeverity;
  /** Leads the row when the record is new or updated. */
  changeStatus?: ConstructionSiteChangeStatus | null;
  className?: string;
}

/**
 * The badge row shown above a construction site wherever it is summarized, so
 * cards, the map selection and the detail page describe a record identically.
 */
export function ConstructionSiteBadges({
  phase,
  closure,
  changeStatus = null,
  className,
}: ConstructionSiteBadgesProps) {
  return (
    <div className={className}>
      <ConstructionSiteChangeBadge changeStatus={changeStatus} />
      <ConstructionPhaseBadge phase={phase} />
      <ClosureBadge closure={closure} />
    </div>
  );
}
