import type { Channel, MediaItem, StudioPost } from "./types";

const IMAGES = [
  "/assets/tiktoks/01-glowup-188k.png",
  "/assets/tiktoks/02-foods-107k.png",
  "/assets/tiktoks/03-guide-178k.png",
  "/assets/tiktoks/07-pov-98k.png",
  "/assets/tiktoks/05-beach-39k.png",
  "/assets/tiktoks/04-marlon-65k.png",
];

export function seedStudio(userId: string) {
  const channels: Channel[] = [
    {
      id: crypto.randomUUID(),
      userId,
      platform: "tiktok",
      name: "manny",
      handle: "mannyprcs",
      avatar: "/assets/avatars/gars1.png",
    },
    {
      id: crypto.randomUUID(),
      userId,
      platform: "tiktok",
      name: "Process App",
      handle: "useprocess",
      avatar: "/logo.svg",
    },
  ];

  const bodies = [
    "Draft: 7 aliments qui dégonflent ton visage pendant la nuit",
    "#debloat le soir, visage net le matin",
    "GUIDE POUR ENLEVER LA RÉTENTION D'EAU DU VISAGE",
    "POV : t’as compris comment dégonfler ton visage",
    "Si tu bois 3L d’eau / jour tu fais une grosse erreur",
    "Comment glow up rapidement",
  ];

  const posts: StudioPost[] = bodies.map((body, index) => ({
    id: crypto.randomUUID(),
    userId,
    channelIds: [channels[index % channels.length].id],
    body,
    date: `2026-08-${String(18 + (index % 5)).padStart(2, "0")}`,
    time: `${10 + index}:00`,
    status: index < 2 ? "draft" : "scheduled",
    image: IMAGES[index],
    views: [188500, 107400, 178100, 98400, 39500, 65200][index],
    likes: [4200, 2100, 3900, 1800, 740, 1200][index],
    comments: [86, 41, 72, 33, 12, 28][index],
    shares: [120, 54, 98, 40, 11, 22][index],
  }));

  const media: MediaItem[] = IMAGES.map((url, index) => ({
    id: crypto.randomUUID(),
    userId,
    url,
    name: url.split("/").pop() || `media-${index}`,
    createdAt: new Date().toISOString(),
  }));

  return { channels, posts, media };
}
