"use client";
import { checkedFetch } from "@/lib/client-request";

import { t } from "@/lib/i18n";
import { ensureRecipe, needsReconstruct } from "@/lib/recipe";
import type { StudioPost } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconCalendar,
  IconCheck,
  IconCopy,
  IconDownload,
  IconDots,
  IconEdit,
  IconEyeOff,
  IconGlobe,
  IconLink,
  IconMedia,
  IconPlus,
  IconSearch,
  IconSparkle,
  IconX,
} from "./icons";
import { SlidePreview } from "./SlidePreview";
import { useStudio } from "./StudioContext";
import "./library.css";

type MarketItem = StudioPost & {
  mine?: boolean;
  slideCount?: number;
  caption?: string;
};

/** Largeur à laquelle la slide est rendue avant d'être mise à l'échelle dans
    la carte : overlayStyle calcule ses tailles en px depuis cette largeur, on
    ne peut donc pas simplement étirer l'aperçu en CSS. */
const PREVIEW_WIDTH = 300;

/** Toutes les colonnes du mur font la même largeur : une seule mesure suffit
    pour toutes les cartes. Le facteur descend en variable CSS (--k), héritée
    par chaque aperçu. Un ResizeObserver par carte serait du gâchis. */
function useTileScale() {
  const ref = useRef<HTMLUListElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const wall = ref.current;
    if (!wall || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const first = wall.firstElementChild as HTMLElement | null;
      const width = first?.clientWidth || 0;
      if (width > 0) setScale(width / PREVIEW_WIDTH);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(wall);
    measure();
    return () => observer.disconnect();
  }, []);

  return { ref, scale };
}

type StatusFilter = "all" | "draft" | "scheduled" | "published";

function originLabel(item: MarketItem, english: boolean) {
  if (item.recipe?.editable) return t("Éditable", "Editable", english);
  if (item.origin === "ai") return "IA";
  if (item.origin === "import") return t("Importé", "Imported", english);
  if (item.origin === "fork") return t("Clone", "Clone", english);
  return t("Manuel", "Manual", english);
}

function statusLabel(status: StudioPost["status"], english: boolean) {
  if (status === "published") return t("Publié", "Published", english);
  if (status === "scheduled") return t("Planifié", "Scheduled", english);
  return t("Brouillon", "Draft", english);
}

