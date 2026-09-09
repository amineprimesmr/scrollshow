"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONNECTOR_CATEGORIES } from "@/lib/connector-categories";
import "./connector-registry.css";

type Tool = {
  id: string; provider: string; providerName: string; endpoint: string;
  name: string; description: string; price: string; verified: boolean; status: string;
};

const CATEGORIES = CONNECTOR_CATEGORIES;

/** Aperçu du registre de connecteurs : catégories, recherche live, ouverture en feuille. */
export function ConnectorRegistry({ english = false }: { english?: boolean }) {
  const t = (fr: string, en: string) => (english ? en : fr);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(CATEGORIES[0].key);
  const [query, setQuery] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error" | "off" | "auth" | "busy">("idle");
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (q: string) => {
    setState("loading");
    try {
      const res = await fetch(`/api/connectors/tools?q=${encodeURIComponent(q)}`);
      const json = await res.json().catch(() => ({}));
      if (json.enabled === false) { setTools([]); setState("off"); return; }
      if (res.status === 403) { setTools([]); setState("auth"); return; }
      if (res.status === 429) { setTools([]); setState("busy"); return; }
      if (!res.ok) throw new Error("registry");
      setTools(json.tools || []);
      setState("idle");
    } catch { setTools([]); setState("error"); }
  }, []);

  useEffect(() => { if (open) void load(query.trim() || category); }, [open, category, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void load(query.trim() || category);
  }

  return (
    <div className="ss-registry">
      <div className="ss-registry__intro lg lg--flat">
        <span className="ss-registry__mark" aria-hidden="true">M</span>
        <div className="ss-registry__copy">
          <strong>{t("Tous les connecteurs", "Every connector")}</strong>
          <span>{t("1 700+ outils et API que ton agent appelle à la demande, sur un seul solde.", "1,700+ tools and APIs your agent calls on demand, on a single balance.")}</span>
        </div>
        <button type="button" className="ss-registry__open lg-press" onClick={() => setOpen(true)} aria-haspopup="dialog">
          {t("Voir tous les outils", "See every tool")} <span aria-hidden="true">→</span>
        </button>
      </div>

      {open && (
        <div className="ss-registry__scrim" role="presentation" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="ss-registry__sheet lg" role="dialog" aria-modal="true" aria-label={t("Registre des outils", "Tool registry")}>
            <header className="ss-registry__head">
              <div>
                <h3>{t("Outils connectés", "Connected tools")}</h3>
                <p>{t("Recherche en direct dans le registre.", "Live search across the registry.")}</p>
              </div>
              <button ref={closeRef} type="button" className="ss-registry__close lg-press" onClick={() => setOpen(false)} aria-label={t("Fermer", "Close")}>
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </header>

            <form className="ss-registry__search lg--flat" onSubmit={submit} role="search">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4.5 4.5" /></svg>
              <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Cherche un outil, une API, une plateforme…", "Search a tool, an API, a platform…")} aria-label={t("Rechercher un outil", "Search a tool")} />
              <button type="submit" className="lg-press">{t("Chercher", "Search")}</button>
            </form>

            <div className="ss-registry__chips" role="tablist" aria-label={t("Catégories", "Categories")}>
              {CATEGORIES.map(c => (
                <button key={c.key} type="button" role="tab" aria-selected={category === c.key && !query}
                  className={`ss-registry__chip lg--lens lg-press${category === c.key && !query ? " is-active" : ""}`}
                  onClick={() => { setQuery(""); setCategory(c.key); }}>{c.label}</button>
              ))}
            </div>

            <div className="ss-registry__body">
              {state === "loading" && <ul className="ss-registry__grid">{Array.from({ length: 6 }).map((_, i) => <li key={i} className="ss-registry__skeleton" style={{ animationDelay: `${i * 70}ms` }} />)}</ul>}
              {state === "off" && <p className="ss-registry__note">{t("Le registre est indisponible sur cet environnement.", "The registry is unavailable on this environment.")}</p>}
              {state === "auth" && <p className="ss-registry__note">{t("La recherche libre est réservée aux comptes ScrollShow. Choisis une catégorie, ou ", "Free-text search is reserved for ScrollShow accounts. Pick a category, or ")}<a href="/signup">{t("crée ton compte", "create your account")}</a>.</p>}
              {state === "busy" && <p className="ss-registry__note">{t("Trop de recherches en ce moment. Réessaie dans une minute.", "Too many searches right now. Try again in a minute.")}</p>}
              {state === "error" && <p className="ss-registry__note">{t("Le registre n’a pas répondu. Réessaie dans un instant.", "The registry did not answer. Try again shortly.")}</p>}
              {state === "idle" && !tools.length && <p className="ss-registry__note">{t("Aucun outil pour cette recherche.", "No tool for this search.")}</p>}
              {state === "idle" && tools.length > 0 && (
                <ul className="ss-registry__grid">
                  {tools.map((tool, i) => (
                    <li key={tool.id} className="ss-registry__tool" style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                      <div className="ss-registry__tool-top">
                        <span className="ss-registry__provider">{tool.providerName}</span>
                        {tool.verified && <span className="ss-registry__badge">{t("vérifié", "verified")}</span>}
                      </div>
                      <strong>{tool.name}</strong>
                      <p>{tool.description}</p>
                      <div className="ss-registry__tool-foot">
                        <code>{tool.endpoint}</code>
                        <span className="ss-registry__price">{tool.price}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="ss-registry__foot">
              <span>{t("Appels facturés à l’usage, sur le solde ScrollShow. Aucune clé à fournir.", "Usage-based calls on the ScrollShow balance. No key to provide.")}</span>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
