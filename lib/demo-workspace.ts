import { LOCAL_DEMO_TOKEN } from "./local-demo";
import { coverOf, defaultOverlay, defaultSlide, ensureRecipe, newShareId, normalizeRecipe } from "./recipe";
import { localStoreEnabled } from "./store";
import type { CarouselRecipe, StoreData, StudioPost, User } from "./types";

const ASSETS = [
  "/assets/tiktoks/01-glowup-188k.png",
  "/assets/tiktoks/02-foods-107k.png",
  "/assets/tiktoks/03-guide-178k.png",
  "/assets/tiktoks/07-pov-98k.png",
  "/assets/tiktoks/05-beach-39k.png",
  "/assets/tiktoks/04-marlon-65k.png",
];

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function needsDemoWorkspace(data: StoreData, userId: string) {
  const channels = data.channels.filter((item) => item.userId === userId);
  const posts = data.posts.filter((item) => item.userId === userId);
  return !channels.some((item) => item.platform === "tiktok" && item.accessToken) || posts.length < 3;
}

export function ensureDemoWorkspace(data: StoreData, user: User) {
  if (!needsDemoWorkspace(data, user.id)) return false;

  data.channels = data.channels.filter((item) => item.userId !== user.id);
  data.posts = data.posts.filter((item) => item.userId !== user.id);
  data.media = data.media.filter((item) => item.userId !== user.id);
  data.accounts = data.accounts.filter((item) => item.userId !== user.id);
  data.runs = data.runs.filter((item) => item.userId !== user.id);

  const now = new Date().toISOString();
  const today = dateOffset(0);
  const handle = user.email.split("@")[0].replace(/\./g, "");
  const channelId = crypto.randomUUID();

  data.channels.push(
    {
      id: channelId,
      userId: user.id,
      platform: "tiktok",
      name: user.name ? `${user.name} TikTok` : "ScrollShow Demo",
      handle,
      avatar: "/assets/avatars/leo.png",
      accessToken: LOCAL_DEMO_TOKEN,
      refreshToken: LOCAL_DEMO_TOKEN,
      openId: LOCAL_DEMO_TOKEN,
      followers: 48200,
      likes: 310000,
      videoCount: 42,
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      platform: "instagram",
      name: `${user.name || "Demo"} IG`,
      handle: `${handle}.ig`,
      avatar: "/assets/avatars/leo.png",
    },
  );

  data.media.push(
    ...ASSETS.map((url) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      url,
      name: url.split("/").pop() || "media",
      createdAt: now,
    })),
  );

  data.accounts.push(
    {
      id: crypto.randomUUID(),
      userId: user.id,
      handle: "definition.mann",
      niche: "Glow-up / breakup",
      followers: 966600,
      avgViews: 320000,
      posts: 12,
      verdict: "keep",
      notes: "Carrousel 3 slides, texte blanc en haut, hook émotionnel fort.",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      handle: "foods.debloat",
      niche: "Food / debloat",
      followers: 107200,
      avgViews: 61000,
      posts: 31,
      verdict: "keep",
      notes: "Avant/après repas, CTA commentaire « ROUTINE ».",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      userId: user.id,
      handle: "debloat.daily",
      niche: "Wellness",
      followers: 512000,
      avgViews: 210000,
      posts: 64,
      verdict: "keep",
      notes: "Top performer sur les listes alimentaires.",
      createdAt: now,
    },
  );

  data.runs.push({
    id: crypto.randomUUID(),
    userId: user.id,
    keywords: "glow up routine debloat",
    status: "done",
    found: 6,
    createdAt: `${dateOffset(-2)}T10:00:00.000Z`,
  });

  const editableImport = normalizeRecipe(
    {
      origin: "import",
      editable: true,
      slides: [
        defaultSlide(ASSETS[0], {
          keepPhoto: true,
          overlays: [defaultOverlay({ text: "2 days after she cheated 💔", y: 25, fontSize: 62 })],
        }),
        defaultSlide(ASSETS[1], {
          keepPhoto: true,
          overlays: [defaultOverlay({ text: "2 Months...", y: 26, fontSize: 54, width: 70 })],
        }),
        defaultSlide(ASSETS[2], {
          keepPhoto: true,
          overlays: [
            defaultOverlay({ text: "6 Months...", y: 17, fontSize: 54, width: 70 }),
            defaultOverlay({ text: "(yesterday she texted me to meet)", y: 21, fontSize: 32, fontWeight: 700, width: 92 }),
          ],
        }),
      ],
    },
    "import",
  );

  const drafts: Array<Record<string, unknown>> = [
    {
      body: "POV: tu clones le carrousel glow-up gagnant. Hook slide 1.",
      date: today,
      time: "12:00",
      status: "scheduled",
      image: ASSETS[0],
      origin: "manual",
      recipe: normalizeRecipe({ origin: "manual", slides: [defaultSlide(ASSETS[0])] }),
    },
    {
      body: "5 aliments qui gonflent le ventre (slide 2 = liste)",
      date: dateOffset(1),
      time: "09:30",
      status: "scheduled",
      image: ASSETS[1],
      origin: "manual",
      recipe: normalizeRecipe({
        origin: "manual",
        slides: [
          defaultSlide(ASSETS[1], {
            overlays: [defaultOverlay({ text: "5 foods that bloat you", y: 18, fontSize: 58 })],
          }),
          defaultSlide(ASSETS[2]),
        ],
      }),
    },
    {
      body: "Published winner — 188k vues sur le hook visage",
      date: dateOffset(-7),
      time: "17:30",
      status: "published",
      image: ASSETS[0],
      views: 188500,
      likes: 12400,
      comments: 980,
      shares: 640,
      origin: "manual",
      recipe: normalizeRecipe({
        origin: "manual",
        editable: true,
        slides: [
          defaultSlide(ASSETS[0], {
            overlays: [defaultOverlay({ text: "Comment glow up ?", y: 12, fontSize: 52 })],
          }),
        ],
      }),
    },
    {
      body: "Format public partagé — template POV debloat",
      date: dateOffset(-3),
      time: "15:00",
      status: "published",
      visibility: "public",
      image: ASSETS[3],
      views: 98400,
      likes: 7200,
      comments: 410,
      shares: 220,
      clones: 14,
      origin: "manual",
      recipe: normalizeRecipe({
        origin: "manual",
        editable: true,
        slides: [
          defaultSlide(ASSETS[3], {
            overlays: [defaultOverlay({ text: "POV: tu découvres le format gagnant", y: 22, fontSize: 48 })],
          }),
        ],
      }),
    },
    {
      body: "Import definition.mann — version éditable",
      status: "draft",
      inCalendar: false,
      visibility: "private",
      image: ASSETS[0],
      views: 966600,
      likes: 42000,
      comments: 890,
      shares: 1200,
      origin: "import",
      tiktokUrl: "https://www.tiktok.com/@definition.mann/photo/7675034951603064097",
      tiktokId: "7675034951603064097-editable",
      authorHandle: "definition.mann",
      authorName: "Definition Mann",
      recipe: editableImport,
    },
  ];

  for (const partial of drafts) {
    const post: StudioPost = {
      id: crypto.randomUUID(),
      userId: user.id,
      channelIds: [channelId],
      body: String(partial.body),
      date: String(partial.date || today),
      time: String(partial.time || "18:00"),
      status: partial.status as "draft" | "scheduled" | "published",
      image: String(partial.image),
      views: Number(partial.views || 0),
      likes: Number(partial.likes || 0),
      comments: Number(partial.comments || 0),
      shares: Number(partial.shares || 0),
      origin: partial.origin as "manual" | "import",
      shareId: newShareId(),
      visibility: (partial.visibility as "private" | "public") || "private",
      inCalendar: partial.inCalendar !== false,
      kind: "photo" as const,
      tiktokUrl: partial.tiktokUrl as string | undefined,
      tiktokId: partial.tiktokId as string | undefined,
      authorHandle: partial.authorHandle as string | undefined,
      authorName: partial.authorName as string | undefined,
      clones: Number(partial.clones || 0),
      createdAt: now,
      recipe: partial.recipe as CarouselRecipe | undefined,
    };
    post.image = coverOf(post);
    ensureRecipe(post);
    data.posts.unshift(post);
  }

  return true;
}
export function localAutoSeedEnabled() {
  return process.env.NODE_ENV !== "production" && localStoreEnabled();
}
