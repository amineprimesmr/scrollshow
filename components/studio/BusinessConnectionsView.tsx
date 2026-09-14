"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { PublicBusinessConnection } from "@/lib/business-analytics/model";
import { useStudio } from "./StudioContext";
import { IconChart } from "./icons";
import { ProviderLogo } from "./ProviderLogo";
import { BusinessField, BusinessModal, CopyButton, businessError, businessRequest } from "./business-ui";
import "./business-results.css";

type Provider = "stripe" | "revenuecat" | "shopify";
const providers: Provider[] = ["stripe", "revenuecat", "shopify"];
const names: Record<Provider, string> = { stripe: "Stripe", revenuecat: "RevenueCat", shopify: "Shopify" };
const dashboards = { stripe: "https://dashboard.stripe.com/apikeys", revenuecat: "https://app.revenuecat.com", shopify: "https://admin.shopify.com" };
type Capability = { provider: string; keyAvailable: boolean; oauthAvailable: boolean; history: string; webhook: boolean; reviewStatus?: "pending" | "approved" };
type ConnectionsResponse = { connections: PublicBusinessConnection[]; capabilities: Capability[] };
type ConnectionResult = { connection: PublicBusinessConnection; webhook?: { urlPath: string; authorization?: string; events: string[] }; sync?: unknown; initialSync?: { complete: boolean; processed: number | null; scanned: number | null; warnings: string[] } };
type PrivacyRequests = { pending: number; requests: { id: string; shopId: string; shopDomain: string; requestedAt: string; status: "pending" | "exported" }[] };
type ProjectDiscovery = { projects: { id: string; name: string }[]; requiresProject: boolean; reason?: string };

function connectionError(failure: unknown, en: boolean) {
  const code = failure instanceof Error ? failure.message : "request_failed";
  const messages: Record<string, [string, string]> = {
    revenuecat_project_selection_required: ["Choisis le projet dont tu souhaites suivre les ventes.", "Choose the project whose sales you want to track."],
    revenuecat_project_id_required: ["Ouvre ton projet RevenueCat et colle le lien de la page ci-dessous.", "Open your RevenueCat project and paste its page link below."],
    revenuecat_project_url_invalid: ["Colle le lien d’un projet depuis app.revenuecat.com.", "Paste a project link from app.revenuecat.com."],
    revenuecat_project_not_accessible: ["Cette clé ne peut pas lire ce projet. Vérifie le projet choisi et les permissions de la clé.", "This key cannot read that project. Check the selected project and key permissions."],
    stripe_shopify_overlap: ["Pour éviter les doubles comptages, choisis Stripe ou Shopify comme source des totaux. Dans les réglages avancés de l’autre connexion, désactive « Inclure dans les totaux ».", "To avoid double counting, choose Stripe or Shopify as the source for totals. In the other connection’s advanced settings, turn off ‘Include in totals’."],
    shopify_shop_invalid: ["Saisis l’adresse de ta boutique, par exemple ma-boutique.myshopify.com.", "Enter your store address, for example my-store.myshopify.com."],
    shopify_oauth_not_configured: ["La connexion Shopify n’est pas encore activée sur ScrollShow. Réessaie plus tard.", "The Shopify connection is not enabled on ScrollShow yet. Try again later."],
    shopify_oauth_state_invalid: ["L’autorisation a expiré. Recommence la connexion Shopify.", "Authorization expired. Start the Shopify connection again."],
    shopify_oauth_denied: ["L’autorisation Shopify a été annulée. Tu peux recommencer quand tu veux.", "Shopify authorization was cancelled. You can try again whenever you’re ready."],
    shopify_permissions_missing: ["Autorise la lecture des commandes dans Shopify pour importer tes ventes.", "Allow order access in Shopify to import your sales."],
  };
  return messages[code]?.[en ? 1 : 0] || businessError(failure, en);
}

