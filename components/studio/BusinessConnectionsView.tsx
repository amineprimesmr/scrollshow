"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { PublicBusinessConnection } from "@/lib/business-analytics/model";
import { useStudio } from "./StudioContext";
import { IconChart, IconPlus, IconPlug } from "./icons";
import { BusinessEmpty, BusinessField, BusinessModal, CopyButton, businessError, businessRequest } from "./business-ui";
import "./business-results.css";

type Provider = "stripe" | "revenuecat" | "lemonsqueezy" | "paddle";
const providerNames: Record<Provider, string> = { stripe: "Stripe", revenuecat: "RevenueCat", lemonsqueezy: "Lemon Squeezy", paddle: "Paddle" };
type Capability = { provider: string; name: string; keyAvailable: boolean; oauthAvailable: boolean; setupRequired: string[]; history: string; webhook: boolean; documentationUrl?: string };
type ConnectionsResponse = { connections: PublicBusinessConnection[]; capabilities: Capability[] };
type ConnectionResult = { connection: PublicBusinessConnection; webhook?: { urlPath: string; authorization?: string; events: string[] }; sync?: unknown };

export function BusinessConnectionsView() {
  const { english: en, user } = useStudio();
  const tr = (fr: string, english: string) => en ? english : fr;
  const requestRef = useRef(0);
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [webhookConnection, setWebhookConnection] = useState<PublicBusinessConnection | null>(null);
  const [disconnect, setDisconnect] = useState<PublicBusinessConnection | null>(null);
  const [origin, setOrigin] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++requestRef.current;
    const current = () => request === requestRef.current && !signal?.aborted;
    try { const next = await businessRequest<ConnectionsResponse>("/connections", undefined, "GET"); if (current()) { setData(next); setError(""); } }
    catch (failure) { if (current()) setError(businessError(failure, en)); }
    finally { if (current()) setLoading(false); }
  }, [en]);
  useEffect(() => { setData(null); setResult(null); setProvider(null); setWebhookConnection(null); setLoading(true); if (!user?.projectId) return; const controller = new AbortController(); void load(controller.signal); setOrigin(window.location.origin); return () => { requestRef.current++; controller.abort(); }; }, [load, user?.projectId]);

  async function sync(connection: PublicBusinessConnection) {
    setBusy(connection.id); setNotice("");
    try { await businessRequest(`/connections/${encodeURIComponent(connection.id)}/sync`, {}); setNotice(tr("Synchronisation terminée. Les résultats disponibles ont été actualisés.", "Sync completed. Available results have been refreshed.")); await load(); }
    catch (failure) { setError(businessError(failure, en)); }
    finally { setBusy(""); }
  }
  async function remove() {
    if (!disconnect) return;
    setBusy(disconnect.id);
    try { await businessRequest(`/connections/${encodeURIComponent(disconnect.id)}`, {}, "DELETE"); setDisconnect(null); await load(); setNotice(tr("Connexion déconnectée.", "Connection disconnected.")); }
    catch (failure) { setError(businessError(failure, en)); }
    finally { setBusy(""); }
  }

  const date = (value?: string) => value ? new Date(value).toLocaleString(en ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }) : tr("Pas encore reçu", "Not received yet");
  return <div className="ss-br ss-br-page">
    <header className="ss-br__header"><div><p className="ss-br__eyebrow">{tr("CONNEXIONS BUSINESS", "BUSINESS CONNECTIONS")}</p><h1>{tr("Tes ventes, à la source.", "Your sales, from the source.")}</h1><p className="ss-br__subtitle">{tr("Connecte les revenus de ton activité aux résultats de tes contenus.", "Connect your business revenue to your content results.")}</p></div><Link className="ss-br__button lg lg--lens lg-press" href="/app/analytics"><IconChart size={15} />{tr("Voir les résultats", "View results")}</Link></header>
    {error && <div className="ss-br__notice is-error" role="alert">{error}<button className="ss-br__button" onClick={() => void load()}>{tr("Réessayer", "Retry")}</button></div>}
    {notice && <div className="ss-br__notice is-success" role="status">{notice}</div>}
    <div className="ss-br__notice lg lg--flat"><IconPlug size={17} /><span>{tr("Ces connexions concernent les clients de ton business. Ton abonnement ScrollShow se gère dans les réglages du compte.", "These connections are for your business customers. Manage your ScrollShow subscription in account settings.")}</span></div>
    {loading ? <div className="ss-br__connections" aria-busy="true"><div className="ss-br__skeleton" /><div className="ss-br__skeleton" /></div> : <div className="ss-br__connections">
      {(["stripe", "revenuecat", "lemonsqueezy", "paddle"] as Provider[]).filter(id => id === "stripe" || id === "revenuecat" || data?.capabilities.some(item => item.provider === id)).map(id => {
        const capability = data?.capabilities?.find(item => item.provider === id);
        const connections = data?.connections?.filter(item => item.provider === id && item.status !== "disconnected") || [];
        const name = providerNames[id];
        return <section className="ss-br__provider" key={id}><div className="ss-br__provider-head"><span className="ss-br__provider-symbol" aria-hidden>{id === "stripe" ? "s" : id === "revenuecat" ? "rc" : id === "lemonsqueezy" ? "ls" : "p"}</span><div><h2>{name}</h2><span className={`ss-br__pill ${connections.length ? "is-good" : ""}`}>{connections.length ? tr(`${connections.length} connexion${connections.length > 1 ? "s" : ""}`, `${connections.length} connection${connections.length > 1 ? "s" : ""}`) : tr("À connecter", "Not connected")}</span></div></div>
          <p>{id === "stripe" ? tr("Paiements, abonnements et remboursements de ton SaaS ou de ta boutique.", "Payments, subscriptions and refunds from your SaaS or store.") : id === "revenuecat" ? tr("Achats et renouvellements des clients de ton app, dans un projet RevenueCat.", "App customer purchases and renewals from a RevenueCat project.") : tr("Commandes, abonnements et ajustements de ton activité.", "Orders, subscriptions and adjustments from your business.")}</p>
          {connections.map(connection => <div className="ss-br__connection" key={connection.id}><div className="ss-br__connection-head"><strong>{connection.name || name}</strong><span className={`ss-br__pill ${connection.status === "error" ? "is-error" : connection.status === "connected" ? "is-good" : "is-warn"}`}>{connection.status === "connected" ? tr("Accès vérifié", "Access verified") : connection.status === "syncing" ? tr("Synchronisation", "Syncing") : connection.status === "error" ? tr("À vérifier", "Needs attention") : tr("Configuration requise", "Setup required")}</span></div>
            <small>{connection.externalAccountId} · {connection.environment === "live" ? tr("Production", "Live") : "Sandbox"}</small>
            <div className="ss-br__key-value"><span>{tr("Dernière synchronisation", "Last sync")}</span><span>{date(connection.lastSyncedAt)}</span></div>
            <div className="ss-br__key-value"><span>{tr("Dernier événement reçu", "Last event received")}</span><span>{date(connection.lastWebhookAt)}</span></div>
            {!connection.lastWebhookAt && <small>{tr("Accès API vérifié ≠ réception des nouveaux paiements. Termine le webhook pour recevoir les événements.", "Verified API access does not mean new payments are arriving. Complete webhook setup to receive events.")}</small>}
            {connection.lastError && <small className="ss-br__caption">{tr("La dernière collecte a échoué. Vérifie les permissions puis synchronise de nouveau.", "The latest collection failed. Check permissions and sync again.")}</small>}
            <div className="ss-br__connection-actions"><button className="ss-br__button lg lg--lens lg-press" disabled={!!busy} onClick={() => void sync(connection)}>{busy === connection.id ? tr("En cours…", "Working…") : tr("Synchroniser", "Sync")}</button><button className="ss-br__button lg lg--lens" onClick={() => setWebhookConnection(connection)} disabled={!!busy}>{tr("Webhook", "Webhook")}</button><button className="ss-br__icon-button" onClick={() => setDisconnect(connection)} disabled={!!busy}>{tr("Déconnecter", "Disconnect")}</button></div>
          </div>)}
          <button className="ss-br__button lg lg--lens lg-press" disabled={!capability?.keyAvailable} onClick={() => { setError(""); setProvider(id); }}><IconPlus size={14} />{tr("Ajouter un compte", "Add account")}</button>
          {!capability?.keyAvailable && <p className="ss-br__caption">{tr("La connexion sécurisée doit être activée sur ce serveur avant de saisir une clé. L'import CSV reste disponible dans les résultats.", "Secure connections must be enabled on this server before entering a key. CSV import is available in Results.")}</p>}
          {capability?.history && <small className="ss-br__caption">{tr("La synchronisation importe un historique limité aux données disponibles chez ce fournisseur.", "Sync imports a bounded history of the data available from this provider.")}</small>}{capability?.documentationUrl && <a href={capability.documentationUrl} target="_blank" rel="noreferrer" className="ss-br__text-link">{tr("Obtenir une clé API", "Get an API key")} ↗</a>}
        </section>;
      })}
    </div>}
    <div className="ss-br__grid ss-br__grid--equal"><section className="ss-br__panel"><div className="ss-br__panel-head"><div><h2>{tr("Relier l'origine d'une vente", "Connect a sale to its origin")}</h2><p>{tr("Une connexion de paiement ne connaît pas le post d'origine.", "A payment connection does not know the original post.")}</p></div></div><div className="ss-br__panel-body"><ol className="ss-br__progress-list"><li><span>1</span><div><strong>{tr("Crée un lien pour le contenu", "Create a content link")}</strong><p>{tr("Chaque clic conserve son lien et sa publication.", "Each click keeps its link and publication.")}</p></div></li><li><span>2</span><div><strong>{tr("Installe le suivi sur ton site", "Install tracking on your site")}</strong><p>{tr("Relie l'identifiant de clic à l'inscription et au client payeur.", "Link the click identifier to the signup and paying customer.")}</p></div></li><li><span>3</span><div><strong>{tr("Vérifie le parcours complet", "Verify the complete journey")}</strong><p>{tr("Les ventes sans lien observé restent d'origine inconnue.", "Sales without an observed link keep an unknown origin.")}</p></div></li></ol><Link href="/app/analytics?tab=settings" className="ss-br__text-link">{tr("Ouvrir l'installation du suivi", "Open tracking setup")} →</Link></div></section>
    <section className="ss-br__panel"><BusinessEmpty title={tr("Une autre plateforme ?", "Another platform?")} body={tr("Importe un CSV de transactions identifiées. Les données importées portent leur source et ne sont pas présentées comme vérifiées par un fournisseur.", "Import a CSV with identified transactions. Imported data keeps its source and is not presented as provider verified.")} action={<Link className="ss-br__button lg lg--lens lg-press" href="/app/analytics?tab=settings">{tr("Importer des transactions", "Import transactions")}</Link>} /></section></div>
    {provider && <ConnectionSetup provider={provider} english={en} onClose={() => setProvider(null)} onSuccess={async next => { setProvider(null); setResult(next); await load(); }} />}
    {result && <BusinessModal title={tr("Termine la réception des événements", "Finish event delivery setup")} onClose={() => setResult(null)} english={en}><div className="ss-br__modal-content"><p>{tr("L'accès au compte est vérifié. Ajoute ce webhook dans le tableau de bord du fournisseur pour recevoir les prochains événements.", "Account access is verified. Add this webhook in the provider dashboard to receive future events.")}</p>{result.webhook ? <><BusinessField label={tr("URL du webhook", "Webhook URL")}><input readOnly value={`${origin}${result.webhook.urlPath}`} /></BusinessField><CopyButton value={`${origin}${result.webhook.urlPath}`} english={en} />{result.webhook.authorization && <><p className="ss-br__caption">{tr("Copie cette autorisation maintenant. Elle ne sera plus affichée après la fermeture.", "Copy this authorization now. It will not be shown after closing.")}</p><pre className="ss-br__code">{result.webhook.authorization}</pre><CopyButton value={result.webhook.authorization} english={en} /></>}<p className="ss-br__caption">{tr("Événements à sélectionner", "Events to select")}</p><pre className="ss-br__code">{result.webhook.events.join("\n")}</pre></> : <p className="ss-br__caption">{tr("Synchronise le compte pour importer les données disponibles.", "Sync the account to import available data.")}</p>}<div className="ss-br__modal-footer">{result.connection.provider !== "revenuecat" && <button className="ss-br__button lg" onClick={() => { setWebhookConnection(result.connection); setResult(null); }}>{tr("Renseigner le secret du webhook", "Enter webhook secret")}</button>}<button className="ss-br__primary" onClick={() => setResult(null)}>{tr("J'ai enregistré la configuration", "I've saved the configuration")}</button></div></div></BusinessModal>}
    {webhookConnection && <WebhookSetup connection={webhookConnection} origin={origin} english={en} onClose={() => setWebhookConnection(null)} onSaved={async next => { setWebhookConnection(null); setResult(next); await load(); }} />}
    {disconnect && <BusinessModal title={tr("Déconnecter ce compte ?", "Disconnect this account?")} onClose={() => setDisconnect(null)} english={en}><div className="ss-br__modal-content"><p>{tr("Les prochaines collectes de ce compte seront arrêtées. Cette action ne modifie aucun paiement chez le fournisseur.", "Future collection from this account will stop. This does not change any payment at the provider.")}</p><div className="ss-br__modal-footer"><button className="ss-br__button" onClick={() => setDisconnect(null)}>{tr("Annuler", "Cancel")}</button><button className="ss-br__primary" disabled={!!busy} onClick={() => void remove()}>{busy ? tr("En cours…", "Working…") : tr("Déconnecter", "Disconnect")}</button></div></div></BusinessModal>}
  </div>;
}

