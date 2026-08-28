"use client";

import { t } from "@/lib/i18n";
import { ensureRecipe, needsReconstruct } from "@/lib/recipe";
import type { StudioPost } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { SlidePreview } from "./SlidePreview";
import { useStudio } from "./StudioContext";

type MarketItem = StudioPost & {
  mine?: boolean;
  slideCount?: number;
  caption?: string;
};

function originLabel(item: MarketItem, english: boolean) {
  if (item.recipe?.editable) return t("Éditable", "Editable", english);
  if (item.origin === "ai") return "IA";
  if (item.origin === "import") return t("Importé", "Imported", english);
  if (item.origin === "fork") return t("Clone", "Clone", english);
  return t("Manuel", "Manual", english);
}

function compact(value: number, english: boolean) {
  return Intl.NumberFormat(english ? "en" : "fr", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function MarketplaceView() {
  const { posts, english, user, setEditing, setPostOpen, reload } = useStudio();
  const [tab, setTab] = useState<"private" | "public">("private");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "scheduled" | "published">("all");
  const [publicItems, setPublicItems] = useState<MarketItem[]>([]);
  const [url, setUrl] = useState("");
  const [sharePublic, setSharePublic] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function loadPublic() {
    const res = await fetch("/api/studio/marketplace?tab=public");
    const json = await res.json().catch(() => ({}));
    setPublicItems(Array.isArray(json.items) ? json.items : []);
  }

  useEffect(() => {
    void loadPublic();
  }, []);

  const privateItems = useMemo(() => posts as MarketItem[], [posts]);
  const items = (tab === "public" ? publicItems : privateItems).filter(
    (item) => tab === "public" || statusFilter === "all" || item.status === statusFilter,
  );

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
    event.preventDefault();
    setBusy("import");
    setMessage("");
    const res = await fetch("/api/studio/marketplace", {
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
    setUrl("");
    setTab(sharePublic ? "public" : "private");
    await reload();
    await loadPublic();
    if (json.post) {
      setEditing(json.post);
      setPostOpen(true);
    }
  }

  async function copyLink(item: MarketItem) {
    const mine = item.mine ?? item.userId === user?.id;
    if (!mine && item.shareId) {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${item.shareId}`).catch(() => undefined);
      setCopied(item.id);
      window.setTimeout(() => setCopied((current) => (current === item.id ? null : current)), 2000);
      return;
    }
    setBusy(item.id);
    const res = await fetch(`/api/studio/posts/${item.id}/share`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!json.shareId) return;
    await navigator.clipboard.writeText(`${window.location.origin}/r/${json.shareId}`).catch(() => undefined);
    setCopied(item.id);
    window.setTimeout(() => setCopied((current) => (current === item.id ? null : current)), 2000);
  }

  async function fork(id: string) {
    setBusy(id);
    const res = await fetch(`/api/studio/posts/${id}/fork`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    await reload();
    await loadPublic();
    setTab("private");
    if (json.post?.id) {
      setEditing(json.post);
      setPostOpen(true);
    }
  }

  async function setVisibility(id: string, visibility: "private" | "public") {
    setBusy(id);
    await fetch(`/api/studio/marketplace/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    });
    setBusy(null);
    await reload();
    await loadPublic();
  }

  async function addToCalendar(id: string) {
    setBusy(id);
    const res = await fetch(`/api/studio/marketplace/${id}`, {
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
  }

  async function reconstruct(item: MarketItem) {
    setBusy(item.id);
    setMessage("");
    const res = await fetch(`/api/studio/posts/${item.id}/reconstruct`, { method: "POST" });
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
  }

  return (
    <div className="ss-market">
      <form className="ss-market-import" onSubmit={(event) => void importUrl(event)}>
        <div>
          <strong>{t("Importer un TikTok", "Import a TikTok", english)}</strong>
          <p>
            {t(
              "Colle le lien : on copie les photos, puis on extrait les textes pour que tu puisses les modifier.",
              "Paste the link: we copy the photos, then extract the texts so you can edit them.",
              english,
            )}
          </p>
        </div>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.tiktok.com/@compte/photo/…"
          required
        />
        <label className="ss-market-import__vis">
          <input type="checkbox" checked={sharePublic} onChange={(event) => setSharePublic(event.target.checked)} />
          {t("Partager en public", "Share publicly", english)}
        </label>
        <button className="ss-btn-purple" type="submit" disabled={busy === "import"}>
          {busy === "import" ? "…" : t("Importer", "Import", english)}
        </button>
        {message ? <p className="ss-market-import__err">{message}</p> : null}
      </form>

      <div className="ss-market__bar">
        <div className="ss-market-tabs">
          <button type="button" className={tab === "private" ? "is-active" : ""} onClick={() => setTab("private")}>
            {t("Privé", "Private", english)}
            <b>{privateItems.length}</b>
          </button>
          <button
            type="button"
            className={tab === "public" ? "is-active" : ""}
            onClick={() => {
              setTab("public");
              void loadPublic();
            }}
          >
            {t("Public", "Public", english)}
            <b>{publicItems.length}</b>
          </button>
        </div>
        <button className="ss-btn-ghost" type="button" onClick={createNew}>
          {t("Nouveau TikTok", "New TikTok", english)}
        </button>
      </div>

      {tab === "private" ? (
        <div className="ss-segment" style={{ marginBottom: 16 }}>
          {(["all", "draft", "scheduled", "published"] as const).map((f) => (
            <button key={f} type="button" className={statusFilter === f ? "is-active" : ""} onClick={() => setStatusFilter(f)}>
              {f === "all" ? t("Tout", "All", english) : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      ) : null}

      {!items.length ? (
        <div className="ss-empty ss-empty--market">
          <h2>
            {tab === "public"
              ? t("Rien en public pour l’instant", "Nothing public yet", english)
              : statusFilter !== "all" && privateItems.length
                ? t(`Aucun post "${statusFilter}"`, `No "${statusFilter}" posts`, english)
                : t("Aucun TikTok", "No TikToks yet", english)}
          </h2>
          <p>
            {tab === "public"
              ? t(
                  "Les formats publics des autres créateurs apparaîtront ici, triés par vues. Tu pourras cloner un format gagnant.",
                  "Public formats from other creators will show up here, sorted by views. You can clone a winning format.",
                  english,
                )
              : statusFilter !== "all" && privateItems.length
                ? t("Change de filtre pour voir tes autres posts.", "Switch the filter to see your other posts.", english)
                : t(
                    "Importe un lien TikTok, crée un carrousel, ou publie un format en public pour le partager.",
                    "Import a TikTok link, create a carousel, or publish a format so others can clone it.",
                    english,
                  )}
          </p>
        </div>
      ) : (
        <div className="ss-market-grid">
          {items.map((item) => {
            const recipe = ensureRecipe(item);
            const mine = item.mine ?? item.userId === user?.id;
            return (
              <article key={item.id} className="ss-market-card">
                <button type="button" className="ss-market-card__cover" disabled={!mine} onClick={() => mine && edit(item)}>
                  <SlidePreview slide={recipe.slides[0]} recipe={recipe} width={220} original={Boolean(recipe.slides[0]?.keepPhoto)} />
                </button>
                <div className="ss-market-card__body">
                  <p>{item.body || item.caption}</p>
                  <div className="ss-market-card__meta">
                    <span>{item.visibility === "public" ? t("Public", "Public", english) : t("Privé", "Private", english)}</span>
                    <span>{originLabel(item, english)}</span>
                    <span>
                      {recipe.slides.length} {t("slides", "slides", english)}
                    </span>
                    {item.authorHandle ? <span>@{item.authorHandle}</span> : null}
                    {item.views ? <span>{compact(item.views, english)} {t("vues", "views", english)}</span> : null}
                  </div>
                  <div className="ss-market-card__actions">
                    {mine ? (
                      <button className="ss-btn-purple" type="button" onClick={() => edit(item)}>
                        {t("Modifier", "Edit", english)}
                      </button>
                    ) : (
                      <button className="ss-btn-purple" type="button" disabled={busy === item.id} onClick={() => void fork(item.id)}>
                        {t("Utiliser ce format", "Use this format", english)}
                      </button>
                    )}
                    {mine && (needsReconstruct(recipe) || recipe.origin === "import" || recipe.origin === "fork") ? (
                      <button className="ss-btn-ghost" type="button" disabled={busy === item.id} onClick={() => void reconstruct(item)}>
                        {busy === item.id ? "…" : t("Recréer en éditable", "Rebuild as editable", english)}
                      </button>
                    ) : null}
                    <button className="ss-btn-ghost" type="button" disabled={busy === item.id} onClick={() => void copyLink(item)}>
                      {copied === item.id ? t("Lien copié", "Link copied", english) : t("Lien IA", "AI link", english)}
                    </button>
                    {mine ? (
                      <button
                        className="ss-btn-ghost"
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => void setVisibility(item.id, item.visibility === "public" ? "private" : "public")}
                      >
                        {item.visibility === "public" ? t("Rendre privé", "Make private", english) : t("Rendre public", "Make public", english)}
                      </button>
                    ) : null}
                    {mine && item.inCalendar === false ? (
                      <button className="ss-btn-ghost" type="button" disabled={busy === item.id} onClick={() => void addToCalendar(item.id)}>
                        {t("Calendrier", "Calendar", english)}
                      </button>
                    ) : null}
                    {mine ? (
                      <button className="ss-btn-ghost" type="button" disabled={busy === item.id} onClick={() => void fork(item.id)}>
                        {t("Dupliquer", "Duplicate", english)}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
