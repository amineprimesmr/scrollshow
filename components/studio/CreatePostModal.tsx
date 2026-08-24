"use client";

import { t } from "@/lib/i18n";
import { platformName } from "@/lib/platforms";
import {
  defaultOverlay,
  defaultSlide,
  ensureRecipe,
  needsReconstruct,
  photosOf,
  RECIPE_FONTS,
  recipeFromPhotos,
} from "@/lib/recipe";
import { dateInTimeZone } from "@/lib/settings";
import type { CarouselRecipe, CarouselSlide } from "@/lib/types";
import { useEffect, useState } from "react";
import { SlidePreview } from "./SlidePreview";
import { useStudio } from "./StudioContext";

const PRIVACY = [
  { id: "PUBLIC_TO_EVERYONE", fr: "Tout le monde", en: "Everyone" },
  { id: "MUTUAL_FOLLOW_FRIENDS", fr: "Amis", en: "Friends" },
  { id: "FOLLOWER_OF_CREATOR", fr: "Abonnés", en: "Followers" },
  { id: "SELF_ONLY", fr: "Moi uniquement", en: "Only me" },
];

function rebuildCopy(code: string, english: boolean) {
  if (code === "ai_gateway_billing") {
    return t(
      "Vercel demande une carte pour activer AI Gateway (crédits offerts ensuite). Ajoute-la puis réessaie.",
      "Vercel needs a card to enable AI Gateway (free credits unlock after). Add it, then try again.",
      english,
    );
  }
  if (code === "ai_gateway_missing") {
    return t(
      "Le modèle du site n’est pas branché. Active AI Gateway sur le projet Vercel, ou ajoute AI_GATEWAY_API_KEY.",
      "The site model is not connected. Enable AI Gateway on the Vercel project, or add AI_GATEWAY_API_KEY.",
      english,
    );
  }
  if (code === "image_missing") {
    return t("Impossible de lire les images importées.", "Could not read the imported images.", english);
  }
  return t("Impossible de recréer les calques éditables. Réessaie dans un instant.", "Could not rebuild the editable layers. Try again in a moment.", english);
}