function ConnectionSetup({ provider, english: en, onClose, onSuccess }: { provider: Provider; english: boolean; onClose: () => void; onSuccess: (result: ConnectionResult) => Promise<void> }) {
  const tr = (fr: string, english: string) => en ? english : fr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const result = await businessRequest<ConnectionResult>("/connections", { provider, name: String(form.get("name") || ""), apiKey: String(form.get("apiKey") || "").trim(), externalAccountId: String(form.get("externalAccountId") || "").trim() || undefined, webhookSecret: String(form.get("webhookSecret") || "").trim() || undefined, environment: form.get("environment"), revenuecatAppIds: String(form.get("appIds") || "").split(/[,\s]+/).filter(Boolean), excludeStripe: form.get("excludeStripe") === "on" });
      await onSuccess(result);
    } catch (failure) { setError(businessError(failure, en)); } finally { setBusy(false); }
  }
  return <BusinessModal title={`${tr("Connecter", "Connect")} ${providerNames[provider]}`} onClose={() => { if (!busy) onClose(); }} english={en}><form className="ss-br__form" onSubmit={event => void submit(event)}>
    <p className="ss-br__caption" style={{ marginTop: 0, marginBottom: 20 }}>{tr("La clé est chiffrée côté serveur et vérifiée avant que la connexion apparaisse comme active.", "The key is encrypted on the server and verified before the connection appears active.")}</p>
    {error && <div className="ss-br__notice is-error" role="alert">{error}</div>}
    <div className="ss-br__form-grid"><BusinessField label={tr("Nom du compte", "Account name")}><input name="name" required placeholder={tr("Mon activité", "My business")} maxLength={100} /></BusinessField><BusinessField label={tr("Environnement", "Environment")}><select name="environment" defaultValue="production"><option value="production">Production</option><option value="sandbox">Sandbox / test</option></select></BusinessField></div>
    <BusinessField label={provider === "revenuecat" ? tr("Clé secrète RevenueCat v2", "RevenueCat v2 secret key") : tr("Clé API secrète", "Secret API key")} hint={provider !== "revenuecat" ? tr("Utilise une clé du compte dont tu veux analyser les ventes.", "Use a key for the account whose sales you want to analyze.") : tr("Clé de lecture du projet, distincte de la clé publique SDK strp_.", "A project read key, separate from the public strp_ SDK key.")}><input name="apiKey" type="password" autoComplete="off" maxLength={4096} required spellCheck={false} /></BusinessField>
    {provider === "revenuecat" ? <><BusinessField label={tr("Identifiant du projet RevenueCat", "RevenueCat project ID")}><input name="externalAccountId" required placeholder="proj…" autoComplete="off" /></BusinessField><BusinessField label={tr("Applications à inclure (facultatif)", "Apps to include (optional)")} hint={tr("Identifiants séparés par une virgule. Vide : toutes les applications du projet.", "Comma-separated IDs. Leave empty for all apps in the project.")}><input name="appIds" placeholder="app…" /></BusinessField><label className="ss-br__check"><input name="excludeStripe" type="checkbox" defaultChecked /><span>{tr("Exclure les transactions Stripe du miroir RevenueCat pour éviter de les compter deux fois.", "Exclude Stripe transactions mirrored in RevenueCat to avoid counting them twice.")}</span></label></> : <>{provider === "lemonsqueezy" && <BusinessField label={tr("Identifiant du magasin", "Store ID")}><input name="externalAccountId" required pattern="[0-9]+" inputMode="numeric" /></BusinessField>}<BusinessField label={tr("Secret du webhook existant (facultatif)", "Existing webhook secret (optional)")} hint={provider === "stripe" ? tr("Le secret whsec_ de l’endpoint Stripe, si tu l’as déjà créé.", "The whsec_ secret for your Stripe endpoint, if already created.") : tr("Le secret défini dans la configuration du webhook chez le fournisseur.", "The secret from the provider webhook configuration.")}><input name="webhookSecret" type="password" autoComplete="off" placeholder={provider === "stripe" ? "whsec_…" : undefined} /></BusinessField></>}
    <div className="ss-br__modal-footer"><button type="button" className="ss-br__button" onClick={onClose} disabled={busy}>{tr("Annuler", "Cancel")}</button><button type="submit" className="ss-br__primary" disabled={busy}>{busy ? tr("Vérification…", "Verifying…") : tr("Vérifier et connecter", "Verify and connect")}</button></div>
  </form></BusinessModal>;
}

