import { KernButton } from "@kern-ux-annex/kern-react-kit";
import type {
  PushNotificationsController,
  PushUnavailableReason,
} from "../hooks/usePushNotifications.ts";
import { AppIcon } from "./AppIcon.tsx";
import "./NotificationSwitch.css";

const UNAVAILABLE_HINTS: Record<PushUnavailableReason, string> = {
  unconfigured: "Benachrichtigungen sind auf dieser Seite nicht eingerichtet.",
  unsupported: "Ihr Browser unterstützt keine Benachrichtigungen.",
  "needs-install":
    "Auf iPhone und iPad: In Safari „Teilen“ › „Zum Home-Bildschirm“ wählen, dann die App von dort öffnen.",
  denied: "Benachrichtigungen sind blockiert. Erlauben Sie sie in den Browser-Einstellungen.",
};

interface NotificationSwitchProps {
  pushNotifications: PushNotificationsController;
  /** Compact banner on the personal screen; full row in the settings. */
  variant?: "banner" | "row";
}

/**
 * The one place that says whether notifications are on and offers to change
 * it. Every surface uses this, so the wording and the server-backed state
 * cannot drift apart between screens.
 */
export function NotificationSwitch({
  pushNotifications,
  variant = "row",
}: NotificationSwitchProps) {
  const {
    subscriptionState,
    isActive,
    unavailableReason,
    isBusy,
    feedbackMessage,
  } = pushNotifications;

  // The banner only appears when the visitor can do something about it.
  if (
    variant === "banner" &&
    (isActive ||
      subscriptionState === "unknown" ||
      unavailableReason === "unconfigured" ||
      unavailableReason === "unsupported")
  ) {
    return null;
  }

  return (
    <div className={`notification-switch notification-switch--${variant}`}>
      <AppIcon name="bell" className="notification-switch__icon" />
      <div className="notification-switch__text">
        <p className="notification-switch__state">
          {subscriptionState === "unknown"
            ? "Benachrichtigungen werden geprüft …"
            : isActive
              ? "Benachrichtigungen sind an"
              : "Benachrichtigungen sind aus"}
        </p>
        {!isActive && unavailableReason && (
          <p className="notification-switch__hint">
            {UNAVAILABLE_HINTS[unavailableReason]}
          </p>
        )}
        {!isActive && !unavailableReason && variant === "banner" && (
          <p className="notification-switch__hint">
            Wir melden neue Baustellen an Ihren Orten.
          </p>
        )}
        {variant === "row" && feedbackMessage && (
          <p className="notification-switch__hint" role="status">
            {feedbackMessage}
          </p>
        )}
      </div>
      {!isActive && !unavailableReason && subscriptionState !== "unknown" && (
        <KernButton
          type="button"
          variant={variant === "banner" ? "primary" : "secondary"}
          label="Einschalten"
          disabled={isBusy}
          onClick={() => void pushNotifications.enable()}
        />
      )}
      {isActive && variant === "row" && (
        <KernButton
          type="button"
          variant="tertiary"
          label="Ausschalten"
          disabled={isBusy}
          onClick={() => void pushNotifications.disable()}
        />
      )}
    </div>
  );
}
