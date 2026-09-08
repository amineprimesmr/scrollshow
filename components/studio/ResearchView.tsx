"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStudio } from "./StudioContext";
import type { Account } from "@/lib/types";
import type { researchMetrics } from "@/lib/research";

type Item = { account: Account; metrics: ReturnType<typeof researchMetrics>; measuredAt: string | null };
export function ResearchView() {
  const { english } = useStudio();
  const tr = (fr: string, en: string) => english ? en : fr;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("median");
  const [available, setAvailable] = useState(false);
  const [action, setAction] = useState("analyze");
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/research");
      if (!r.ok) throw new Error("load");
      const j = await r.json(); setItems(j.items); setAvailable(j.discoveryAvailable);
    } catch { setError(english ? "Could not load your research." : "Impossible de charger tes recherches."); }
    finally { setLoading(false); }
  }, [english]);
  useEffect(() => { void load(); }, [load]);
  async function run(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, query }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setNotice(j.warning ? tr("Profil enregistré. Certaines mesures sont indisponibles ; aucune valeur n’a été inventée.", "Profile saved. Some metrics are unavailable; no values were invented.") : tr("Recherche enregistrée dans ta bibliothèque.", "Research saved in your library."));
      await load();
    } catch (e) { setError(tr("La recherche n’a pas abouti. Vérifie le compte ou réessaie plus tard. ", "Research failed. Check the account or try again later. ") + (e instanceof Error ? e.message : "")); }
    finally { setBusy(false); }
  }
  const visible = useMemo(() => items.filter(i => `${i.account.handle} ${i.account.niche} ${i.account.notes}`.toLowerCase().includes(filter.toLowerCase())).sort((a,b) =>
    sort === "followers" ? b.account.followers - a.account.followers : sort === "ratio" ? (b.metrics.medianViewsPerFollower ?? -1) - (a.metrics.medianViewsPerFollower ?? -1) : (b.metrics.medianViews ?? -1) - (a.metrics.medianViews ?? -1)), [items,filter,sort]);
  const number = (n: number | null) => n === null ? "—" : Math.round(n).toLocaleString(english ? "en-US" : "fr-FR");
  return <div className="ss-research">
    <section className="ss-panel">
      <h2>{tr("De la recherche à ton prochain carrousel", "From research to your next carousel")}</h2>
      <p className="ss-lead">{tr("Analyse un compte, compare ses slideshows et retrouve les publications qui méritent d’être étudiées. Ton assistant MCP peut utiliser toute cette bibliothèque pour préparer ton contenu.", "Analyze an account, compare its slideshows and find posts worth studying. Your MCP assistant can use this library to plan your content.")}</p>
      <form onSubmit={run} className="ss-research__form">
        <label>{tr("Mode", "Mode")}<select className="ss-input" value={action} onChange={e=>setAction(e.target.value)}><option value="analyze">{tr("Analyser un @compte", "Analyze an @account")}</option><option value="discover" disabled={!available}>{tr("Découvrir par mots-clés", "Discover by keywords")}</option></select></label>
        <label>{action === "analyze" ? tr("Compte TikTok", "TikTok account") : tr("Mots-clés", "Keywords")}<input className="ss-input" required minLength={2} maxLength={120} value={query} onChange={e=>setQuery(e.target.value)} placeholder={action === "analyze" ? "@compte" : "skincare routines"}/></label>
        <button className="ss-btn-purple" disabled={busy}>{busy ? tr("Analyse en cours…", "Analyzing…") : tr("Rechercher", "Research")}</button>
      </form>
      <p className="ss-lead">{tr("30 analyses et 10 découvertes par jour. Les métriques reflètent un échantillon public, pas une garantie de performance.", "30 analyses and 10 discoveries per day. Metrics reflect a public sample, not a performance guarantee.")}</p>
      {!available && <p className="ss-lead">{tr("La découverte par mots-clés sera disponible lorsque le service de recherche sera connecté. Tu peux déjà analyser un compte précis.", "Keyword discovery becomes available when the search service is connected. You can already analyze a specific account.")}</p>}
      {error && <p role="alert">{error} <button className="ss-btn-ghost" onClick={()=>void load()}>{tr("Réessayer", "Retry")}</button></p>}
      {notice && <p role="status">{notice}</p>}
    </section>
    <div className="ss-research__form">
      <label>{tr("Filtrer la bibliothèque", "Filter library")}<input className="ss-input" value={filter} onChange={e=>setFilter(e.target.value)} placeholder={tr("Compte, niche, notes…", "Account, niche, notes…")}/></label>
      <label>{tr("Trier par", "Sort by")}<select className="ss-input" value={sort} onChange={e=>setSort(e.target.value)}><option value="median">{tr("Vues médianes", "Median views")}</option><option value="ratio">{tr("Vues par abonné", "Views per follower")}</option><option value="followers">{tr("Abonnés", "Followers")}</option></select></label>
      <a className="ss-btn-ghost" href="/app/mcp">{tr("Préparer ma stratégie avec Claude", "Plan my strategy with Claude")}</a>
    </div>
    {loading ? <p role="status">{tr("Chargement des recherches…", "Loading research…")}</p> : !visible.length ? <section className="ss-panel"><h3>{tr("Ta bibliothèque commence avec un compte", "Your library starts with one account")}</h3><p>{tr("Ajoute un concurrent ou un créateur de ta niche ci-dessus. Les résultats restent enregistrés pour tes prochaines analyses.", "Add a competitor or creator above. Results stay saved for your next analysis.")}</p></section> :
    <div className="ss-research__grid">{visible.map(({account:a,metrics:m,measuredAt})=><article className="ss-panel" key={a.id}>
      <h3><a href={`https://www.tiktok.com/@${encodeURIComponent(a.handle)}`} target="_blank" rel="noreferrer">@{a.handle}</a></h3><p className="ss-lead">{a.niche || a.bio}</p>
      <dl className="ss-research__metrics"><div><dt>{tr("Abonnés", "Followers")}</dt><dd>{number(a.followers)}</dd></div><div><dt>{tr("Vues médianes", "Median views")}</dt><dd>{number(m.medianViews)}</dd></div><div><dt>{tr("Part de slideshows", "Slideshow share")}</dt><dd>{m.slideshowShare === null ? "—" : number(m.slideshowShare * 100)+" %"}</dd></div><div><dt>{tr("Échantillon", "Sample")}</dt><dd>{m.samplePosts} posts</dd></div></dl>
      <p className="ss-lead">{measuredAt ? tr("Mesuré le ", "Measured ")+new Date(measuredAt).toLocaleDateString() : tr("Statistiques détaillées non mesurées", "Detailed statistics not measured")}</p>
      {m.slideshowPosts < 5 && <p>{tr("Échantillon insuffisant pour conclure sur ce format.", "Insufficient sample to draw conclusions about this format.")}</p>}
      {m.topPosts.length > 0 && <details><summary>{tr("Slideshows à étudier", "Slideshows to study")}</summary><ol>{m.topPosts.map(p=><li key={p.id}><a href={p.url} target="_blank" rel="noreferrer">{p.title || p.id}</a> · {number(p.views)} {tr("vues", "views")}</li>)}</ol></details>}
    </article>)}</div>}
  </div>;
}
