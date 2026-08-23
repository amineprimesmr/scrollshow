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
  const channels: Channel[] = [];
  const posts: StudioPost[] = [];
  const media: MediaItem[] = IMAGES.map((url, index) => ({
    id: crypto.randomUUID(),
    userId,
    url,
    name: url.split("/").pop() || `media-${index}`,
    createdAt: new Date().toISOString(),
  }));
  return { channels, posts, media };
}
