import type { MouseEvent, ReactNode } from "react";

interface ClientNavigationLinkProps {
  /** The shareable destination; always a real, openable URL. */
  href: string;
  /** Runs instead of a page load when the app handles the click itself. */
  onNavigate: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * True for a click the app may handle in place. Middle clicks, modified clicks
 * ("open in new tab/window", "download") and context menus keep the browser's
 * own behavior, which is what makes every in-app destination shareable.
 */
const isPlainLeftClick = (event: MouseEvent): boolean =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * A link the app navigates itself while keeping the browser's link semantics:
 * a real `href` for the status bar, the context menu and new-tab clicks.
 */
export function ClientNavigationLink({
  href,
  onNavigate,
  className,
  children,
}: ClientNavigationLinkProps) {
  return (
    <a
      className={className}
      href={href}
      onClick={(event) => {
        if (!isPlainLeftClick(event)) return;
        event.preventDefault();
        onNavigate();
      }}
    >
      {children}
    </a>
  );
}