function compact(value: number, english: boolean) {
  return Intl.NumberFormat(english ? "en" : "fr", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Menu d'actions secondaires d'une carte. Il se pose sur le mur, donc verre
    plus opaque que la valeur par défaut, comme les menus de la sidebar. */
/** Le texte d'un carrousel, slide par slide : ce qu'on recolle dans TikTok.
 *  Les calques sont ranges de haut en bas pour retrouver l'ordre de lecture. */
function slideText(recipe: ReturnType<typeof ensureRecipe>) {
  return recipe.slides
    .map((slide, index) => {
      const lines = [...(slide.overlays || [])]
        .sort((a, b) => a.y - b.y)
        .map((overlay) => overlay.text.trim())
        .filter(Boolean);
      return lines.length ? `${index + 1}. ${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function CardMenu({ children, label }: { children: (close: () => void) => React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ss-lib-menu-wrap" ref={box}>
      <button type="button" className="ss-lib-more" aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <IconDots size={16} />
      </button>
      {open ? <div className="ss-lib-menu">{children(() => setOpen(false))}</div> : null}
    </div>
  );
}

export function MarketplaceView() {
  const { posts, english, user, setEditing, setPostOpen, reload } = useStudio();
  const [tab, setTab] = useState<"private" | "public">("private");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [publicItems, setPublicItems] = useState<MarketItem[]>([]);
  const [url, setUrl] = useState("");
  const [sharePublic, setSharePublic] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function loadPublic() {
    try {

    const res = await checkedFetch("/api/studio/marketplace?tab=public");
    const json = await res.json().catch(() => ({}));
    setPublicItems(Array.isArray(json.items) ? json.items : []);

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setBusy(null); }
  }

  useEffect(() => {
    void loadPublic();
  }, []);

  const privateItems = useMemo(() => posts as MarketItem[], [posts]);

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = { all: privateItems.length, draft: 0, scheduled: 0, published: 0 };
    for (const item of privateItems) base[item.status] += 1;
    return base;
  }, [privateItems]);

  const items = useMemo(() => {
    const source = tab === "public" ? publicItems : privateItems;
    const needle = query.trim().toLowerCase();
    return source.filter((item) => {
      if (tab === "private" && statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!needle) return true;
      const hay = `${item.body || ""} ${item.caption || ""} ${item.authorHandle || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [tab, publicItems, privateItems, statusFilter, query]);

  function createNew() {
    setEditing(null);
    setPostOpen(true);
  }

  function edit(item: MarketItem) {
    if (item.userId && item.userId !== user?.id) return;
    setEditing(item);
    setPostOpen(true);
  }

  async function importUrl(event: React.FormEvent) {
    try {

    event.preventDefault();
    setBusy("import");
    setMessage("");
    const res = await checkedFetch("/api/studio/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, visibility: sharePublic ? "public" : "private" }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      const errors: Record<string, [string, string]> = {
        not_tiktok: ["Colle un lien TikTok.", "Paste a TikTok link."],
        invalid_url: ["Colle un lien TikTok.", "Paste a TikTok link."],
        url_required: ["Colle un lien TikTok.", "Paste a TikTok link."],
        no_slides: ["Impossible de lire les slides. Vérifie que le TikTok est public.", "Could not read the slides. Make sure the TikTok is public."],
        tiktok_not_found: ["Impossible de lire ce TikTok. Vérifie qu’il est public.", "Could not read that TikTok. Make sure it is public."],
        image_download_failed: ["Les images TikTok n’ont pas pu être copiées.", "The TikTok images could not be copied."],
        image_store_failed: ["Les slides ont été lues mais pas enregistrées.", "The slides were read but could not be saved."],
      };
      const copy = errors[String(json.error)] || ["Import impossible.", "Import failed."];
      setMessage(t(copy[0], copy[1], english));
      return;
    }
    if (json.post?.importSummary?.videoPreviewOnly) setMessage(t("Seule la miniature de cette vidéo a été importée. Le fichier vidéo n’est pas importé ni éditable ici.", "Only this video's thumbnail was imported. The video file is not imported or editable here.", english));
    if (json.post?.importSummary?.failed || json.post?.importSummary?.truncated) {
      const summary = json.post.importSummary;
      setMessage(t(`Import partiel : ${summary.imported} image(s) sur ${summary.expected}. Vérifie le carrousel avant de l’utiliser.`, `Partial import: ${summary.imported} of ${summary.expected} images. Check the carousel before using it.`, english));
    }
    setUrl("");
    setImportOpen(false);
    setTab(sharePublic ? "public" : "private");
    await reload();
    await loadPublic();
    if (json.post) {
      setEditing(json.post);
      setPostOpen(true);
    }

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setBusy(null); }
  }

  /** Un seul chemin pour toute copie : on montre « Copie » au meme endroit. */
  async function copyText(id: string, text: string) {
    try {

    if (!text.trim()) {
      setMessage(t("Rien a copier sur ce carrousel.", "Nothing to copy on this carousel.", english));
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setMessage("");
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setBusy(null); }
  }

  /** Le .zip des images, deja produit par le serveur : slide-01.jpg, la
   *  legende et la recette. La route existait sans que rien ne l'appelle. */
  async function downloadImages(item: MarketItem) {
    setBusy(item.id);
    setMessage("");
    try {
      const res = await checkedFetch(`/api/studio/posts/${item.id}/export`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setMessage(
          json.error === "daily_export_limit"
            ? t("Limite de telechargements atteinte pour aujourd'hui.", "Daily download limit reached.", english)
            : t("Telechargement impossible.", "Download failed.", english),
        );
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `scrollshow-${item.id}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch {
      setMessage(t("Telechargement impossible.", "Download failed.", english));
    } finally {
      setBusy(null);
    }
  }

  async function copyLink(item: MarketItem) {
    try {

    const mine = item.mine ?? item.userId === user?.id;
    const flash = (id: string) => {
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000);
    };
    if (!mine && item.shareId) {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${item.shareId}`);
      flash(item.id);
      return;
    }
    setBusy(item.id);
    const res = await checkedFetch(`/api/studio/posts/${item.id}/share`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!json.shareId) return;
    await navigator.clipboard.writeText(`${window.location.origin}/r/${json.shareId}`);
    flash(item.id);

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setBusy(null); }
  }

  async function fork(id: string) {
    try {

    setBusy(id);
    const res = await checkedFetch(`/api/studio/posts/${id}/fork`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    await reload();
    await loadPublic();
    setTab("private");
    if (json.post?.id) {
      setEditing(json.post);
      setPostOpen(true);
    }

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setBusy(null); }
  }

  async function setVisibility(id: string, visibility: "private" | "public") {
    try {

    setBusy(id);
    await checkedFetch(`/api/studio/marketplace/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    setBusy(null);
    await reload();
    await loadPublic();

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setBusy(null); }
  }

  async function addToCalendar(id: string) {
    try {

    setBusy(id);
    const res = await checkedFetch(`/api/studio/marketplace/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inCalendar: true }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    await reload();
    if (json.post) {
      setEditing(json.post);
      setPostOpen(true);
    }

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setBusy(null); }
  }

  async function reconstruct(item: MarketItem) {
    try {

    setBusy(item.id);
    setMessage("");
    const res = await checkedFetch(`/api/studio/posts/${item.id}/reconstruct`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMessage(
        json.error === "ai_gateway_billing"
          ? t(
              "Vercel demande une carte pour activer AI Gateway. Ajoute-la puis réessaie.",
              "Vercel needs a card to enable AI Gateway. Add it, then try again.",
              english,
            )
          : json.error === "ai_gateway_missing"
          ? t(
              "Le modèle du site n’est pas branché. Active AI Gateway sur Vercel.",
              "The site model is not connected. Enable AI Gateway on Vercel.",
              english,
            )
          : t("Impossible de recréer ce TikTok en éditable.", "Could not rebuild this TikTok as editable.", english),
      );
      return;
    }
    await reload();
    await loadPublic();
    if (json.post) {
      setEditing(json.post);
      setPostOpen(true);
    }

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setBusy(null); }
  }

  const wall = useTileScale();

  const STATUS_TABS: { key: StatusFilter; fr: string; en: string }[] = [
    { key: "all", fr: "Tout", en: "All" },
    { key: "draft", fr: "Brouillons", en: "Drafts" },
    { key: "scheduled", fr: "Planifiés", en: "Scheduled" },
    { key: "published", fr: "Publiés", en: "Published" },
  ];

  return (
    <div className="ss-lib">
      <header className="ss-lib__bar">
        <div className="ss-lib__title">
          <h1>{t("Bibliothèque", "Library", english)}</h1>
          <p>{tab === "public" ? t("Formats partagés", "Shared formats", english) : t("Tes carrousels", "Your carousels", english)}</p>
        </div>

        <div className="ss-lib__field lg lg--lens">
          <IconSearch size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Chercher un carrousel…", "Search a carousel…", english)}
            aria-label={t("Chercher un carrousel", "Search a carousel", english)}
          />
          {query ? (
            <button type="button" className="ss-lib__clear" aria-label={t("Effacer", "Clear", english)} onClick={() => setQuery("")}>
              <IconX size={14} />
            </button>
          ) : null}
        </div>

        <div className="ss-lib__tools">
          <div className="ss-lib__tabs lg lg--lens">
            <button type="button" className={tab === "private" ? "is-on" : ""} onClick={() => setTab("private")}>
              {t("À moi", "Mine", english)}
              <b>{privateItems.length}</b>
            </button>
            <button
              type="button"
              className={tab === "public" ? "is-on" : ""}
              onClick={() => {
                setTab("public");
                void loadPublic();
              }}
            >
              {t("Publics", "Public", english)}
              <b>{publicItems.length}</b>
            </button>
          </div>

          {tab === "private" ? (
            <div className="ss-lib__filters">
              {STATUS_TABS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`ss-lib__pill lg lg--lens${statusFilter === entry.key ? " is-on" : ""}`}
                  onClick={() => setStatusFilter(entry.key)}
                >
                  {t(entry.fr, entry.en, english)}
                  <b>{counts[entry.key]}</b>
                </button>
              ))}
            </div>
          ) : null}

          <span className="ss-lib__spacer" />

          <button type="button" className={`ss-lib__pill lg lg--lens${importOpen ? " is-on" : ""}`} onClick={() => setImportOpen((v) => !v)}>
            <IconSparkle size={14} />
            {t("Importer un TikTok", "Import a TikTok", english)}
          </button>
          <button type="button" className="ss-lib__cta lg-press" onClick={createNew}>
            <IconPlus size={16} />
            {t("Nouveau", "New", english)}
          </button>
        </div>

        {importOpen ? (
          <form className="ss-lib-import" onSubmit={(event) => void importUrl(event)}>
            <div className="ss-lib-import__row">
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.tiktok.com/@compte/photo/…"
                required
                autoFocus
              />
              <label>
                <input type="checkbox" checked={sharePublic} onChange={(event) => setSharePublic(event.target.checked)} />
                {t("Partager en public", "Share publicly", english)}
              </label>
              <button type="submit" className="ss-lib__cta lg-press" disabled={busy === "import"}>
                {busy === "import" ? t("Import…", "Importing…", english) : t("Importer", "Import", english)}
              </button>
            </div>
          </form>
        ) : null}

        {message ? (
          <p className="ss-lib__err" role="status">
            {message}
          </p>
        ) : null}
      </header>

      {!items.length ? (
        <div className="ss-lib-empty">
          <span className="ss-lib-empty__mark">
            <IconMedia size={26} />
          </span>
          <h2>
            {query
              ? t("Rien ne correspond", "Nothing matches", english)
              : tab === "public"
                ? t("Rien en public pour l’instant", "Nothing public yet", english)
                : statusFilter !== "all" && privateItems.length
                  ? t("Aucun carrousel ici", "No carousel here", english)
                  : t("Bibliothèque vide", "Empty library", english)}
          </h2>
          <p>
            {query
              ? t("Essaie un autre mot.", "Try another word.", english)
              : tab === "public"
                ? t("Les formats partagés par les autres arriveront ici.", "Formats shared by others will land here.", english)
                : statusFilter !== "all" && privateItems.length
                  ? t("Change de filtre.", "Switch the filter.", english)
                  : t("Importe un TikTok, ou crée un carrousel.", "Import a TikTok, or create a carousel.", english)}
          </p>
          {!query ? (
            <div className="ss-lib-empty__acts">
              <button type="button" className="ss-lib__cta lg-press" onClick={createNew}>
                <IconPlus size={16} />
                {t("Créer un carrousel", "Create a carousel", english)}
              </button>
              <button type="button" className="ss-lib__pill lg lg--lens" onClick={() => setImportOpen(true)}>
                <IconSparkle size={14} />
                {t("Importer un TikTok", "Import a TikTok", english)}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="ss-lib__wall" ref={wall.ref} style={{ "--k": wall.scale } as React.CSSProperties}>
          {items.map((item, index) => {
            const recipe = ensureRecipe(item);
            const mine = item.mine ?? item.userId === user?.id;
            const working = busy === item.id;
            const canRebuild = mine && (needsReconstruct(recipe) || recipe.origin === "import" || recipe.origin === "fork");
            return (
              <li key={item.id} style={{ "--i": index } as React.CSSProperties}>
                <article className={`ss-lib-card${working ? " is-busy" : ""}`}>
                  <button
                    type="button"
                    className="ss-lib-card__cover"
                    onClick={() => (mine ? edit(item) : void fork(item.id))}
                    aria-label={mine ? t("Modifier", "Edit", english) : t("Utiliser ce format", "Use this format", english)}
                  >
                    <span className="ss-lib-card__scale">
                      <SlidePreview
                        slide={recipe.slides[0]}
                        recipe={recipe}
                        width={PREVIEW_WIDTH}
                        original={Boolean(recipe.slides[0]?.keepPhoto)}
                      />
                    </span>
                    <span className="ss-lib-card__slides">
                      {recipe.slides.length} {t("slides", "slides", english)}
                    </span>
                    {item.views ? <span className="ss-lib-card__views">{compact(item.views, english)} {t("vues", "views", english)}</span> : null}
                    <span className="ss-lib-card__veil">
                      <span>{mine ? t("Ouvrir", "Open", english) : t("Utiliser", "Use", english)}</span>
                    </span>
                  </button>

                  <div className="ss-lib-card__foot">
                    <p>{item.body || item.caption || t("Sans titre", "Untitled", english)}</p>
                    <div className="ss-lib-card__meta">
                      {tab === "private" ? (
                        <span className={`ss-lib-tag is-${item.status}`}>{statusLabel(item.status, english)}</span>
                      ) : null}
                      <span className="ss-lib-tag">{originLabel(item, english)}</span>
                      {item.visibility === "public" && mine ? <span className="ss-lib-tag">{t("Public", "Public", english)}</span> : null}
                      {item.authorHandle ? <span className="ss-lib-card__handle">@{item.authorHandle}</span> : null}
                    </div>

                    <div className="ss-lib-card__acts">
                      <button
                        type="button"
                        className="ss-lib-card__go lg-press"
                        disabled={working}
                        onClick={() => (mine ? edit(item) : void fork(item.id))}
                      >
                        {mine ? <IconEdit size={15} /> : <IconSparkle size={15} />}
                        {mine ? t("Modifier", "Edit", english) : t("Utiliser ce format", "Use this format", english)}
                      </button>

                      <CardMenu label={t("Plus d’actions", "More actions", english)}>
                        {(close) => (
                          <>
                            {canRebuild ? (
                              <button
                                type="button"
                                disabled={working}
                                onClick={() => {
                                  close();
                                  void reconstruct(item);
                                }}
                              >
                                <IconSparkle size={15} />
                                {t("Recréer en éditable", "Rebuild as editable", english)}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => {
                                close();
                                void copyText(item.id, item.body || item.caption || "");
                              }}
                            >
                              <IconCopy size={15} />
                              {t("Copier la légende", "Copy the caption", english)}
                            </button>
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => {
                                close();
                                void copyText(item.id, slideText(recipe));
                              }}
                            >
                              <IconCopy size={15} />
                              {t("Copier le texte des slides", "Copy the slide text", english)}
                            </button>
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => {
                                close();
                                void downloadImages(item);
                              }}
                            >
                              <IconDownload size={15} />
                              {t("Télécharger les images", "Download the images", english)}
                            </button>
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => {
                                close();
                                void copyLink(item);
                              }}
                            >
                              <IconLink size={15} />
                              {copied === item.id ? t("Lien copié", "Link copied", english) : t("Copier le lien", "Copy the link", english)}
                            </button>
                            {mine ? (
                              <button
                                type="button"
                                disabled={working}
                                onClick={() => {
                                  close();
                                  void setVisibility(item.id, item.visibility === "public" ? "private" : "public");
                                }}
                              >
                                {item.visibility === "public" ? <IconEyeOff size={15} /> : <IconGlobe size={15} />}
                                {item.visibility === "public" ? t("Rendre privé", "Make private", english) : t("Rendre public", "Make public", english)}
                              </button>
                            ) : null}
                            {mine && item.inCalendar === false ? (
                              <button
                                type="button"
                                disabled={working}
                                onClick={() => {
                                  close();
                                  void addToCalendar(item.id);
                                }}
                              >
                                <IconCalendar size={15} />
                                {t("Mettre au calendrier", "Add to the calendar", english)}
                              </button>
                            ) : null}
                            {mine ? (
                              <button
                                type="button"
                                disabled={working}
                                onClick={() => {
                                  close();
                                  void fork(item.id);
                                }}
                              >
                                <IconPlus size={15} />
                                {t("Dupliquer", "Duplicate", english)}
                              </button>
                            ) : null}
                          </>
                        )}
                      </CardMenu>
                    </div>

                    {copied === item.id ? (
                      <span className="ss-lib-card__copied">
                        <IconCheck size={13} />
                        {t("Lien copié", "Link copied", english)}
                      </span>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
