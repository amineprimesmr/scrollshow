"use client";

import { useState } from "react";
import { AssistantStarter } from "@/components/AssistantStarter";
import { AI_CLIENTS, type AiClientId } from "@/lib/ai-clients";
import { useAgentConnections } from "@/components/useAgentConnections";
import { useStudio } from "./StudioContext";
import "./assistant-connection.css";

export function DeveloperAccess() {
  const { english } = useStudio();
  const { connections, error, revoke } = useAgentConnections();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [revokeError, setRevokeError] = useState(false);
  const [client, setClient] = useState<AiClientId>("codex");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const tx = (fr: string, en: string) => english ? en : fr;
  const grants = connections?.grants || [];
  const authorized = grants.length > 0;
  const address = "https://scrollshow.io/api/mcp";
  const instruction = client === "claude" ? address : "set up https://scrollshow.io/SKILL.md";

  const setup = <>
    <div className="ss-mcp-bar">
      <div className="ss-mcp-tabs" role="group" aria-label={tx("Ton assistant", "Your assistant")}>
        {AI_CLIENTS.map(item => <button key={item.id} type="button" aria-pressed={client === item.id} className={client === item.id ? "is-on" : ""} onClick={() => { setClient(item.id); setCopied(false); setCopyError(false); }}>
          <img src={item.logo} alt="" className="ss-mcp-tabs__mark" style={{ background: item.bg }} />{item.label}
        </button>)}
      </div>
    </div>
    <div className="ss-mcp-keys">
      <h3>{client === "claude" ? tx("Ajoute ScrollShow dans Claude", "Add ScrollShow to Claude") : tx("Envoie cette instruction à ton assistant", "Send this instruction to your assistant")}</h3>
      <p>{client === "claude"
        ? tx("Dans Réglages → Connecteurs, ajoute un connecteur personnalisé nommé ScrollShow avec cette adresse.", "In Settings → Connectors, add a custom connector named ScrollShow with this address.")
        : tx("Ton assistant installe la skill et configure la connexion. Autorise ensuite l’accès à ton compte dans la fenêtre qui s’ouvre.", "Your assistant installs the skill and sets up the connection. Then approve account access in the window that opens.")}</p>
      <div className="ss-mcp-copy"><div className="ss-mcp-copy__row">
        <input readOnly value={instruction} aria-label={tx("Instruction de connexion", "Connection instruction")} onFocus={event => event.currentTarget.select()} />
        <button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(instruction); setCopied(true); setCopyError(false); }
          catch { setCopyError(true); }
        }}>{copied ? "✓" : tx("Copier", "Copy")}</button>
      </div></div>
      {copyError && <p role="alert">{tx("Sélectionne le texte ci-dessus pour le copier.", "Select the text above to copy it.")}</p>}
      <p>{tx("L’autorisation reste enregistrée. Tu pourras ensuite demander directement ce dont tu as besoin.", "Authorization is saved. You can then ask directly for what you need.")}</p>
      {client === "claude" && <a className="ss-btn-ghost" href="https://claude.ai/customize/connectors?modal=add-custom-connector" target="_blank" rel="noreferrer">{tx("Ouvrir les connecteurs Claude", "Open Claude connectors")}</a>}
    </div>
  </>;

  return <section className="ss-mcp ss-agent-setup">
    <header className="ss-mcp-hero">
      <h2>{tx("Agents", "Agents")}</h2>
      <p className="ss-mcp-sub">{authorized
        ? tx("Tes assistants autorisés peuvent travailler dans ton espace ScrollShow.", "Your authorized assistants can work in your ScrollShow workspace.")
        : tx("Prépare tes carrousels et retrouve ton travail ici, avec l’assistant que tu utilises déjà.", "Prepare carousels and find your work here, with the assistant you already use.")}</p>
    </header>
    {error && <p role="status">{tx("Impossible de vérifier les connexions pour le moment. Les accès existants n’ont pas été modifiés.", "Connections could not be checked right now. Existing access has not changed.")}</p>}
    {!connections && !error && <p role="status">{tx("Vérification de tes connexions…", "Checking your connections…")}</p>}
    {notice && <p role={revokeError ? "alert" : "status"}>{notice}</p>}
    {connections && <div className="ss-mcp-panel">
      {authorized ? <>
        <div className="ss-mcp-keys">
          <h3>{tx("Assistants autorisés", "Authorized assistants")}</h3>
          <p>{tx("Ils peuvent travailler dans ton espace. Retirer un accès déconnecte cet assistant sans supprimer tes carrousels.", "They can work in your workspace. Removing access disconnects that assistant and keeps your carousels.")}</p>
          <ul className="ss-agent-connections">
            {grants.map(grant => <li key={grant.grantId}>
              <span><strong>{grant.name}</strong><span>{tx("Accès actif depuis le", "Access active since")} {new Date(grant.createdAt).toLocaleDateString(english ? "en-US" : "fr-FR")}</span></span>
              <button type="button" className="ss-btn-ghost" disabled={revoking !== null} aria-label={tx(`Retirer l’accès à ${grant.name}`, `Remove access for ${grant.name}`)} onClick={async () => {
                setRevoking(grant.grantId); setNotice(""); setRevokeError(false);
                try { await revoke(grant.grantId); setNotice(tx(`Accès retiré à ${grant.name}.`, `Access removed for ${grant.name}.`)); }
                catch { setRevokeError(true); setNotice(tx("Impossible de retirer cet accès. Réessaie.", "Could not remove this access. Try again.")); }
                finally { setRevoking(null); }
              }}>{revoking === grant.grantId ? tx("Retrait…", "Removing…") : tx("Retirer l’accès", "Remove access")}</button>
            </li>)}
          </ul>
        </div>
        <details className="ss-mcp-keys"><summary>{tx("Ajouter un autre assistant", "Add another assistant")}</summary>{setup}</details>
      </> : setup}
    </div>}
    {authorized && <details className="ss-mcp-keys ss-agent-setup__example"><summary>{tx("Un exemple pour commencer", "An example to get started")}</summary><AssistantStarter english={english} /></details>}
    <details className="ss-mcp-keys ss-agent-setup__technical"><summary>{tx("Détails techniques", "Technical details")}</summary><p>{tx("MCP est le protocole utilisé par tes assistants pour accéder à ScrollShow. La connexion à ton compte utilise OAuth.", "MCP is the protocol your assistants use to access ScrollShow. Account authorization uses OAuth.")}</p><code>{address}</code></details>
  </section>;
}
