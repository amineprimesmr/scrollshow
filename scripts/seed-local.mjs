import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".data");
const importsDir = path.join(dataDir, "imports");
const storePath = path.join(dataDir, "store.json");
const PREFIX = "ss_live_";

const ASSETS = [
  "/assets/tiktoks/01-glowup-188k.png",
  "/assets/tiktoks/02-foods-107k.png",
  "/assets/tiktoks/03-guide-178k.png",
  "/assets/tiktoks/07-pov-98k.png",
  "/assets/tiktoks/05-beach-39k.png",
  "/assets/tiktoks/04-marlon-65k.png",
];

mkdirSync(importsDir, { recursive: true });

function id() {
  return randomUUID();
}

function shareId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function hashApiKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function slideUrl(name) {
  return `/api/i/${name}`;
}

function copySlide(source, name) {
  copyFileSync(source, path.join(importsDir, name));
  return slideUrl(name);
}

function overlay(text, partial = {}) {
  return {
    id: id(),
    text,
    fontFamily: partial.fontFamily || "Montserrat",
    fontSize: partial.fontSize ?? 64,
    fontWeight: partial.fontWeight ?? 800,
    color: partial.color || "#ffffff",
    x: partial.x ?? 50,
    y: partial.y ?? 25,
    align: partial.align || "center",
    width: partial.width ?? 88,
    lineHeight: partial.lineHeight ?? 1.05,
    ...(partial.backdrop ? { backdrop: partial.backdrop } : {}),
  };
}

function slide(image, partial = {}) {
  return {
    id: id(),
    image,
    sourceImage: partial.sourceImage ?? image,
    keepPhoto: partial.keepPhoto,
    backgroundColor: partial.backgroundColor,
    overlays: partial.overlays || [],
  };
}

function recipe(origin, slides, partial = {}) {
  return {
    version: 1,
    origin,
    fontFamily: partial.fontFamily || "Montserrat",
    editable: partial.editable,
    prompt: partial.prompt,
    slides,
  };
}

function post(userId, channelIds, partial) {
  const image = partial.image || ASSETS[0];
  return {
    id: partial.id || id(),
    userId,
    channelIds,
    body: partial.body || "",
    date: partial.date || dateOffset(0),
    time: partial.time || "18:00",
    status: partial.status || "draft",
    image,
    views: partial.views ?? 0,
    likes: partial.likes ?? 0,
    comments: partial.comments ?? 0,
    shares: partial.shares ?? 0,
    origin: partial.origin || "manual",
    shareId: partial.shareId || shareId(),
    visibility: partial.visibility || "private",
    inCalendar: partial.inCalendar ?? true,
    kind: partial.kind || "photo",
    tiktokUrl: partial.tiktokUrl,
    tiktokId: partial.tiktokId,
    authorHandle: partial.authorHandle,
    authorName: partial.authorName,
    authorAvatar: partial.authorAvatar,
    musicTitle: partial.musicTitle,
    musicAuthor: partial.musicAuthor,
    clones: partial.clones ?? 0,
    forkedFrom: partial.forkedFrom,
    createdAt: partial.createdAt || new Date().toISOString(),
    recipe: partial.recipe || recipe(partial.origin || "manual", [slide(image)]),
  };
}

const LOCAL_DEMO_TOKEN = "local-demo";

function libraryAccounts(userId) {
  return [
    {
      id: id(),
      userId,
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
      id: id(),
      userId,
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
      id: id(),
      userId,
      handle: "protocol.notes",
      niche: "Routines",
      followers: 38400,
      avgViews: 128000,
      posts: 18,
      verdict: "watch",
      notes: "Petite base, vues très au-dessus. Format à reverse-engineer.",
      createdAt: now,
    },
    {
      id: id(),
      userId,
      handle: "glowreset.lab",
      niche: "Glow-up / skin",
      followers: 184000,
      avgViews: 92000,
      posts: 46,
      verdict: "keep",
      notes: "Carrousels 7 slides, hook visage, CTA App Store slide 3.",
      createdAt: now,
    },
    {
      id: id(),
      userId,
      handle: "skinroutine.eu",
      niche: "Skincare",
      followers: 22100,
      avgViews: 44000,
      posts: 9,
      verdict: "skip",
      notes: "Hook faible, trop de texte par slide.",
      createdAt: now,
    },
    {
      id: id(),
      userId,
      handle: "debloat.daily",
      niche: "Wellness",
      followers: 512000,
      avgViews: 210000,
      posts: 64,
      verdict: "keep",
      notes: "Top performer sur les listes alimentaires.",
      createdAt: now,
    },
  ];
}

