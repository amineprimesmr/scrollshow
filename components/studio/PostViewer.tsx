"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AccountVideo } from "@/lib/types";
import { t } from "@/lib/i18n";
import { coverSrc } from "./cover";
import { embedId, engagementOf } from "./post-meta";
import { TikTokSlides } from "./TikTokSlides";
import "./account-gallery.css";

export function PostViewer({
  initialSlide,
  video,
  handle,
  en,
  onClose,
}: {
  initialSlide: number;
  video: AccountVideo;
  handle: string;
  en: boolean;
  onClose: () => void;
}) {
  const id = embedId(video);
  const [visibleSlide, setVisibleSlide] = useState(initialSlide);
  const transcript = video.slideTexts?.find(s => s.index === visibleSlide);
  const link = video.url || (id ? `https://www.tiktok.com/@${handle}/${video.kind === "photo" ? "photo" : "video"}/${id}` : "");

  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab" && dialog.current) {
        const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), a[href], iframe, [tabindex="0"]')];
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  // Le panneau crée son propre contexte d'empilement : le lecteur doit sortir
  // du DOM du panneau pour passer au-dessus du chrome flottant du studio.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ss-postview" role="dialog" aria-modal="true" aria-label={video.title || t("Post TikTok", "TikTok post", en)}>
      <button type="button" className="ss-postview__scrim" aria-label={t("Fermer", "Close", en)} onClick={onClose} />
      <div ref={dialog} className="ss-postview__sheet lg">
        <header className="ss-postview__head">
          <div>
            <small>@{handle} · {video.kind === "photo" ? t("Carrousel", "Carousel", en) : t("Vidéo", "Video", en)}</small>
            <b>{video.title || t("Sans titre", "Untitled", en)}</b>
          </div>
          <button ref={closeButton} type="button" className="ss-btn-ghost lg-press" onClick={onClose}>
            {t("Fermer", "Close", en)}
          </button>
        </header>

        <div className="ss-postview__body">
          <div className="ss-postview__player">
            {video.kind === "photo" && video.images?.length ? <TikTokSlides key={video.id} images={video.images} en={en} large initialIndex={initialSlide} onSlideChange={setVisibleSlide} /> : id ? (
              <iframe
                key={id}
                src={`https://www.tiktok.com/embed/v2/${id}`}
                title={video.title || `TikTok ${id}`}
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : video.cover ? (
              <img src={coverSrc(video.cover)} alt="" />
            ) : (
              <p className="ss-postview__muted">{t("Ce post n'a pas d'identifiant TikTok lisible.", "This post has no readable TikTok id.", en)}</p>
            )}
          </div>

          <div className="ss-postview__side">
            <dl className="ss-postview__stats">
              <div>
                <dt>{t("Vues", "Views", en)}</dt>
                <dd>{video.views.toLocaleString(en ? "en-US" : "fr-FR")}</dd>
              </div>
              <div>
                <dt>Likes</dt>
                <dd>{video.likes.toLocaleString(en ? "en-US" : "fr-FR")}</dd>
              </div>
              <div>
                <dt>{t("Commentaires", "Comments", en)}</dt>
                <dd>{video.comments.toLocaleString(en ? "en-US" : "fr-FR")}</dd>
              </div>
              <div>
                <dt>{t("Partages", "Shares", en)}</dt>
                <dd>{video.shares.toLocaleString(en ? "en-US" : "fr-FR")}</dd>
              </div>
              <div>
                <dt>{t("Engagement", "Engagement", en)}</dt>
                <dd>{engagementOf(video)}%</dd>
              </div>
              <div>
                <dt>{t("Publié le", "Published", en)}</dt>
                <dd>{video.createdAt ? new Date(video.createdAt * 1000).toLocaleDateString(en ? "en-US" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"}</dd>
              </div>
            </dl>
            {transcript ? <section className="ss-postview__transcript">
              <strong>{t(`Texte de la slide ${visibleSlide + 1}`, `Slide ${visibleSlide + 1} text`, en)}</strong>
              <p>{transcript.text || t(transcript.status === "pending" ? "Lecture en cours…" : "Aucun texte lisible détecté.", transcript.status === "pending" ? "Reading…" : "No readable text detected.", en)}</p>
              {transcript.status === "uncertain" ? <small>{t("Lecture automatique incertaine : vérifie l’image.", "Uncertain automatic reading: check the image.", en)}</small> : null}
            </section> : null}
            {video.caption || video.title ? <p className="ss-postview__caption">{video.caption || video.title}</p> : null}
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="ss-btn-ghost lg-press">
                {t("Ouvrir sur TikTok ↗", "Open on TikTok ↗", en)}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
