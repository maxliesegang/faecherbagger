import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { ClosureSeverity } from "../types/index.ts";
import {
  CLOSURE_SEVERITY_COLORS,
  getClosureLabel,
} from "../lib/construction-site-labels.ts";
import { AppIcon } from "./AppIcon.tsx";
import "./ConstructionSiteCard.css";

interface ConstructionSiteCardProps {
  title: string;
  closure: ClosureSeverity;
  /** Omitted for a site no longer in the data: the card then has no link. */
  detailsHref?: string;
  onDetailsOpen?: () => void;
  /** Short facts after the closure, e.g. the period and the place. */
  facts: readonly ReactNode[];
  /** Replaces the closure label as the first fact, e.g. "Geändert". */
  lead?: string;
  isFollowed?: boolean;
  isChanged?: boolean;
}

/** Leaves modified clicks to the browser so "open in new tab" keeps working. */
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * One construction site in a list: name, then a single line of facts.
 *
 * The bar on the left carries the closure colour and the first fact repeats it
 * in words, so colour is never the only signal. The whole card is the link
 * target, but only the name is the link, so a screen reader hears one link per
 * site rather than a paragraph.
 */
export function ConstructionSiteCard({
  title,
  closure,
  detailsHref,
  onDetailsOpen,
  facts,
  lead,
  isFollowed = false,
  isChanged = false,
}: ConstructionSiteCardProps) {
  return (
    <li
      className="site-card"
      style={
        { "--closure-color": CLOSURE_SEVERITY_COLORS[closure] } as CSSProperties
      }
    >
      <p className="site-card__title">
        {detailsHref ? (
          <a
            className="site-card__link"
            href={detailsHref}
            onClick={(event) => {
              if (!onDetailsOpen || !isPlainClick(event)) return;
              event.preventDefault();
              onDetailsOpen();
            }}
          >
            {title}
          </a>
        ) : (
          <span>{title}</span>
        )}
        {isFollowed && (
          <span className="site-card__star" title="Gemerkt">
            <AppIcon name="star" isFilled />
            <span className="kern-sr-only">Gemerkt</span>
          </span>
        )}
        {isChanged && <span className="site-card__new">Neu</span>}
      </p>
      <p className="site-card__meta">
        <span className="site-card__lead">{lead ?? getClosureLabel(closure)}</span>
        {facts.map((fact, index) => (
          <span key={index}>{fact}</span>
        ))}
      </p>
    </li>
  );
}
