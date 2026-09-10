/** Aides partagees par le panneau de compte, le lecteur et la page Recherche. */

/** The post id is enough to embed the real TikTok, video or carousel alike. */
export function embedId(video: { id: string; url: string }) {
  const fromUrl = video.url.match(/\/(?:video|photo)\/(\d+)/)?.[1];
  const id = fromUrl || video.id;
  return /^\d{6,}$/.test(id) ? id : null;
}

export function engagementOf(v: { views: number; likes: number; comments: number; shares: number }) {
  return v.views ? Math.round(((v.likes + v.comments + v.shares) / v.views) * 1000) / 10 : 0;
}
