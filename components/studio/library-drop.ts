"use client";

/**
 * Garder un carrousel trouvé dans la Recherche : on l'importe dans la
 * Bibliothèque. Le glisser-déposer et le bouton passent tous les deux par ici,
 * pour qu'un geste au clavier fasse exactement ce que fait la souris.
 */

/** Le format qu'on met dans le presse-papiers de glissement. `text/uri-list`
 *  est le format standard d'une URL : un dépôt hors de l'application (un
 *  onglet, un éditeur) reçoit alors quelque chose d'utilisable. */
export const DRAG_TYPE = "application/x-scrollshow-post";

export type DraggedPost = { url: string; handle: string; cover?: string };

export function setDragPayload(event: React.DragEvent, post: DraggedPost) {
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(post));
  event.dataTransfer.setData("text/uri-list", post.url);
  event.dataTransfer.setData("text/plain", post.url);
  event.dataTransfer.effectAllowed = "copy";
}

export function readDragPayload(event: React.DragEvent): DraggedPost | null {
  const raw = event.dataTransfer.getData(DRAG_TYPE);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DraggedPost;
      if (parsed?.url) return parsed;
    } catch {
      // Charge illisible : on retombe sur l'URL brute ci-dessous.
    }
  }
  const url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
  return url && /tiktok\.com/i.test(url) ? { url, handle: "" } : null;
}

/** Le glissement ne porte que des types, pas encore les données : c'est la
 *  seule chose qu'on peut interroger pendant le survol pour décider d'accepter. */
export function carriesPost(event: React.DragEvent) {
  const types = [...(event.dataTransfer?.types || [])];
  return types.includes(DRAG_TYPE) || types.includes("text/uri-list");
}

export type KeepResult = { ok: true; postId: string } | { ok: false; error: string };

/** Importe le TikTok dans la Bibliothèque. Toujours en privé : rendre public
 *  reste une décision explicite, prise dans la Bibliothèque. */
export async function keepInLibrary(url: string): Promise<KeepResult> {
  try {
    const res = await fetch("/api/studio/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, visibility: "private" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: String(json.error || "import_failed") };
    return { ok: true, postId: String(json.post?.id || "") };
  } catch {
    return { ok: false, error: "network" };
  }
}

export function keepErrorLabel(code: string, english: boolean) {
  const table: Record<string, [string, string]> = {
    invalid_url: ["Ce lien TikTok n’est pas lisible.", "That TikTok link cannot be read."],
    not_found: ["Ce TikTok n’existe plus.", "That TikTok no longer exists."],
    private_post: ["Ce TikTok est privé.", "That TikTok is private."],
    no_images: ["Ce post n’est pas un carrousel photo.", "That post is not a photo carousel."],
    plan_required: ["Ton offre ne permet pas l’import.", "Your plan does not allow importing."],
    network: ["Connexion perdue.", "Connection lost."],
  };
  const found = table[code];
  return found ? (english ? found[1] : found[0]) : english ? "Import failed." : "Import impossible.";
}
