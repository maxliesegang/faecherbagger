/**
 * The few symbols KERN's icon set lacks: navigation and the notification bell.
 *
 * Drawn here as simple strokes on a 24-unit grid rather than pulled from an
 * icon library, so they match KERN's line weight and add no dependency.
 * Decorative by default — every use sits next to a text label.
 */
import type { NotificationAreaKind } from "../types/index.ts";

export type AppIconName =
  | "person-pin"
  | "map"
  | "settings"
  | "bell"
  | "star"
  | "share"
  | "area-circle"
  | "area-corridor"
  | "area-polygon"
  | "area-street"
  | "area-municipality";

const PATHS: Record<AppIconName, string> = {
  // A location pin with a dot: "places that matter to me".
  "person-pin":
    "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  map: "M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5L9 4z M9 4v13.5 M15 6.5V20",
  // Three sliders: plainer than a cog and reads as "adjust".
  settings:
    "M4 7h10 M18 7h2 M4 17h4 M12 17h8 M4 12h2 M10 12h10 M16 5v4 M10 15v4 M8 10v4",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z M10 20.5a2 2 0 0 0 4 0",
  // A box with an arrow out of it: the iOS "Teilen" button.
  share: "M8.5 6.5 12 3l3.5 3.5 M12 3v11 M8.5 10H6v10.5h12V10h-2.5",
  star: "m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.5z",
  // Watched-area kinds, so a list of places reads at a glance.
  // A ring around a point: a radius.
  "area-circle":
    "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  // Two ends joined by a winding path: a route.
  "area-corridor":
    "M6 16.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M18 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M8.5 19h8a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7h8",
  // A free outline: a drawn area.
  "area-polygon": "M12 3.5 20.5 9.5 17.3 20H6.7L3.5 9.5z",
  // A signpost: a street.
  "area-street": "M12 3v18 M5 5.5h11l2.5 2.5L16 10.5H5z M19 13.5H8L5.5 16 8 18.5h11z",
  // Gabled houses: a municipality.
  "area-municipality":
    "M3.5 20.5h17 M5.5 20.5V11l4-3.5 4 3.5v9.5 M13.5 20.5V8l3-2.5 3 2.5v12.5 M8.5 20.5v-4h2v4",
};

/** The icon for each kind of watched area. */
export const NOTIFICATION_AREA_ICON: Record<NotificationAreaKind, AppIconName> = {
  circle: "area-circle",
  corridor: "area-corridor",
  polygon: "area-polygon",
  street: "area-street",
  municipality: "area-municipality",
};

interface AppIconProps {
  name: AppIconName;
  /** Filled rather than outlined, e.g. for a pressed star. */
  isFilled?: boolean;
  className?: string;
}

export function AppIcon({ name, isFilled = false, className }: AppIconProps) {
  return (
    <svg
      className={className ? `app-icon ${className}` : "app-icon"}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
      fill={isFilled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
