"use client";

import { useMemo, useState } from "react";
import { AssistantStarter } from "@/components/AssistantStarter";
import { BrandMark } from "@/components/BrandMark";
import { AI_CLIENTS, type AiClientId } from "@/lib/ai-clients";
import { t as tr } from "@/lib/i18n";
import { useStudio } from "./StudioContext";
import { Beam } from "@/components/fx/Beam";
import { Metal } from "@/components/fx/Metal";
import { Orb } from "@/components/fx/Orb";

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
  secondaryCta?: string;
  secondaryHref?: string;
  sensitive?: boolean;
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
  disabled,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`ss-mcp-copy ${multiline ? "is-multi" : ""}`}>
      <div className="ss-mcp-copy__row">
        {multiline ? (
          <pre>{value}</pre>
        ) : (
          <input readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
        )}
        <button type="button" onClick={onCopy} aria-label="Copy" disabled={disabled}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

export function DeveloperAccess() {
  const { english } = useStudio();
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [client, setClient] = useState<ClientId>("claude");
  const [copied, setCopied] = useState("");

  const origin = typeof window === "undefined" ? "https://scrollshow.io" : window.location.origin;
  const mcpUrl = `${origin}/api/mcp`;
  const token = revealed || "ss_live_YOUR_KEY";

  function tx(fr: string, en: string) {
    return tr(fr, en, english);
  }

  function pick(id: ClientId) {
    setClient(id);
  }

  async function createKey() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MCP" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "create_failed");
      const next = liveToken(data);
      if (!next) throw new Error("create_failed");
      setRevealed(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
    } finally {
      setCreating(false);
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((cur) => (cur === id ? "" : cur)), 1600);
    } catch { setError("clipboard"); }
  }

  const claudeCli = `claude mcp add --transport http scrollshow ${mcpUrl} --header "Authorization: Bearer ${token}"`;
  const keyedUrl = `${mcpUrl}?key=${token}`;
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
      title: tx("Lance ta première mission", "Start your first task"),
      body: tx(
        "Copie le prompt sous ce guide dans une nouvelle conversation, avec ScrollShow activé. Ton assistant prépare un brouillon, sans publication automatique.",
        "Paste the prompt below this guide into a new conversation with ScrollShow enabled. Your assistant prepares a draft, without automatic publication.",
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
          sensitive: true,
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
          title: tx("Copie la commande de connexion", "Copy the connection command"),
          body: tx("À exécuter dans ton terminal, pas dans une conversation. Elle contient ta clé privée.", "Run in your terminal, not in a conversation. It contains your private key."),
          field: claudeCli,
          copyId: "cc-prompt",
          sensitive: true,
        },
        {
          n: "2",
          title: tx("Active les outils ScrollShow", "Enable ScrollShow tools"),
          body: tx(
            "Après la commande, rouvre Claude Code et vérifie que le serveur ScrollShow est disponible. Utilise ensuite le prompt ci-dessous.",
            "After running the command, reopen Claude Code and check that the ScrollShow server is available. Then use the prompt below.",
          ),
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
          sensitive: true,
        },
        start,
      ];
    }

    return [
      {
        n: "1",
        title: tx("Copie l’adresse ScrollShow", "Copy the ScrollShow address"),
        body: tx("Adresse privée réservée au champ URL du connecteur, jamais à la conversation.", "Private address for the connector URL field, never the conversation."),
        field: keyedUrl,
        copyId: "url",
        sensitive: true,
      },
      {
        n: "2",
        title: tx("Ouvre le connecteur Claude", "Open the Claude connector"),
        body: tx(
          "Ajoute un connecteur personnalisé nommé ScrollShow avec l’adresse de l’étape 1, puis active ses outils dans ta conversation. La clé est déjà incluse dans cette adresse.",
          "Add a custom connector named ScrollShow using the address from step 1, then enable its tools in your conversation. The key is already included in that address.",
        ),
        cta: tx("Ouvrir claude.ai", "Open claude.ai"),
        href: "https://claude.ai/customize/connectors?modal=add-custom-connector",
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
          <Metal variant="circle" preset="chromatic" strength={0.9} keepStyles>
            <span className="ss-mcp-orbit__item is-core">
              <img src="/logo.png" alt="" />
            </span>
          </Metal>
          {CLIENTS.slice(2).map((item) => (
            <span key={item.id} className="ss-mcp-orbit__item">
              <img src={item.logo} alt="" style={{ background: item.bg }} />
            </span>
          ))}
        </div>
        <h2>{tx("Ton IA travaille dans ScrollShow", "Your AI works in ScrollShow")}</h2>
        <p className="ss-mcp-sub">
          {tx(
            "Choisis l’outil que tu utilises. On te dit exactement quoi faire. Ensuite tu lui parles.",
            "Pick the tool you already use. We’ll tell you exactly what to do. Then you just talk to it.",
          )}
        </p>
      </header>

      <div className="ss-mcp-panel">
        <div className="ss-mcp-keys">
          <p>{tx("Déjà connecté ? Passe directement au prompt, sans créer de nouvelle clé.", "Already connected? Go straight to the prompt without creating another key.")}</p>
          {!revealed && <button type="button" className="ss-btn-purple" disabled={creating} onClick={() => void createKey()}>{creating ? "…" : tx("Créer ma connexion", "Create my connection")}</button>}
          {error && <p role="alert">{error === "clipboard" ? tx("Copie impossible : vérifie les permissions du presse-papiers.", "Copy failed: check clipboard permissions.") : tx("Création impossible. Vérifie tes clés dans Réglages → API puis réessaie.", "Creation failed. Check your keys in Settings → API and retry.")}</p>}
        </div>
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
            <Beam key={`${client}-${step.n}`} active={Boolean(step.primary)} size="pulse-inner" colorVariant="ocean" strength={0.6} className="ss-mcp-card__beam">
            <article className="ss-mcp-card">
              <span className="ss-mcp-card__n">{step.n}</span>
              <h3>
                {step.n === "1" ? <BrandMark size={18} /> : null}
                {step.title}
              </h3>
              <p>{step.body}</p>
              <div className="ss-mcp-card__action">
                {step.field ? (
                  <CopyField
                    value={step.sensitive ? step.field.replace(/ss_live_[A-Za-z0-9_-]+/g, "ss_live_••••••••") : step.field}
                    copied={copied === step.copyId}
                    onCopy={() => void copy(step.copyId || "field", step.field || "")}
                    disabled={step.sensitive && !revealed}
                  />
                ) : null}
                {step.sensitive && !revealed && creating ? (
                  <p className="ss-mcp-card__warn">
                    <Orb size={20} state="weaving" /> {tx("Génération de ta clé…", "Generating your key…")}
                  </p>
                ) : null}
                {step.sensitive && error ? (
                  <p className="ss-mcp-error">
                    {error === "limit"
                      ? tx("Limite de clés atteinte — gère-les dans Réglages → Clés API.", "Key limit reached — manage them in Settings → API keys.")
                      : tx("Impossible de générer la clé. Réessaie.", "Could not generate the key. Try again.")}
                  </p>
                ) : null}
                {step.cta && step.href ? (
                  step.sensitive && !revealed ? (
                    <span className="ss-btn-ghost is-disabled" aria-disabled="true">
                      {step.cta}
                    </span>
                  ) : (
                    <a
                      className={step.primary ? "ss-btn-purple" : "ss-btn-ghost"}
                      href={step.href}
                      target={step.href.startsWith("http") ? "_blank" : undefined}
                      rel={step.href.startsWith("http") ? "noreferrer" : undefined}
                    >
                      {step.cta}
                      {step.primary ? null : <ExternalIcon />}
                    </a>
                  )
                ) : null}
                {step.secondaryCta && step.secondaryHref ? (
                  <a className="ss-mcp-card__secondary" href={step.secondaryHref} target="_blank" rel="noreferrer">
                    {step.secondaryCta}
                  </a>
                ) : null}
              </div>
            </article>
            </Beam>
          ))}
        </div>
      </div>

      <AssistantStarter english={english} />

      {revealed ? (
        <div className="ss-mcp-keys">
          <div className="ss-mcp-keys__head">
            <div>
              <h3>{tx("Ta clé ScrollShow", "Your ScrollShow key")}</h3>
              <p>{tx("Copie-la maintenant — elle ne sera plus affichée ici.", "Copy it now — it won’t be shown here again.")}</p>
            </div>
            <CopyField value="ss_live_••••••••" copied={copied === "key"} onCopy={() => void copy("key", revealed)} />
          </div>
        </div>
      ) : null}

      <p className="ss-mcp-foot">
        {tx(
          "TikTok se branche dans Connexions. Tes clés se gèrent dans Réglages → Clés API.",
          "TikTok is connected in Connections. Your keys are managed in Settings → API keys.",
        )}
      </p>
    </section>
  );
}
