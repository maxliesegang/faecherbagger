import { KernButton, KernText } from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import { useView } from "../context/ViewContext.tsx";
import { useNotificationState } from "../hooks/useNotificationState.ts";
import "./NotificationStatusCard.css";

interface NotificationStatusCardProps {
  /**
   * `"compact"` states the situation and sends the visitor to the settings;
   * `"detailed"` is the settings screen itself and carries the switch.
   */
  variant: "compact" | "detailed";
}

/**
 * Says whether this device would be told about a new construction site nearby,
 * and offers the one action that changes it.
 *
 * The same card in both places on purpose: the compact one keeps the state
 * visible on the screen the visitor actually opens, and tapping it lands on the
 * detailed one, which says the identical sentence — no re-derived wording that
 * can promise something the switch then refuses. Every word and the tone come
 * from {@link useNotificationState}; this component only wires the actions.
 */
export function NotificationStatusCard({
  variant,
}: NotificationStatusCardProps) {
  const { area: homeArea, push: pushController } = usePersonal();
  const { showNotificationSettings } = useView();
  const notificationState = useNotificationState();
  const isDetailed = variant === "detailed";
  const isOn = notificationState.tone === "on";

  // `"unavailable"` is the only state with no next step, so the compact card
  // would be a permanent line of noise above the answer the visitor came for.
  // The settings screen still explains the situation to anyone who looks.
  if (!isDetailed && notificationState.tone === "unavailable") return null;

  const toggleNotifications = () => {
    if (isOn) {
      void pushController.disableNotifications();
      return;
    }
    if (homeArea) void pushController.enableNotifications(homeArea);
  };

  return (
    <div
      className={`notification-state notification-state--${variant} notification-tone--${notificationState.tone}`}
    >
      <p className="notification-state__headline">
        <span className="notification-state__dot" aria-hidden="true" />
        {notificationState.headline}
      </p>

      {isDetailed && (
        <p className="notification-state__description">
          {notificationState.description}
        </p>
      )}

      <div className="notification-state__actions">
        {isDetailed ? (
          notificationState.toggleLabel && (
            <KernButton
              type="button"
              variant={isOn ? "tertiary" : "primary"}
              label={notificationState.toggleLabel}
              disabled={pushController.isBusy}
              onClick={toggleNotifications}
            />
          )
        ) : (
          <KernButton
            type="button"
            variant={isOn ? "tertiary" : "secondary"}
            label={isOn ? "Einstellungen" : "Benachrichtigungen einrichten"}
            onClick={showNotificationSettings}
          />
        )}
      </div>

      {/*
       * The outcome of the last attempt belongs to the switch, so it is only
       * ever shown where the switch is — not on the screen the visitor opened
       * to read about their surroundings.
       */}
      {isDetailed && pushController.feedbackMessage && (
        <KernText className="notification-state__feedback" aria-live="polite">
          {pushController.feedbackMessage}
        </KernText>
      )}
    </div>
  );
}
