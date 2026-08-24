"use client";

import { t } from "@/lib/i18n";
import { platformName } from "@/lib/platforms";
import {
  defaultOverlay,
  defaultSlide,
  ensureRecipe,
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

  const connected = channels.filter((item) => item.connected);
  const slide = recipe.slides[slideIndex] || recipe.slides[0];

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
  }, [postOpen, editing, channels, media, activeChannel, user]);

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
    const res = await fetch("/api/tiktok/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_images: photosOf(recipe),
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
          <div className="ss-recipe__stage">
            <SlidePreview slide={slide} recipe={recipe} width={280} />
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
            <select value={slide.image} onChange={(event) => patchSlide(slide.id, { image: event.target.value })}>
              {media.map((item) => (
                <option key={item.id} value={item.url}>
                  {item.name}
                </option>
              ))}
              {slide.image && !media.some((item) => item.url === slide.image) ? (
                <option value={slide.image}>{t("Image actuelle", "Current image", english)}</option>
              ) : null}
            </select>
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
                    value={overlay.color}
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