function WebhookSetup({ connection, origin, english: en, onClose, onSaved }: { connection: PublicBusinessConnection; origin: string; english: boolean; onClose: () => void; onSaved: (result: ConnectionResult) => Promise<void> }) {
  const tr = (fr: string, eng: string) => en ? eng : fr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = `${origin}/api/business/webhooks/${connection.provider}/${connection.id}`;
  const revenuecat = connection.provider === "revenuecat";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try { await onSaved(await businessRequest<ConnectionResult>(`/connections/${encodeURIComponent(connection.id)}`, revenuecat ? { rotateWebhookSecret: true } : { webhookSecret: String(form.get("webhookSecret") || "").trim() }, "PATCH")); }
    catch (failure) { setError(businessError(failure, en)); } finally { setBusy(false); }
  }
  return <BusinessModal title={tr("Configurer le webhook", "Configure webhook")} english={en} onClose={() => { if (!busy) onClose(); }}><form className="ss-br__form" onSubmit={event => void submit(event)}>{error && <div className="ss-br__notice is-error" role="alert">{error}</div>}<BusinessField label={tr("URL de réception", "Delivery URL")}><input value={url} readOnly /></BusinessField><CopyButton value={url} english={en} /><p className="ss-br__caption">{tr("Ajoute cette URL dans les webhooks du fournisseur. La réception sera confirmée uniquement après un événement valide.", "Add this URL in the provider webhook settings. Delivery is only confirmed after a valid event arrives.")}</p>{revenuecat ? <><p>{tr("Le secret existant ne peut pas être réaffiché. Le remplacer invalide immédiatement l’ancien ; copie le nouveau dans RevenueCat pour rétablir la réception.", "The existing secret cannot be shown again. Replacing it immediately invalidates the old one; copy the new secret into RevenueCat to restore delivery.")}</p><label className="ss-br__check"><input type="checkbox" required /><span>{tr("Je vais remplacer l’autorisation dans RevenueCat.", "I will replace the authorization in RevenueCat.")}</span></label></> : <BusinessField label={tr("Secret de signature du webhook", "Webhook signing secret")}><input type="password" name="webhookSecret" autoComplete="off" required minLength={16} maxLength={connection.provider === "lemonsqueezy" ? 40 : 500} placeholder={connection.provider === "stripe" ? "whsec_…" : undefined} /></BusinessField>}<div className="ss-br__modal-footer"><button type="button" className="ss-br__button" disabled={busy} onClick={onClose}>{tr("Fermer", "Close")}</button><button className="ss-br__primary" disabled={busy}>{busy ? tr("Enregistrement…", "Saving…") : revenuecat ? tr("Remplacer l’autorisation", "Replace authorization") : tr("Enregistrer le secret", "Save secret")}</button></div></form></BusinessModal>;
}
