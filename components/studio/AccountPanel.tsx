"use client";

import { PublicationTextSearch } from "./PublicationTextSearch";
import { matchingSlide, normalizeSlideSearch, publicationTextProgress } from "@/lib/publication-text";
import "./account-gallery.css";
import { t } from "@/lib/i18n";
import type { AccountInsights } from "@/lib/insights";
import { useEffect, useMemo, useRef, useState } from "react";
import { compact, type FanItem } from "./AccountsFan";
import { PostTile } from "./PostTile";
import { PostViewer } from "./PostViewer";
import { engagementOf } from "./post-meta";
import { activeFilterCount, applyPostFilters, ENGAGEMENT_STEPS, NO_FILTERS, postKpis, VIEW_STEPS, type PostFilters } from "@/lib/account-filters";
import { IconChevron } from "./icons";
import { signedUrlExpired } from "./cover";
import { useStudio } from "./StudioContext";

// `img-fx` embarque three.js (~150 Ko compresses). Il ne sert qu'a deux vignettes
// hors de la vue par defaut : on ne le telecharge que si elles s'affichent, au
// lieu de le mettre sur le chemin critique de l'Overview.
import { LoadingOrb, Orb } from "@/components/fx/Orb";

type Range = 30 | 90 | "all";
type Sort = "views" | "engagement" | "recent";

const PAGE = 24;




