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
        Fächerbagger ist eine statische Website: keine Benutzerkonten, kein
        Tracking, keine Werbung. Ihre Filter und Einstellungen verlassen Ihr
        Gerät nicht.
      </p>

      <h2>Aufruf der Seite</h2>
      <p>
        Beim Aufruf überträgt Ihr Browser technisch notwendige Daten wie Ihre
        IP-Adresse an den Hosting-Dienst. Rechtsgrundlage ist Art. 6 Abs. 1
        lit. f DSGVO (Bereitstellung des Angebots).
      </p>

      <h2>Kartendarstellung</h2>
      <p>
        Kartenkacheln und Kartenstil kommen von{" "}
        <a href="https://openfreemap.org/">OpenFreeMap</a>. Dabei erhält dieser
        Dienst Ihre IP-Adresse, aber erst, wenn eine Karte angezeigt wird.
      </p>

      <h2>Standort</h2>
      <p>
        Ihr Standort wird nur abgefragt, wenn Sie es auslösen. Er wird nur im
        Browser verwendet (Kartenausschnitt, Sortierung nach Entfernung) und
        nicht übertragen. Sie können die Freigabe jederzeit widerrufen.
      </p>

      <h2>Benachrichtigungen (Web Push)</h2>
      <p>
        <strong>Ihre Gebiete verlassen Ihr Gerät nicht.</strong> Mittelpunkt,
        Radius, beobachtete Baustellen und Ihre Auswahl liegen nur in Ihrem
        Browser. Wir kennen sie nicht.
      </p>
      <p>
        Beim Einschalten speichert unser Benachrichtigungsdienst nur eine
        anonyme Geräteadresse, die Ihr Browser erzeugt (Push-Endpoint und
        Schlüssel). Bei neuen Meldungen erhalten alle angemeldeten Geräte
        denselben Hinweis ohne Inhalt. Erst Ihr Gerät prüft, ob etwas davon
        Sie betrifft, und zeigt nur dann eine Benachrichtigung. Der Dienst
        weiß daher nicht, wo Sie wohnen oder was Ihnen angezeigt wird.
      </p>
      <p>
        Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Beim
        Ausschalten wird die Geräteadresse gelöscht. Zugestellt wird über den
        Push-Dienst Ihres Browser-Herstellers.
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