export function BusinessConnectionsView() {
  const { english: en, user } = useStudio();
  const tr = (fr: string, english: string) => en ? english : fr;
  const requestRef = useRef(0);
  const projectRef = useRef<string | undefined>(undefined);
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [busy, setBusy] = useState("");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [initialShop, setInitialShop] = useState("");
  // One-time authorizations stay in this page's memory, never in browser storage.
  const [issued, setIssued] = useState<Record<string, ConnectionResult>>({});
  const [webhookConnection, setWebhookConnection] = useState<PublicBusinessConnection | null>(null);
  const [disconnect, setDisconnect] = useState<PublicBusinessConnection | null>(null);
  const [origin, setOrigin] = useState("");
  const [privacy, setPrivacy] = useState<PrivacyRequests | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++requestRef.current;
    const current = () => request === requestRef.current && !signal?.aborted;
    try {
      const next = await businessRequest<ConnectionsResponse>("/connections", undefined, "GET");
      if (current()) { setData(next); setError(""); }
      if (next.connections.some(connection => connection.provider === "shopify")) {
        const requests = await businessRequest<PrivacyRequests>("/connectors/shopify/privacy", undefined, "GET").catch(() => null);
        if (current()) setPrivacy(requests);
      } else if (current()) setPrivacy(null);
    } catch (failure) { if (current()) setError(connectionError(failure, en)); }
    finally { if (current()) setLoading(false); }
  }, [en]);
  useEffect(() => {
    if (projectRef.current !== user?.projectId) {
      projectRef.current = user?.projectId;
      setData(null); setPrivacy(null); setIssued({}); setProvider(null); setWebhookConnection(null); setDisconnect(null); setNotice(""); setNoticeError(false);
    }
    if (!user?.projectId) return;
    setLoading(true);
    const controller = new AbortController();
    void load(controller.signal); setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    const callbackError = params.get("business_error");
    if (callbackError) { setNotice(connectionError(new Error(callbackError), en)); setNoticeError(true); }
    else if (params.get("business_connected") === "shopify") { setNotice(tr("Shopify est connecté. Tes commandes peuvent maintenant être synchronisées.", "Shopify is connected. Your orders can now be synced.")); setNoticeError(false); }
    if (params.get("connect") === "shopify") {
      setInitialShop((params.get("shop") || "").slice(0, 255)); setProvider("shopify");
      params.delete("connect"); params.delete("shop");
    }
    if (callbackError || params.has("business_connected")) { params.delete("business_error"); params.delete("business_connected"); }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, "", nextUrl);
    return () => { requestRef.current++; controller.abort(); };
  }, [load, user?.projectId]);

  async function sync(id: Provider, connections: PublicBusinessConnection[]) {
    setBusy(id); setNotice(""); setNoticeError(false); setError("");
    try {
      for (const connection of connections) await businessRequest(`/connections/${encodeURIComponent(connection.id)}/sync`, {});
      await load(); setNotice(tr("Tes ventes ont été actualisées.", "Your sales have been refreshed."));
    } catch (failure) { setError(connectionError(failure, en)); }
    finally { setBusy(""); }
  }
  async function setMonetarySource(connection: PublicBusinessConnection, enabled: boolean) {
    setBusy(`source:${connection.id}`); setError(""); setNotice(""); setNoticeError(false);
    try {
      await businessRequest(`/connections/${encodeURIComponent(connection.id)}`, { monetarySource: enabled }, "PATCH");
      await load();
      setNotice(enabled ? tr("Cette source est incluse dans les totaux.", "This source is included in totals.") : tr("Cette source est exclue des totaux. Son historique est conservé.", "This source is excluded from totals. Its history is preserved."));
    } catch (failure) { setError(connectionError(failure, en)); }
    finally { setBusy(""); }
  }
  async function exportPrivacy(requestId: string) {
    setBusy(requestId); setError("");
    try {
      const response = await fetch("/api/business/connectors/shopify/privacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) });
      if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(typeof failure.error === "string" ? failure.error : "request_failed"); }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "shopify-data-request.json"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await load();
    } catch (failure) { setError(connectionError(failure, en)); }
    finally { setBusy(""); }
  }
  async function remove() {
    if (!disconnect) return;
    setBusy(disconnect.id);
    try {
      await businessRequest(`/connections/${encodeURIComponent(disconnect.id)}`, {}, "DELETE");
      setIssued(previous => { const next = { ...previous }; delete next[disconnect.id]; return next; });
      setDisconnect(null); await load(); setNoticeError(false); setNotice(tr("Compte déconnecté.", "Account disconnected."));
    } catch (failure) { setError(connectionError(failure, en)); }
    finally { setBusy(""); }
  }
  const date = (value?: string) => value ? new Date(value).toLocaleString(en ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }) : tr("Pas encore", "Not yet");
  const open = (id: Provider) => { setError(""); setProvider(id); };

  return <div className="ss-br ss-br-page ss-commerce">
    <header className="ss-br__header">
      <div><p className="ss-br__eyebrow">{tr("CONNEXIONS", "CONNECTIONS")}</p><h1>{tr("Connecte tes ventes.", "Connect your sales.")}</h1><p className="ss-br__subtitle">{tr("Retrouve les revenus de ton activité dans les résultats de tes contenus.", "Bring your business revenue into your content results.")}</p></div>
      <Link className="ss-br__button lg lg--lens lg-press" href="/app/analytics"><IconChart size={15} />{tr("Voir les résultats", "View results")}</Link>
    </header>
    {error && <div className="ss-br__notice is-error" role="alert"><span>{error}</span>{!data && <button className="ss-br__button" onClick={() => void load()}>{tr("Réessayer", "Retry")}</button>}</div>}
    {notice && <div className={`ss-br__notice${noticeError ? " is-error" : ""}`} role={noticeError ? "alert" : "status"}><span>{notice}</span><button className="ss-commerce__dismiss" onClick={() => setNotice("")} aria-label={tr("Fermer le message", "Dismiss message")}>×</button></div>}
    <div className="ss-commerce__cards" aria-busy={loading}>
      {providers.map(id => {
        const capability = data?.capabilities.find(item => item.provider === id);
        const providerConnections = data?.connections.filter(item => item.provider === id) || [];
        const connections = providerConnections.filter(item => item.status !== "disconnected");
        const available = id === "shopify" ? capability?.oauthAvailable : capability?.keyAvailable;
        const hasError = connections.some(item => item.status === "error" || item.status === "configuration_required" || item.lastError);
        const syncing = connections.some(item => item.status === "syncing") || busy === id;
        return <section className="ss-commerce__card" key={id} aria-label={names[id]}>
          <div className="ss-commerce__brand"><ProviderLogo provider={id} /></div>
          <p className="ss-commerce__description">{id === "stripe" ? tr("Les paiements et abonnements de ton site.", "Payments and subscriptions from your website.") : id === "revenuecat" ? tr("Les achats et abonnements de ton app.", "Purchases and subscriptions from your app.") : tr("Les commandes de ta boutique en ligne.", "Orders from your online store.")}</p>
          <div className="ss-commerce__state">
            {loading ? <span className="ss-commerce__loading">{tr("Chargement…", "Loading…")}</span> : connections.length ? <>
              <span className={`ss-br__pill ${hasError ? "is-warn" : syncing ? "" : "is-good"}`}><span className="ss-br__dot" />{hasError ? tr("À vérifier", "Needs attention") : syncing ? tr("Synchronisation…", "Syncing…") : tr("Connecté", "Connected")}</span>
              {connections.map(connection => <div className="ss-commerce__account" key={connection.id}><strong>{connection.name || names[id]}</strong><span>{connection.lastSyncedAt ? `${tr("Actualisé le", "Updated")} ${date(connection.lastSyncedAt)}` : tr("Prêt pour la première synchronisation", "Ready for the first sync")}</span>{connection.environment === "test" && <span>{tr("Données de test", "Test data")}</span>}</div>)}
              {!connections.every(connection => connection.lastWebhookAt) && <p className="ss-commerce__delivery">{id !== "shopify" && connections.some(connection => !connection.hasWebhookSecret) ? tr("Le suivi en direct reste à activer dans les réglages avancés.", "Enable live updates in advanced settings.") : tr("En attente du premier paiement reçu en direct.", "Waiting for the first live payment event.")}</p>}
            </> : <span className="ss-commerce__disconnected">{tr("Pas encore connecté", "Not connected yet")}</span>}
          </div>
          <button className={connections.length ? "ss-br__button lg lg--lens lg-press ss-commerce__connect" : "ss-br__primary ss-commerce__connect"} disabled={loading || !!busy || (!connections.length && !available)} onClick={() => connections.length ? void sync(id, connections) : open(id)}>
            {syncing ? tr("Actualisation…", "Refreshing…") : connections.length ? tr("Actualiser les ventes", "Refresh sales") : `${tr("Connecter", "Connect")} ${names[id]}`}
          </button>
          {!loading && !connections.length && !available && <p className="ss-commerce__availability">{tr("La connexion doit être activée sur ScrollShow.", "This connection needs to be enabled on ScrollShow.")}</p>}
          {!loading && id === "shopify" && available && capability?.reviewStatus === "pending" && <p className="ss-commerce__availability">{tr("Accès public soumis à validation Shopify — boutiques de test uniquement.", "Public access requires Shopify approval — test stores only.")}</p>}
          {providerConnections.length > 0 && <details className="ss-commerce__advanced"><summary>{tr("Réglages avancés", "Advanced settings")}<span aria-hidden>⌄</span></summary>
            <div className="ss-commerce__advanced-body">
              {providerConnections.map(connection => <div className="ss-commerce__diagnostics" key={connection.id}>
                {providerConnections.length > 1 && <h3>{connection.name || names[id]}</h3>}
                {connection.status === "disconnected" && <p className="ss-br__caption">{tr("Compte déconnecté. L’historique est conservé.", "Account disconnected. History is preserved.")}</p>}
                <label className="ss-br__check ss-commerce__source-toggle"><input type="checkbox" checked={connection.monetarySource !== false} disabled={!!busy} onChange={event => void setMonetarySource(connection, event.target.checked)} /><span>{tr("Inclure dans les totaux", "Include in totals")}</span></label>
                <div className="ss-br__key-value"><span>{tr("Compte", "Account")}</span><span>{connection.externalAccountId}</span></div>
                <div className="ss-br__key-value"><span>{tr("Environnement", "Environment")}</span><span>{connection.environment === "live" ? tr("Production", "Live") : tr("Test", "Test")}</span></div>
                <div className="ss-br__key-value"><span>{tr("Dernière synchronisation", "Last sync")}</span><span>{date(connection.lastSyncedAt)}</span></div>
                <div className="ss-br__key-value"><span>{tr("Dernier événement reçu", "Last event received")}</span><span>{date(connection.lastWebhookAt)}</span></div>
                <p className="ss-br__caption">{connection.historyComplete ? tr("Historique disponible importé.", "Available history imported.") : tr("L’historique peut être partiel. Actualise les ventes pour poursuivre l’import.", "History may be partial. Refresh sales to continue importing.")}</p>
                {connection.lastError && <p className="ss-commerce__diagnostic-error">{connectionError(new Error(connection.lastError), en)}</p>}
                {id !== "shopify" && connection.status !== "disconnected" && <>
                  <p className="ss-br__caption">{tr("Le webhook transmet les nouveaux paiements automatiquement. Sa réception est confirmée après le premier événement valide.", "The webhook delivers new payments automatically. Delivery is confirmed after the first valid event.")}</p>
                  {issued[connection.id]?.webhook?.authorization && <p className="ss-br__caption">{tr("Une autorisation à copier est disponible pour cette session.", "An authorization is available to copy during this session.")}</p>}
                  <button className="ss-commerce__link-button" onClick={() => setWebhookConnection(connection)}>{tr("Configurer les paiements en direct", "Set up live payments")} →</button>
                </>}
                {id === "shopify" && privacy && privacy.pending > 0 && privacy.requests.filter(request => request.status === "pending" && request.shopId === connection.externalAccountId).map(request => <div className="ss-commerce__privacy-request" key={request.id}><p>{tr("Demande d’accès aux données reçue le", "Data access request received")} {date(request.requestedAt)}</p><button className="ss-commerce__link-button" disabled={!!busy} onClick={() => void exportPrivacy(request.id)}>{busy === request.id ? tr("Préparation…", "Preparing…") : tr("Télécharger le dossier pour le client", "Download the customer’s data file")} ↓</button></div>)}
                {connection.status !== "disconnected" && <button className="ss-commerce__link-button ss-commerce__disconnect" disabled={!!busy} onClick={() => setDisconnect(connection)}>{tr("Déconnecter ce compte", "Disconnect this account")}</button>}
              </div>)}
              {connections.length > 0 && <button className="ss-commerce__link-button" disabled={!available || !!busy} onClick={() => open(id)}>{tr("Connecter un autre compte", "Connect another account")}</button>}
            </div>
          </details>}
        </section>;
      })}
    </div>
    <div className="ss-commerce__footer"><p>{tr("Pour savoir quel contenu a généré une vente, ajoute le suivi à ton site.", "To identify which content led to a sale, add tracking to your website.")} <Link href="/app/analytics?tab=settings">{tr("Installer le suivi", "Set up tracking")} →</Link></p><p>{tr("Ces comptes concernent ton activité. Ton abonnement ScrollShow reste dans les réglages du compte.", "These accounts belong to your business. Your ScrollShow subscription stays in account settings.")}</p></div>
    {provider && <ConnectionSetup provider={provider} initialShop={initialShop} english={en} onClose={() => setProvider(null)} onSuccess={async next => {
      setProvider(null); setIssued(previous => ({ ...previous, [next.connection.id]: next })); await load();
      setNoticeError(false);
      setNotice(next.initialSync && !next.initialSync.complete ? tr("Compte connecté. Actualise les ventes pour poursuivre l’import de l’historique.", "Account connected. Refresh sales to continue importing history.") : tr(`${names[next.connection.provider as Provider]} est connecté. Tes ventes disponibles ont été importées.`, `${names[next.connection.provider as Provider]} is connected. Your available sales have been imported.`));
    }} />}
    {webhookConnection && <WebhookSetup connection={webhookConnection} issued={issued[webhookConnection.id]} origin={origin} english={en} onClose={() => setWebhookConnection(null)} onSaved={async next => {
      setIssued(previous => ({ ...previous, [next.connection.id]: next })); await load();
    }} />}
    {disconnect && <BusinessModal title={tr("Déconnecter ce compte ?", "Disconnect this account?")} onClose={() => { if (!busy) setDisconnect(null); }} english={en}><div className="ss-br__modal-content"><p>{tr("Les prochaines collectes de ce compte seront arrêtées. Aucun paiement chez le fournisseur ne sera modifié.", "Future collection from this account will stop. No payments at the provider will be changed.")}</p><div className="ss-br__modal-footer"><button className="ss-br__button" disabled={!!busy} onClick={() => setDisconnect(null)}>{tr("Annuler", "Cancel")}</button><button className="ss-br__primary" disabled={!!busy} onClick={() => void remove()}>{busy ? tr("En cours…", "Working…") : tr("Déconnecter", "Disconnect")}</button></div></div></BusinessModal>}
  </div>;
}

