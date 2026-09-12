"use client";

import { useUndoState } from "@/lib/use-undo-state";
import { t } from "@/lib/i18n";
import { platformName } from "@/lib/platforms";
import {
  defaultOverlay,
  defaultSlide,
  ensureRecipe,
  needsRasterize,
  needsReconstruct,
  photosOf,
  RECIPE_FONTS,
  recipeFromPhotos,
} from "@/lib/recipe";
import { dateInTimeZone } from "@/lib/settings";
import { sound } from "@/lib/sound";
import { coerceOptions, EMPTY_OPTIONS, type TikTokPostOptions, validatePostOptions } from "@/lib/tiktok-compliance";
import type { CarouselRecipe, CarouselSlide } from "@/lib/types";
import { useEffect, useRef, useState } from "react";
import { SlidePreview } from "./SlidePreview";
import { useStudio } from "./StudioContext";
import { blockedCopy, optionsErrorCopy, PublishStatus, type PublishProgress, TikTokPublishPanel, useTikTokCreator } from "./TikTokPublishPanel";
import { Metal } from "@/components/fx/Metal";
import { Orb } from "@/components/fx/Orb";

function rebuildCopy(code: string, english: boolean) {
  if (code === "image_missing" || code === "media_access_denied") return t("Impossible de lire une image du carrousel. Vérifie son accès ou importe-la à nouveau.", "Could not read a carousel image. Check access or upload it again.", english);
  return t("Impossible de recréer les textes éditables pour le moment. Tes images sont conservées ; réessaie dans un instant.", "Could not rebuild editable text right now. Your images are preserved; please try again.", english);
}

