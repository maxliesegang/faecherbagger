import { useEffect, useRef, type ReactNode } from "react";
import { KernAlert, KernIcon } from "@kern-ux-annex/kern-react-kit";
import type { LegalPageId } from "../lib/legal-pages.ts";
import { getLegalPageTitle } from "../lib/legal-pages.ts";
import {
  isSiteOperatorConfigured,
  SITE_OPERATOR,
} from "../lib/site-operator.ts";
import "./LegalPage.css";

interface LegalPageProps {
  pageId: LegalPageId;
  overviewHref: string;
  onBack: () => void;
}

/**
 * Privacy notice.
 *
 * The substance that follows from *this* application — which data it processes
 * and where it sends requests — is written out here, because only the code knows it. Everything that is a statement
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

      {pageId === "privacy" && <PrivacyContent />}
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

/**
 * Layered: the essentials stay visible, each function's details sit in an
 * accordion. Collapsed text is still part of the page, so nothing Art. 13
 * DSGVO requires is dropped, only folded away.
 */
function PrivacyContent() {
  return (
    <>
      <h2>Verantwortlich</h2>
      <OperatorDetails />

      <h2>Das Wichtigste</h2>
      <ul>
        <li>Keine Werbung, keine Nutzungsanalyse, keine Analyse-Cookies.</li>
        <li>Ihre Orte, Strecken und Einstellungen bleiben auf Ihrem Gerät.</li>
        <li>
          Andere Dienste erhalten Daten nur, wenn Sie die jeweilige Funktion
          nutzen.
        </li>
      </ul>

      <div className="legal-page__details">
        <LegalSection title="Aufruf der Seite">
          <p>
            GitHub Pages stellt die Seite bereit und erhält dabei technisch
            notwendige Daten wie Ihre IP-Adresse. Rechtsgrundlage: Art. 6
            Abs. 1 lit. f DSGVO.
          </p>
        </LegalSection>

        <LegalSection title="Karte">
          <p>
            Sobald eine Karte erscheint, erhält{" "}
            <a href="https://openfreemap.org/privacy/">OpenFreeMap</a>{" "}
            (ggf. über Cloudflare) Ihre IP-Adresse und die angezeigten
            Kartenbereiche. Ihre Gebiete werden nicht übertragen.
          </p>
        </LegalSection>

        <LegalSection title="Standort">
          <p>
            Nur auf Ihre Anforderung, und nur auf Ihrem Gerät genutzt:
            für Entfernungen und den Kartenausschnitt. Die Freigabe können Sie
            im Browser widerrufen.
          </p>
        </LegalSection>

        <LegalSection title="Adresssuche">
          <p>
            Ab drei Zeichen geht der Suchtext mit Ihrer IP-Adresse an den
            Photon-Dienst von komoot. Standort und Gebiete werden nicht
            mitgesendet. Ohne Übertragung: Punkt auf der Karte wählen.
          </p>
        </LegalSection>

        <LegalSection title="Streckenberechnung">
          <p>
            Start, Ziel und Verkehrsmittel gehen einmalig mit Ihrer IP-Adresse
            an den Routing-Dienst der{" "}
            <a href="https://www.fossgis.de/">FOSSGIS e.&nbsp;V.</a>{" "}
            (routing.openstreetmap.de). Nur die berechnete Linie wird
            gespeichert, in Ihrem Browser. Ohne Übertragung: Strecke selbst
            zeichnen.
          </p>
        </LegalSection>

        <LegalSection title="Benachrichtigungen">
          <p>
            Ihre Orte und beobachteten Baustellen werden nicht übertragen. Ihr
            Gerät prüft selbst, welche Meldungen passen.
          </p>
          <dl className="legal-page__facts">
            <dt>Gespeichert</dt>
            <dd>
              Technische Zustelladresse mit Schlüsseln, Zeitpunkte von
              Anmeldung und Zustellung. Bei Safari und Firefox zusätzlich das
              Datum der nächsten geplanten Nachricht.
            </dd>
            <dt>Empfänger</dt>
            <dd>
              Cloudflare (Speicherung, dabei auch Ihre IP-Adresse), GitHub
              Actions (Versand) und der Push-Dienst Ihres Browsers (Apple,
              Google oder Mozilla).
            </dd>
            <dt>Rechtsgrundlage</dt>
            <dd>
              Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Sie widerrufen
              sie, indem Sie Benachrichtigungen ausschalten.
            </dd>
            <dt>Löschung</dt>
            <dd>
              Beim Ausschalten. Ist der Dienst nicht erreichbar, versucht es
              Ihr Gerät später erneut; dafür müssen die App-Daten erhalten
              bleiben. Ungültige Anmeldungen werden beim Versand entfernt.
              Sicherungen enthalten alte Daten bis zu 30 Tage.
            </dd>
            <dt>Protokolle</dt>
            <dd>
              Aufrufprotokolle sind ausgeschaltet. Fehlerprotokolle enthalten
              nur Fehlercodes und bleiben bis zu 7 Tage.
            </dd>
            <dt>Drittland</dt>
            <dd>
              Cloudflare und GitHub sind US-Anbieter, die Verarbeitung kann
              außerhalb der EU stattfinden. Schutzmaßnahmen:{" "}
              <a href="https://www.cloudflare.com/trust-hub/gdpr/">
                Cloudflare
              </a>
              ,{" "}
              <a href="https://www.cloudflare.com/cloudflare-customer-dpa/">
                Auftragsverarbeitung
              </a>
              ,{" "}
              <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement">
                GitHub
              </a>
              .
            </dd>
          </dl>
        </LegalSection>

        <LegalSection title="Speicherung auf Ihrem Gerät">
          <p>
            Gebiete, beobachtete Baustellen und Einstellungen liegen in der
            Browser-Datenbank (IndexedDB), damit auch Benachrichtigungen sie
            lesen können. Sie löschen sie in den Browsereinstellungen.
          </p>
        </LegalSection>
      </div>

      <h2>Ihre Rechte</h2>
      <p>
        Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit,
        Widerspruch, Widerruf einer Einwilligung und Beschwerde bei einer
        Datenschutzaufsichtsbehörde.
      </p>
    </>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="kern-accordion">
      <summary className="kern-accordion__header">
        <h3>{title}</h3>
      </summary>
      <div className="kern-accordion__body">{children}</div>
    </details>
  );
}