function libraryRuns(userId) {
  return [
    {
      id: id(),
      userId,
      keywords: "glow up routine debloat",
      status: "done",
      found: 6,
      createdAt: dateOffset(-2) + "T10:00:00.000Z",
    },
    {
      id: id(),
      userId,
      keywords: "breakup carousel tiktok",
      status: "done",
      found: 4,
      createdAt: dateOffset(-5) + "T14:30:00.000Z",
    },
  ];
}

function workspacePosts(userId, channelId, definitionSlides) {
  const editableDefinition = recipe("import", [
    slide(definitionSlides[0], {
      keepPhoto: true,
      overlays: [overlay("2 days after she cheated 💔", { y: 25, fontSize: 62 })],
    }),
    slide(definitionSlides[1], {
      keepPhoto: true,
      overlays: [overlay("2 Months...", { y: 26, fontSize: 54, width: 70 })],
    }),
    slide(definitionSlides[2], {
      keepPhoto: true,
      overlays: [
        overlay("6 Months...", { y: 17, fontSize: 54, width: 70 }),
        overlay("(yesterday she texted me to meet)", { y: 21, fontSize: 32, fontWeight: 700, width: 92 }),
      ],
    }),
  ], { editable: true });

  const bakedDefinition = recipe(
    "import",
    definitionSlides.map((url) => slide(url, { keepPhoto: true, sourceImage: url })),
  );

  return [
    post(userId, [channelId], {
      body: "Schreibe „ROUTINE“ wenn du das E-Book zum Glow Up willst . #glowup #ascend #routine",
      status: "draft",
      inCalendar: false,
      visibility: "private",
      image: definitionSlides[0],
      views: 966600,
      likes: 42000,
      comments: 890,
      shares: 1200,
      origin: "import",
      tiktokUrl: "https://www.tiktok.com/@definition.mann/photo/7675034951603064097",
      tiktokId: "7675034951603064097",
      authorHandle: "definition.mann",
      authorName: "Definition Mann",
      musicTitle: "original sound",
      musicAuthor: "definition.mann",
      recipe: bakedDefinition,
    }),
    post(userId, [channelId], {
      body: "Schreibe „ROUTINE“ wenn du das E-Book zum Glow Up willst . #glowup #ascend #routine",
      status: "draft",
      inCalendar: false,
      visibility: "private",
      image: definitionSlides[0],
      views: 966600,
      likes: 42000,
      comments: 890,
      shares: 1200,
      origin: "import",
      tiktokId: "7675034951603064097-editable",
      authorHandle: "definition.mann",
      authorName: "Definition Mann",
      recipe: editableDefinition,
    }),
    post(userId, [channelId], {
      body: "POV: tu clones le carrousel glow-up gagnant. Hook slide 1.",
      date: today,
      time: "12:00",
      status: "scheduled",
      image: ASSETS[0],
      origin: "manual",
      recipe: recipe("manual", [slide(ASSETS[0])]),
    }),
    post(userId, [channelId], {
      body: "5 aliments qui gonflent le ventre (slide 2 = liste)",
      date: dateOffset(1),
      time: "09:30",
      status: "scheduled",
      image: ASSETS[1],
      origin: "manual",
      recipe: recipe("manual", [
        slide(ASSETS[1], {
          overlays: [overlay("5 foods that bloat you", { y: 18, fontSize: 58 })],
        }),
        slide(ASSETS[2]),
      ]),
    }),
    post(userId, [channelId], {
      body: "Guide complet debloat — CTA commentaire ROUTINE",
      date: dateOffset(2),
      time: "18:00",
      status: "scheduled",
      image: ASSETS[2],
      origin: "manual",
      recipe: recipe("manual", [slide(ASSETS[2])]),
    }),
    post(userId, [channelId], {
      body: "Beach glow check — photo carousel test",
      date: dateOffset(3),
      time: "11:00",
      status: "scheduled",
      image: ASSETS[4],
      origin: "manual",
      recipe: recipe("manual", [slide(ASSETS[4])]),
    }),
    post(userId, [channelId], {
      body: "Marlon format — brouillon pas encore planifié",
      date: dateOffset(4),
      time: "20:00",
      status: "draft",
      inCalendar: false,
      image: ASSETS[5],
      origin: "manual",
      recipe: recipe("manual", [slide(ASSETS[5])]),
    }),
    post(userId, [channelId], {
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
      recipe: recipe("manual", [
        slide(ASSETS[0], {
          overlays: [overlay("Comment glow up ?", { y: 12, fontSize: 52 })],
        }),
      ], { editable: true }),
    }),
    post(userId, [channelId], {
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
      recipe: recipe("manual", [
        slide(ASSETS[3], {
          overlays: [overlay("POV: tu découvres le format gagnant", { y: 22, fontSize: 48 })],
        }),
      ], { editable: true }),
    }),
  ];
}

