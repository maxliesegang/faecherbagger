import { useEffect, useRef } from "react";
import { KernAlert, KernIcon } from "@kern-ux-annex/kern-react-kit";
import type { LegalPageId } from "../lib/legal-pages.ts";
import { getLegalPageTitle } from "../lib/legal-pages.ts";
import {
  isSiteOperatorConfigured,
  SITE_OPERATOR,
  UNOFFICIAL_NOTICE,
} from "../lib/site-operator.ts";
import "./LegalPage.css";

interface LegalPageProps {
  pageId: LegalPageId;
  overviewHref: string;
  onBack: () => void;
}

/**
 * Imprint, privacy notice and accessibility statement.
 *
 * The substance that follows from *this* application — which data it processes,
 * where it sends requests, what the known accessibility gaps are — is written
 * out here, because only the code knows it. Everything that is a statement
 * about the operator comes from {@link SITE_OPERATOR}; when that is unset the
 * page says the deployment is incomplete rather than showing an invented name.
 */
export function LegalPage({ pageId, overviewHref, onBack }: LegalPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const title = getLegalPageTitle(pageId);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} – Fächerbagger`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [pageId]);

  return (
    <article className="legal-page" aria-labelledby="legal-page-title">
      <a
        className="legal-page__back"
        href={overviewHref}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          onBack();
        }}
      >
        <KernIcon icon="arrow-back" />
        Zur Übersicht
      </a>

      <h1 id="legal-page-title" ref={headingRef} tabIndex={-1}>
        {title}
      </h1>

      {!isSiteOperatorConfigured && (
        <KernAlert variant="warning" title="Angaben zum Betreiber fehlen">
          Vor der Veröffentlichung müssen die Build-Variablen
          <code> VITE_OPERATOR_NAME</code>, <code>VITE_OPERATOR_ADDRESS</code>{" "}
          und <code>VITE_OPERATOR_EMAIL</code> gesetzt werden.
        </KernAlert>
      )}

      {pageId === "imprint" && <ImprintContent />}
      {pageId === "privacy" && <PrivacyContent />}
      {pageId === "accessibility" && <AccessibilityContent />}
    </article>
  );
}

function OperatorDetails() {
  if (!isSiteOperatorConfigured) return null;
  return (
    <address className="legal-page__address">
      {SITE_OPERATOR.name}
      {SITE_OPERATOR.address.split("\n").map((line) => (
        <span key={line}>{line}</span>
      ))}
      <a href={`mailto:${SITE_OPERATOR.email}`}>{SITE_OPERATOR.email}</a>
    </address>
  );
}

function ImprintContent() {
  return (
    <>
      <h2>Verantwortlich für den Inhalt</h2>
      <OperatorDetails />

      <h2>Art des Angebots</h2>
      <p>
        Fächerbagger ist ein privates Angebot und
        <strong> kein amtliches Angebot</strong> der Stadt Karlsruhe, einer
        anderen Kommune oder der TechnologieRegion Karlsruhe. Diese betreiben
        oder prüfen es nicht.
      </p>

      <h2>Datenquelle</h2>
      <p>
        Die Baustellendaten stammen aus dem Mobilitätsportal der
        TechnologieRegion Karlsruhe (WFS des TRK-GeoServers) und werden
        regelmäßig automatisch abgerufen. Die Rechte liegen bei den jeweils
        angegebenen Quellen.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Alle Angaben ohne Gewähr und ohne Rechtsverbindlichkeit. Es gelten
        allein die Anordnungen und die Beschilderung vor Ort. Für
        Vollständigkeit, Richtigkeit und Aktualität der Daten wird nicht
        gehaftet.
      </p>

      <h2>Quellcode und Lizenz</h2>
      <p>
        Der Quellcode ist öffentlich und steht unter der EUPL-1.2.
      </p>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <h2>Verantwortliche Stelle</h2>
      <OperatorDetails />

      <h2>Grundsatz</h2>
      <p>
        Fächerbagger verwendet keine Werbung und keine Dienste zur Analyse
        Ihres Nutzungsverhaltens. Ihre gespeicherten Orte und Einstellungen
        bleiben auf Ihrem Gerät. Für einzelne Funktionen werden die unten
        beschriebenen Dienste eingebunden.
      </p>

      <h2>Aufruf der Seite</h2>
      <p>
        Beim Aufruf überträgt Ihr Browser technisch notwendige Daten wie Ihre
        IP-Adresse an GitHub Pages, den Hosting-Dienst dieser Website.
        Rechtsgrundlage ist Art. 6 Abs. 1
        lit. f DSGVO (Bereitstellung des Angebots).
      </p>

      <h2>Kartendarstellung</h2>
      <p>
        Kartenkacheln und Kartenstil kommen von{" "}
        <a href="https://openfreemap.org/">OpenFreeMap</a>. Dabei erhält dieser
        Dienst Ihre IP-Adresse und die angeforderten Kartenbereiche, aber
        erst, wenn eine Karte angezeigt wird. OpenFreeMap kann Cloudflare zur
        Auslieferung einsetzen. Ihre eingezeichneten Gebiete werden nicht als
        eigene Daten übertragen.{" "}
        <a href="https://openfreemap.org/privacy/">Datenschutz bei OpenFreeMap</a>
      </p>

      <h2>Standort</h2>
      <p>
        Ihren Standort fragt die App nur auf Ihre Anforderung ab. Sie verwendet
        ihn auf Ihrem Gerät zur Entfernungssortierung und zur Wahl des
        Kartenausschnitts. Wenn eine Karte angezeigt wird, werden die dafür
        benötigten Kartenbereiche beim Kartendienst angefordert. Sie können
        die Standortfreigabe jederzeit in Ihrem Browser widerrufen.
      </p>

      <h2>Adresssuche</h2>
      <p>
        Wenn Sie mindestens drei Zeichen eingeben, sendet Ihr Browser den
        Suchtext an den öffentlichen Photon-Dienst von komoot. Dabei erhält
        der Dienst auch Ihre IP-Adresse. Die Suche bevorzugt Karlsruhe;
        Ihr Gerätestandort und gespeicherte Gebiete werden nicht mitgesendet.
        Suchtexte werden von Fächerbagger nicht gespeichert. Sie können den
        Mittelpunkt auch auf der Karte wählen.
      </p>

      <h2>Streckenberechnung</h2>
      <p>
        Wenn Sie eine Strecke aus Start und Ziel berechnen lassen, sendet Ihr
        Browser einmalig diese beiden Punkte und das Verkehrsmittel an den
        Routing-Dienst der{" "}
        <a href="https://www.fossgis.de/">FOSSGIS e.&nbsp;V.</a>{" "}
        (routing.openstreetmap.de). Dabei erhält der Dienst auch Ihre
        IP-Adresse. Gespeichert wird nur die berechnete Linie, und zwar in
        Ihrem Browser. Ohne Übertragung geht es, wenn Sie die Strecke selbst
        auf der Karte nachziehen.
      </p>

      <h2>Benachrichtigungen (Web Push)</h2>
      <p>
        <strong>Ihre gespeicherten Orte bleiben auf Ihrem Gerät.</strong>{" "}
        Gebiete, Strecken, Straßen und beobachtete Baustellen werden nicht an
        den Benachrichtigungsdienst übertragen. Ihr Gerät prüft selbst, welche
        Meldungen zu Ihrer Auswahl passen.
      </p>
      <p>
        Wenn Sie Benachrichtigungen einschalten, speichert unser
        Benachrichtigungsdienst bei Cloudflare eine technische Zustelladresse
        und die zugehörigen Schlüssel. Diese Adresse ermöglicht die Zustellung
        an Ihr Browser-Abo und dessen Wiedererkennung. Gespeichert werden
        außerdem technische Zeitangaben zur Anmeldung und Zustellung.
        Bei Safari und Firefox kommt das Datum der nächsten geplanten
        Nachricht hinzu. Persönliche Meldungen werden auf Ihrem Gerät erzeugt.
      </p>
      <p>
        Beim Kontakt mit dem Dienst verarbeitet Cloudflare auch Ihre
        IP-Adresse und technische Verbindungsdaten. Für den Versand werden
        die Zustelldaten außerdem auf einem GitHub-Actions-Server verarbeitet.
        Die Zustellung erfolgt über den Push-Dienst Ihres Browsers, je nach
        Browser von Apple, Google oder Mozilla.
      </p>
      <p>
        Die Anmeldung erfolgt mit Ihrer Einwilligung (Art. 6 Abs. 1 lit. a
        DSGVO). Sie können diese jederzeit durch Ausschalten der
        Benachrichtigungen widerrufen. Dabei wird die Zustelladresse aus der
        laufenden Datenbank gelöscht. Ist der Dienst nicht erreichbar, bleibt
        ein Löschauftrag auf Ihrem Gerät und wird beim nächsten App-Aufruf oder
        bei erneuter Verbindung wieder versucht. Dafür müssen die lokalen
        App-Daten erhalten bleiben. Ungültige Anmeldungen werden entfernt,
        sobald der Push-Dienst sie beim Versand als ungültig meldet.
      </p>
      <p>
        In zeitlich begrenzten Datenbanksicherungen können ältere Daten noch
        bis zu 30 Tage enthalten sein. Automatische Aufrufprotokolle und
        Ablaufaufzeichnungen der Push-API sind ausgeschaltet. Für die
        Fehlerdiagnose protokollieren wir nur allgemeine Fehlercodes, keine
        Zustelladressen oder Schlüssel. Diese Fehlerprotokolle werden bei
        Cloudflare je nach Tarif bis zu sieben Tage gespeichert.
      </p>
      <p>
        Cloudflare, Inc. und GitHub, Inc. sind US-Anbieter. Die Verarbeitung
        kann auch außerhalb der EU stattfinden. Cloudflare beschreibt die
        Schutzmaßnahmen für internationale Übermittlungen in seinen{" "}
        <a href="https://www.cloudflare.com/trust-hub/gdpr/">Datenschutzinformationen</a>{" "}
        und seinem{" "}
        <a href="https://www.cloudflare.com/cloudflare-customer-dpa/">
          Vertrag zur Auftragsverarbeitung
        </a>. Informationen zu GitHub finden Sie in dessen{" "}
        <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement">
          Datenschutzerklärung
        </a>.
      </p>

      <h2>Lokale Speicherung</h2>
      <p>
        Gebiete, beobachtete Baustellen und Einstellungen liegen in der
        Browser-Datenbank (IndexedDB). So bleiben sie erhalten, und der
        Hintergrunddienst kann passende Meldungen auswählen. Es gibt keine
        Analyse-Cookies. Sie können die Daten jederzeit in Ihren
        Browsereinstellungen löschen.
      </p>

      <h2>Ihre Rechte</h2>
      <p>
        Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung
        der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht,
        eine erteilte Einwilligung zu widerrufen. Außerdem steht Ihnen ein
        Beschwerderecht bei einer Datenschutzaufsichtsbehörde zu.
      </p>
    </>
  );
}

function AccessibilityContent() {
  return (
    <>
      <h2>Geltungsbereich</h2>
      <p>
        Diese Erklärung gilt für Fächerbagger. Ziel sind die Anforderungen der
        BITV 2.0 bzw. EN 301 549 (WCAG 2.1, Stufe AA).
      </p>

      <h2>Stand der Vereinbarkeit</h2>
      <p>
        Das Angebot ist mit den genannten Anforderungen{" "}
        <strong>teilweise vereinbar</strong>. Folgende Inhalte sind nicht
        barrierefrei.
      </p>

      <h2>Nicht barrierefreie Inhalte</h2>
      <ul>
        <li>
          <strong>Interaktive Karte:</strong> Die Marker liegen in einem Canvas
          und sind per Tastatur nicht erreichbar. Die Listenansicht bietet
          dieselben Daten, Filter und Sortierungen; ein Hinweis am Anfang der
          Karte führt dorthin.
        </li>
        <li>
          <strong>Kartenkacheln:</strong> Die Hintergrundkarte stammt von einem
          Drittanbieter. Ihre Kontraste können wir nicht beeinflussen.
        </li>
        <li>
          <strong>Quelltexte:</strong> Freitexte zu Baustellen stammen
          unverändert aus der Datenquelle. Ihre Verständlichkeit können wir
          nicht beeinflussen.
        </li>
      </ul>

      <h2>Erstellung dieser Erklärung</h2>
      <p>
        Die Erklärung beruht auf einer Selbstbewertung des Betreibers.
      </p>

      <h2>Barriere melden</h2>
      <p>
        Ist Ihnen eine Barriere aufgefallen, oder brauchen Sie eine Information
        in anderer Form?{" "}
        {SITE_OPERATOR.accessibilityContact ? (
          <a href={`mailto:${SITE_OPERATOR.accessibilityContact}`}>
            Schreiben Sie uns eine E-Mail.
          </a>
        ) : (
          "Für diese Bereitstellung ist noch kein Kontakt hinterlegt."
        )}
      </p>

      <h2>Hinweis</h2>
      <p>{UNOFFICIAL_NOTICE}</p>
    </>
  );
}
