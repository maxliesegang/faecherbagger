/** The same short explanation appears before every push activation. */
export function PushPrivacyHint({ className }: { className: string }) {
  return (
    <p className={className}>
      Ihre gespeicherten Orte und Ihre Auswahl bleiben auf diesem Gerät.
      Für Benachrichtigungen speichern wir eine technische Zustelladresse
      bei Cloudflare. Die Zustellung erfolgt über den Push-Dienst Ihres
      Browsers. Sie können Benachrichtigungen jederzeit ausschalten.{" "}
      <a href={`${import.meta.env.BASE_URL}?seite=datenschutz`}>
        Mehr zum Datenschutz
      </a>
    </p>
  );
}
