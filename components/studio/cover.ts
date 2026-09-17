/** TikTok covers and avatars are hotlink-protected: always go through our own proxy.
 *
 * `width` = largeur CSS d'affichage. Le proxy redimensionne (x2 pour les ecrans
 * denses) : sans elle, une tuile de 200 px telecharge la slide 1080 px entiere. */
export function coverSrc(url: string, width?: number) {
  if (!url) return "";
  if (!/^https:\/\//.test(url)) return url;
  const size = width ? `&w=${Math.round(width * 2)}` : "";
  return `/api/studio/tiktok/cover?url=${encodeURIComponent(url)}${size}`;
}

/** Avatar TikTok par handle : adresse stable, reparee cote serveur quand l'URL
 * signee stockee a expire (~48 h). `url` n'est qu'un indice encore frais. */
export function avatarSrc(handle: string, url?: string, width = 48, hint = false) {
  const clean = (handle || "").replace(/^@/, "").trim();
  if (url && !/^https:\/\//.test(url)) return url;
  if (!clean) return coverSrc(url || "", width);
  // `hint` : pour un auteur hors bibliotheque (mur de recherche), l'URL recue a
  // l'instant evite au serveur une lecture de profil.
  const extra = hint && url ? `&url=${encodeURIComponent(url)}` : "";
  return `/api/studio/tiktok/avatar?handle=${encodeURIComponent(clean)}&w=${Math.round(width * 2)}${extra}`;
}

/** Avatar d'une ligne du studio (compte connecte ou suivi). TikTok passe par la
 * route par handle ; les autres plateformes gardent leur URL. */
export function rowAvatarSrc(row: { platform?: string; handle?: string; avatar?: string }, width = 40) {
  if ((!row.platform || row.platform === "tiktok") && row.handle && row.handle !== "tiktok") return avatarSrc(row.handle, row.avatar, width);
  return row.avatar || "";
}

/** `onError` d'un avatar : le serveur repare une URL expiree en arriere-plan, on
 * redemande donc l'image deux fois (5 s puis 10 s) avant de la masquer. */
export function retryAvatar(event: { currentTarget: HTMLImageElement }) {
  const img = event.currentTarget;
  const tries = Number(img.dataset.retry || 0);
  img.style.visibility = "hidden";
  if (tries >= 2 || !img.src.includes("/tiktok/avatar")) return;
  img.dataset.retry = String(tries + 1);
  window.setTimeout(() => {
    if (!img.isConnected) return;
    img.onload = () => { img.style.visibility = ""; };
    img.src = `${img.src.replace(/&retry=\d+$/, "")}&retry=${tries + 1}`;
  }, 5000 * (tries + 1));
}

/** Une URL du CDN TikTok porte sa date de peremption (`x-expires`, en secondes). */
export function signedUrlExpired(url?: string) {
  if (!url || !/^https:\/\//.test(url)) return false;
  try {
    const expires = Number(new URL(url).searchParams.get("x-expires") || 0);
    return expires > 0 && expires * 1000 <= Date.now();
  } catch {
    return false;
  }
}
