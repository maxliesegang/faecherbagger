import { KernBadge } from "@kern-ux-annex/kern-react-kit";
import type { ClosureSeverity, ConstructionPhase } from "../types/index.ts";
import type { ConstructionSiteRecency } from "../shared/recency.ts";
import {
  getClosureBadgeVariant,
  getClosureLabel,
  getConstructionPhaseBadgeVariant,
  getConstructionPhaseLabel,
} from "../shared/construction-site-labels.ts";

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

/** Marks a record the pipeline first saw within the visitor's time window. */
export function ConstructionSiteRecencyBadge({
  recency,
}: {
  recency: ConstructionSiteRecency;
}) {
  if (recency === null) return null;
  return <KernBadge variant="danger" label="Neu" />;
}

interface ConstructionSiteBadgesProps {
  phase: ConstructionPhase;
  closure: ClosureSeverity;
  /** Leads the row when the record is new in the visitor's window. */
  recency?: ConstructionSiteRecency;
  className?: string;
}

/**
 * The badge row shown above a construction site wherever it is summarized, so
 * cards, the map selection and the detail page describe a record identically.
 */
export function ConstructionSiteBadges({
  phase,
  closure,
  recency = null,
  className,
}: ConstructionSiteBadgesProps) {
  return (
    <div className={className}>
      <ConstructionSiteRecencyBadge recency={recency} />
      <ConstructionPhaseBadge phase={phase} />
      <ClosureBadge closure={closure} />
    </div>
  );
}
