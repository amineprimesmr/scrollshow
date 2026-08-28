"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { AI_CLIENTS, type AiClientId } from "@/lib/ai-clients";
import { t as tr } from "@/lib/i18n";
import { useStudio } from "./StudioContext";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ClientId = AiClientId;

type Step = {
  n: string;
  title: string;
  body: string;
  field?: string;
  copyId?: string;
  cta?: string;
  href?: string;
  primary?: boolean;
};

const CLIENTS = AI_CLIENTS;

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 15V7a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M14 5h5v5M19 5 10 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function liveToken(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const token = (data as { token?: unknown }).token;
  return typeof token === "string" && token.startsWith("ss_live_") ? token : "";
}

function CopyField({
  value,
  copied,
  onCopy,
  multiline,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
  multiline?: boolean;
}) {
  return (
    <div className={`ss-mcp-copy ${multiline ? "is-multi" : ""}`}>
      <div className="ss-mcp-copy__row">
        {multiline ? (
          <pre>{value}</pre>
        ) : (
          <input readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
        )}
        <button type="button" onClick={onCopy} aria-label="Copy">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

export function DeveloperAccess() {
  const { english } = useStudio();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [client, setClient] = useState<ClientId>("claude-code");
  const [copied, setCopied] = useState("");

  const origin = typeof window === "undefined" ? "https://scrollshow.io" : window.location.origin;
  const mcpUrl = `${origin}/api/mcp`;
  const token = revealed || "ss_live_YOUR_KEY";

  useEffect(() => {
    void refresh();
  }, []);

  function tx(fr: string, en: string) {
    return tr(fr, en, english);
  }

  function pick(id: ClientId) {
    setClient(id);
  }

  async function refresh() {
    const res = await fetch("/api/keys");
    const data = await res.json();
    setKeys(data.keys || []);
  }

  async function createKey() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: CLIENTS.find((item) => item.id === client)?.label || "Agent" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "create_failed");
      const next = liveToken(data);
      if (!next) throw new Error("create_failed");
      setRevealed(next);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    if (revealed) setRevealed(null);
    await refresh();
  }

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied((cur) => (cur === id ? "" : cur)), 1600);
  }

  const claudeCli = `claude mcp add --transport http scrollshow ${mcpUrl} --header "Authorization: Bearer ${token}"`;
  const codexExport = `export SCROLLSHOW_API_KEY='${token}'`;
  const codexCli = `codex mcp add scrollshow --url ${mcpUrl} --bearer-token-env-var SCROLLSHOW_API_KEY`;
  const cursorDeeplink = useMemo(() => {
    const config = btoa(JSON.stringify({ url: mcpUrl, headers: { Authorization: `Bearer ${token}` } }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=scrollshow&config=${config}`;
  }, [mcpUrl, token]);

  function steps(): Step[] {
    const start: Step = {
      n: "3",
      title: tx("Demande-lui un post", "Ask it to post"),
      body: tx(
        "Exemple : « Planifie un carousel demain à 18h ». Il le pose dans ton calendrier.",
        "Example: “Schedule a carousel tomorrow at 6pm.” It lands on your calendar.",
      ),
      cta: tx("Ouvrir le calendrier", "Open the calendar"),
      href: "/app",
      primary: true,
    };

    if (client === "codex") {
      return [
        {
          n: "1",
          title: tx("Copie la première commande", "Copy the first command"),
          body: tx("Colle-la dans le terminal de Codex.", "Paste it in the Codex terminal."),
          field: codexExport,
          copyId: "codex-env",
        },
        {
          n: "2",
          title: tx("Puis la deuxième", "Then the second"),
          body: tx("Toujours dans le même terminal. Relance Codex après.", "Still in the same terminal. Restart Codex afterwards."),
          field: codexCli,
          copyId: "codex-cli",
        },
        start,
      ];
    }

    if (client === "claude-code") {
      return [
        {
          n: "1",
          title: tx("Copie cette commande", "Copy this command"),
          body: tx("Tu la colleras dans le terminal au step suivant.", "You’ll paste it in the terminal next."),
          field: claudeCli,
          copyId: "cli",
        },
        {
          n: "2",
          title: tx("Colle-la dans Claude Code", "Paste it in Claude Code"),
          body: tx("Ouvre ton projet, colle la commande, puis relance la session.", "Open your project, paste the command, then reload the session."),
          cta: tx("Ouvrir Claude Code", "Open Claude Code"),
          href: "https://docs.anthropic.com/en/docs/claude-code",
        },
        start,
      ];
    }

    if (client === "cursor") {
      return [
        {
          n: "1",
          title: tx("Copie l’adresse ScrollShow", "Copy the ScrollShow address"),
          body: tx("Tu la colleras dans Cursor au step suivant.", "You’ll paste this into Cursor next."),
          field: mcpUrl,
          copyId: "url",
        },
        {
          n: "2",
          title: tx("Ajoute ScrollShow dans Cursor", "Add ScrollShow in Cursor"),
          body: tx("Un clic. Cursor te demande de confirmer. C’est tout.", "One click. Cursor will ask you to confirm. That’s it."),
          cta: tx("Ouvrir Cursor", "Open Cursor"),
          href: cursorDeeplink,
        },
        start,
      ];
    }

    return [
      {
        n: "1",
        title: tx("Copie l’adresse ScrollShow", "Copy the ScrollShow address"),
        body: tx("Tu la colleras dans Claude au step suivant.", "You’ll paste this URL into Claude next."),
        field: mcpUrl,
        copyId: "url",
      },
      {
        n: "2",
        title: tx("Claude → Customize → Connectors", "Claude → Customize → Connectors"),
        body: tx(
          "Dans Claude desktop ou claude.ai, va dans Customize → Connectors. Nomme-le ScrollShow et colle l’adresse. Si claude.ai te demande une authentification qu’il ne peut pas compléter, utilise l’onglet Claude Code à la place — il marche avec ta clé directement.",
          "In Claude desktop or claude.ai, go to Customize → Connectors. Name it ScrollShow and paste the address. If claude.ai asks for an authentication it can't complete, use the Claude Code tab instead — it works with your key directly.",
        ),
        cta: tx("Ouvrir Claude Customize", "Open Claude Customize"),
        href: "https://claude.ai/settings/connectors",
      },
      start,
    ];
  }

  const stepList = steps();

  return (
    <section className="ss-mcp">
      <header className="ss-mcp-hero">
        <div className="ss-mcp-orbit" aria-hidden>
          {CLIENTS.slice(0, 2).map((item) => (
            <span key={item.id} className="ss-mcp-orbit__item">
              <img src={item.logo} alt="" style={{ background: item.bg }} />
            </span>
          ))}
          <span className="ss-mcp-orbit__item is-core">
            <img src="/logo.png" alt="" />
          </span>
          {CLIENTS.slice(2).map((item) => (
            <span key={item.id} className="ss-mcp-orbit__item">
              <img src={item.logo} alt="" style={{ background: item.bg }} />
            </span>
          ))}
        </div>
        <h2>{tx("Tes IA publient tes TikToks", "Your AI posts your TikToks")}</h2>
        <p className="ss-mcp-sub">
          {tx(
            "Choisis l’outil que tu utilises. On te dit exactement quoi faire. Ensuite tu lui parles.",
            "Pick the tool you already use. We’ll tell you exactly what to do. Then you just talk to it.",
          )}
        </p>
      </header>

      <div className="ss-mcp-keys">
        <div className="ss-mcp-keys__head">
          <div>
            <h3>{tx("Clés actives", "Active keys")}</h3>
            <p>
              {revealed
                ? tx("Copie-la maintenant — elle ne sera plus affichée. Elle marche pour tous tes agents.", "Copy it now — it won’t be shown again. It works for every agent.")
                : tx("Une clé pour brancher Claude, Claude Code, Cursor et Codex. Crée-la une fois.", "One key to connect Claude, Claude Code, Cursor and Codex. Create it once.")}
            </p>
          </div>
          {revealed ? (
            <CopyField value={revealed} copied={copied === "key"} onCopy={() => void copy("key", revealed)} />
          ) : (
            <button type="button" className="ss-btn-purple" disabled={creating} onClick={() => void createKey()}>
              {creating ? tx("Création…", "Creating…") : tx("Créer une clé", "Create a key")}
            </button>
          )}
        </div>
        {error ? (
          <p className="ss-mcp-error">
            {error === "limit"
              ? tx("Limite de 10 clés atteinte — révoque-en une pour continuer.", "10-key limit reached — revoke one to continue.")
              : tx("Impossible de créer la clé. Réessaie.", "Could not create the key. Try again.")}
          </p>
        ) : null}
        {keys.length ? (
          keys.map((key) => (
            <div key={key.id} className="ss-mcp-keys__row">
              <code>
                {key.prefix}… · {key.name}
                {key.lastUsedAt ? (
                  <small style={{ marginLeft: 8, color: "#a1a1aa", fontWeight: 400 }}>
                    · {tx("utilisée", "used")} {new Date(key.lastUsedAt).toLocaleDateString(english ? "en-US" : "fr-FR")}
                  </small>
                ) : null}
              </code>
              <button type="button" onClick={() => void revoke(key.id)}>
                {tx("Révoquer", "Revoke")}
              </button>
            </div>
          ))
        ) : (
          <p className="ss-mcp-keys__empty">{tx("Aucune clé pour l’instant.", "No keys yet.")}</p>
        )}
      </div>

      <div className="ss-mcp-panel">
        <div className="ss-mcp-bar">
          <div className="ss-mcp-tabs" role="tablist">
            {CLIENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={client === item.id}
                className={client === item.id ? "is-on" : ""}
                onClick={() => pick(item.id)}
              >
                <img src={item.logo} alt="" className="ss-mcp-tabs__mark" style={{ background: item.bg }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ss-mcp-board">
          {stepList.map((step) => (
            <article key={`${client}-${step.n}`} className="ss-mcp-card">
              <span className="ss-mcp-card__n">{step.n}</span>
              <h3>
                {step.n === "1" ? <BrandMark size={18} /> : null}
                {step.title}
              </h3>
              <p>{step.body}</p>
              <div className="ss-mcp-card__action">
                {step.field ? (
                  <CopyField value={step.field} copied={copied === step.copyId} onCopy={() => void copy(step.copyId || "field", step.field || "")} />
                ) : null}
                {step.cta && step.href ? (
                  <a className={step.primary ? "ss-btn-purple" : "ss-btn-ghost"} href={step.href}>
                    {step.cta}
                    {step.primary ? null : <ExternalIcon />}
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>

      <p className="ss-mcp-foot">
        {tx("TikTok se branche dans Connexions. Ici, c’est uniquement tes assistants IA.", "TikTok is connected in Connections. This page is only for your AI assistants.")}
      </p>
    </section>
  );
}
