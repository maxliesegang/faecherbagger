import { KernRadioGroup, KernText } from "@kern-ux-annex/kern-react-kit";
import { usePersonal } from "../context/PersonalContext.tsx";
import {
  getNotificationClosureLevelHint,
  getNotificationClosureLevelLabel,
} from "../shared/construction-site-labels.ts";
import {
  NOTIFICATION_CLOSURE_LEVELS,
  isNotificationClosureLevel,
} from "../shared/notification-relevance.ts";
import "./NotificationClosureLevelSetup.css";

/**
 * How disruptive a construction site has to be before this device is
 * interrupted.
 *
 * The second half of what a notification is: the area says where to look, this
 * says what is worth saying. Without it the service reported every record that
 * was new to the pipeline inside the radius, which in Karlsruhe means mostly
 * private scaffolding permits at a single house number — the kind of message
 * that gets notifications switched off entirely rather than read.
 *
 * Saved on change rather than behind a button, unlike the radius: there is no
 * dragging here, one click is the whole decision, and the transfer to the
 * service reports itself through the switch's own message channel.
 */
export function NotificationClosureLevelSetup() {
  const { push: pushController } = usePersonal();
  const { closureLevel, setClosureLevel } = pushController;

  return (
    <div className="closure-level">
      <KernRadioGroup
        name="notification-closure-level"
        legend="Melden ab"
        items={NOTIFICATION_CLOSURE_LEVELS.map((level) => ({
          value: level,
          label: getNotificationClosureLevelLabel(level),
        }))}
        selected={closureLevel}
        onChange={(value) => {
          // The control hands back a plain string; anything else would be a
          // KERN release changing its contract, not a value to act on.
          if (isNotificationClosureLevel(value)) setClosureLevel(value);
        }}
      />
      <KernText muted className="closure-level__hint" aria-live="polite">
        {getNotificationClosureLevelHint(closureLevel)}
      </KernText>
    </div>
  );
}
