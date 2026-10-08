import { agentOptions, agentResponse, bearerToken } from "@/lib/agent-http";
import { resolveApiKey } from "@/lib/api-keys";
import { hasStudioAccess } from "@/lib/plans";
import { consumeLimit } from "@/lib/rate-limit";
import { handleShortcut, shortcutConfig } from "@/lib/shortcut-recreate";
import { enqueueShortcut, drainShortcutJobs } from "@/lib/shortcut-queue";
import { AgentError } from "@/lib/agent";
import { after } from "next/server";

export const maxDuration = 300;

export function OPTIONS() {
  return agentOptions();
}

/** Lu par le raccourci avant sa liste de choix. Jamais d'erreur : sans cle valide, la liste s'affiche et le POST explique. */
export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    const user = token ? await resolveApiKey(token) : null;
    return agentResponse(await shortcutConfig(user && hasStudioAccess(user.plan) ? user : null));
  } catch {
    return agentResponse({ ask: "1", mode: "ask" });
  }
}

/**
 * Raccourci iPhone v3 (Partager → ScrollShow). Répond toujours 200 avec
 * title/message pour la notification. background=1 accuse réception après
 * sauvegarde durable ; l'import continue après la réponse. Les anciens
 * raccourcis gardent la réponse synchrone. La v3 n'ouvre aucune URL.
 */
export async function POST(request: Request) {
  const english = String(request.headers.get("accept-language") || "").toLowerCase().startsWith("en");
  const say = (error: string, title: string, message: string, openUrl?: string) => agentResponse({ ok: false, error, title, message, openUrl });
  try {
    const token = bearerToken(request);
    const user = token ? await resolveApiKey(token) : null;
    if (!user) {
      return say("unauthorized", english ? "ScrollShow key invalid" : "Clé ScrollShow invalide",
        english ? "Your key is unknown or expired. ScrollShow → Settings → iPhone shortcut: create a new key and paste it in the shortcut." : "Ta clé est inconnue ou a expiré. ScrollShow → Réglages → Raccourci iPhone : crée une nouvelle clé et colle-la dans le raccourci.",
        "https://scrollshow.io/app/settings?tab=api");
    }
    if (!hasStudioAccess(user.plan)) {
      return say("payment_required", english ? "ScrollShow plan inactive" : "Abonnement ScrollShow inactif",
        english ? "Reactivate your plan to use the shortcut." : "Réactive ton abonnement pour utiliser le raccourci.", "https://scrollshow.io/pricing");
    }
    if (!(await consumeLimit(`api:${user.id}`, 120, 60000))) return say("rate_limited", "ScrollShow", english ? "Too many requests. Try again in a minute." : "Trop de requêtes. Réessaie dans une minute.");
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const text = String(body.url || body.text || "");
    // Old installed shortcuts keep their synchronous response. v3 opts in.
    if (body.background === "1" || body.background === true) {
      const job = await enqueueShortcut(user, { text, choice: body.mode ?? body.choice, english });
      after(async () => { await drainShortcutJobs(user); });
      return agentResponse({ ok: true, title: "ScrollShow", jobId: job.id,
        message: english ? "Request saved. You can keep using TikTok while preparation runs." : "Demande enregistrée. Tu peux continuer à utiliser TikTok pendant la préparation." });
    }
    return agentResponse(await handleShortcut(user, { text, choice: body.mode ?? body.choice, english }));
  } catch (error) {
    if (error instanceof AgentError) return say(error.message, "ScrollShow", english ? "Could not queue this request. Share a TikTok post or retry from shortcut settings." : "Demande non enregistrée. Partage un post TikTok ou relance depuis les réglages du raccourci.");
    console.error("shortcut_failed", { message: error instanceof Error ? error.message : "error" });
    return say("temporarily_unavailable", "ScrollShow", english ? "ScrollShow is unavailable right now. Try again in a minute." : "ScrollShow est indisponible pour le moment. Réessaie dans une minute.");
  }
}
