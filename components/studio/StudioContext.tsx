"use client";

import { prefersEnglish } from "@/lib/i18n";
import type { PlatformAvailability } from "@/lib/platforms";
import type { Channel, MediaItem, PublicUser, StudioPost } from "@/lib/types";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type StudioContextValue = {
  user: PublicUser | null;
  english: boolean;
  channels: Channel[];
  posts: StudioPost[];
  media: MediaItem[];
  availability: PlatformAvailability | null;
  activeChannel: string | "all";
  setActiveChannel: (id: string | "all") => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  postOpen: boolean;
  setPostOpen: (open: boolean) => void;
  editing: StudioPost | null;
  setEditing: (post: StudioPost | null) => void;
  composeDate: string | null;
  setComposeDate: (date: string | null) => void;
  reload: () => Promise<void>;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function englishFrom(user: PublicUser | null) {
  if (user?.settings?.locale === "en") return true;
  if (user?.settings?.locale === "fr") return false;
  return prefersEnglish();
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<StudioPost[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [availability, setAvailability] = useState<PlatformAvailability | null>(null);
  const [activeChannel, setActiveChannel] = useState<string | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [editing, setEditing] = useState<StudioPost | null>(null);
  const [composeDate, setComposeDate] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/studio");
    if (!res.ok) return;
    const json = await res.json();
    setUser(json.user);
    setChannels(json.channels || []);
    setPosts(json.posts || []);
    setMedia(json.media || []);
    if (json.availability) setAvailability(json.availability);
  }

  useEffect(() => {
    reload();
  }, []);

  const english = englishFrom(user);

  const value = useMemo(
    () => ({
      user,
      english,
      channels,
      posts,
      media,
      availability,
      activeChannel,
      setActiveChannel,
      addOpen,
      setAddOpen,
      postOpen,
      setPostOpen,
      editing,
      setEditing,
      composeDate,
      setComposeDate,
      reload,
    }),
    [user, english, channels, posts, media, availability, activeChannel, addOpen, postOpen, editing, composeDate],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("StudioProvider missing");
  return ctx;
}
