"use client";
import { checkedFetch } from "@/lib/client-request";
import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { IconPlug } from "./icons";

type RequestRow = {
  id: string;
  status: "queued" | "running" | "done" | "failed" | "none";
  requestedAt?: string;
  author: string | null;
  slides: number;
  sharer: string | null;
  link: "connected" | "tracked" | "unlinked" | "unknown";
  projectName: string | null;
  resultPostId: string | null;
  error: string | null;
  trigger: { ok: boolean; error: string | null; sessionUrl: string | null } | null;
  claudeUrl: string;
};

type Status = {
  shortcutMode: "ask" | "recreate" | "save";
  agentConnected: boolean;
  agentByKey: boolean;
  mcpUrl: string;
  connectorsUrl: string;
  trigger: { configured: false } | { configured: true; url: string; tokenHint: string; createdAt: string; lastFiredAt: string | null; lastError: string | null; lastSessionUrl: string | null };
  routinePrompt: string;
  requests: RequestRow[];
};

const STATUS_LABEL: Record<RequestRow["status"], [string, string]> = {
  queued: ["En attente", "Waiting"],
  running: ["En cours", "In progress"],
  done: ["Brouillon prêt", "Draft ready"],
  failed: ["Échec", "Failed"],
  none: ["—", "—"],
};

const FIRE_ERRORS: Record<string, [string, string]> = {
  token_revoked: ["jeton révoqué ou régénéré", "token revoked or regenerated"],
  token_unreadable: ["jeton illisible, recolle-le", "token unreadable, paste it again"],
  routine_missing: ["routine supprimée", "routine deleted"],
  routine_paused_or_invalid: ["routine en pause", "routine paused"],
  rate_limited: ["limite horaire Claude atteinte", "Claude hourly limit reached"],
  no_access: ["routines indisponibles sur ce compte Claude", "routines unavailable on this Claude account"],
  network: ["Claude injoignable", "Claude unreachable"],
};

function fireError(code: string | null | undefined, english: boolean) {
  if (!code) return "";
  const known = FIRE_ERRORS[code];
  return known ? (english ? known[1] : known[0]) : code;
}

/**
 * Reglages → API → Raccourci iPhone. Le raccourci envoie un post TikTok ; la routine Claude de
 * l'utilisateur (claude.ai/code/routines, declenchee par API) le recree en arriere-plan, a ses frais.
 * Rien ne s'ouvre sur le telephone.
 */
