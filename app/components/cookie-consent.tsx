import { useEffect, useState } from "react";
import { useLocation } from "react-router";

type Consent = "accepted" | "refused" | null;

function enableGoogleAnalytics(measurementId: string) {
  if (!measurementId || document.querySelector(`script[data-ga-id="${measurementId}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.dataset.gaId = measurementId;
  document.head.append(script);
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { anonymize_ip: true, allow_google_signals: false });
}

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function CookieConsent({ measurementId }: { measurementId: string }) {
  const location = useLocation(); const english = location.pathname === "/en" || location.pathname.startsWith("/en/");
  const [consent, setConsent] = useState<Consent>(null);
  useEffect(() => {
    const stored = window.localStorage.getItem("zcl:analytics-consent:v1") as Consent;
    setConsent(stored);
    if (stored === "accepted") enableGoogleAnalytics(measurementId);
  }, [measurementId]);
  const choose = (value: Exclude<Consent, null>) => {
    window.localStorage.setItem("zcl:analytics-consent:v1", value);
    setConsent(value);
    if (value === "accepted") enableGoogleAnalytics(measurementId);
  };
  if (consent !== null) return null;
  return (
    <aside className="cookie-banner" aria-label="Préférences de confidentialité">
      <div><strong>{english ? "Your coffee, your choice." : "Votre café, vos choix."}</strong><p>{english ? "We only use anonymised analytics after you agree." : "Nous utilisons uniquement des statistiques anonymisées après votre accord."}</p></div>
      <div className="cookie-actions">
        <button type="button" className="button button--ghost" onClick={() => choose("refused")}>{english ? "Decline" : "Refuser"}</button>
        <button type="button" className="button button--light" onClick={() => choose("accepted")}>{english ? "Accept" : "Accepter"}</button>
      </div>
    </aside>
  );
}
