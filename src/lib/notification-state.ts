/**
 * Why the visitor can or cannot receive notifications right now. Lives here
 * rather than with the hook that produces it, so this module stays free of the
 * DOM and can be tested on its own.
 */
export type PushNotificationStatus =
  | "unsupported"
  | "unconfigured"
  | "blocked"
  | "disabled"
  | "enabled";

/**
 * Whether asking this visitor to switch notifications on can succeed at all:
 * the browser and deployment must support it, permission must not be blocked,
 * and on iOS the app has to be installed first.
 */
export function canOfferPushNotifications(
  status: PushNotificationStatus,
  isInstalled: boolean,
  isIosDevice: boolean,
): boolean {
  if (status !== "disabled" && status !== "enabled") return false;
  return !isIosDevice || isInstalled;
}

/**
 * What the visitor can do about notifications right now, in one word. Every
 * surface renders it as a `notification-tone--*` class, which is the single
 * place that turns a tone into a colour.
 *
 * `"unavailable"` is the one tone with no next step at all — this browser or
 * this deployment simply cannot do it — which is why a surface may drop the
 * state entirely on it. Everything else, including `"needs-area"` and
 * `"needs-app"`, is one action away and has to stay visible.
 */
export type NotificationStateTone =
  | "on"
  | "off"
  | "needs-area"
  | "needs-app"
  | "blocked"
  | "unavailable";

export interface NotificationStateDescription {
  tone: NotificationStateTone;
  /** Two or three words, for the tab bar and the scope chips. */
  shortLabel: string;
  /** The state as a sentence-sized headline. */
  headline: string;
  /** What it means and, where there is one, what to do about it. */
  description: string;
  /**
   * The label of the switch that changes this state, or `null` when offering
   * one would lead nowhere. One field rather than a flag plus a label, so a
   * surface cannot render an action the state does not actually allow.
   */
  toggleLabel: string | null;
}

export interface NotificationStateInput {
  status: PushNotificationStatus;
  /** Whether the app runs as an installed PWA; iOS only allows push there. */
  isInstalled: boolean;
  /** Push needs an area to match new construction sites against. */
  hasHomeArea: boolean;
  /** Whether this is an iPhone or iPad, where the hint has to name Safari. */
  isIosDevice: boolean;
}

/**
 * Turns the push status, the installation and the watched area into the single
 * description every notification surface renders.
 *
 * The combination used to be re-derived with nested ternaries in each place
 * that mentioned notifications, which is how the surroundings screen came to
 * promise a switch that the settings panel then refused to show.
 */
export function describeNotificationState({
  status,
  isInstalled,
  hasHomeArea,
  isIosDevice,
}: NotificationStateInput): NotificationStateDescription {
  if (!canOfferPushNotifications(status, isInstalled, isIosDevice)) {
    if (status === "blocked") {
      return {
        tone: "blocked",
        shortLabel: "Blockiert",
        headline: "Benachrichtigungen sind blockiert",
        description:
          "Diese Seite darf keine Benachrichtigungen senden. Geben Sie sie in den Einstellungen Ihres Browsers oder Geräts wieder frei.",
        toggleLabel: null,
      };
    }
    if (status === "unconfigured") {
      return {
        tone: "unavailable",
        shortLabel: "Nicht verfügbar",
        headline: "Der Benachrichtigungsdienst ist nicht eingerichtet",
        description:
          "Für diese Bereitstellung ist kein Benachrichtigungsdienst konfiguriert. Alles andere funktioniert trotzdem.",
        toggleLabel: null,
      };
    }
    if (isIosDevice) {
      return {
        tone: "needs-app",
        shortLabel: "App nötig",
        headline: "Erst zum Home-Bildschirm hinzufügen",
        description:
          "Auf iPhone und iPad sind Benachrichtigungen nur in der installierten App möglich: in Safari „Teilen“ und dann „Zum Home-Bildschirm“ wählen.",
        toggleLabel: null,
      };
    }
    return {
      tone: "unavailable",
      shortLabel: "Nicht verfügbar",
      headline: "Dieser Browser kann keine Benachrichtigungen empfangen",
      description:
        "Sie können Ihre Umgebung trotzdem jederzeit hier in der App nachsehen oder den RSS-Feed abonnieren.",
      toggleLabel: null,
    };
  }

  if (status === "enabled") {
    return {
      tone: "on",
      shortLabel: "Eingeschaltet",
      headline: "Benachrichtigungen sind eingeschaltet",
      description:
        "Dieses Gerät erhält eine Meldung, sobald in Ihrem Gebiet eine neue Baustelle auftaucht — auch wenn die App geschlossen ist.",
      toggleLabel: "Benachrichtigungen ausschalten",
    };
  }

  if (!hasHomeArea) {
    return {
      tone: "needs-area",
      shortLabel: "Gebiet fehlt",
      headline: "Legen Sie zuerst Ihr Gebiet fest",
      description:
        "Benachrichtigungen brauchen einen Mittelpunkt und einen Radius. Danach lassen sie sich mit einem Klick einschalten.",
      toggleLabel: null,
    };
  }

  return {
    tone: "off",
    shortLabel: "Ausgeschaltet",
    headline: "Benachrichtigungen sind ausgeschaltet",
    description:
      "Lassen Sie sich melden, sobald in Ihrem Gebiet eine neue Baustelle auftaucht — auch wenn die App geschlossen ist.",
    toggleLabel: "Benachrichtigungen einschalten",
  };
}
