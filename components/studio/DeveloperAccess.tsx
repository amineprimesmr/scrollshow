"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { prefersEnglish, t as tr } from "@/lib/i18n";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ClientId = "claude" | "chatgpt" | "cursor" | "claude-code" | "codex";
type Mode = "mcp" | "cli";

type Step = {
  n: string;
  title: string;
  body: string;
  field?: string;
  copyId?: string;
  extra?: string;
  extraId?: string;
  extraHint?: string;
  cta?: string;
  href?: string;
  primary?: boolean;
};

const CLIENTS: { id: ClientId; label: string; mark: string; tone: string }[] = [
  { id: "claude", label: "Claude", mark: "C", tone: "#d97757" },
  { id: "chatgpt", label: "ChatGPT", mark: "G", tone: "#10a37f" },
  { id: "cursor", label: "Cursor", mark: "▶", tone: "#e8e8e8" },
  { id: "claude-code", label: "Claude Code", mark: "</>", tone: "#d97757" },
  { id: "codex", label: "Codex", mark: "⌘", tone: "#7c6af7" },
];

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

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.4 14.4 8l6 .6-4.6 4.1 1.4 5.9L12 15.8 6.8 18.6 8.2 12.7 3.6 8.6l6-.6L12 2.4Z" />
    </svg>
  );
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
  const [english, setEnglish] = useState(false);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [client, setClient] = useState<ClientId>("claude");
  const [mode, setMode] = useState<Mode>("mcp");
  const [copied, setCopied] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const origin = typeof window === "undefined" ? "https://scrollshow.io" : window.location.origin;
  const mcpUrl = `${origin}/api/mcp`;
  const token = revealed || "ss_live_YOUR_KEY";

  useEffect(() => {
    setEnglish(prefersEnglish());
    void refresh();
  }, []);

  function tx(fr: string, en: string) {
    return tr(fr, en, english);
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
      setRevealed(data.key);
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

  const cursorConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            scrollshow: {
              url: mcpUrl,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      ),
    [mcpUrl, token],
  );

  const claudeDesktopConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            scrollshow: {
              type: "http",
              url: mcpUrl,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      ),
    [mcpUrl, token],
  );

  const claudeCli = `claude mcp add --transport http scrollshow ${mcpUrl} --header "Authorization: Bearer ${token}"`;
  const cursorDeeplink = useMemo(() => {
    const config = btoa(JSON.stringify({ url: mcpUrl, headers: { Authorization: `Bearer ${token}` } }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=scrollshow&config=${config}`;
  }, [mcpUrl, token]);

  const prompts = [
    tx("Planifie un carousel glow-up demain à 18h", "Schedule a glow-up carousel tomorrow at 6pm"),
    tx("Sors-moi le rapport ScrollShow de la semaine", "Give me this week's ScrollShow report"),
    tx("Liste mes posts draft et publie le plus fort", "List my drafts and publish the strongest one"),
    tx("Crée 3 posts à partir de ma librairie Media", "Create 3 posts from my Media library"),
  ];

  const faqs = [
    {
      q: tx("Qu’est-ce que MCP ?", "What is MCP?"),
      a: tx(
        "Le Model Context Protocol relie ton agent (Claude, Cursor, ChatGPT) à ScrollShow. L’agent appelle tes outils : créer, planifier, publier, lire les stats.",
        "Model Context Protocol connects your agent (Claude, Cursor, ChatGPT) to ScrollShow. The agent calls your tools: create, schedule, publish, read stats.",
      ),
    },
    {
      q: tx("C’est sécurisé ?", "Is it secure?"),
      a: tx(
        "Chaque clé ss_live_ est liée à ton compte. L’agent ne voit que tes chaînes, médias et posts. Révoque une clé à tout moment.",
        "Each ss_live_ key is bound to your account. The agent only sees your channels, media and posts. Revoke a key anytime.",
      ),
    },
    {
      q: tx("MCP ou CLI ?", "MCP or CLI?"),
      a: tx(
        "MCP = connexion visuelle (Claude Customize, Cursor Settings). CLI = une commande dans le terminal. Claude Code et Codex marchent mieux en CLI.",
        "MCP = visual connect (Claude Customize, Cursor Settings). CLI = one terminal command. Claude Code and Codex work best via CLI.",
      ),
    },
    {
      q: tx("Ça publie vraiment sur TikTok ?", "Does it really post to TikTok?"),
      a: tx(
        "Oui, via publish_now — une fois TikTok connecté dans Intégrations. Sans ça, l’agent crée et planifie quand même dans le calendrier.",
        "Yes, via publish_now — once TikTok is connected in Integrations. Without that, the agent still creates and schedules in the calendar.",
      ),
    },
  ];

  const showCli = mode === "cli";

  function steps(): Step[] {
    if (showCli && client !== "chatgpt" && client !== "cursor") {
      return [
        {
          n: "1",
          title: tx("Copie la commande CLI", "Copy the CLI command"),
          body: tx("Tu la colleras dans ton terminal au step suivant.", "You’ll paste it in your terminal next."),
          field: claudeCli,
          copyId: "cli",
        },
        {
          n: "2",
          title: client === "codex" ? tx("Ouvre Codex", "Open Codex") : tx("Ouvre Claude Code", "Open Claude Code"),
          body: tx("Dans le projet, colle la commande. Recharge la session MCP.", "In the project, paste the command. Reload the MCP session."),
          cta: client === "codex" ? tx("Docs Codex", "Codex docs") : tx("Ouvrir Claude Code", "Open Claude Code"),
          href: client === "codex" ? "https://developers.openai.com/codex" : "https://docs.anthropic.com/en/docs/claude-code",
        },
        {
          n: "3",
          title: tx("Connecte, puis crée", "Connect, then create"),
          body: tx("Demande un carousel, un planning, ou un rapport. L’agent parle à ScrollShow.", "Ask for a carousel, a schedule, or a report. The agent talks to ScrollShow."),
          cta: tx("Commencer à créer", "Start creating"),
          href: "/app",
          primary: true,
        },
      ];
    }

    if (showCli && client === "cursor") {
      return [
        {
          n: "1",
          title: tx("Copie la config Cursor", "Copy the Cursor config"),
          body: tx("Tu la colleras dans ~/.cursor/mcp.json au step suivant.", "You’ll paste this into ~/.cursor/mcp.json next."),
          extra: cursorConfig,
          extraId: "cursor-json",
        },
        {
          n: "2",
          title: tx("Colle dans ~/.cursor/mcp.json", "Paste into ~/.cursor/mcp.json"),
          body: tx("Crée le fichier s’il n’existe pas, puis recharge Cursor.", "Create the file if it doesn’t exist, then reload Cursor."),
          cta: tx("Ouvrir Cursor MCP", "Open Cursor MCP"),
          href: cursorDeeplink,
        },
        {
          n: "3",
          title: tx("Connecte, puis crée", "Connect, then create"),
          body: tx("Demande un carousel, un planning, ou un rapport.", "Ask for a carousel, a schedule, or a report."),
          cta: tx("Commencer à créer", "Start creating"),
          href: "/app",
          primary: true,
        },
      ];
    }

    if (client === "cursor") {
      return [
        {
          n: "1",
          title: tx("Copie l’URL du connecteur ScrollShow", "Copy the ScrollShow connector URL"),
          body: tx("Tu la colleras dans Cursor au step suivant.", "You’ll paste this into Cursor next."),
          field: mcpUrl,
          copyId: "url",
        },
        {
          n: "2",
          title: tx("Cursor → Settings → MCP", "Cursor → Settings → MCP"),
          body: tx(
            "Ajoute un serveur HTTP nommé scrollshow. Colle l’URL et le header Authorization: Bearer.",
            "Add an HTTP server named scrollshow. Paste the URL and the Authorization: Bearer header.",
          ),
          cta: tx("Ouvrir Cursor MCP", "Open Cursor MCP"),
          href: cursorDeeplink,
          extra: cursorConfig,
          extraId: "cursor-json",
          extraHint: tx("Ou colle ça dans ~/.cursor/mcp.json", "Or paste this into ~/.cursor/mcp.json"),
        },
        {
          n: "3",
          title: tx("Connecte, puis crée", "Connect, then create"),
          body: tx("Recharge Cursor. Demande un carousel, un planning, ou un rapport.", "Reload Cursor. Ask for a carousel, a schedule, or a report."),
          cta: tx("Commencer à créer", "Start creating"),
          href: "/app",
          primary: true,
        },
      ];
    }

    if (client === "chatgpt") {
      return [
        {
          n: "1",
          title: tx("Copie l’URL du connecteur ScrollShow", "Copy the ScrollShow connector URL"),
          body: tx("Tu la colleras dans ChatGPT au step suivant.", "You’ll paste this into ChatGPT next."),
          field: mcpUrl,
          copyId: "url",
        },
        {
          n: "2",
          title: tx("ChatGPT → Apps & connecteurs", "ChatGPT → Apps & connectors"),
          body: tx(
            "Ajoute un connecteur custom. Nomme-le ScrollShow, colle l’URL, header Bearer.",
            "Add a custom connector. Name it ScrollShow, paste the URL, Bearer header.",
          ),
          cta: tx("Ouvrir ChatGPT", "Open ChatGPT"),
          href: "https://chatgpt.com/",
        },
        {
          n: "3",
          title: tx("Connecte, puis crée", "Connect, then create"),
          body: tx("Connecte-toi, puis demande de générer ou planifier un TikTok.", "Sign in, then ask to generate or schedule a TikTok."),
          cta: tx("Commencer à créer", "Start creating"),
          href: "/app",
          primary: true,
        },
      ];
    }

    return [
      {
        n: "1",
        title: tx("Copie l’URL du connecteur ScrollShow", "Copy the ScrollShow connector URL"),
        body: tx("Tu la colleras dans Claude au step suivant.", "You’ll paste this URL into Claude next."),
        field: mcpUrl,
        copyId: "url",
      },
      {
        n: "2",
        title: tx("Claude → Customize → Connectors", "Claude → Customize → Connectors"),
        body: tx(
          "Dans Claude desktop ou claude.ai, va dans Customize → Connectors. Nomme-le ScrollShow, colle l’URL et le header Authorization: Bearer.",
          "In Claude desktop or claude.ai, go to Customize → Connectors. Name it ScrollShow, paste the URL and the Authorization: Bearer header.",
        ),
        cta: tx("Ouvrir Claude Customize", "Open Claude Customize"),
        href: "https://claude.ai/settings/connectors",
        extra: mode === "mcp" ? claudeDesktopConfig : undefined,
        extraId: "claude-json",
        extraHint: tx("Ou colle ça dans claude_desktop_config.json", "Or paste this into claude_desktop_config.json"),
      },
      {
        n: "3",
        title: tx("Connecte, puis crée", "Connect, then create"),
        body: tx(
          "Connecte-toi, puis demande à Claude de planifier un carousel ou un rapport.",
          "Sign in, then ask Claude to schedule a carousel or a report.",
        ),
        cta: tx("Commencer à créer", "Start creating"),
        href: "/app",
        primary: true,
      },
    ];
  }

  const stepList = steps();

  return (
    <section className="ss-mcp">
      <div className="ss-mcp-hero">
        <div className="ss-mcp-orbit" aria-hidden>
          {CLIENTS.slice(0, 2).map((item) => (
            <span key={item.id} className="ss-mcp-logo" style={{ background: item.tone, color: item.id === "cursor" ? "#111" : "#fff" }}>
              {item.mark}
            </span>
          ))}
          <BrandMark size={72} className="ss-mcp-orbit__core" />
          {CLIENTS.slice(2, 4).map((item) => (
            <span key={item.id} className="ss-mcp-logo" style={{ background: item.tone, color: item.id === "cursor" ? "#111" : "#fff" }}>
              {item.mark}
            </span>
          ))}
        </div>
        <p className="ss-mcp-kicker">
          MCP <span>New</span>
        </p>
        <h2>{tx("SCROLLSHOW MCP & CLI POUR TOUTES LES IA", "SCROLLSHOW MCP & CLI FOR ANY AI")}</h2>
        <p className="ss-mcp-sub">
          {tx(
            "Crée, planifie et publie des TikToks directement depuis tes prompts — dans n’importe quel agent.",
            "Create, schedule and publish TikToks directly from your prompts — in any AI tool.",
          )}
        </p>
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
              onClick={() => {
                setClient(item.id);
                setMode(item.id === "claude-code" || item.id === "codex" ? "cli" : "mcp");
              }}
            >
              <span className="ss-mcp-tabs__mark" style={{ background: item.tone, color: item.id === "cursor" ? "#111" : "#fff" }}>
                {item.mark}
              </span>
              {item.label}
              {client === item.id ? <StarIcon /> : null}
            </button>
          ))}
        </div>
        <div className="ss-mcp-mode" role="group" aria-label="MCP or CLI">
          <button type="button" className={mode === "mcp" ? "is-on" : ""} onClick={() => setMode("mcp")}>
            MCP
          </button>
          <button type="button" className={mode === "cli" ? "is-on" : ""} onClick={() => setMode("cli")}>
            CLI
          </button>
        </div>
      </div>

      <div className="ss-mcp-keyband">
        <div>
          <p className="ss-mcp-keyband__title">{tx("Ta clé API", "Your API key")}</p>
          <p>
            {revealed
              ? tx("Copie-la maintenant — elle ne sera plus affichée.", "Copy it now — it won’t be shown again.")
              : tx("Une clé Bearer pour authentifier l’agent. Crée-la une fois, puis branche.", "One Bearer key to auth the agent. Create once, then connect.")}
          </p>
        </div>
        {revealed ? (
          <CopyField value={revealed} copied={copied === "key"} onCopy={() => void copy("key", revealed)} />
        ) : (
          <button type="button" className="ss-mcp-btn ss-mcp-btn--lime" disabled={creating} onClick={() => void createKey()}>
            {creating ? tx("Création…", "Creating…") : tx("Créer une clé", "Create a key")}
          </button>
        )}
      </div>
      {error ? <p className="ss-mcp-error">{error}</p> : null}
      {!revealed ? (
        <p className="ss-mcp-hint">{tx("Remplace ss_live_YOUR_KEY par ta clé après création.", "Replace ss_live_YOUR_KEY with your key after creating it.")}</p>
      ) : null}

      <div className="ss-mcp-board">
        {stepList.map((step) => (
          <article key={step.n} className="ss-mcp-card">
            <span className="ss-mcp-card__n">{step.n}</span>
            <h3>
              {step.n === "1" ? <BrandMark size={18} /> : null}
              {step.title}
            </h3>
            <p>{step.body}</p>
            {step.field ? (
              <CopyField value={step.field} copied={copied === step.copyId} onCopy={() => void copy(step.copyId || "field", step.field || "")} />
            ) : null}
            {step.cta && step.href ? (
              <a className={step.primary ? "ss-mcp-btn ss-mcp-btn--peach" : "ss-mcp-btn"} href={step.href}>
                {step.primary ? <StarIcon /> : null}
                {step.cta}
                {step.primary ? null : <ExternalIcon />}
              </a>
            ) : null}
            {step.extra ? (
              <details className="ss-mcp-details">
                <summary>{step.extraHint || "JSON"}</summary>
                <CopyField
                  multiline
                  value={step.extra}
                  copied={copied === step.extraId}
                  onCopy={() => void copy(step.extraId || "extra", step.extra || "")}
                />
              </details>
            ) : null}
          </article>
        ))}
      </div>

      {(client === "claude" || client === "claude-code") && mode === "mcp" ? (
        <p className="ss-mcp-foot">
          {tx("Si tu utilises Claude Code ou Codex, le CLI est plus simple.", "If you are using Claude Code or Codex, it’s better to use the CLI.")}{" "}
          <button type="button" onClick={() => setMode("cli")}>
            CLI <ExternalIcon />
          </button>
        </p>
      ) : null}

      <div className="ss-mcp-how">
        <h3>{tx("COMMENT MCP MARCHE ?", "HOW DOES MCP WORK?")}</h3>
        <div className="ss-mcp-chat">
          <div className="ss-mcp-bubble ss-mcp-bubble--user">
            <span>You</span>
            <p>{prompts[0]}</p>
          </div>
          <div className="ss-mcp-bubble ss-mcp-bubble--tool">
            <span>scrollshow · create_post</span>
            <p>scheduled · tomorrow 18:00 · draft</p>
          </div>
          <div className="ss-mcp-bubble ss-mcp-bubble--ai">
            <span>Claude</span>
            <p>
              {tx(
                "C’est calé. Carousel glow-up demain 18h dans ton calendrier ScrollShow.",
                "Done. Glow-up carousel is on your ScrollShow calendar tomorrow at 6pm.",
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="ss-mcp-prompts">
        <h3>{tx("PROMPTS QUI MARCHENT", "PROMPTS THAT WORK")}</h3>
        <div className="ss-mcp-prompt-grid">
          {prompts.map((prompt) => (
            <button key={prompt} type="button" className="ss-mcp-prompt" onClick={() => void copy(prompt, prompt)}>
              <span>{prompt}</span>
              {copied === prompt ? <CheckIcon /> : <CopyIcon />}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-mcp-faq">
        <h3>FAQ</h3>
        {faqs.map((item, index) => (
          <button
            key={item.q}
            type="button"
            className={`ss-mcp-faq__item ${openFaq === index ? "is-open" : ""}`}
            onClick={() => setOpenFaq(openFaq === index ? null : index)}
          >
            <strong>{item.q}</strong>
            {openFaq === index ? <p>{item.a}</p> : null}
          </button>
        ))}
      </div>

      {keys.length ? (
        <div className="ss-mcp-keys">
          <h3>{tx("Clés actives", "Active keys")}</h3>
          {keys.map((key) => (
            <div key={key.id} className="ss-mcp-keys__row">
              <code>
                {key.prefix}… · {key.name}
              </code>
              <button type="button" onClick={() => void revoke(key.id)}>
                {tx("Révoquer", "Revoke")}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
