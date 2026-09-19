// Monde de la PAGE TikTok. Ne fait rien hors d'une fenetre de collecte ouverte
// par ScrollShow (marqueur dans le fragment d'URL). Dans ce cas seulement, il
// recopie les reponses de la recherche TikTok vers le script de contenu : ce
// sont les memes donnees que la page affiche deja a l'utilisateur connecte.
(() => {
  if (!location.hash.includes("scrollshow-collect")) return;
  const wanted = (url) => /\/api\/search\/(photo|general|item)\/full\//.test(String(url || ""));
  const forward = (url, data) => { try { window.postMessage({ __scrollshow: "payload", url: String(url), data }, location.origin); } catch {} };

  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    const response = await nativeFetch.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input && input.url;
      if (wanted(url)) response.clone().json().then((data) => forward(url, data)).catch(() => {});
    } catch {}
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (wanted(url)) this.addEventListener("load", () => { try { forward(url, JSON.parse(this.responseText)); } catch {} });
    return nativeOpen.apply(this, arguments);
  };
})();
