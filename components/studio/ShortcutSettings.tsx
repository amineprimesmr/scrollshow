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
 * Reglages → API → Raccourci iPhone. Le raccourci envoie un post TikTok ; l'agent
 * de l'utilisateur le recree en brouillon. Deux modes : Claude s'ouvre avec le
 * message pret, ou une routine Claude (claude.ai/code/routines) travaille seule.
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

  return (
    <div className="ss-set-card ss-sc">
      <h2>
        <IconPlug size={16} /> {t("Raccourci iPhone", "iPhone shortcut", english)}
      </h2>
      <p className="ss-lead">
        {t(
          "Sur un post TikTok : Partager → ScrollShow → « Recréer pour mon business ». Ton agent analyse le carrousel et le recrée pour ton business, en brouillon dans ton calendrier, sur le compte TikTok ouvert sur ton téléphone.",
          "On a TikTok post: Share → ScrollShow → “Recreate for my business”. Your agent studies the carousel and recreates it for your business as a draft in your calendar, on the TikTok account open on your phone.",
          english,
        )}
      </p>

      <div className="ss-sc__chips" role="list">
        <span role="listitem" className={`ss-sc__chip ${status?.agentConnected || status?.agentByKey ? "is-ok" : "is-warn"}`}>
          {status?.agentConnected ? t("Claude connecté", "Claude connected", english)
            : status?.agentByKey ? t("Agent connecté par clé", "Agent connected by key", english)
            : t("Claude non connecté", "Claude not connected", english)}
        </span>
        <span role="listitem" className={`ss-sc__chip ${auto ? "is-ok" : ""}`}>
          {auto ? t("Mode automatique", "Automatic mode", english)
            : status?.agentConnected ? t("Mode : Claude s’ouvre", "Mode: Claude opens", english)
            : status?.agentByKey ? t("Mode : à la prochaine session de l’agent", "Mode: at the agent’s next session", english)
            : t("Mode : en attente de Claude", "Mode: waiting for Claude", english)}
        </span>
      </div>

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
        <li>
          {status?.agentConnected ? (
            t("Claude est connecté à ScrollShow : c’est lui qui recrée.", "Claude is connected to ScrollShow: it does the recreation.", english)
          ) : (
            <>
              {t(
                "Ajoute ScrollShow dans Claude : Réglages → Connecteurs → « Ajouter un connecteur personnalisé », nom ScrollShow, avec cette adresse, puis « Se connecter ». C’est Claude qui recrée.",
                "Add ScrollShow to Claude: Settings → Connectors → “Add custom connector”, name ScrollShow, with this address, then “Connect”. Claude does the recreation.",
                english,
              )}
              <span className="ss-reveal ss-sc__key">
                <code>{status?.mcpUrl || "https://scrollshow.io/api/mcp"}</code>
                <button className="ss-btn-ghost" type="button" onClick={() => void copyAddress()}>{addressCopied ? t("Copié", "Copied", english) : t("Copier", "Copy", english)}</button>
              </span>
              <a className="ss-btn-ghost" href={status?.connectorsUrl || "https://claude.ai/customize/connectors?modal=add-custom-connector"} target="_blank" rel="noreferrer">{t("Ouvrir les connecteurs Claude", "Open Claude connectors", english)}</a>
              <span className="ss-sc__hint">
                {t(
                  "ScrollShow est déjà dans tes connecteurs Claude ? Son autorisation a expiré : ouvre-le, « Se déconnecter », puis « Se connecter ».",
                  "ScrollShow already in your Claude connectors? Its authorization expired: open it, “Disconnect”, then “Connect”.",
                  english,
                )}
              </span>
              {status?.agentByKey ? (
                <span className="ss-sc__hint">{t("Ton agent branché par clé (Claude Code, Cursor…) traitera aussi les demandes à sa prochaine session.", "Your key-connected agent (Claude Code, Cursor…) will also handle requests at its next session.", english)}</span>
              ) : null}
            </>
          )}
        </li>
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

      <details className="ss-sc__auto" open={auto}>
        <summary>{t("Mode automatique : l’agent travaille seul", "Automatic mode: the agent works on its own", english)}</summary>
        <p className="ss-muted">
          {t(
            "Avec une routine Claude (offres Pro, Max, Team), le partage lance l’agent dans le cloud : rien ne s’ouvre sur ton téléphone et tu reçois une notification quand le brouillon est prêt. Chaque recréation compte dans ton usage Claude.",
            "With a Claude routine (Pro, Max, Team plans), sharing starts the agent in the cloud: nothing opens on your phone and you get a notification when the draft is ready. Each recreation counts toward your Claude usage.",
            english,
          )}
        </p>
        {auto && trigger?.configured ? (
          <div className="ss-sc__routine">
            <span>
              <b>{t("Routine branchée", "Routine connected", english)}</b>
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
          <ol className="ss-steps">
            <li>
              {t("Sur claude.ai/code/routines : « New routine », colle ces instructions, garde le connecteur ScrollShow.", "On claude.ai/code/routines: “New routine”, paste these instructions, keep the ScrollShow connector.", english)}{" "}
              <button className="ss-btn-ghost" type="button" onClick={() => void copyPrompt()} disabled={!status}>
                {promptCopied ? t("Copié", "Copied", english) : t("Copier les instructions", "Copy instructions", english)}
              </button>{" "}
              <a className="ss-sc__link" href="https://claude.ai/code/routines" target="_blank" rel="noreferrer">claude.ai/code/routines</a>
            </li>
            <li>{t("Dans « Select a trigger », ajoute « API », enregistre, puis « Generate token ».", "Under “Select a trigger”, add “API”, save, then “Generate token”.", english)}</li>
            <li>
              {t("Colle ici l’URL et le jeton (le jeton est chiffré et ne ressort jamais).", "Paste the URL and token here (the token is encrypted and never shown again).", english)}
              <div className="ss-sc__form">
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire" aria-label={t("URL de la routine", "Routine URL", english)} spellCheck={false} autoComplete="off" />
                <input value={token} onChange={e => setToken(e.target.value)} placeholder="sk-ant-oat01-…" type="password" aria-label={t("Jeton de la routine", "Routine token", english)} autoComplete="off" />
                <button className="ss-btn-purple" type="button" disabled={Boolean(busy) || !url || !token} onClick={() => void act("save", { url, token })}>
                  {busy === "save" ? <span className="ss-spin" /> : t("Brancher", "Connect", english)}
                </button>
              </div>
            </li>
          </ol>
        )}
      </details>
      {note ? <p className="ss-sc__note" role="status">{note}</p> : null}

      {status?.requests.length ? (
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
                    {item.sharer ? ` · ${t("depuis", "from", english)} @${item.sharer}` : ""}
                    {item.link === "unlinked" ? ` (${t("non lié", "not linked", english)})` : item.link === "tracked" ? ` (${t("non connecté", "not connected", english)})` : ""}
                    {item.projectName ? ` · ${item.projectName}` : ""}
                    {item.error ? ` · ${item.error}` : ""}
                    {item.trigger && !item.trigger.ok ? ` · ${fireError(item.trigger.error, english)}` : ""}
                  </span>
                </span>
                <span className="ss-sc__actions">
                  {item.resultPostId ? <a className="ss-btn-ghost" href={`/app?post=${encodeURIComponent(item.resultPostId)}`}>{t("Voir le brouillon", "Open draft", english)}</a> : null}
                  {item.trigger?.sessionUrl && item.status !== "done" ? <a className="ss-sc__link" href={item.trigger.sessionUrl} target="_blank" rel="noreferrer">{t("Session", "Session", english)}</a> : null}
                  {item.status === "queued" || item.status === "failed" ? (
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
      ) : null}
    </div>
  );
}