function seedWorkspace(store, user, partial = {}) {
  const channelId = id();
  const tiktokName = partial.tiktokName || user.name || "ScrollShow Demo";
  const tiktokHandle = partial.tiktokHandle || user.email.split("@")[0].replace(/\./g, "");

  store.channels = (store.channels || []).filter((channel) => channel.userId !== user.id);
  store.channels.push(
    {
      id: channelId,
      userId: user.id,
      platform: "tiktok",
      name: tiktokName,
      handle: tiktokHandle,
      avatar: "/assets/avatars/leo.png",
      accessToken: LOCAL_DEMO_TOKEN,
      refreshToken: LOCAL_DEMO_TOKEN,
      openId: LOCAL_DEMO_TOKEN,
      followers: partial.followers ?? 12400,
      likes: partial.likes ?? 89000,
      videoCount: partial.videoCount ?? 37,
    },
    {
      id: id(),
      userId: user.id,
      platform: "instagram",
      name: `${tiktokName} IG`,
      handle: `${tiktokHandle}.ig`,
      avatar: "/assets/avatars/leo.png",
    },
  );

  store.media = (store.media || []).filter((item) => item.userId !== user.id);
  store.media.unshift(
    ...ASSETS.map((url) => ({
      id: id(),
      userId: user.id,
      url,
      name: url.split("/").pop(),
      createdAt: now,
    })),
    ...importSlides.map((url, index) => ({
      id: id(),
      userId: user.id,
      url,
      name: `definition.mann-${tiktokHandle}-${index + 1}`,
      createdAt: now,
    })),
  );

  store.accounts = (store.accounts || []).filter((account) => account.userId !== user.id);
  store.accounts.push(...libraryAccounts(user.id));

  store.runs = (store.runs || []).filter((run) => run.userId !== user.id);
  store.runs.push(...libraryRuns(user.id));

  const definitionSlides =
    importSlides.length === 3 ? importSlides : [ASSETS[0], ASSETS[1], ASSETS[2]];
  const posts = workspacePosts(user.id, channelId, definitionSlides);

  store.posts = (store.posts || []).filter((item) => item.userId !== user.id);
  store.posts.unshift(...posts);

  return { channelId, posts, definitionSlides };
}

const store = JSON.parse(readFileSync(storePath, "utf8"));
const now = new Date().toISOString();
const today = dateOffset(0);

const devEmail = "dev@scrollshow.local";
const devPassword = "scrollshow123";
const founderEmail = "aminennasri@outlook.com";
const gmailEmail = "amine.ennasri.pro@gmail.com";
const creatorEmail = "creator@scrollshow.local";

const importSlides = [];
for (let index = 0; index < 3; index += 1) {
  const source = path.join(dataDir, `${index + 1}.jpg`);
  if (existsSync(source)) {
    const name = `dev-slide-${index + 1}-${randomUUID().slice(0, 8)}.jpg`;
    importSlides.push(copySlide(source, name));
  }
}

let devUser = store.users.find((user) => user.email === devEmail);
if (!devUser) {
  devUser = { id: id(), email: devEmail, name: "Dev Local", plan: "pro", createdAt: now };
  store.users.unshift(devUser);
}
devUser.passwordHash = bcrypt.hashSync(devPassword, 12);
devUser.plan = "pro";
devUser.name = "Dev Local";
devUser.settings = {
  locale: "fr",
  timezone: "Europe/Paris",
  weekStartsOn: 1,
  defaultPostTime: "18:00",
  defaultPrivacy: "SELF_ONLY",
  defaultStatus: "scheduled",
  disableComments: true,
  disableDuet: true,
  disableStitch: true,
  autoAddMusic: false,
  brandContent: false,
  brandOrganic: false,
};

let founderUser = store.users.find((user) => user.email === founderEmail);
if (!founderUser) {
  founderUser = { id: id(), email: founderEmail, name: "Amine", plan: "pro", createdAt: now };
  store.users.unshift(founderUser);
}
founderUser.plan = "pro";
founderUser.name = founderUser.name || "Amine";

let creatorUser = store.users.find((user) => user.email === creatorEmail);
if (!creatorUser) {
  creatorUser = { id: id(), email: creatorEmail, name: "Creator Demo", plan: "creator", createdAt: now };
  store.users.push(creatorUser);
}
creatorUser.plan = "creator";
creatorUser.name = "Creator Demo";

const devSeed = seedWorkspace(store, devUser, { tiktokName: "Dev TikTok", tiktokHandle: "dev-local" });
const founderSeed = seedWorkspace(store, founderUser, {
  tiktokName: "Amine TikTok",
  tiktokHandle: "aminennasri",
  followers: 48200,
  likes: 310000,
  videoCount: 42,
});

