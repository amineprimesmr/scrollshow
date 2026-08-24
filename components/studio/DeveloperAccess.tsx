"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ClientId = "cursor" | "claude" | "desktop" | "rest";

export function DeveloperAccess() {
  const [english, setEnglish] = useState(false);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("Cursor");
  const [fresh, setFresh] = useState("");
  const [client, setClient] = useState<ClientId>("cursor");
  const [busy, setBusy] = useState(false);
  const origin = typeof window === "undefined" ? "https://scrollshow.io" : window.location.origin;
  const mcpUrl = `${origin}/api/mcp`;

  useEffect(() => {
    setEnglish(prefersEnglish());
    void load();
  }, []);

  async function load() {
    const res = await fetch("/api/keys");
    const json = await res.json().catch(() => ({ keys: [] }));
    setKeys(json.keys || []);
  }

  async function createKey() {
    setBusy(true);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return;
    setFresh(json.token || "");
    await load();
  }

  async function revoke(id: string) {
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    if (fresh) setFresh("");
    await load();
  }

  const snippet = useMemo(() => {
    const token = fresh || "ss_live_YOUR_KEY";
    if (client === "cursor") {
      return JSON.stringify(
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
      );
    }
    if (client === "claude") {
      return `claude mcp add --transport http scrollshow ${mcpUrl} --header "Authorization: Bearer ${token}"`;
    }
    if (client === "desktop") {
      return JSON.stringify(
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
      );
    }
    return `curl ${origin}/api/v1/me \\\n  -H "Authorization: Bearer ${token}"`;
  }, [client, fresh, mcpUrl, origin]);

  return (
    <div className="ss-panel">
      <h2>{t("Agents IA", "AI agents", english)}</h2>
      <p className="ss-lead">
        {t(
          "Connecte Cursor, Claude Code, Codex ou n’importe quel agent. Ils peuvent créer des TikTok, les planifier, les publier, lire les stats et sortir un rapport.",
          "Connect Cursor, Claude Code, Codex, or any agent. They can create TikToks, schedule, publish, read stats, and write a full report.",
          english,
        )}
      </p>

      <div className="ss-form ss-dev-create">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("Nom de la clé", "Key name", english)}
        />
        <button className="ss-btn-purple" type="button" disabled={busy} onClick={() => void createKey()}>
          {busy ? "…" : t("Créer une clé", "Create API key", english)}
        </button>
      </div>

      {fresh ? (
        <div className="ss-dev-fresh">
          <p>{t("Copie-la maintenant. Elle ne sera plus affichée.", "Copy it now. It will not be shown again.", english)}</p>
          <code>{fresh}</code>
          <button
            className="ss-btn-ghost"
            type="button"
            onClick={() => navigator.clipboard.writeText(fresh)}
          >
            {t("Copier", "Copy", english)}
          </button>
        </div>
      ) : null}

      {keys.length ? (
        <ul className="ss-dev-keys">
          {keys.map((key) => (
            <li key={key.id}>
              <span>
                <b>{key.name}</b>
                <code>{key.prefix}…</code>
              </span>
              <button className="ss-btn-ghost" type="button" onClick={() => void revoke(key.id)}>
                {t("Révoquer", "Revoke", english)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("Aucune clé pour l’instant.", "No keys yet.", english)}</p>
      )}

      <div className="ss-dev-tabs" role="tablist">
        {(
          [
            ["cursor", "Cursor"],
            ["claude", "Claude Code"],
            ["desktop", "Claude Desktop"],
            ["rest", "REST"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={client === id}
            className={client === id ? "is-active" : ""}
            onClick={() => setClient(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="ss-lead">
        {client === "cursor"
          ? t("Colle ça dans ~/.cursor/mcp.json, puis recharge Cursor.", "Paste this into ~/.cursor/mcp.json, then reload Cursor.", english)
          : client === "claude"
            ? t("Lance ça dans le terminal, puis redémarre Claude Code.", "Run this in the terminal, then restart Claude Code.", english)
            : client === "desktop"
              ? t("Colle ça dans ~/Library/Application Support/Claude/claude_desktop_config.json, puis redémarre Claude.", "Paste this into claude_desktop_config.json, then restart Claude.", english)
              : t("Même API que le MCP, en HTTP. Bearer token.", "Same API as MCP, over HTTP. Bearer token.", english)}
      </p>
      <pre className="ss-pre">{snippet}</pre>
      <button className="ss-btn-ghost" type="button" onClick={() => navigator.clipboard.writeText(snippet)}>
        {t("Copier la config", "Copy config", english)}
      </button>
    </div>
  );
}
