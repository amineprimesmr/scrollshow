"use client";

import { useState } from "react";
import { scrollshowStarterPrompt } from "@/lib/assistant-prompts";
import "./assistant-starter.css";

export function AssistantStarter({ english = false, pending = false }: { english?: boolean; pending?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const prompt = scrollshowStarterPrompt(english);
  return <section className="ss-assistant-starter" aria-label={english ? "First ScrollShow prompt" : "Premier prompt ScrollShow"}>
    <h3>{english ? "Give your AI its first task" : "Donne sa première mission à ton IA"}</h3>
    <p>{english ? "Once the connector is enabled, paste this prompt into your assistant’s conversation. It reads your profile and saves an editable private draft." : "Une fois le connecteur activé, colle ce prompt dans la conversation de ton assistant. Il lit ton profil et enregistre un brouillon privé éditable."}</p>
    {pending && <p>{english ? "Use it after payment activates your account. You can also find it in the studio’s AI section." : "À utiliser après l’activation de ton compte par le paiement. Tu le retrouveras aussi dans la rubrique IA du studio."}</p>}
    <details><summary>{english ? "Read the prompt" : "Voir le prompt"}</summary><textarea aria-label={english ? "Prompt to copy" : "Prompt à copier"} readOnly value={prompt} rows={10} /></details>
    <button type="button" className="ss-btn-purple" onClick={async () => {
      try { await navigator.clipboard.writeText(prompt); setStatus("copied"); }
      catch { setStatus("error"); }
    }}>{status === "copied" ? (english ? "Prompt copied ✓" : "Prompt copié ✓") : (english ? "Copy my first prompt" : "Copier mon premier prompt")}</button>
    <p role="status">{status === "error" ? (english ? "Copy failed. Open the prompt above and select its text manually." : "Copie impossible. Ouvre le prompt ci-dessus et sélectionne son texte manuellement.") : (english ? "No API key. No automatic publication." : "Aucune clé API. Aucune publication automatique.")}</p>
  </section>;
}
