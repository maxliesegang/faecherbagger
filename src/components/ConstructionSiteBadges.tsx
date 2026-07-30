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

/**
 * Marks a record the pipeline first saw within the visitor's time window.
 *
 * Not a `danger` badge any more, and not a KERN badge at all: red is what the
 * app says when a street is closed, and spending it on "we learned about this
 * recently" made bookkeeping look like an emergency. A solid accent chip stands
 * out from the outlined badges beside it without claiming severity.
 */
export function ConstructionSiteRecencyBadge({
  recency,
}: {
  recency: ConstructionSiteRecency;
}) {
  if (recency === null) return null;
  return <span className="site-badge-new">Neu</span>;
}

interface ConstructionSiteBadgesProps {
  phase: ConstructionPhase;
  closure: ClosureSeverity;
  /** Closes the row when the record is new in the visitor's window. */
  recency?: ConstructionSiteRecency;
  /**
   * Whether to state the phase. The surroundings cards turn it off: they carry
   * a timing sentence that says "Läuft seit gestern" or "Beginnt in 4 Tagen",
   * which is the same fact at a resolution a two-value badge cannot reach, and
   * saying it twice cost a line on every card.
   */
  showPhase?: boolean;
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
  showPhase = true,
  className,
}: ConstructionSiteBadgesProps) {
  return (
    <div className={className}>
      {/* Severity leads: it is the only one of the three that can change what
          a visitor does in the next hour. */}
      <ClosureBadge closure={closure} />
      {showPhase && <ConstructionPhaseBadge phase={phase} />}
      <ConstructionSiteRecencyBadge recency={recency} />
    </div>
  );
}
