"use client";

import { useState, type ReactNode } from "react";
import type { AccountVideo } from "@/lib/types";
import { compact } from "./AccountsFan";
import { avatarSrc, coverSrc } from "./cover";
import { TikTokSlides } from "./TikTokSlides";
import "./account-gallery.css";
import "./post-tile.css";

/**
 * La vignette de publication de l'Overview, extraite pour que la page Recherche
 * montre exactement les memes posts, de la meme facon : un carrousel feuilletable
 * quand il y a des slides, une couverture sinon, et les compteurs en dessous.
 *
 * Le contenu reste opaque : aucun verre ici, c'est la regle du design system.
 */
export function PostTile({
  post,
  en,
  onOpen,
  initialSlide = 0,
  author,
  badge,
  footer,
}: {
  post: AccountVideo;
  en: boolean;
  onOpen?: (slide: number) => void;
  initialSlide?: number;
  /** Sur un mur multi-comptes, la vignette doit dire de qui est le post. */
  author?: { handle: string; avatar?: string } | null;
  /** Pastille posee sur la couverture : la date, le rang, ce que la page veut. */
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  const slides = post.kind === "photo" && post.images?.length ? post.images : null;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const unavailable = !post.cover || failedCover === post.cover;
  const unknown = (key: "views" | "likes") => post.missingMetrics?.includes(key);

  return (
    <article className="ss-posttile">
      <div className="ss-posttile__media">
        {slides ? (
          <TikTokSlides
            key={`${post.id}:${initialSlide}`}
            initialIndex={initialSlide}
            images={slides}
            en={en}
            onOpen={(slide) => onOpen?.(slide)}
          />
        ) : (
          <button
            type="button"
            className="ss-posttile__cover"
            aria-label={en ? "Open post" : "Ouvrir la publication"}
            onClick={() => onOpen?.(0)}
          >
            <span className="ss-posttile__placeholder" aria-hidden>
              {post.kind === "photo" ? "▦" : "▶"}
            </span>
            {unavailable ? <span className="ss-posttile__unavailable">
              <strong>{en ? "Preview unavailable" : "Aperçu indisponible"}</strong>
              <span>{post.title || (en ? "TikTok post" : "Publication TikTok")}</span>
              <small>{en ? "View post details" : "Voir les détails"}</small>
            </span> : (
              <img
                src={coverSrc(post.cover, 240)}
                decoding="async"
                alt=""
                loading="lazy"
                onError={() => setFailedCover(post.cover)}
              />
            )}
          </button>
        )}
        {badge ? <span className="ss-posttile__badge">{badge}</span> : null}
      </div>

      {author ? (
        <a
          className="ss-posttile__author"
          href={`https://www.tiktok.com/@${author.handle}`}
          target="_blank"
          rel="noreferrer"
        >
          {author.avatar ? <img src={avatarSrc(author.handle, author.avatar, 32, true)} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : <span aria-hidden />}
          <b>@{author.handle}</b>
        </a>
      ) : null}

      <dl className="ss-posttile__counts">
        <div>
          <dt>{en ? "Views" : "Vues"}</dt>
          <dd>{unknown("views") ? "—" : compact(post.views)}</dd>
        </div>
        <div>
          <dt>Likes</dt>
          <dd>{unknown("likes") ? "—" : compact(post.likes)}</dd>
        </div>
      </dl>

      {footer}
    </article>
  );
}
