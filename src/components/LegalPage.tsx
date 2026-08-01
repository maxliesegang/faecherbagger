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
        Zur Baustellenübersicht
      </a>

      <h1 id="legal-page-title" ref={headingRef} tabIndex={-1}>
        {title}
      </h1>

      {!isSiteOperatorConfigured && (
        <KernAlert variant="warning" title="Angaben zum Betreiber fehlen">
          Diese Bereitstellung wurde noch nicht vollständig konfiguriert. Die
            verantwortliche Stelle muss über die Build-Variablen
            <code> VITE_OPERATOR_NAME</code>, <code>VITE_OPERATOR_ADDRESS</code>{" "}
            und <code>VITE_OPERATOR_EMAIL</code> hinterlegt werden, bevor das
            Angebot öffentlich betrieben wird.
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
        Fächerbagger ist ein unabhängiges, privat betriebenes Angebot. Es ist
        <strong> kein amtliches Angebot</strong> der Stadt Karlsruhe, einer
        anderen Kommune oder der TechnologieRegion Karlsruhe und wird von diesen
        weder betrieben noch geprüft.
      </p>

      <h2>Datenquelle</h2>
      <p>
        Die dargestellten Baustellendaten stammen aus dem Mobilitätsportal der
        TechnologieRegion Karlsruhe (WFS des TRK-GeoServers) und werden
        regelmäßig automatisiert abgerufen. Die Rechte an den Daten liegen bei
        den jeweils angegebenen Quellen.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Die Angaben erfolgen ohne Gewähr und ohne Rechtsverbindlichkeit.
        Maßgeblich sind ausschließlich die Anordnungen und Beschilderungen vor
        Ort. Für Vollständigkeit, Richtigkeit und Aktualität der übernommenen
        Daten wird keine Haftung übernommen.
      </p>

      <h2>Quellcode und Lizenz</h2>
      <p>
        Der Quellcode dieses Angebots ist öffentlich und steht unter der
        EUPL-1.2.
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
        Fächerbagger ist eine statische Anwendung. Es gibt keine Benutzerkonten,
        keine Analyse- oder Tracking-Dienste und keine Werbung. Die
        Baustellendaten werden als unveränderliche Dateien ausgeliefert; welche
        Filter Sie setzen, verlässt Ihr Gerät nicht.
      </p>

      <h2>Aufruf der Seite</h2>
      <p>
        Beim Abruf der Seite überträgt Ihr Browser technisch notwendige Daten
        (unter anderem Ihre IP-Adresse) an den Hosting-Dienst, über den das
        Angebot ausgeliefert wird. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f
        DSGVO (Bereitstellung des Angebots).
      </p>

      <h2>Kartendarstellung</h2>
      <p>
        Für die Karte werden Kartenkacheln und der Kartenstil von{" "}
        <a href="https://openfreemap.org/">OpenFreeMap</a> geladen. Dabei wird
        Ihre IP-Adresse an diesen Dienst übertragen. Die Karte wird erst
        geladen, wenn Sie eine Kartenansicht öffnen.
      </p>

      <h2>Standort</h2>
      <p>
        Ihr Standort wird nur abgefragt, wenn Sie ihn ausdrücklich freigeben. Er
        wird ausschließlich im Browser verwendet — für den Kartenausschnitt und
        die Sortierung nach Entfernung — und nicht an einen Server übertragen.
        Sie können die Freigabe jederzeit widerrufen.
      </p>

      <h2>Benachrichtigungen (Web Push)</h2>
      <p>
        <strong>
          Ihre Benachrichtigungsgebiete verlassen Ihr Gerät nicht.
        </strong>{" "}
        Mittelpunkt, Radius und Ihre Auswahl, worüber Sie informiert werden
        möchten, werden ausschließlich lokal in Ihrem Browser gespeichert. Sie
        werden weder übertragen noch gespeichert und sind uns nicht bekannt.
      </p>
      <p>
        Beim Aktivieren wird beim Benachrichtigungsdienst dieses Angebots
        ausschließlich eine anonyme, von Ihrem Browser erzeugte Geräteadresse
        (Push-Endpoint samt zugehörigen Schlüsseln) gespeichert — sonst nichts.
        Gibt es neue Baustellenmeldungen, erhält jedes angemeldete Gerät
        denselben inhaltslosen Hinweis. Erst auf Ihrem Gerät wird geprüft,
        welche der Meldungen in Ihre Gebiete fallen; nur dann wird überhaupt
        eine Benachrichtigung angezeigt. Der Dienst kann daher nicht erkennen,
        wo Sie wohnen oder welche Meldungen Sie erhalten haben.
      </p>
      <p>
        Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Beim
        Ausschalten der Benachrichtigungen wird die Geräteadresse gelöscht. Der
        Versand erfolgt technisch über den Push-Dienst Ihres
        Browser-Herstellers.
      </p>

      <h2>Lokale Speicherung</h2>
      <p>
        In der lokalen Datenbank Ihres Browsers (IndexedDB) werden Ihre
        Benachrichtigungsgebiete und Einstellungen abgelegt, damit sie beim
        nächsten Besuch erhalten bleiben und damit der Hintergrunddienst des
        Browsers passende Meldungen auswählen kann. Es werden keine Cookies zu
        Analysezwecken gesetzt. Sie können diese Daten jederzeit über die
        Einstellungen Ihres Browsers löschen.
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
        Diese Erklärung gilt für die Web-Anwendung Fächerbagger. Ziel ist die
        Erfüllung der Anforderungen der BITV 2.0 beziehungsweise der EN 301 549
        (WCAG 2.1, Stufe AA).
      </p>

      <h2>Stand der Vereinbarkeit</h2>
      <p>
        Das Angebot ist mit den genannten Anforderungen{" "}
        <strong>teilweise vereinbar</strong>. Die nachstehend genannten Inhalte
        sind nicht barrierefrei.
      </p>

      <h2>Nicht barrierefreie Inhalte</h2>
      <ul>
        <li>
          <strong>Interaktive Karte:</strong> Die Marker der Karte liegen in
          einem Canvas und sind nicht mit der Tastatur erreichbar. Als
          gleichwertige Alternative steht die Listenansicht mit denselben Daten,
          Filtern und Sortierungen zur Verfügung; ein Hinweis am Anfang der
          Karte führt dorthin. Die Kartenansicht ist keine Voraussetzung, um an
          eine Information zu gelangen.
        </li>
        <li>
          <strong>Kartenkacheln:</strong> Die Hintergrundkarte stammt von einem
          Drittanbieter. Kontrastverhältnisse innerhalb der Kacheln liegen
          außerhalb unseres Einflussbereichs.
        </li>
        <li>
          <strong>Quelltexte:</strong> Freitextangaben zu einzelnen Baustellen
          werden unverändert aus der Datenquelle übernommen. Formulierung und
          Verständlichkeit dieser Texte können wir nicht beeinflussen.
        </li>
      </ul>

      <h2>Erstellung dieser Erklärung</h2>
      <p>
        Diese Erklärung beruht auf einer Selbstbewertung des Angebots durch den
        Betreiber.
      </p>

      <h2>Barriere melden</h2>
      <p>
        Sind Ihnen Barrieren aufgefallen oder benötigen Sie eine Information in
        einer zugänglichen Form?{" "}
        {SITE_OPERATOR.accessibilityContact ? (
          <a href={`mailto:${SITE_OPERATOR.accessibilityContact}`}>
            Melden Sie sich gern per E-Mail.
          </a>
        ) : (
          "Eine Kontaktmöglichkeit ist für diese Bereitstellung noch nicht hinterlegt."
        )}
      </p>

      <h2>Hinweis</h2>
      <p>{UNOFFICIAL_NOTICE}</p>
    </>
  );
}