export function CreatePostModal() {
  const { user, english, postOpen, setPostOpen, channels, media, editing, setEditing, reload, activeChannel } = useStudio();
  const [body, setBody] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("18:00");
  const [status, setStatus] = useState<"draft" | "scheduled">("scheduled");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState("SELF_ONLY");
  const [allowed, setAllowed] = useState<string[]>(PRIVACY.map((item) => item.id));
  const [commentsOff, setCommentsOff] = useState(true);
  const [branded, setBranded] = useState(false);
  const [organic, setOrganic] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [recipe, setRecipe] = useState<CarouselRecipe>(() => recipeFromPhotos([], "manual"));
  const [slideIndex, setSlideIndex] = useState(0);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildError, setRebuildError] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);

  const connected = channels.filter((item) => item.connected);
  const slide = recipe.slides[slideIndex] || recipe.slides[0];
  const baked = needsReconstruct(recipe);

  useEffect(() => {
    if (!postOpen) return;
    if (editing) {
      const next = ensureRecipe(editing);
      setBody(editing.body);
      setDate(editing.date);
      setTime(editing.time);
      setStatus(editing.status === "published" ? "scheduled" : editing.status);
      setChannelIds(editing.channelIds);
      setRecipe(next);
      setSlideIndex(0);
      setMessage("");
      setShowOriginal(Boolean(next.slides.some((item) => item.keepPhoto)));
      return;
    }
    const settings = user?.settings;
    const first = media[0]?.url || "/assets/tiktoks/01-glowup-188k.png";
    setBody("");
    setDate(dateInTimeZone(settings?.timezone || "Europe/Paris"));
    setTime(settings?.defaultPostTime || "18:00");
    setStatus(settings?.defaultStatus || "scheduled");
    setRecipe(recipeFromPhotos([first], "manual"));
    setSlideIndex(0);
    setChannelIds(
      activeChannel === "all"
        ? channels.filter((item) => item.connected).slice(0, 1).map((item) => item.id)
        : [activeChannel],
    );
    setPrivacy(settings?.defaultPrivacy || "PUBLIC_TO_EVERYONE");
    setCommentsOff(Boolean(settings?.disableComments));
    setBranded(Boolean(settings?.brandContent));
    setOrganic(Boolean(settings?.brandOrganic));
    setMessage("");
    setRebuildError("");
    setShowOriginal(false);
    setRebuilding(false);
  }, [postOpen, editing, channels, media, activeChannel, user]);

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

  useEffect(() => {
    if (!postOpen || !connected.length) return;
    fetch("/api/tiktok/creator")
      .then((res) => res.json())
      .then((json) => {
        const options = json.creator?.privacy_level_options;
        if (Array.isArray(options) && options.length) {
          setAllowed(options);
          setPrivacy((current) => (options.includes(current) ? current : options[0]));
        }
      })
      .catch(() => undefined);
  }, [postOpen, connected.length]);

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
    if (!url) return;
    const next = defaultSlide(url);
    setRecipe((current) => ({ ...current, slides: [...current.slides, next] }));
    setSlideIndex(recipe.slides.length);
  }

  function removeSlide(id: string) {
    if (recipe.slides.length < 2) return;
    const next = recipe.slides.filter((item) => item.id !== id);
    setRecipe((current) => ({ ...current, slides: next }));
    setSlideIndex((index) => Math.max(0, Math.min(index, next.length - 1)));
  }

  async function reconstruct() {
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
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const payload = {
      body,
      date,
      time,
      status,
      image: recipe.slides[0]?.image,
      photo_images: photosOf(recipe),
      channelIds,
      origin: editing?.origin || recipe.origin || "manual",
      recipe: { ...recipe, replaceSlides: true },
    };
    if (editing?.id) {
      await fetch(`/api/studio/posts/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/studio/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setPending(false);
    setPostOpen(false);
    setEditing(null);
    reload();
  }

  async function publishNow() {
    setPending(true);
    setMessage("");
    let photos = photosOf(recipe);
    if (recipe.editable) {
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
    const res = await fetch("/api/tiktok/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_images: photos,
        description: body,
        privacy_level: privacy,
        disable_comment: commentsOff,
        brand_content_toggle: branded,
        brand_organic_toggle: organic,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setMessage(json.error || t("Publication impossible", "Could not publish", english));
      return;
    }
    setMessage(t("Envoyé sur TikTok (video.publish)", "Posted to TikTok (video.publish)", english));
    reload();
  }

  return (
    <div
      className="ss-modal"
      onClick={() => {
        setPostOpen(false);
        setEditing(null);
      }}
    >
      <div className="ss-dialog ss-dialog--recipe" onClick={(event) => event.stopPropagation()}>
        <h2>{editing ? t("Modifier le TikTok", "Edit TikTok", english) : t("Publier sur TikTok", "Publish to TikTok", english)}</h2>
        <form className="ss-recipe" onSubmit={save}>
          {baked || rebuilding || rebuildError || recipe.editable ? (
            <div className={`ss-recipe__banner${rebuildError ? " ss-recipe__banner--err" : ""}`}>
              <p>
                {rebuilding
                  ? t("On extrait les textes des slides (les photos ne bougent pas)…", "Extracting the on-slide texts (photos stay as-is)…", english)
                  : rebuildError
                    ? rebuildError
                    : recipe.editable
                      ? t("Les textes sont extraits. L’aperçu montre la photo originale. Modifie une ligne à droite si besoin.", "Texts are extracted. The preview shows the original photo. Edit a line on the right if you need.", english)
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
                  {t("Extraction des textes…", "Extracting texts…", english)}
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
            {connected.length ? (
              <div className="ss-checks">
                {connected.map((channel) => (
                  <label key={channel.id}>
                    <input
                      type="checkbox"
                      checked={channelIds.includes(channel.id)}
                      onChange={(event) => {
                        setChannelIds((current) =>
                          event.target.checked ? [...current, channel.id] : current.filter((id) => id !== channel.id),
                        );
                      }}
                    />
                    {channel.name} · {platformName(channel.platform)}
                  </label>
                ))}
              </div>
            ) : (
              <p className="ss-lead">
                {t("Connecte TikTok pour publier en Direct Post.", "Connect TikTok to publish with Direct Post.", english)}{" "}
                <a href="/api/tiktok/oauth/start">{t("Continuer avec TikTok", "Continue with TikTok", english)}</a>
              </p>
            )}
            <select value={privacy} onChange={(event) => setPrivacy(event.target.value)}>
              {PRIVACY.filter((item) => allowed.includes(item.id)).map((item) => (
                <option key={item.id} value={item.id}>
                  {english ? item.en : item.fr}
                </option>
              ))}
            </select>
            <label className="ss-checks">
              <input type="checkbox" checked={commentsOff} onChange={(event) => setCommentsOff(event.target.checked)} />
              {t("Désactiver les commentaires", "Disable comments", english)}
            </label>
            <label className="ss-checks">
              <input type="checkbox" checked={organic} onChange={(event) => setOrganic(event.target.checked)} />
              {t("Votre marque (brand_organic_toggle)", "Your brand (brand_organic_toggle)", english)}
            </label>
            <label className="ss-checks">
              <input type="checkbox" checked={branded} onChange={(event) => setBranded(event.target.checked)} />
              {t("Contenu de marque (brand_content_toggle)", "Branded content (brand_content_toggle)", english)}
            </label>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
            <select value={status} onChange={(event) => setStatus(event.target.value as "draft" | "scheduled")}>
              <option value="draft">{t("Brouillon", "Draft", english)}</option>
              <option value="scheduled">{t("Planifié", "Scheduled", english)}</option>
            </select>
            {message ? <p className="ss-lead">{message}</p> : null}
            <div className="ss-form-actions">
              <button className="ss-btn-ghost" type="submit" disabled={pending}>
                {pending ? "…" : editing ? t("Enregistrer", "Save", english) : t("Planifier", "Schedule", english)}
              </button>
              <button className="ss-btn-purple" type="button" disabled={pending || !connected.length || !body.trim()} onClick={publishNow}>
                {pending ? "…" : t("Publier maintenant", "Publish now", english)}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
