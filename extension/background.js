// Script de fond. Une collecte = une recherche ScrollShow (source « browser ») :
//   1. on reserve l'etape aupres de ScrollShow (avec la session de l'utilisateur) ;
//   2. on ouvre la recherche photos TikTok dans une petite fenetre, dans SON TikTok ;
//   3. collect.js fait defiler, hook.js recopie les reponses, on les empile ici ;
//   4. on rend les pages brutes a ScrollShow, qui les normalise, et on ferme.
// Rien n'est envoye ailleurs qu'a l'origine ScrollShow qui a lance la recherche.
const ORIGINS = ["https://scrollshow.io", "http://localhost:3000"];
const runs = new Map(); // tabId -> { jobId, origin, token, payloads, pageTabId, windowId, closing }

const api = async (origin, body) => {
  const response = await fetch(`${origin}/api/research/collector`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `http_${response.status}`);
  return json;
};
const tell = (run, forPage) => { if (run.pageTabId != null) chrome.tabs.sendMessage(run.pageTabId, { forPage: { jobId: run.jobId, ...forPage } }).catch(() => {}); };

async function openStep(run) {
  const { task } = await api(run.origin, { action: "claim", id: run.jobId });
  if (!task) return tell(run, { type: "finished" });
  if (task.kind !== "search") { tell(run, { type: "error", error: "browser_mode_is_search_only" }); return; }
  run.token = task.token; run.payloads = []; run.closing = false;
  const url = `https://www.tiktok.com/search/photo?q=${encodeURIComponent(task.keyword)}#scrollshow-collect`;
  const win = await chrome.windows.create({ url, type: "popup", focused: false, width: 520, height: 860 });
  run.windowId = win.id;
  const tabId = win.tabs && win.tabs[0] && win.tabs[0].id;
  runs.set(tabId, run);
  tell(run, { type: "progress", pages: 0, posts: 0, keyword: task.keyword });
}

async function closeStep(tabId, blocked) {
  const run = runs.get(tabId);
  if (!run || run.closing) return;
  run.closing = true; runs.delete(tabId);
  if (run.windowId != null) chrome.windows.remove(run.windowId).catch(() => {});
  try {
    const job = await api(run.origin, { action: "complete_raw", id: run.jobId, token: run.token, payloads: run.payloads.slice(0, 40), blocked: Boolean(blocked) });
    // Plusieurs mots-cles : la recherche attend l'etape suivante.
    if (job && ["queued", "running"].includes(job.status)) return openStep(run);
    tell(run, { type: "finished", blocked: blocked || "" });
  } catch (error) { tell(run, { type: "error", error: String(error && error.message || error) }); }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || !sender.tab) return;
  if (message.type === "collect") {
    if (!ORIGINS.includes(message.origin) || !String(sender.tab.url || "").startsWith(message.origin)) { reply({ error: "origin_not_allowed" }); return; }
    const run = { jobId: message.jobId, origin: message.origin, pageTabId: sender.tab.id, payloads: [] };
    openStep(run).then(() => reply({ ok: true })).catch((error) => reply({ error: String(error && error.message || error) }));
    return true; // reponse asynchrone
  }
  const run = runs.get(sender.tab.id);
  if (!run) return;
  if (message.type === "payload") {
    run.payloads.push(message.payload);
    const posts = run.payloads.reduce((n, p) => n + (p.item_list ? p.item_list.length : 0), 0);
    tell(run, { type: "progress", pages: run.payloads.length, posts });
  }
  if (message.type === "done") closeStep(sender.tab.id, message.blocked);
});

// L'utilisateur ferme la fenetre lui-meme : on rend ce qui a ete lu.
chrome.tabs.onRemoved.addListener((tabId) => { if (runs.has(tabId)) { const run = runs.get(tabId); run.windowId = null; closeStep(tabId, ""); } });