let gmailUser = store.users.find((user) => user.email === gmailEmail);
if (!gmailUser) {
  gmailUser = { id: id(), email: gmailEmail, name: "Amine", plan: "pro", createdAt: now };
  store.users.push(gmailUser);
}
gmailUser.plan = "pro";
const gmailSeed = seedWorkspace(store, gmailUser, {
  tiktokName: "Amine Gmail",
  tiktokHandle: "amineennasri",
  followers: 48200,
  likes: 310000,
  videoCount: 42,
});

const creatorChannelId = id();
store.channels = (store.channels || []).filter((channel) => channel.userId !== creatorUser.id);
store.channels.push({
  id: creatorChannelId,
  userId: creatorUser.id,
  platform: "tiktok",
  name: "Glow Templates",
  handle: "glow-templates",
  avatar: "/assets/avatars/leo.png",
  accessToken: LOCAL_DEMO_TOKEN,
  refreshToken: LOCAL_DEMO_TOKEN,
  openId: LOCAL_DEMO_TOKEN,
  followers: 482000,
  likes: 2100000,
  videoCount: 89,
});

store.media = (store.media || []).filter((item) => item.userId !== creatorUser.id);
store.media.unshift(
  ...ASSETS.slice(0, 3).map((url) => ({
    id: id(),
    userId: creatorUser.id,
    url,
    name: url.split("/").pop(),
    createdAt: now,
  })),
);

const creatorPosts = [
  post(creatorUser.id, [creatorChannelId], {
    body: "Glow up in 30 days — comment GLOWUP for the guide",
    status: "published",
    visibility: "public",
    image: ASSETS[0],
    views: 1200000,
    likes: 89000,
    comments: 4200,
    shares: 3100,
    clones: 87,
    origin: "manual",
    authorHandle: "glow-templates",
    authorName: "Glow Templates",
    recipe: recipe("manual", [
      slide(ASSETS[0], {
        overlays: [overlay("30 day glow up plan", { y: 20, fontSize: 56 })],
      }),
      slide(ASSETS[2]),
    ], { editable: true }),
  }),
  post(creatorUser.id, [creatorChannelId], {
    body: "Debloat foods list — high save rate format",
    status: "published",
    visibility: "public",
    image: ASSETS[1],
    views: 540000,
    likes: 41000,
    comments: 1900,
    shares: 980,
    clones: 52,
    origin: "manual",
    authorHandle: "glow-templates",
    authorName: "Glow Templates",
    recipe: recipe("manual", [
      slide(ASSETS[1], {
        overlays: [overlay("Stop eating these 5 foods", { y: 18, fontSize: 54 })],
      }),
    ], { editable: true }),
  }),
  post(creatorUser.id, [creatorChannelId], {
    body: "Morning routine carousel — 7 slides",
    status: "published",
    visibility: "public",
    image: ASSETS[2],
    views: 310000,
    likes: 22000,
    comments: 880,
    shares: 540,
    clones: 31,
    origin: "manual",
    authorHandle: "glow-templates",
    authorName: "Glow Templates",
    recipe: recipe("manual", [slide(ASSETS[2])]),
  }),
];

store.posts = (store.posts || []).filter((item) => item.userId !== creatorUser.id);
store.posts.unshift(...creatorPosts);

const apiToken = `${PREFIX}${randomBytes(24).toString("base64url")}`;
store.apiKeys = (store.apiKeys || []).filter((key) => key.userId !== devUser.id || key.name !== "Local dev");
store.apiKeys.unshift({
  id: id(),
  userId: devUser.id,
  name: "Local dev",
  prefix: `${PREFIX}${apiToken.slice(PREFIX.length, PREFIX.length + 4)}`,
  hash: hashApiKey(apiToken),
  createdAt: now,
  lastUsedAt: now,
});

writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(
  JSON.stringify(
    {
      ok: true,
      dev: { email: devEmail, password: devPassword },
      founder: { email: founderEmail, note: "Ton compte actuel — TikTok demo connecté" },
      creator: { email: creatorEmail, note: "Public marketplace formats only" },
      counts: {
        founderPosts: founderSeed.posts.length,
        devPosts: devSeed.posts.length,
        publicMarketplace: creatorPosts.length + founderSeed.posts.filter((p) => p.visibility === "public").length,
        libraryAccounts: store.accounts.filter((a) => a.userId === founderUser.id).length,
        calendarPosts: founderSeed.posts.filter((p) => p.inCalendar !== false).length,
      },
      apiKey: apiToken,
      urls: {
        app: "http://localhost:3000/app",
        marketplace: "http://localhost:3000/app/marketplace",
        analytics: "http://localhost:3000/app/analytics",
        library: "http://localhost:3000/app/library",
      },
      note: "npm run dev utilise .data/store.json en local (blob ignoré). npm run dev:remote pour la prod.",
    },
    null,
    2,
  ),
);