function ConnectionSetup({ provider, initialShop, english: en, onClose, onSuccess }: { provider: Provider; initialShop: string; english: boolean; onClose: () => void; onSuccess: (result: ConnectionResult) => Promise<void> }) {
  const tr = (fr: string, english: string) => en ? english : fr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<ProjectDiscovery["projects"]>([]);
  const [needsProject, setNeedsProject] = useState(false);
  const [project, setProject] = useState("");
  const [projectLink, setProjectLink] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    if (provider === "shopify") {
      const shop = String(form.get("shop") || "").trim();
      window.location.assign(`/api/business/connectors/shopify/authorize?${new URLSearchParams({ shop })}`);
      return;
    }
    const apiKey = String(form.get("apiKey") || "").trim();
    const selectedProject = project === "__link__" ? projectLink.trim() : project.trim();
    try {
      await onSuccess(await businessRequest<ConnectionResult>("/connections", { provider, apiKey, ...(provider === "revenuecat" && selectedProject ? { externalAccountId: selectedProject } : {}) }));
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "";
      if (provider === "revenuecat" && (code === "revenuecat_project_selection_required" || code === "revenuecat_project_id_required")) {
        setNeedsProject(true);
        try {
          const discovery = await businessRequest<ProjectDiscovery>("/connections/discover", { provider, apiKey });
          setProjects(discovery.projects); setProject(discovery.projects.length === 1 ? discovery.projects[0].id : "");
          setError("");
        } catch { setProjects([]); setError(connectionError(failure, en)); }
      } else setError(connectionError(failure, en));
    } finally { setBusy(false); }
  }
  return <BusinessModal title={`${tr("Connecter", "Connect")} ${names[provider]}`} onClose={() => { if (!busy) onClose(); }} english={en}>
    <form className="ss-br__form ss-commerce__setup" onSubmit={event => void submit(event)}>
      <div className="ss-commerce__setup-brand"><ProviderLogo provider={provider} /></div>
      <p className="ss-commerce__setup-intro">{provider === "shopify" ? tr("Renseigne ta boutique, puis autorise ScrollShow dans Shopify.", "Enter your store, then authorize ScrollShow in Shopify.") : tr("Colle ta clé. ScrollShow vérifie le compte et retrouve tes ventes.", "Paste your key. ScrollShow verifies the account and finds your sales.")}</p>
      {error && <div className="ss-br__notice is-error" role="alert">{error}</div>}
      {provider === "shopify" ? <>
        <BusinessField label={tr("Adresse de ta boutique", "Your store address")} hint={tr("Utilise ton adresse myshopify.com, même si ta boutique possède un autre domaine.", "Use your myshopify.com address, even if your store has another domain.")}><input name="shop" defaultValue={initialShop} required autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder={tr("ma-boutique.myshopify.com", "my-store.myshopify.com")} maxLength={255} /></BusinessField>
        <div className="ss-commerce__key-help"><a href={dashboards.shopify} target="_blank" rel="noreferrer">{tr("Ouvrir mon administration Shopify", "Open my Shopify admin")} ↗</a><p>{tr("Retrouve l’adresse dans Paramètres → Domaines.", "Find the address in Settings → Domains.")}</p></div>
      </> : <>
        <BusinessField label={provider === "stripe" ? tr("Clé API Stripe", "Stripe API key") : tr("Clé API RevenueCat v2", "RevenueCat v2 API key")}><input name="apiKey" type="password" required autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={4096} onChange={() => { if (needsProject) { setNeedsProject(false); setProjects([]); setProject(""); setProjectLink(""); } }} placeholder={provider === "stripe" ? "sk_live_… / rk_live_…" : "sk_…"} /></BusinessField>
        <div className="ss-commerce__key-help"><a href={dashboards[provider]} target="_blank" rel="noreferrer">{provider === "stripe" ? tr("Ouvrir mes clés API Stripe", "Open my Stripe API keys") : tr("Ouvrir RevenueCat", "Open RevenueCat")} ↗</a><p>{provider === "stripe" ? tr("Une clé secrète ou restreinte avec accès en lecture suffit.", "Use a secret or restricted key with read access.") : tr("Dans ton projet : API keys → Secret API keys → v2. Autorise Apps : Read et Customers : Read. Projects : Read permet la détection automatique.", "In your project: API keys → Secret API keys → v2. Allow Apps: Read and Customers: Read. Projects: Read enables automatic detection.")}</p></div>
        {provider === "revenuecat" && needsProject && <div className="ss-commerce__project-choice"><p>{projects.length ? tr("Quel projet veux-tu connecter ?", "Which project would you like to connect?") : tr("La clé ne permet pas de retrouver le projet automatiquement. Colle simplement son lien.", "This key does not allow automatic project discovery. Paste the project link instead.")}</p>
          <BusinessField label={projects.length ? tr("Ton projet", "Your project") : tr("Lien du projet RevenueCat", "RevenueCat project link")}>
            {projects.length ? <select value={project} onChange={event => setProject(event.target.value)} required><option value="">{tr("Choisir un projet", "Choose a project")}</option>{projects.map(item => <option value={item.id} key={item.id}>{item.name || item.id}</option>)}<option value="__link__">{tr("Un autre projet…", "Another project…")}</option></select> : <input value={project} onChange={event => setProject(event.target.value)} placeholder="https://app.revenuecat.com/projects/…" autoComplete="off" required />}
          </BusinessField>
          {projects.length > 0 && project === "__link__" && <BusinessField label={tr("Lien du projet RevenueCat", "RevenueCat project link")}><input value={projectLink} onChange={event => setProjectLink(event.target.value)} placeholder="https://app.revenuecat.com/projects/…" autoComplete="off" required /></BusinessField>}
        </div>}
      </>}
      <p className="ss-commerce__privacy">{provider === "shopify" ? tr("Aucun mot de passe Shopify à partager.", "No Shopify password to share.") : tr("Ta clé est chiffrée. Elle ne s’affiche plus après connexion.", "Your key is encrypted and is not displayed after connection.")}</p>
      <div className="ss-br__modal-footer"><button type="button" className="ss-br__button" disabled={busy} onClick={onClose}>{tr("Annuler", "Cancel")}</button><button type="submit" className="ss-br__primary" disabled={busy}>{busy ? tr("Connexion…", "Connecting…") : provider === "shopify" ? tr("Continuer sur Shopify", "Continue to Shopify") : tr("Connecter", "Connect")}</button></div>
    </form>
  </BusinessModal>;
}

