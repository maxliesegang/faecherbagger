import { KernButton, KernText } from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import { useNotificationState } from "../hooks/useNotificationState.ts";
import "./NotificationStatusCard.css";

/**
 * Says whether this device would be told about a new construction site nearby,
 * and carries the switch that changes it.
 *
 * The only place in the app that spells the state out. The surroundings screen
 * used to repeat it as a compact copy above its answer, which meant the same
 * sentence competed with the list the visitor came for — the tab dot says
 * whether anything needs attention, and this card is one tap away. Every word
 * and the tone come from {@link useNotificationState}; this component only wires
 * the actions.
 */
export function NotificationStatusCard() {
  const { area: homeArea, push: pushController } = usePersonal();
  const notificationState = useNotificationState();
  const isOn = notificationState.tone === "on";

  const toggleNotifications = () => {
    if (isOn) {
      void pushController.disableNotifications();
      return;
    }
    if (homeArea) void pushController.enableNotifications(homeArea);
  };

  return (
    <div
      className={`notification-state notification-tone--${notificationState.tone}`}
    >
      <p className="notification-state__headline">
        <span className="notification-state__dot" aria-hidden="true" />
        {notificationState.headline}
      </p>

      <p className="notification-state__description">
        {notificationState.description}
      </p>

      {notificationState.toggleLabel && (
        <div className="notification-state__actions">
          <KernButton
            type="button"
            variant={isOn ? "tertiary" : "primary"}
            label={notificationState.toggleLabel}
            disabled={pushController.isBusy}
            onClick={toggleNotifications}
          />
        </div>
      )}

      {/* The outcome of the last attempt, next to the switch that made it. */}
      {pushController.feedbackMessage && (
        <KernText className="notification-state__feedback" aria-live="polite">
          {pushController.feedbackMessage}
        </KernText>
      )}
    </div>
  );
}
