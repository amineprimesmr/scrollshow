"use client";

import Link from "next/link";
import { useState } from "react";
import { useAgentConnections, type AgentConnections } from "./useAgentConnections";

export function AgentConnectStatus({ initial }: { initial: AgentConnections }) {
  const { connections = initial, error } = useAgentConnections(initial);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const { account, grants } = connections;
  const authorized = grants.length > 0;
  const command = "set up https://scrollshow.io/SKILL.md";
  const names = [...new Set(grants.map(grant => grant.name))].join(", ");

  return <>
    <h1>{!account ? "Ton assistant, dans ScrollShow" : !account.active ? "Active ton espace" : authorized ? "Ton assistant est autorisé" : "Connecte ton assistant"}</h1>
    <p className="ss-connect__sub">{
      !account ? "Connecte-toi pour retrouver ton espace et tes assistants."
        : !account.active ? "Ton compte est prêt. Active ton accès pour utiliser les outils."
          : authorized ? "Tu peux lui demander de travailler dans ton espace ScrollShow."
            : "Envoie cette instruction à ton assistant, puis autorise l’accès à ton compte."
    }</p>
    <div className="ss-connect__card">
      <span className="ss-connect__edge" aria-hidden />
      {account ? <p className="ss-connect__account">{account.email}</p> : null}
      {!account ? <Link className="ss-connect__cta" href="/signup?mode=signin&next=/connect">Me connecter</Link>
        : !account.active ? <>
          {authorized && <p>{names} {grants.length === 1 ? "est déjà autorisé" : "sont déjà autorisés"}. Tu n’as pas à refaire la connexion.</p>}
          <Link className="ss-connect__cta" href="/pricing">Activer mon accès</Link>
        </>
          : authorized ? <div className="ss-connect__success" role="status">
            <span className="ss-connect__mark" aria-hidden>✓</span>
            <div><strong>{names}</strong><p>L’accès à ton compte est accordé. La connexion reste enregistrée pour tes prochaines demandes.</p></div>
          </div>
            : <>
              <p className="ss-connect__label">À envoyer dans Codex, Claude Code ou Cursor</p>
              <div className="ss-connect__copy">
                <code>{command}</code>
                <button type="button" className="ss-connect__cta" onClick={async () => {
                  try { await navigator.clipboard.writeText(command); setCopied(true); setCopyError(false); }
                  catch { setCopied(false); setCopyError(true); }
                }}>{copied ? "Copié ✓" : "Copier"}</button>
              </div>
              {copyError && <p role="status">Sélectionne l’instruction ci-dessus pour la copier.</p>}
              <details className="ss-connect__help"><summary>J’utilise Claude sur le web</summary><p>Dans les réglages de Claude, ajoute un connecteur nommé ScrollShow avec cette adresse, puis connecte ton compte.</p><code>https://scrollshow.io/api/mcp</code></details>
            </>}
      {error && <p role="status">La vérification est momentanément indisponible. Ton autorisation n’a pas été modifiée.</p>}
      {account?.active && authorized && <Link className="ss-connect__cta" href="/app">Ouvrir mon studio</Link>}
    </div>
    <p className="ss-connect__foot">{authorized
      ? <>Gère les accès dans <Link href="/app/settings">Réglages</Link>.</>
      : account?.active ? "Ton assistant te demandera l’accès dans le navigateur. Cette page se met à jour après l’autorisation." : "Retrouve ton studio et tes assistants avec ton compte ScrollShow."}</p>
  </>;
}