export function ShortcutSettings({ english, busyKey, onCreateKey, revealed, copied, onCopy }: { english: boolean; busyKey: boolean; onCreateKey: () => void; revealed: string; copied: boolean; onCopy: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const lang = english ? "?lang=en" : "";

  useEffect(() => {
    void checkedFetch(`/api/studio/shortcut${lang}`).then(res => res.json()).then(setStatus).catch(() => setStatus(null));
  }, [lang]);

  // Tant qu'une recreation attend ou tourne, la liste se met a jour seule : on voit l'agent avancer.
  const waiting = Boolean(status?.requests.some(item => item.status === "queued" || item.status === "running"));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      void fetch(`/api/studio/shortcut${lang}`).then(res => (res.ok ? res.json() : null)).then(next => { if (next) setStatus(next); }).catch(() => undefined);
    }, 8000);
    return () => clearInterval(timer);
  }, [waiting, lang]);

  async function act(action: string, extra: Record<string, string> = {}) {
    setBusy(action + (extra.id || ""));
    setNote("");
    try {
      const res = await fetch(`/api/studio/shortcut${lang}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(json.error === "routine_invalid"
          ? t("URL ou jeton non reconnus. L’URL finit par /fire, le jeton commence par sk-ant-oat01-.", "URL or token not recognised. The URL ends with /fire, the token starts with sk-ant-oat01-.", english)
          : json.error === "rate_limited" ? t("Trop d’essais. Réessaie dans quelques minutes.", "Too many attempts. Try again in a few minutes.", english)
          : t("L’action n’a pas abouti.", "The action failed.", english));
        return;
      }
      if (json.status) setStatus(json.status);
      const result = json.result as { ok?: boolean; error?: string; sessionUrl?: string; delivery?: string; openUrl?: string } | undefined;
      if (action === "save") { setUrl(""); setToken(""); setNote(t("Routine enregistrée. Lance un test pour vérifier.", "Routine saved. Run a test to check it.", english)); }
      if (action === "test") setNote(result?.ok ? t("La routine a démarré : ouvre la session pour voir l’agent travailler.", "The routine started: open the session to watch the agent.", english) : `${t("La routine n’a pas démarré", "The routine did not start", english)} : ${fireError(result?.error, english)}`);
      if (action === "retry" && result?.delivery === "claude" && result.openUrl) window.open(result.openUrl, "_blank", "noopener");
      if (action === "retry" && result?.delivery === "routine") setNote(t("Ton agent a été relancé.", "Your agent was restarted.", english));
    } catch {
      setNote(t("L’action n’a pas abouti. Vérifie ta connexion puis réessaie.", "The action failed. Check your connection and try again.", english));
    } finally {
      setBusy("");
    }
  }

  async function copyPrompt() {
    if (!status) return;
    try { await navigator.clipboard.writeText(status.routinePrompt); setPromptCopied(true); setTimeout(() => setPromptCopied(false), 1600); } catch { /* presse-papiers refuse */ }
  }

  async function copyAddress() {
    if (!status) return;
    try { await navigator.clipboard.writeText(status.mcpUrl); setAddressCopied(true); setTimeout(() => setAddressCopied(false), 1600); } catch { /* presse-papiers refuse */ }
  }

  const trigger = status?.trigger;
  const auto = trigger?.configured === true;

  const requests = status?.requests.length ? (
    <>
      <h3 className="ss-sc__sub">{t("Derniers partages", "Recent shares", english)}</h3>
      <ul className="ss-settings-list ss-sc__list">
        {status.requests.map(item => (
          <li key={item.id}>
            <span>
              <b>
                {item.author ? `@${item.author}` : "TikTok"}
                {item.slides > 1 ? ` · ${item.slides} slides` : ""}
              </b>
              <span>
                <em className={`ss-sc__state is-${item.status}`}>{english ? STATUS_LABEL[item.status][1] : STATUS_LABEL[item.status][0]}</em>
                {item.status === "queued" && !auto ? ` · ${t("branche le mode automatique pour qu’elle parte seule", "turn on automatic mode so it runs on its own", english)}` : ""}
                {item.sharer ? ` · ${t("depuis", "from", english)} @${item.sharer}` : ""}
                {item.link === "unlinked" ? ` (${t("non lié", "not linked", english)})` : item.link === "tracked" ? ` (${t("non connecté", "not connected", english)})` : ""}
                {item.projectName ? ` · ${item.projectName}` : ""}
                {item.error ? ` · ${item.error}` : ""}
                {item.trigger && !item.trigger.ok ? ` · ${fireError(item.trigger.error, english)}` : ""}
              </span>
            </span>
            <span className="ss-sc__actions">
              {item.resultPostId ? <a className="ss-btn-ghost" href={`/app?post=${encodeURIComponent(item.resultPostId)}`}>{t("Voir le brouillon", "Open draft", english)}</a> : null}
              {item.trigger?.sessionUrl && item.status !== "done" ? <a className="ss-sc__link" href={item.trigger.sessionUrl} target="_blank" rel="noreferrer">{t("Voir l’agent travailler", "Watch the agent", english)}</a> : null}
              {(item.status === "queued" || item.status === "failed") && auto ? (
                <button className="ss-btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => void act("retry", { id: item.id })}>
                  {busy === `retry${item.id}` ? <span className="ss-spin" /> : t("Relancer", "Retry", english)}
                </button>
              ) : null}
              {item.status !== "running" && item.status !== "done" ? (
                <button className="ss-btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => void act("cancel", { id: item.id })}>
                  {t("Retirer", "Remove", english)}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  ) : null;

  return (
    <div className="ss-set-card ss-sc">
      <h2>
        <IconPlug size={16} /> {t("Raccourci iPhone", "iPhone shortcut", english)}
      </h2>
      <p className="ss-lead">
        {t(
          "Sur un post TikTok : Partager → ScrollShow. Rien ne s’ouvre : ton agent Claude recrée le carrousel pour ton business en arrière-plan, avec ton abonnement Claude, et le range en brouillon dans ton calendrier.",
          "On a TikTok post: Share → ScrollShow. Nothing opens: your Claude agent recreates the carousel for your business in the background, on your Claude plan, and saves it as a draft in your calendar.",
          english,
        )}
      </p>

      <div className="ss-sc__chips" role="list">
        <span role="listitem" className={`ss-sc__chip ${auto ? "is-ok" : "is-warn"}`}>
          {auto ? t("Mode automatique branché", "Automatic mode on", english) : t("Mode automatique à brancher", "Automatic mode not set up", english)}
        </span>
        <span role="listitem" className={`ss-sc__chip ${status?.agentConnected || status?.agentByKey ? "is-ok" : "is-warn"}`}>
          {status?.agentConnected ? t("Connecteur Claude actif", "Claude connector active", english)
            : status?.agentByKey ? t("Agent connecté par clé", "Agent connected by key", english)
            : t("Connecteur Claude inactif", "Claude connector inactive", english)}
        </span>
      </div>

      <div className={`ss-sc__auto${auto ? "" : " is-todo"}`}>
        <b className="ss-sc__auto-title">
          {auto ? t("Mode automatique", "Automatic mode", english) : t("À faire une fois : brancher le mode automatique (2 minutes)", "Do once: turn on automatic mode (2 minutes)", english)}
        </b>
        {auto && trigger?.configured ? (
          <div className="ss-sc__routine">
            <span>
              <b>{t("Ta routine Claude est branchée", "Your Claude routine is connected", english)}</b>
              <span>
                {t("jeton", "token", english)} {trigger.tokenHint}
                {trigger.lastFiredAt ? ` · ${t("dernier lancement", "last run", english)} ${new Date(trigger.lastFiredAt).toLocaleString(english ? "en-US" : "fr-FR")}` : ""}
                {trigger.lastError ? ` · ${fireError(trigger.lastError, english)}` : ""}
              </span>
            </span>
            {trigger.lastSessionUrl ? <a className="ss-sc__link" href={trigger.lastSessionUrl} target="_blank" rel="noreferrer">{t("Dernière session", "Last session", english)}</a> : null}
            <button className="ss-btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => void act("test")}>
              {busy === "test" ? <span className="ss-spin" /> : t("Tester", "Test", english)}
            </button>
            <button className="ss-btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => void act("remove")}>
              {t("Débrancher", "Disconnect", english)}
            </button>
          </div>
        ) : (
          <>
            <p className="ss-muted">
              {t(
                "Une routine Claude, c’est ton agent qui tourne dans le cloud d’Anthropic. ScrollShow la déclenche à chaque partage : zéro frais ScrollShow, ça compte dans ton usage Claude (offres Pro, Max, Team).",
                "A Claude routine is your agent running in Anthropic’s cloud. ScrollShow starts it on every share: no ScrollShow fee, it counts toward your Claude usage (Pro, Max, Team plans).",
                english,
              )}
            </p>
            <ol className="ss-steps">
              <li>
                {t("Ouvre les routines Claude et touche « New routine ».", "Open Claude routines and tap “New routine”.", english)}{" "}
                <a className="ss-btn-ghost" href="https://claude.ai/code/routines" target="_blank" rel="noreferrer">{t("Ouvrir les routines", "Open routines", english)}</a>
              </li>
              <li>
                {t("Nom : ScrollShow. Colle ces instructions dans le champ du prompt.", "Name: ScrollShow. Paste these instructions into the prompt field.", english)}{" "}
                <button className="ss-btn-ghost" type="button" onClick={() => void copyPrompt()} disabled={!status}>
                  {promptCopied ? t("Copié", "Copied", english) : t("Copier les instructions", "Copy instructions", english)}
                </button>
                <span className="ss-sc__hint">{t("Si un dépôt GitHub est demandé, choisis n’importe lequel : l’agent n’y touche pas. En bas, garde le connecteur ScrollShow coché.", "If a GitHub repository is required, pick any: the agent never touches it. At the bottom, keep the ScrollShow connector checked.", english)}</span>
              </li>
              <li>{t("« Select a trigger » → « API ». Crée la routine, puis dans le déclencheur API touche « Generate token ».", "“Select a trigger” → “API”. Create the routine, then in the API trigger tap “Generate token”.", english)}</li>
              <li>
                {t("Colle l’URL et le jeton ici, puis « Brancher » (le jeton est chiffré et ne ressort jamais).", "Paste the URL and token here, then “Connect” (the token is encrypted and never shown again).", english)}
                <div className="ss-sc__form">
                  <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire" aria-label={t("URL de la routine", "Routine URL", english)} spellCheck={false} autoComplete="off" />
                  <input value={token} onChange={e => setToken(e.target.value)} placeholder="sk-ant-oat01-…" type="password" aria-label={t("Jeton de la routine", "Routine token", english)} autoComplete="off" />
                  <button className="ss-btn-purple" type="button" disabled={Boolean(busy) || !url || !token} onClick={() => void act("save", { url, token })}>
                    {busy === "save" ? <span className="ss-spin" /> : t("Brancher", "Connect", english)}
                  </button>
                </div>
              </li>
            </ol>
          </>
        )}
      </div>
      {note ? <p className="ss-sc__note" role="status">{note}</p> : null}

      {requests}

      <h3 className="ss-sc__sub">{t("Installer le raccourci", "Install the shortcut", english)}</h3>
      <ol className="ss-steps">
        <li>
          {t("Crée la clé de ton iPhone (valable un an, elle remplace la précédente) et copie-la.", "Create your iPhone key (valid for a year, it replaces the previous one) and copy it.", english)}{" "}
          <button className="ss-btn-ghost" type="button" disabled={busyKey} onClick={onCreateKey}>
            {busyKey ? <span className="ss-spin" /> : t("Créer la clé iPhone", "Create iPhone key", english)}
          </button>
          {revealed ? (
            <div className="ss-reveal ss-sc__key">
              <code>{revealed}</code>
              <button className="ss-btn-ghost" type="button" onClick={onCopy}>{copied ? t("Copié", "Copied", english) : t("Copier", "Copy", english)}</button>
            </div>
          ) : null}
        </li>
        <li>
          {t("Ouvre ce lien sur l’iPhone, touche « Ajouter » et colle la clé.", "Open this link on the iPhone, tap “Add” and paste the key.", english)}{" "}
          <a className="ss-btn-ghost" href={english ? "/ScrollShow-en.shortcut" : "/ScrollShow.shortcut"} download="ScrollShow.shortcut">
            {t("Installer le raccourci", "Install the shortcut", english)}
          </a>
        </li>
        {!status?.agentConnected ? (
          <li>
            {t(
              "Ajoute ScrollShow dans Claude (Réglages → Connecteurs → « Ajouter un connecteur personnalisé ») avec cette adresse, puis « Se connecter ». La routine s’en sert.",
              "Add ScrollShow to Claude (Settings → Connectors → “Add custom connector”) with this address, then “Connect”. The routine uses it.",
              english,
            )}
            <span className="ss-reveal ss-sc__key">
              <code>{status?.mcpUrl || "https://scrollshow.io/api/mcp"}</code>
              <button className="ss-btn-ghost" type="button" onClick={() => void copyAddress()}>{addressCopied ? t("Copié", "Copied", english) : t("Copier", "Copy", english)}</button>
            </span>
            <a className="ss-btn-ghost" href={status?.connectorsUrl || "https://claude.ai/customize/connectors?modal=add-custom-connector"} target="_blank" rel="noreferrer">{t("Ouvrir les connecteurs Claude", "Open Claude connectors", english)}</a>
            <span className="ss-sc__hint">
              {t(
                "ScrollShow est déjà dans tes connecteurs ? Son autorisation a expiré : ouvre-le, « Se déconnecter », puis « Se connecter ».",
                "ScrollShow already in your connectors? Its authorization expired: open it, “Disconnect”, then “Connect”.",
                english,
              )}
            </span>
          </li>
        ) : null}
      </ol>
      <p className="ss-muted">
        {t(
          "Si le compte TikTok ouvert sur ton téléphone est lié à un autre projet, la demande y est rangée ; s’il n’est pas lié à ScrollShow, la notification te prévient.",
          "If the TikTok account open on your phone belongs to another project, the request is filed there; if it is not linked to ScrollShow, the notification tells you.",
          english,
        )}
      </p>

      <div className="ss-set-row ss-sc__mode">
        <div>
          <b>{t("Quand je partage", "When I share", english)}</b>
          <p>{t("Sans « Demander », le raccourci ne pose plus la question.", "Without “Ask”, the shortcut skips the question.", english)}</p>
        </div>
        <div className="ss-seg" role="group" aria-label={t("Quand je partage", "When I share", english)}>
          {([["ask", "Demander", "Ask"], ["recreate", "Recréer", "Recreate"], ["save", "Enregistrer", "Save"]] as const).map(([id, fr, en]) => (
            <button key={id} type="button" className={(status?.shortcutMode || "ask") === id ? "is-on" : ""} disabled={!status || Boolean(busy)} onClick={() => void act("mode", { mode: id })}>
              {english ? en : fr}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