export function CreatePostModal() {
  const { user, english, availability, postOpen, setPostOpen, channels, media, editing, setEditing, composeDate, setComposeDate, reload, activeChannel } = useStudio();
  const [body, setBody] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("18:00");
  const [status, setStatus] = useState<"draft" | "scheduled">("scheduled");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  // Every Direct Post choice starts empty/off: TikTok forbids defaults for
  // privacy, comments and commercial disclosure.
  const [options, setOptions] = useState<TikTokPostOptions>(EMPTY_OPTIONS);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const history = useUndoState<CarouselRecipe>(() => recipeFromPhotos([], "manual"));
  const { value: recipe, set: setRecipe, reset: resetRecipe } = history;
  const uploadRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);

  const connected = channels.filter((item) => item.connected);
  const slide = recipe.slides[slideIndex] || recipe.slides[0];
  const baked = needsReconstruct(recipe);
  const creatorState = useTikTokCreator(postOpen && connected.length > 0, channelIds[0]);
  const optionsError = validatePostOptions(options, creatorState.creator);
  const canPublish =
    availability?.tiktokPublishing === true &&
    connected.length > 0 &&
    !creatorState.loading &&
    !creatorState.blocked &&
    Boolean(creatorState.creator) &&
    !optionsError &&
    Boolean(body.trim()) &&
    !pending &&
    !rebuilding &&
    !(progress && progress.status !== "FAILED");

  // Initialise the form once per opening (or when switching to another post).
  // `reload()` after a publish refreshes channels/media/user; that must not
  // wipe the creator's choices or the publish status they are watching.
  const initKey = postOpen ? editing?.id || "new" : "";
  const lastInit = useRef("");
  const baseline = useRef("");
  const [showDiscard, setShowDiscard] = useState(false);
  const latestDraft = useRef("");
  latestDraft.current = JSON.stringify({ body, date, time, status, channelIds, options, recipe });
  const closeEditor = () => {
    if (pending || uploading || rebuilding) return;
    if (baseline.current && baseline.current !== latestDraft.current) { setShowDiscard(true); return; }
    setPostOpen(false); setEditing(null);
  };
  const closeRef = useRef(closeEditor); closeRef.current = closeEditor;
  useEffect(() => {
    if (!postOpen) return;
    const frame = requestAnimationFrame(() => { baseline.current = latestDraft.current; });
    return () => cancelAnimationFrame(frame);
  }, [postOpen, initKey]);
  useEffect(() => { setSlideIndex(index => Math.max(0, Math.min(index, recipe.slides.length - 1))); }, [recipe.slides.length]);
  useEffect(() => {
    if (!postOpen) {
      lastInit.current = "";
      return;
    }
    if (lastInit.current === initKey) return;
    lastInit.current = initKey;
    setShowDiscard(false);
    if (editing) {
      const next = ensureRecipe(editing);
      setBody(editing.body);
      setDate(editing.date);
      setTime(editing.time);
      setStatus(editing.status === "published" ? "scheduled" : editing.status);
      setChannelIds(editing.channelIds);
      resetRecipe(next);
      setSlideIndex(0);
      setMessage("");
      setShowOriginal(Boolean(next.slides.some((item) => item.keepPhoto)));
      setOptions(editing.tiktok ? coerceOptions(editing.tiktok) : { ...EMPTY_OPTIONS });
      setProgress(
        editing.publishId && editing.publishState && editing.publishState !== "FAILED"
          ? { publishId: editing.publishId, status: editing.publishState, tiktokId: editing.tiktokId }
          : null,
      );
      return;
    }
    const settings = user?.settings;
    const first = media[0]?.url || "";
    setBody("");
    setDate(composeDate || dateInTimeZone(settings?.timezone || "Europe/Paris"));
    setComposeDate(null);
    setTime(settings?.defaultPostTime || "18:00");
    setStatus(availability?.tiktokPublishing && connected.length ? settings?.defaultStatus || "scheduled" : "draft");
    const draft = recipeFromPhotos([first], "manual");
    if (!first) { draft.slides[0].backgroundColor = "#111111"; draft.slides[0].keepPhoto = false; draft.editable = true; }
    resetRecipe(draft);
    setSlideIndex(0);
    setChannelIds(
      activeChannel === "all"
        ? channels.filter((item) => item.connected).slice(0, 1).map((item) => item.id)
        : [activeChannel],
    );
    setOptions({ ...EMPTY_OPTIONS });
    setProgress(null);
    setMessage("");
    setRebuildError("");
    setShowOriginal(false);
    setRebuilding(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postOpen, initKey]);

  useEffect(() => {
    if (!postOpen || !editing?.id) return;
    const next = ensureRecipe(editing);
    if (!needsReconstruct(next)) return;
    const id = editing.id;
    let cancelled = false;
    setRebuilding(true);
    setRebuildError("");
    fetch(`/api/studio/posts/${id}/reconstruct`, { method: "POST" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setRebuildError(rebuildCopy(String(json.error), english));
          return;
        }
        if (json.post) {
          setEditing(json.post);
          setRecipe(ensureRecipe(json.post));
          reload();
        }
      })
      .catch(() => {
        if (!cancelled) setRebuildError(rebuildCopy("reconstruct_failed", english));
      })
      .finally(() => {
        if (!cancelled) setRebuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postOpen, editing?.id, english, reload, setEditing]);

  // Guideline 5e: after content/init, poll publish/status/fetch so the creator
  // sees PROCESSING → PUBLISH_COMPLETE / FAILED without leaving the page.
  useEffect(() => {
    if (!postOpen || !progress || progress.status === "PUBLISH_COMPLETE" || progress.status === "FAILED") return;
    let cancelled = false;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > 60) {
        clearInterval(timer);
        return;
      }
      try {
        const res = await fetch(`/api/tiktok/publish/status?publish_id=${encodeURIComponent(progress.publishId)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const status = String(json.status || "");
        if (!status) return;
        setProgress({ publishId: progress.publishId, status, tiktokId: json.tiktokId, failReason: json.failReason });
        if (status === "PUBLISH_COMPLETE" || status === "FAILED") {
          clearInterval(timer);
          if (status === "PUBLISH_COMPLETE") sound.success();
          else sound.error();
          reload();
        }
      } catch {
        // transient; next tick retries
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [postOpen, progress, reload]);

  useEffect(() => {
    if (!postOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button, input, textarea, select")?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") {
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([hidden]), textarea, select, a[href]') || [])].filter(el => el.offsetParent !== null);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [postOpen]);

  if (!postOpen || !slide) return null;

  function patchSlide(id: string, next: Partial<CarouselSlide>) {
    setRecipe((current) => ({
      ...current,
      slides: current.slides.map((item) => (item.id === id ? { ...item, ...next } : item)),
    }));
  }

  function setFont(fontFamily: string) {
    setRecipe((current) => ({
      ...current,
      fontFamily,
      slides: current.slides.map((item) => ({
        ...item,
        overlays: item.overlays.map((overlay) => ({ ...overlay, fontFamily })),
      })),
    }));
  }

  function addSlide() {
    const url = media.find((item) => !recipe.slides.some((slideItem) => slideItem.image === item.url))?.url || media[0]?.url;
    if (recipe.slides.length >= 35) return;
    const next = defaultSlide(url || "");
    if (!url) { next.backgroundColor = "#111111"; next.keepPhoto = false; }
    setRecipe((current) => ({ ...current, slides: [...current.slides, next] }));
    setSlideIndex(recipe.slides.length);
  }

  function changeAlignment(id: string, align: "left" | "center" | "right") {
    const anchor = { left: 0, center: 0.5, right: 1 };
    patchSlide(slide.id, { overlays: slide.overlays.map(item => {
      if (item.id !== id) return item;
      const width = item.width ?? 86;
      // Alignment also chooses the stored anchor. Preserve the box position.
      const x = item.x + width * (anchor[align] - anchor[item.align || "center"]);
      return { ...item, align, x: Math.max(width * anchor[align], Math.min(100 - width * (1 - anchor[align]), x)) };
    }) });
  }

  function moveSlide(direction: number) {
    const nextIndex = slideIndex + direction;
    if (nextIndex < 0 || nextIndex >= recipe.slides.length) return;
    const slides = [...recipe.slides];
    [slides[slideIndex], slides[nextIndex]] = [slides[nextIndex], slides[slideIndex]];
    setRecipe({ ...recipe, slides }); setSlideIndex(nextIndex);
  }

  async function uploadImage(file?: File) {
    if (!file || uploading) return;
    if (file.size > 3_000_000) { setMessage(t("Image trop grande : 3 Mo maximum.", "Image too large: 3 MB maximum.", english)); return; }
    setUploading(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/studio/media", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok || !json.media?.url) throw new Error("upload_failed");
      patchSlide(slide.id, { image: json.media.url, sourceImage: json.media.url, keepPhoto: true });
      await reload();
    } catch { setMessage(t("L’image n’a pas pu être importée. Réessaie.", "Could not upload the image. Try again.", english)); }
    finally { setUploading(false); if (uploadRef.current) uploadRef.current.value = ""; }
  }



  function removeSlide(id: string) {
    if (recipe.slides.length < 2) return;
    const next = recipe.slides.filter((item) => item.id !== id);
    setRecipe((current) => ({ ...current, slides: next }));
    setSlideIndex((index) => Math.max(0, Math.min(index, next.length - 1)));
  }

  async function reconstruct() {
    try {

    if (!editing?.id || rebuilding) return;
    setRebuilding(true);
    setRebuildError("");
    const res = await fetch(`/api/studio/posts/${editing.id}/reconstruct`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setRebuilding(false);
    if (!res.ok) {
      setRebuildError(rebuildCopy(String(json.error), english));
      return;
    }
    if (json.post) {
      setEditing(json.post);
      setRecipe(ensureRecipe(json.post));
      reload();
    }

    } catch { setRebuildError(t("Extraction impossible. Réessaie.", "Could not extract text. Try again.", english)); } finally { setRebuilding(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (rebuilding) return;
    // A scheduled post goes out unattended, so the creator's choices must be
    // complete now — the scheduler never fills them in.
    if (status === "scheduled" && channelIds.some((id) => connected.some((channel) => channel.id === id)) && optionsError) {
      sound.error();
      setMessage(optionsErrorCopy(optionsError, english));
      return;
    }
    setPending(true);
    setMessage("");
    const payload = {
      body,
      date,
      time,
      status,
      tiktok: options,
      image: recipe.slides[0]?.image,
      photo_images: photosOf(recipe),
      channelIds,
      origin: editing?.origin || recipe.origin || "manual",
      recipe: { ...recipe, replaceSlides: true },
    };
    try {
      const res = editing?.id
        ? await fetch(`/api/studio/posts/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/studio/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        sound.error();
        setMessage(json.error || t("Impossible d'enregistrer.", "Could not save.", english));
        return;
      }
      sound.success();
      setPostOpen(false);
      setEditing(null);
      reload();
    } catch {
      sound.error();
      setMessage(t("Connexion impossible. Réessaie.", "Could not reach the server. Try again.", english));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    try {

    if (!editing?.id) return;
    if (!window.confirm(t("Supprimer ce post ? C'est définitif.", "Delete this post? This can't be undone.", english))) return;
    setPending(true);
    try {
      const res = await fetch(`/api/studio/posts/${editing.id}`, { method: "DELETE" });
      if (!res.ok) {
        sound.error();
        setMessage(t("Impossible de supprimer.", "Could not delete.", english));
        return;
      }
      sound.notify();
      setPostOpen(false);
      setEditing(null);
      reload();
    } finally {
      setPending(false);
    }

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setPending(false); }
  }

  async function publishNow() {
    try {

    if (!canPublish) {
      if (optionsError) setMessage(optionsErrorCopy(optionsError, english));
      return;
    }
    setPending(true);
    setMessage("");
    let photos = photosOf(recipe);
    if (needsRasterize(recipe)) {
      const raster = await fetch(editing?.id ? `/api/studio/posts/${editing.id}/rasterize` : "/api/studio/rasterize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe }),
      });
      const rasterJson = await raster.json().catch(() => ({}));
      if (!raster.ok || !Array.isArray(rasterJson.photo_images) || !rasterJson.photo_images.length) {
        setPending(false);
        setMessage(t("Impossible de générer les images avec le nouveau texte.", "Could not render images with the new text.", english));
        return;
      }
      photos = rasterJson.photo_images;
    }
    // Guideline 5c: nothing is sent to TikTok before this explicit click.
    const res = await fetch("/api/tiktok/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_images: photos,
        description: body,
        options,
        post_id: editing?.id,
        channel_id: channelIds[0],
      }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      sound.error();
      const code = String(json.error || "");
      if (code.startsWith("creator_")) {
        creatorState.refresh();
        setMessage(blockedCopy(code.slice("creator_".length), english));
      } else {
        setMessage(optionsErrorCopy(code, english) || String(json.message || code) || t("Publication impossible", "Could not publish", english));
      }
      return;
    }
    sound.notify();
    setProgress({ publishId: String(json.publish_id || ""), status: "PROCESSING" });
    reload();

    } catch { setMessage(t("L’action a échoué. Réessaie dans un instant.", "The action failed. Please try again.", english)); } finally { setPending(false); }
  }

  return (
    <div
      className="ss-modal"
      onClick={closeEditor}
    >
      <div className="ss-dialog ss-dialog--recipe" ref={dialogRef} role="dialog" aria-modal="true" aria-label={english ? "Carousel editor" : "Éditeur de carrousel"} onClick={(event) => event.stopPropagation()}>
        {availability?.tiktokPublishing === false ? <p role="status" style={{ padding: "12px 24px", margin: 0 }}>{english ? "TikTok publishing is awaiting approval. You can create, save and export your carousels." : "Publication TikTok en attente de validation. Tu peux créer, enregistrer et exporter tes carrousels."}</p> : null}
        <button type="button" className="ss-btn-ghost" style={{ float: "right" }} onClick={closeEditor} aria-label={t("Fermer", "Close", english)}>×</button>
        <h2>{editing ? t("Modifier le TikTok", "Edit TikTok", english) : t("Créer un carrousel", "Create a carousel", english)}</h2>
        {showDiscard ? <div role="alertdialog" aria-label={t("Modifications non enregistrées", "Unsaved changes", english)} className="ss-panel" style={{ margin: 16 }}>
          <p>{t("Ce carrousel contient des modifications non enregistrées.", "This carousel has unsaved changes.", english)}</p>
          <button type="button" className="ss-btn-purple" onClick={() => setShowDiscard(false)}>{t("Continuer l’édition", "Continue editing", english)}</button>
          <button type="button" className="ss-btn-ghost" onClick={() => { setShowDiscard(false); setPostOpen(false); setEditing(null); }}>{t("Abandonner les modifications", "Discard changes", english)}</button>
        </div> : null}
        <form className="ss-recipe" onSubmit={save}>
          {baked || rebuilding || rebuildError || recipe.editable ? (
            <div className={`ss-recipe__banner${rebuildError ? " ss-recipe__banner--err" : ""}`}>
              <p>
                {rebuilding
                  ? t("On extrait les textes des slides (les photos ne bougent pas)…", "Extracting the on-slide texts (photos stay as-is)…", english)
                  : rebuildError
                    ? rebuildError
                    : recipe.editable
                      ? showOriginal
                        ? t("L’aperçu montre l’image originale. Passe à l’édition pour voir tes modifications.", "The preview shows the original image. Switch to the edit to see your changes.", english)
                        : t("Ton carrousel est éditable. Modifie les textes et leur mise en page à droite.", "Your carousel is editable. Adjust the text and layout on the right.", english)
                      : t("Import brut : le texte est encore dans l’image. Recrée-le pour extraire les textes éditables.", "Raw import: text is still inside the image. Rebuild it to extract editable texts.", english)}
              </p>
              {editing?.id && (baked || rebuildError || recipe.origin === "import" || recipe.origin === "fork") && !rebuilding ? (
                <button className="ss-btn-purple" type="button" onClick={() => void reconstruct()}>
                  {t("Recréer en éditable", "Rebuild as editable", english)}
                </button>
              ) : null}
              {rebuildError.includes("AI Gateway") || rebuildError.includes("carte pour activer") ? (
                <a
                  className="ss-btn-ghost"
                  href="https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Ajouter une carte Vercel", "Add a Vercel card", english)}
                </a>
              ) : null}
              {recipe.editable && (slide.sourceImage || slide.image) ? (
                <button className="ss-btn-ghost" type="button" onClick={() => setShowOriginal((value) => !value)}>
                  {showOriginal ? t("Voir l’édition", "Show edit", english) : t("Voir l’original", "Show original", english)}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="ss-recipe__stage">
            <div className="ss-recipe__preview">
              <SlidePreview slide={slide} recipe={recipe} width={280} original={showOriginal} />
              {rebuilding ? (
                <div className="ss-slide-preview__busy">
                  <Orb size={64} state="solving" invert />
                  <span>{t("Extraction des textes…", "Extracting texts…", english)}</span>
                </div>
              ) : null}
            </div>
            <div className="ss-recipe__thumbs">
              {recipe.slides.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={index === slideIndex ? "is-active" : ""}
                  onClick={() => setSlideIndex(index)}
                >
                  {index + 1}
                </button>
              ))}
              <button type="button" onClick={addSlide}>
                +
              </button>
            </div>
          </div>
          <div className="ss-form ss-recipe__form">
            <div className="ss-recipe__overlay-row">
              <button type="button" className="ss-btn-ghost" disabled={!history.canUndo} onClick={history.undo}>{t("Annuler", "Undo", english)}</button>
              <button type="button" className="ss-btn-ghost" disabled={!history.canRedo} onClick={history.redo}>{t("Rétablir", "Redo", english)}</button>
              <button type="button" className="ss-btn-ghost" disabled={slideIndex === 0} onClick={() => moveSlide(-1)}>← {t("Déplacer", "Move", english)}</button>
              <button type="button" className="ss-btn-ghost" disabled={slideIndex === recipe.slides.length - 1} onClick={() => moveSlide(1)}>{t("Déplacer", "Move", english)} →</button>
            </div>
            <button type="button" className="ss-btn-ghost" disabled={uploading} onClick={() => uploadRef.current?.click()}>{uploading ? t("Import en cours…", "Uploading…", english) : t("Importer une image · 3 Mo max", "Upload image · 3 MB max", english)}</button>
            <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => void uploadImage(event.target.files?.[0])} />
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("Légende…", "Caption…", english)} required />
            <label className="ss-recipe__label">{t("Police", "Font", english)}</label>
            <select value={recipe.fontFamily} onChange={(event) => setFont(event.target.value)}>
              {RECIPE_FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
            <label className="ss-recipe__label">
              {t("Slide", "Slide", english)} {slideIndex + 1}
              {recipe.slides.length > 1 ? (
                <button className="ss-recipe__remove" type="button" onClick={() => removeSlide(slide.id)}>
                  {t("Retirer", "Remove", english)}
                </button>
              ) : null}
            </label>
            <select value={slide.image} onChange={(event) => patchSlide(slide.id, { image: event.target.value, sourceImage: event.target.value, keepPhoto: true })}>
              {media.map((item) => (
                <option key={item.id} value={item.url}>
                  {item.name}
                </option>
              ))}
              {(slide.image || slide.sourceImage) && !media.some((item) => item.url === slide.image) ? (
                <option value={slide.image || slide.sourceImage}>{t("Image actuelle", "Current image", english)}</option>
              ) : null}
            </select>
            {recipe.editable ? (
              <label className="ss-recipe__label">
                {t("Fond", "Background", english)}
                <input
                  type="color"
                  value={slide.backgroundColor || "#111111"}
                  onChange={(event) => patchSlide(slide.id, { backgroundColor: event.target.value, keepPhoto: false })}
                />
              </label>
            ) : null}
            {baked ? (
              <p className="ss-lead">
                {t(
                  "Tant que les textes ne sont pas extraits, tu ne peux pas les changer — ils sont encore collés dans le JPEG.",
                  "Until the texts are extracted, you cannot change them — they are still baked into the JPEG.",
                  english,
                )}
              </p>
            ) : (
              <>
            {slide.overlays.map((overlay, overlayIndex) => (
              <div key={overlay.id} className="ss-recipe__overlay">
                <textarea
                  value={overlay.text}
                  placeholder={t("Texte sur la slide…", "Text on this slide…", english)}
                  onChange={(event) =>
                    patchSlide(slide.id, {
                      overlays: slide.overlays.map((item) =>
                        item.id === overlay.id ? { ...item, text: event.target.value } : item,
                      ),
                    })
                  }
                />
                <div className="ss-recipe__overlay-row">
                  <input
                    type="number"
                    min={18}
                    max={160}
                    value={overlay.fontSize}
                    onChange={(event) =>
                      patchSlide(slide.id, {
                        overlays: slide.overlays.map((item) =>
                          item.id === overlay.id ? { ...item, fontSize: Number(event.target.value) || 64 } : item,
                        ),
                      })
                    }
                  />
                  <input
                    type="color"
                    value={/^#[0-9A-Fa-f]{6}$/.test(overlay.color) ? overlay.color : "#ffffff"}
                    onChange={(event) =>
                      patchSlide(slide.id, {
                        overlays: slide.overlays.map((item) =>
                          item.id === overlay.id ? { ...item, color: event.target.value } : item,
                        ),
                      })
                    }
                  />
                  {slide.overlays.length > 1 ? (
                    <button
                      type="button"
                      className="ss-btn-ghost"
                      onClick={() =>
                        patchSlide(slide.id, {
                          overlays: slide.overlays.filter((item) => item.id !== overlay.id),
                        })
                      }
                    >
                      {t("Retirer le texte", "Remove text", english)}
                    </button>
                  ) : null}
                </div>
                <div className="ss-recipe__overlay-row">
                  {(["x", "y", "width"] as const).map(field => <label key={field}>{field === "width" ? t("Largeur %", "Width %", english) : `${field.toUpperCase()} %`}
                    <input aria-label={`${field} ${overlayIndex + 1}`} type="number" min={field === "width" ? 1 : 0} max={100} value={overlay[field] ?? 86}
                      onChange={event => patchSlide(slide.id, { overlays: slide.overlays.map(item => item.id === overlay.id ? { ...item, [field]: Math.max(field === "width" ? 1 : 0, Math.min(100, Number(event.target.value))) } : item) })} />
                  </label>)}
                  <select aria-label={t("Alignement", "Alignment", english)} value={overlay.align} onChange={event => changeAlignment(overlay.id, event.target.value as "left" | "center" | "right")}>
                    <option value="left">{t("Gauche", "Left", english)}</option><option value="center">{t("Centre", "Center", english)}</option><option value="right">{t("Droite", "Right", english)}</option>
                  </select>
                </div>
                {overlayIndex === 0 ? <span>{t("Taille · couleur", "Size · color", english)}</span> : null}
              </div>
            ))}
            <button
              className="ss-btn-ghost"
              type="button"
              onClick={() =>
                patchSlide(slide.id, {
                  overlays: [...slide.overlays, defaultOverlay({ fontFamily: recipe.fontFamily, y: 22 })],
                })
              }
            >
              {t("Ajouter un texte", "Add text", english)}
            </button>
              </>
            )}
            {channels.length ? (
              <div className="ss-checks">
                {[...connected, ...channels.filter((item) => !item.connected)].map((channel) => (
                  <label key={channel.id} className={channel.connected ? "" : "is-muted"}>
                    <input
                      type="radio"
                      name="publish-channel"
                      checked={channelIds.includes(channel.id)}
                      onChange={(event) => {
                        if (event.target.checked) setChannelIds([channel.id]);
                      }}
                    />
                    {channel.name} · {platformName(channel.platform)}
                    {!channel.connected ? ` · ${t("non connecté, brouillon seulement", "not connected, draft only", english)}` : ""}
                  </label>
                ))}
              </div>
            ) : null}
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
            <select value={status} onChange={(event) => setStatus(event.target.value as "draft" | "scheduled")}>
              <option value="draft">{t("Brouillon", "Draft", english)}</option>
              <option value="scheduled">{t("Planifié", "Scheduled", english)}</option>
            </select>
            <TikTokPublishPanel english={english} creatorState={creatorState} options={options} setOptions={setOptions} onRefresh={creatorState.refresh} />
            {progress ? <PublishStatus progress={progress} english={english} handle={creatorState.creator?.username || creatorState.handle} /> : null}
            {message ? <p className="ss-lead ss-lead--err">{message}</p> : null}
            <div className="ss-form-actions">
              {editing?.id ? (
                <button className="ss-btn-danger" type="button" disabled={pending || rebuilding} onClick={() => void remove()}>
                  {t("Supprimer", "Delete", english)}
                </button>
              ) : null}
              <button className="ss-btn-ghost" type="submit" disabled={pending || rebuilding}>
                {pending ? "…" : editing || status === "draft" ? t("Enregistrer", "Save", english) : t("Planifier", "Schedule", english)}
              </button>
              <span
                className="ss-ttp__publish"
                title={
                  optionsError === "commercial_choice_required"
                    ? optionsErrorCopy(optionsError, english)
                    : optionsError
                      ? optionsErrorCopy(optionsError, english)
                      : undefined
                }
              >
                <Metal preset="chromatic" strength={canPublish ? 0.95 : 0.35}>
                  <button className="ss-btn-purple" type="button" disabled={!canPublish} onClick={publishNow}>
                    {pending ? <Orb size={20} state="connecting" invert /> : null}
                    {pending ? t("Publication…", "Publishing…", english) : t("Publier sur TikTok", "Post to TikTok", english)}
                  </button>
                </Metal>
              </span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
