// Monde de la PAGE TikTok. Ne fait rien hors d'une fenetre de collecte ouverte
// par ScrollShow (marqueur dans le fragment d'URL). Dans ce cas seulement :
//   1. il recopie les reponses de la recherche TikTok vers le script de contenu —
//      les memes donnees que la page affiche deja a l'utilisateur connecte ;
//   2. des la premiere reponse, il demande lui-meme les pages suivantes, avec la
//      meme requete que la page (TikTok la signe comme les siennes).
// Le point 2 remplace le defilement : une fenetre en arriere-plan ou recouverte
// n'est pas rendue par Chrome, le defilement n'y charge donc rien (mesure le
// 19 septembre 2026 : une seule page lue, contre quatre par cette voie).
(() => {
  if (!location.hash.includes("scrollshow-collect")) return;
  const MAX_PAGES = 14;
  const SIGNED = ["X-Bogus", "X-Gnarly", "X-Dynosaur", "msToken", "_signature"];
  const wanted = (url) => /\/api\/search\/(photo|general|item)\/full\//.test(String(url || ""));
  const forward = (url, data) => { try { window.postMessage({ __scrollshow: "payload", url: String(url), data }, location.origin); } catch {} };

  let paging = false;
  const paginate = async (firstUrl, first) => {
    if (paging) return; paging = true;
    let cursor = Number(first.cursor || 0), more = Boolean(first.has_more);
    const searchId = (first.log_pb && first.log_pb.impr_id) || (first.extra && first.extra.logid) || "";
    for (let page = 1; page < MAX_PAGES && more && cursor > 0; page++) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      try {
        const url = new URL(firstUrl, location.origin);
        SIGNED.forEach((key) => url.searchParams.delete(key));
        url.searchParams.set("offset", String(cursor)); url.searchParams.set("cursor", String(cursor));
        if (searchId) url.searchParams.set("search_id", searchId);
        // window.fetch COURANT : celui que TikTok a enveloppe pour signer ses requetes,
        // et qui repasse par notre copie ci-dessous (la page suivante est donc recopiee).
        const data = await window.fetch(url.toString(), { credentials: "include" }).then((r) => r.json());
        const items = Array.isArray(data.item_list) ? data.item_list : [];
        if (!items.length) break;
        more = Boolean(data.has_more);
        const next = Number(data.cursor || 0);
        if (next <= cursor) break;
        cursor = next;
      } catch { break; }
    }
    window.postMessage({ __scrollshow: "paged" }, location.origin);
  };

  const seen = (url, data) => {
    forward(url, data);
    if (!paging && /\/api\/search\/photo\/full\//.test(String(url)) && Array.isArray(data && data.item_list) && data.item_list.length) paginate(url, data);
  };

  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    const response = await nativeFetch.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input && input.url;
      if (wanted(url)) response.clone().json().then((data) => seen(url, data)).catch(() => {});
    } catch {}
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (wanted(url)) this.addEventListener("load", () => { try { seen(url, JSON.parse(this.responseText)); } catch {} });
    return nativeOpen.apply(this, arguments);
  };
})();