function WebhookSetup({ connection, issued, origin, english: en, onClose, onSaved }: { connection: PublicBusinessConnection; issued?: ConnectionResult; origin: string; english: boolean; onClose: () => void; onSaved: (result: ConnectionResult) => Promise<void> }) {
  const tr = (fr: string, english: string) => en ? english : fr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const url = `${origin}${issued?.webhook?.urlPath || `/api/business/webhooks/${connection.provider}/${connection.id}`}`;
  const revenuecat = connection.provider === "revenuecat";
  const authorization = issued?.webhook?.authorization;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      await onSaved(await businessRequest<ConnectionResult>(`/connections/${encodeURIComponent(connection.id)}`, revenuecat ? { rotateWebhookSecret: true } : { webhookSecret: String(form.get("webhookSecret") || "").trim() }, "PATCH"));
      setSaved(true);
    } catch (failure) { setError(connectionError(failure, en)); }
    finally { setBusy(false); }
  }
  return <BusinessModal title={tr("Paiements en direct", "Live payments")} english={en} onClose={() => { if (!busy) onClose(); }}><form className="ss-br__form ss-commerce__setup" onSubmit={event => void submit(event)}>
    <p className="ss-commerce__setup-intro">{tr("Ajoute cette adresse dans les webhooks du fournisseur.", "Add this address to your provider’s webhooks.")} <a href={revenuecat ? "https://app.revenuecat.com" : "https://dashboard.stripe.com/webhooks"} target="_blank" rel="noreferrer">{tr("Ouvrir", "Open")} {revenuecat ? "RevenueCat" : "Stripe"} ↗</a></p>
    {error && <div className="ss-br__notice is-error" role="alert">{error}</div>}
    {saved && <div className="ss-br__notice is-success" role="status">{tr("Configuration enregistrée. La réception sera confirmée au premier événement valide.", "Settings saved. Delivery will be confirmed after the first valid event.")}</div>}
    <BusinessField label={tr("URL du webhook", "Webhook URL")}><input value={url} readOnly /></BusinessField><CopyButton value={url} english={en} />
    {issued?.webhook?.events.length ? <><p className="ss-br__caption">{tr("Événements à sélectionner", "Events to select")}</p><pre className="ss-br__code">{issued.webhook.events.join("\n")}</pre></> : <p className="ss-br__caption">{revenuecat ? tr("Sélectionne INITIAL_PURCHASE, RENEWAL, NON_RENEWING_PURCHASE, CANCELLATION et REFUND_REVERSED.", "Select INITIAL_PURCHASE, RENEWAL, NON_RENEWING_PURCHASE, CANCELLATION and REFUND_REVERSED.") : tr("Sélectionne charge.succeeded, charge.captured, refund.created et refund.updated.", "Select charge.succeeded, charge.captured, refund.created and refund.updated.")}</p>}
    {revenuecat ? authorization ? <><p className="ss-br__caption">{tr("Colle cette valeur dans le champ Authorization de RevenueCat. Elle n’est disponible que pendant cette session.", "Paste this value into the RevenueCat Authorization field. It is only available during this session.")}</p><pre className="ss-br__code">{authorization}</pre><CopyButton value={authorization} english={en} /></> : <><p className="ss-br__caption">{tr("L’autorisation existante ne peut pas être réaffichée. La remplacer invalide l’ancienne : mets aussi RevenueCat à jour.", "The existing authorization cannot be shown again. Replacing it invalidates the old one: update RevenueCat too.")}</p><label className="ss-br__check"><input type="checkbox" required /><span>{tr("Je vais remplacer l’autorisation dans RevenueCat.", "I will replace the authorization in RevenueCat.")}</span></label></> : !saved && <BusinessField className="ss-commerce__webhook-secret" label={tr("Secret de signature Stripe", "Stripe signing secret")} hint={tr("Copie le secret whsec_ de l’endpoint créé dans Stripe.", "Copy the whsec_ secret from the endpoint created in Stripe.")}><input type="password" name="webhookSecret" autoComplete="off" required minLength={16} maxLength={500} placeholder="whsec_…" /></BusinessField>}
    <div className="ss-br__modal-footer"><button type="button" className="ss-br__button" disabled={busy} onClick={onClose}>{tr("Fermer", "Close")}</button>{!authorization && !saved && <button className="ss-br__primary" disabled={busy}>{busy ? tr("Enregistrement…", "Saving…") : revenuecat ? tr("Remplacer l’autorisation", "Replace authorization") : tr("Enregistrer", "Save")}</button>}</div>
  </form></BusinessModal>;
}