export function AccountPanel({
  item,
  expanded,
  onToggle,
}: {
  item: FanItem | null;
  expanded: boolean;
  onToggle: (open: boolean) => void;
}) {
  const { english: en } = useStudio();
  const [range, setRange] = useState<Range>("all");
  const [data, setData] = useState<AccountInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PostFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterBox = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  const [hookOnly, setHookOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [openSlide, setOpenSlide] = useState(0);
  function openPublication(id: string, slide = 0) { setOpenSlide(slide); setOpenPost(id); }
  const [openPost, setOpenPost] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Un compte supprime n'a plus d'avatar : on retombe sur ses initiales.
  const [deadAvatar, setDeadAvatar] = useState<string | null>(null);

  const key = item?.id || null;

  useEffect(() => {
    setShown(PAGE);
    setOpenPost(null);
  }, [key, range, filters, sort, query, hookOnly]);

  // Le menu Filtres se ferme au clic dehors et a Echap.
  useEffect(() => {
    if (!filtersOpen) return;
    const away = (event: PointerEvent) => { if (!filterBox.current?.contains(event.target as Node)) setFiltersOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setFiltersOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [filtersOpen]);

  // Dernieres stats lues, par compte et periode. Revenir sur un compte deja vu
  // l'affiche tout de suite ; la lecture reseau le rafraichit derriere.
  const seenInsights = useRef(new Map<string, AccountInsights>());
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!key) {
      setData(null);
      return;
    }
    const cacheKey = `${key}:${range}`;
    const cached = seenInsights.current.get(cacheKey) || null;
    setData(cached);
    let active = true;
    // Scrubbing the fan changes the selection quickly: wait for it to settle.
    // Le tout premier compte n'a rien a attendre : personne ne fait defiler.
    const wait = firstLoad.current ? 0 : cached ? 500 : 220;
    firstLoad.current = false;
    const handle = window.setTimeout(() => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      setError(null);
      fetch(`/api/studio/insights?key=${encodeURIComponent(key)}&days=${range}`, { signal: controller.signal })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || "failed");
          seenInsights.current.set(cacheKey, json);
          if (seenInsights.current.size > 40) seenInsights.current.delete(seenInsights.current.keys().next().value as string);
          if (active) setData(json);
        })
        .catch((err) => {
          if (active && !cached && err?.name !== "AbortError") setError(t("Impossible de charger les statistiques.", "Could not load the stats.", en));
        })
        .finally(() => { if (active) setLoading(false); });
    }, wait);
    return () => { active = false; window.clearTimeout(handle); abort.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range]);

  const selection = useRef<string | null>(null);
  useEffect(() => () => { selection.current = null; }, []);
  selection.current = `${key}:${range}`;
  const syncing = useRef(false);
  const autoStarted = useRef(new Set<string>());

  /**
   * Chaque page lue est un appel PAYANT. Une ouverture automatique n'en lit que
   * deux (les 100 posts les plus recents) ; l'historique complet d'un gros compte
   * — des centaines de pages pour @nike — ne se charge que si l'utilisateur le
   * demande, six pages par clic.
   */
  async function fetchVideos(fromStart = false, manual = false) {
    if (!key || syncing.current) return;
    let pagesLeft = manual ? 6 : 2;
    const requestedKey = key;
    const requestedSelection = `${key}:${range}`;
    syncing.current = true;
    setFetching(true);
    setError(null);
    let restart = fromStart || Boolean(data?.sync?.complete);
    try {
      // Each HTTP request commits one page. Switching account pauses this loop;
      // reopening it resumes from the persisted cursor.
      while (selection.current === requestedSelection) {
        const res = await fetch("/api/studio/insights", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: requestedKey, action: "fetch_videos", days: range, restart, force: manual && restart }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "sync_failed");
        seenInsights.current.set(requestedSelection, json);
        if (selection.current !== requestedSelection) break;
        setData(json);
        restart = false;
        pagesLeft -= 1;
        if (!json.sync?.hasMore || pagesLeft <= 0) break;
      }
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "sync_failed";
      const reconnect = /scope|token|connection_required|unauthorized/.test(code);
      if (selection.current === requestedSelection) setError(code === "budget"
        ? t("Limite quotidienne de lecture de posts atteinte. Elle se réinitialise demain ; les posts déjà chargés restent affichés.", "Daily post-reading limit reached. It resets tomorrow; posts already loaded stay available.", en)
        : code === "blocked"
        ? t("La lecture des posts publics est suspendue côté ScrollShow. Les posts déjà chargés restent affichés.", "Reading public posts is paused on ScrollShow's side. Posts already loaded stay available.", en)
        : reconnect
        ? t("Autorisation TikTok expirée ou incomplète. Reconnecte ce compte depuis Comptes. Les posts chargés sont conservés.", "TikTok permission expired or incomplete. Reconnect this account from Accounts. Loaded posts are preserved.", en)
        : t("Lecture interrompue par le service de données. Les posts chargés sont conservés ; reprends la synchronisation dans un moment.", "The data service interrupted the sync. Loaded posts are preserved; resume syncing in a moment.", en));
    } finally {
      syncing.current = false;
      setFetching(false);
    }
  }

  useEffect(() => {
    // Une synchronisation appelle un fournisseur PAYANT. Elle ne part donc que pour
    // un panneau ouvert (faire defiler l'eventail panneau replie ne coute rien) et
    // une seule fois par compte et par visite — `autoStarted` retient tous les
    // comptes deja tentes, pas seulement le dernier : A → B → A ne repaie pas A.
    if (!expanded || !key || !data || data.key !== key || !data.canFetch || fetching || autoStarted.current.has(key)) return;
    const age = data.fetchedAt ? Date.now() - Date.parse(data.fetchedAt) : Infinity;
    // `fetchedAt` ne bouge qu'en cas de succes : l'anciennete d'un ECHEC se lit sur
    // `sync.updatedAt`, sinon un compte qui echoue toujours etait retente a chaque fois.
    const sinceAttempt = data.sync?.updatedAt ? Date.now() - Date.parse(data.sync.updatedAt) : Infinity;
    // Les couvertures TikTok sont des URL signees qui expirent en quelques jours.
    // Une galerie dont les images sont mortes doit etre relue DEPUIS LE DEBUT :
    // reprendre au curseur ne rafraichit jamais les premieres pages, et c'est
    // ainsi qu'un compte lu il y a une semaine affichait un mur de tuiles vides.
    const dead = data.videos.slice(0, 12).filter(v => signedUrlExpired(v.images?.[0] || v.cover)).length;
    const expired = dead > 0 && dead >= Math.min(3, data.videos.length);
    // Une erreur ancienne ne doit pas bloquer a vie : on retente apres une heure.
    if (data.sync?.error && sinceAttempt < 6 * 3600000) return;
    // « Partiel » seul ne declenche rien : sinon chaque visite d'un gros compte
    // relisait deux pages de plus, indefiniment. On relit si le compte n'a jamais
    // ete lu, s'il date de plus de 24 h, ou si ses images sont mortes.
    if (expired || !data.fetchedAt || age > 24 * 3600000) {
      autoStarted.current.add(key);
      void fetchVideos(expired);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, data, fetching, expanded]);

  const metricValue = (value: number, metric = "views", suffix = "") => {
    const missing = !data || (data.source === "none" && !data.sync?.complete) || data.stats.missingMetrics?.includes(metric);
    return missing ? "—" : `${compact(value)}${suffix}`;
  };

  const videos = useMemo(() => {
    const all = data?.videos || [];
    const needle = normalizeSlideSearch(query);
    // Les seuils « au-dessus de la mediane » / « top 10 % » se mesurent sur tout
    // le compte, puis la recherche de texte affine.
    const filtered = applyPostFilters(all, filters).filter((v) => !needle || Boolean(matchingSlide(v, needle, hookOnly)));
    const rank: Record<Sort, (v: (typeof all)[number]) => number> = {
      views: (v) => v.views,
      engagement: (v) => engagementOf(v),
      recent: (v) => v.createdAt,
    };
    return [...filtered].sort((a, b) => rank[sort](b) - rank[sort](a));
  }, [data, filters, sort, query, hookOnly]);

  const kpis = useMemo(() => postKpis(videos), [videos]);
  const filterCount = activeFilterCount(filters);
  const shownValue = (value: number, suffix = "") => (kpis.posts && !kpis.complete && !value ? "—" : `${compact(value)}${suffix}`);

  if (!item) return null;
  const s = data?.stats;
  const current = openPost ? (data?.videos || []).find((v) => v.id === openPost) || null : null;
  const rangeLabel = range === "all" ? t("Tout", "All", en) : `${range} ${t("jours", "days", en)}`;

  return (
    <div className={`ss-acc ${expanded ? "is-open" : ""}`}>
      <button type="button" className="ss-acc__bar" onClick={() => onToggle(!expanded)} aria-expanded={expanded}>
        <div className="ss-acc__id">
          {item.avatar && deadAvatar !== item.avatar ? <img src={item.avatar} alt="" decoding="async" onError={() => setDeadAvatar(item.avatar)} /> : <span>{item.handle.slice(0, 2).toUpperCase()}</span>}
          <div>
            <b>{item.name}</b>
            <span>
              @{item.handle} · {item.platform === "tiktok" ? "TikTok" : item.platform === "instagram" ? "Instagram" : item.platform}
            </span>
          </div>
          <span className={`ss-badge ${item.connected ? "is-ready" : "is-wait"}`}>
            {item.connected ? t("Connecté", "Connected", en) : item.kind === "clipper" ? t("Réseau", "Network", en) : t("Lié", "Linked", en)}
          </span>
        </div>
        <dl className="ss-acc__quick">
          <div>
            <dt>{t("Abonnés", "Followers", en)}</dt>
            <dd>{compact(item.followers)}</dd>
          </div>
          <div>
            <dt>{t("Vues", "Views", en)} · {rangeLabel}</dt>
            <dd>{s ? metricValue(s.views) : "—"}</dd>
          </div>
          <div>
            <dt>{t("Vues moy.", "Avg views", en)}</dt>
            <dd>{s ? metricValue(s.avgViews) : "—"}</dd>
          </div>
          <div>
            <dt>{t("Publications chargées", "Loaded posts", en)}</dt>
            <dd>{data ? data.sync?.loaded ?? data.videos.length : "—"}</dd>
          </div>
        </dl>
        <span className="ss-acc__toggle">
          {expanded ? t("Réduire", "Collapse", en) : t("Détails", "Details", en)}
          <span className={`ss-acc__chev ${expanded ? "is-open" : ""}`}>
            <IconChevron dir="down" size={16} />
          </span>
        </span>
      </button>

      <div className="ss-acc__body" aria-hidden={!expanded}>
        {/* Une seule vue : une rangee de commandes en verre, six chiffres, le mur. */}
        <div className="ss-acc__controls">
          <PublicationTextSearch key={`${key}:${range}`} enabled={expanded} accountKey={key!} range={range} videos={data?.videos || []} query={query} onQuery={setQuery}
            hookOnly={hookOnly} onScope={setHookOnly} priorityPostId={openPost || undefined} en={en} onUpdate={(updates, hooks) => setData(previous => {
              if (!previous || previous.key !== key) return previous;
              const indexed = new Map(updates.map(v => [v.id, v.slideTexts]));
              return { ...previous, hooks, videos: previous.videos.map(v => indexed.has(v.id) ? { ...v, slideTexts: indexed.get(v.id) } : v) };
            })} />
          <div className="ss-acc__seg lg" role="group" aria-label={t("Période", "Period", en)}>
            {([30, 90, "all"] as const).map((r) => (
              <button key={String(r)} type="button" className={range === r ? "is-on" : ""} aria-pressed={range === r} onClick={() => setRange(r)}>
                {r === "all" ? t("Tout", "All", en) : `${r} j`}
              </button>
            ))}
          </div>
          <div className="ss-acc__filter" ref={filterBox}>
            <button type="button" className={`ss-acc__pill lg lg--lens lg-press${filterCount ? " is-on" : ""}`} aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={() => setFiltersOpen((open) => !open)}>
              {t("Filtres", "Filters", en)}{filterCount ? <b>{filterCount}</b> : null}
            </button>
            {filtersOpen ? (
              <div className="ss-acc__filter-menu lg" role="dialog" aria-label={t("Filtres", "Filters", en)}>
                <FilterGroup label={t("Trier par", "Sort by", en)}>
                  {(["recent", "views", "engagement"] as const).map((id) => (
                    <button key={id} type="button" aria-pressed={sort === id} className={sort === id ? "is-on" : ""} onClick={() => setSort(id)}>
                      {id === "recent" ? t("Récents", "Recent", en) : id === "views" ? t("Vues", "Views", en) : t("Engagement", "Engagement", en)}
                    </button>
                  ))}
                </FilterGroup>
                <FilterGroup label={t("Type", "Type", en)}>
                  {(["all", "photo", "video"] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={filters.kind === k} className={filters.kind === k ? "is-on" : ""} onClick={() => setFilters({ ...filters, kind: k })}>
                      {k === "all" ? t("Tout", "All", en) : k === "photo" ? t("Carrousels", "Carousels", en) : t("Vidéos", "Videos", en)}
                    </button>
                  ))}
                </FilterGroup>
                <FilterGroup label={t("Vues minimum", "Minimum views", en)}>
                  {VIEW_STEPS.map((step) => (
                    <button key={step} type="button" aria-pressed={filters.minViews === step} className={filters.minViews === step ? "is-on" : ""} onClick={() => setFilters({ ...filters, minViews: step })}>
                      {step ? `${compact(step).replace(".0", "")}+` : t("Toutes", "Any", en)}
                    </button>
                  ))}
                </FilterGroup>
                <FilterGroup label={t("Engagement minimum", "Minimum engagement", en)}>
                  {ENGAGEMENT_STEPS.map((step) => (
                    <button key={step} type="button" aria-pressed={filters.minEngagement === step} className={filters.minEngagement === step ? "is-on" : ""} onClick={() => setFilters({ ...filters, minEngagement: step })}>
                      {step ? `${step} %+` : t("Tous", "Any", en)}
                    </button>
                  ))}
                </FilterGroup>
                <FilterGroup label={t("Performance", "Performance", en)}>
                  {(["all", "above", "top"] as const).map((perf) => (
                    <button key={perf} type="button" aria-pressed={filters.perf === perf} className={filters.perf === perf ? "is-on" : ""} onClick={() => setFilters({ ...filters, perf })}>
                      {perf === "all" ? t("Tous", "All", en) : perf === "above" ? t("Top 50 %", "Top 50%", en) : t("Top 10 %", "Top 10%", en)}
                    </button>
                  ))}
                </FilterGroup>
                <FilterGroup label={t("Recherche de texte", "Text search", en)}>
                  <button type="button" aria-pressed={!hookOnly} className={!hookOnly ? "is-on" : ""} onClick={() => setHookOnly(false)}>{t("Toutes les slides", "All slides", en)}</button>
                  <button type="button" aria-pressed={hookOnly} className={hookOnly ? "is-on" : ""} onClick={() => setHookOnly(true)}>{t("Hook seul", "Hook only", en)}</button>
                </FilterGroup>
                <div className="ss-acc__filter-foot">
                  <button type="button" className="ss-acc__filter-reset" disabled={!filterCount && sort === "recent" && !hookOnly} onClick={() => { setFilters(NO_FILTERS); setSort("recent"); setHookOnly(false); }}>{t("Réinitialiser", "Reset", en)}</button>
                  <button type="button" className="ss-acc__pill is-on lg-press" onClick={() => setFiltersOpen(false)}>{t(`Voir ${videos.length} posts`, `Show ${videos.length} posts`, en)}</button>
                </div>
              </div>
            ) : null}
          </div>
          {data?.canFetch && !data.sync?.complete ? (
            <button type="button" className="ss-acc__pill lg lg--lens lg-press" disabled={fetching} onClick={() => void fetchVideos(true, true)}>
              {t("Actualiser", "Refresh", en)}
            </button>
          ) : null}
          {data?.canFetch ? (
            <button type="button" className="ss-acc__pill lg lg--lens lg-press" disabled={fetching} onClick={() => void fetchVideos(false, true)}
              title={data.fetchedAt ? `${t("Lu le", "Read on", en)} ${new Date(data.fetchedAt).toLocaleDateString(en ? "en-US" : "fr-FR", { day: "numeric", month: "short" })}` : undefined}>
              {fetching ? <Orb size={20} state="searching" /> : <span className={`ss-acc__status-dot${data.sync?.complete ? " is-ok" : " is-partial"}`} aria-hidden />}
              {fetching ? t("Lecture…", "Reading…", en) : data.sync?.complete ? t("Actualiser", "Refresh", en) : t("Charger plus", "Load more", en)}
            </button>
          ) : null}
          <a href={`https://www.tiktok.com/@${item.handle}`} target="_blank" rel="noreferrer" className="ss-acc__pill lg lg--lens lg-press" aria-label={t("Ouvrir sur TikTok", "Open on TikTok", en)}>↗</a>
        </div>

        {error ? <p className="ss-acc__error">{error}</p> : null}
        {loading && !data ? <LoadingOrb state="searching" text={t("Lecture des statistiques…", "Reading the stats…", en)} /> : null}

        {data ? (
          <div className="ss-acc__videos">
            {videos.length ? (
              <dl className="ss-acc__kpis">
                <div><dd>{compact(item.followers)}</dd><dt>{t("abonnés", "followers", en)}</dt></div>
                <div><dd>{kpis.posts}</dd><dt>{t("posts", "posts", en)}</dt></div>
                <div><dd>{shownValue(kpis.views)}</dd><dt>{t("vues", "views", en)}</dt></div>
                <div><dd>{shownValue(kpis.avgViews)}</dd><dt>{t("vues moy.", "avg views", en)}</dt></div>
                <div><dd>{shownValue(kpis.medianViews)}</dd><dt>{t("médiane", "median", en)}</dt></div>
                <div><dd>{kpis.views ? `${kpis.engagement} %` : "—"}</dd><dt>{t("engagement", "engagement", en)}</dt></div>
                <div><dd>{kpis.cadence || "—"}</dd><dt>{t("posts / sem.", "posts / wk", en)}</dt></div>
              </dl>
            ) : (
              <p className="ss-acc__empty">
                {data.videos.length
                  ? query && publicationTextProgress(data.videos).pending
                    ? t("Aucun résultat dans les images déjà lues. La recherche se complétera au fil de la lecture.", "No matches in the images read so far. More results may appear as reading continues.", en)
                    : t("Aucun post ne correspond.", "No post matches.", en)
                  : data.canFetch
                    ? t("Aucun post sur cette période.", "No post in this range.", en)
                    : t("Connecte le compte pour lire ses posts.", "Connect the account to read its posts.", en)}
                {data.videos.length && (filterCount || query) ? (
                  <button type="button" className="ss-acc__filter-reset" onClick={() => { setFilters(NO_FILTERS); setQuery(""); }}>{t("Tout afficher", "Show all", en)}</button>
                ) : null}
              </p>
            )}

            <ul className="ss-acc__gallery">
              {videos.slice(0, shown).map((v) => (
                <li key={v.id}>
                  <PostTile
                    post={v}
                    en={en}
                    initialSlide={matchingSlide(v, query, hookOnly)?.index ?? 0}
                    onOpen={slide => openPublication(v.id, slide)}
                    footer={normalizeSlideSearch(query) ? <button type="button" className="ss-posttile__match" onClick={() => openPublication(v.id, matchingSlide(v, query, hookOnly)?.index ?? 0)}>
                      {t(`Voir le texte · slide ${(matchingSlide(v, query, hookOnly)?.index ?? 0) + 1}`, `View text · slide ${(matchingSlide(v, query, hookOnly)?.index ?? 0) + 1}`, en)}
                    </button> : null}
                  />
                </li>
              ))}
            </ul>
            {videos.length > shown ? (
              <button type="button" className="ss-acc__pill lg lg--lens lg-press ss-acc__more" onClick={() => setShown((n) => n + PAGE)}>
                {t(`Voir ${Math.min(PAGE, videos.length - shown)} de plus`, `Show ${Math.min(PAGE, videos.length - shown)} more`, en)}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {current ? <PostViewer initialSlide={openSlide} video={current} handle={item.handle} en={en} onClose={() => setOpenPost(null)} /> : null}
    </div>
  );
}

/**
 * Le post entier, dans le studio : l'embed officiel TikTok joue la vidéo ou
 * fait défiler le carrousel, et les compteurs de la période sont à côté.
 */

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="ss-acc__filter-group">
      <legend>{label}</legend>
      <div className="ss-acc__range" role="group" aria-label={label}>{children}</div>
    </fieldset>
  );
}
