import { ExternalLink, LogOut, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useLocation } from "react-router";
import { AccountDashboard } from "~/components/account/account-dashboard";
import type { AccountActionFeedback, AccountDashboardData, AccountMfaState, AccountSectionId } from "~/components/account/account-dashboard";
import type { Locale } from "~/domain/types";

const ACCOUNT_DRAWER_ANIMATION_MS = 280;

type AccountDrawerResponse = Omit<AccountDashboardData, "viewer"> & {
  viewer: AccountDashboardData["viewer"] | null;
  mfa?: AccountMfaState | null;
};

const tabs: Array<{ id: AccountSectionId; fr: string; en: string }> = [
  { id: "orders", fr: "Commandes", en: "Orders" },
  { id: "addresses", fr: "Adresses", en: "Addresses" },
  { id: "settings", fr: "Paramètres", en: "Settings" },
  { id: "professional-quotes", fr: "Boutique pro", en: "Pro shop" },
];

export function AccountDrawer({ open, locale, onClose }: { open: boolean; locale: Locale; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastActionDataRef = useRef<AccountActionFeedback | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  const [activeSection, setActiveSection] = useState<AccountSectionId>("orders");
  const accountFetcher = useFetcher<AccountDrawerResponse>({ key: "account-drawer-data" });
  const actionFetcher = useFetcher<AccountActionFeedback>({ key: "account-drawer-actions" });
  const location = useLocation();
  const english = locale === "en-GB";
  const accountPath = english ? "/en/my-account" : "/mon-compte";
  const returnPath = `${location.pathname}${location.search}`;
  const data = accountFetcher.data;
  const professional = data?.viewer?.profile?.professional_status === "approved";
  const mfaChallengeRequired = Boolean(data?.mfa?.verifiedFactors.length && data.mfa.currentLevel !== "aal2");
  const visibleTabs = tabs.filter((tab) => tab.id !== "professional-quotes" || professional);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setClosing(false);
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) {
      setClosing(false);
      return;
    }
    setClosing(true);
    const closeTimer = window.setTimeout(() => {
      if (dialog.open) dialog.close();
      setClosing(false);
    }, ACCOUNT_DRAWER_ANIMATION_MS);
    return () => window.clearTimeout(closeTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    accountFetcher.load(accountPath);
  }, [accountPath, open]);

  useEffect(() => {
    if (!open || actionFetcher.state !== "idle" || !actionFetcher.data || actionFetcher.data === lastActionDataRef.current) return;
    lastActionDataRef.current = actionFetcher.data;
    accountFetcher.load(accountPath);
  }, [accountPath, actionFetcher.data, actionFetcher.state, open]);

  useEffect(() => {
    if (activeSection === "professional-quotes" && data && !professional) setActiveSection("orders");
  }, [activeSection, data, professional]);

  const displayName = data?.viewer
    ? [data.viewer.profile?.first_name, data.viewer.profile?.last_name].filter(Boolean).join(" ")
    : "";

  return <dialog
    id="account-drawer"
    ref={dialogRef}
    className={`account-drawer${closing ? " is-closing" : ""}`}
    aria-labelledby="account-drawer-title"
    onClose={onClose}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className="account-drawer__panel">
      <header className="account-drawer__header">
        <div><p className="eyebrow">{english ? "Private space" : "Espace privé"}</p><h2 id="account-drawer-title">{displayName || (english ? "My account" : "Mon compte")}</h2>{data?.viewer?.user.email ? <small>{data.viewer.user.email}</small> : null}</div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={english ? "Close my account" : "Fermer mon compte"} autoFocus><X aria-hidden="true" /></button>
      </header>

      {data?.viewer && !mfaChallengeRequired ? <div className="account-drawer__tabs" role="tablist" aria-label={english ? "My account sections" : "Rubriques de mon compte"}>
        {visibleTabs.map((tab) => <button
          id={`account-drawer-tab-${tab.id}`}
          className={activeSection === tab.id ? "is-active" : undefined}
          type="button"
          role="tab"
          aria-selected={activeSection === tab.id}
          aria-controls={`account-drawer-${tab.id}`}
          tabIndex={activeSection === tab.id ? 0 : -1}
          onClick={() => setActiveSection(tab.id)}
          onKeyDown={(event) => {
            const currentIndex = visibleTabs.findIndex((candidate) => candidate.id === tab.id);
            let nextIndex = currentIndex;
            if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % visibleTabs.length;
            else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
            else if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = visibleTabs.length - 1;
            else return;
            event.preventDefault();
            const nextTab = visibleTabs[nextIndex];
            setActiveSection(nextTab.id);
            window.requestAnimationFrame(() => document.getElementById(`account-drawer-tab-${nextTab.id}`)?.focus());
          }}
          key={tab.id}
        >{english ? tab.en : tab.fr}</button>)}
      </div> : <div />}

      <div className="account-drawer__content">
        {accountFetcher.state === "loading" && !data ? <div className="account-drawer__loading" role="status"><span aria-hidden="true" /><p>{english ? "Loading your account…" : "Chargement de votre compte…"}</p></div> : null}
        {data && !data.viewer ? <div className="account-drawer__empty"><p>{english ? "Your session has expired. Sign in again to continue." : "Votre session a expiré. Reconnectez-vous pour continuer."}</p><Link className="button button--dark" to={accountPath} onClick={onClose}>{english ? "Sign in" : "Se connecter"}</Link></div> : null}
        {data?.viewer && mfaChallengeRequired ? <div className="account-drawer__empty"><p>{english ? "Complete two-factor authentication to open this protected account." : "Terminez la double authentification pour ouvrir ce compte protégé."}</p><Link className="button button--dark" to={accountPath} onClick={onClose}>{english ? "Verify my account" : "Vérifier mon compte"}</Link></div> : null}
        {data?.viewer && !mfaChallengeRequired ? <AccountDashboard data={data as AccountDashboardData} result={actionFetcher.data} mode="drawer" activeSection={activeSection} onNavigate={onClose} /> : null}
      </div>

      <footer className="account-drawer__footer">
        <Link className="ui-button ui-button--outline" to={accountPath} onClick={onClose}><ExternalLink aria-hidden="true" />{english ? "Full account page" : "Voir la page complète"}</Link>
        <actionFetcher.Form method="post" action={accountPath}>
          <input type="hidden" name="intent" value="logout" />
          <input type="hidden" name="next" value={returnPath} />
          <button className="ui-button ui-button--ghost" type="submit" disabled={actionFetcher.state !== "idle"}><LogOut aria-hidden="true" />{english ? "Sign out" : "Se déconnecter"}</button>
        </actionFetcher.Form>
      </footer>
    </div>
  </dialog>;
}
