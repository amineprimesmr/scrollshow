// Script de contenu (monde isole) de la fenetre de collecte. Il fait defiler la
// recherche TikTok comme le ferait l'utilisateur, allege chaque page de
// resultats et la remet au script de fond. Il s'arrete seul.
(() => {
  if (!location.hash.includes("scrollshow-collect")) return;
  const MAX_PAGES = 14;          // ~170 carrousels : le serveur en garde 200 par recherche
  const QUIET_MS = 9000;         // plus rien de neuf depuis 9 s : fin de liste
  const BUDGET_MS = 42000;       // le serveur coupe une recherche a 60 s
  const started = Date.now();
  let pages = 0, lastPayloadAt = Date.now(), ended = false, exhausted = false;

  const keepAuthor = (a = {}) => ({ uniqueId: a.uniqueId, nickname: a.nickname, signature: a.signature, avatarThumb: a.avatarThumb, avatarMedium: a.avatarMedium, avatarLarger: a.avatarLarger });
  const slimItem = (row) => {
    const i = row && (row.item || row);
    if (!i || typeof i !== "object") return null;
    return { id: i.id, desc: i.desc, createTime: i.createTime, author: keepAuthor(i.author), stats: i.stats, statsV2: i.statsV2,
      authorStats: i.authorStats, authorStatsV2: i.authorStatsV2, imagePost: i.imagePost,
      video: i.video ? { cover: i.video.cover, originCover: i.video.originCover } : undefined,
      textExtra: Array.isArray(i.textExtra) ? i.textExtra.map((t) => ({ hashtagName: t.hashtagName })) : undefined };
  };
  const slim = (d) => {
    const list = Array.isArray(d.item_list) ? d.item_list : Array.isArray(d.data) ? d.data : [];
    return { status_code: d.status_code, has_more: d.has_more, cursor: d.cursor, item_list: list.map(slimItem).filter(Boolean) };
  };

  const seenCursors = new Set();
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || ended) return;
    // hook.js a fini de demander les pages suivantes : plus rien a attendre.
    if (event.data.__scrollshow === "paged") { exhausted = true; return; }
    if (event.data.__scrollshow !== "payload") return;
    const payload = slim(event.data.data || {});
    // Le defilement et la pagination directe peuvent lire la meme page.
    const mark = `${payload.cursor}:${payload.item_list.length && payload.item_list[0].id}`;
    if (seenCursors.has(mark)) return; seenCursors.add(mark);
    if (!payload.item_list.length && pages > 0) { exhausted = true; return; }
    pages += 1; lastPayloadAt = Date.now();
    if (payload.has_more === 0 || payload.has_more === false) exhausted = true;
    chrome.runtime.sendMessage({ type: "payload", payload, pages });
  });

  // Connexion demandee ou verification anti-robot : on le signale, on ne la contourne jamais.
  const blocked = () => {
    const text = (document.body && document.body.innerText || "").slice(0, 6000).toLowerCase();
    if (/drag the slider|fais glisser|verify to continue|vérifie(z)? pour continuer|captcha/.test(text)) return "captcha";
    if (document.querySelector('[data-e2e="login-modal"], [id*="loginContainer"], [class*="LoginContainer"]')) return "login";
    return "";
  };

  const finish = (reason) => {
    if (ended) return; ended = true;
    chrome.runtime.sendMessage({ type: "done", reason, pages, blocked: blocked() });
  };

  const tick = () => {
    if (ended) return;
    const wall = blocked();
    if (wall === "captcha") return finish("captcha");
    if (wall === "login" && pages === 0 && Date.now() - started > 6000) return finish("login");
    if (pages >= MAX_PAGES) return finish("page_limit");
    if (exhausted) return finish("end_of_results");
    if (Date.now() - started > BUDGET_MS) return finish("time_budget");
    if (Date.now() - lastPayloadAt > QUIET_MS) return finish(pages ? "quiet" : "nothing_loaded");
    window.scrollTo(0, document.documentElement.scrollHeight);
    const scroller = document.querySelector('[data-e2e="search-common-container"], main');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    setTimeout(tick, 900);
  };
  const begin = () => setTimeout(tick, 1500);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin); else begin();
})();
