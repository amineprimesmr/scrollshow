"use client";

import type { Channel, MediaItem, SessionUser, StudioPost } from "@/lib/types";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type StudioContextValue = {
  user: SessionUser | null;
  channels: Channel[];
  posts: StudioPost[];
  media: MediaItem[];
  activeChannel: string | "all";
  setActiveChannel: (id: string | "all") => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  postOpen: boolean;
  setPostOpen: (open: boolean) => void;
  editing: StudioPost | null;
  setEditing: (post: StudioPost | null) => void;
  reload: () => Promise<void>;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [posts, setPosts] = useState<StudioPost[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [editing, setEditing] = useState<StudioPost | null>(null);

  async function reload() {
    const res = await fetch("/api/studio");
    if (!res.ok) return;
    const json = await res.json();
    setUser(json.user);
    setChannels(json.channels || []);
    setPosts(json.posts || []);
    setMedia(json.media || []);
  }

  useEffect(() => {
    reload();
  }, []);

  const value = useMemo(
    () => ({
      user,
      channels,
      posts,
      media,
      activeChannel,
      setActiveChannel,
      addOpen,
      setAddOpen,
      postOpen,
      setPostOpen,
      editing,
      setEditing,
      reload,
    }),
    [user, channels, posts, media, activeChannel, addOpen, postOpen, editing],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("StudioProvider missing");
  return ctx;
}
