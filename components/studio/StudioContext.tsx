"use client";

import { prefersEnglish } from "@/lib/i18n";
import { createStudioSync } from "@/lib/studio-sync";
import type { PlatformAvailability } from "@/lib/platforms";
import type { Channel, MediaItem, PublicUser, StudioPost } from "@/lib/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type StudioSnapshot = {
  user: PublicUser;
  channels: Channel[];
  posts: StudioPost[];
  media: MediaItem[];
  availability: PlatformAvailability;
};

type StudioContextValue = {
  user: PublicUser | null;
  english: boolean;
  channels: Channel[];
  posts: StudioPost[];
  media: MediaItem[];
  availability: PlatformAvailability | null;
  loaded: boolean;
  syncError: "offline" | "session_expired" | "unavailable" | null;
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
  reload: (options?: { throwOnError?: boolean }) => Promise<void>;
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
  const [loaded, setLoaded] = useState(false);
  const [syncError, setSyncError] = useState<StudioContextValue["syncError"]>(null);
  const syncRef = useRef<ReturnType<typeof createStudioSync<StudioSnapshot>> | null>(null);
  const [activeChannel, setActiveChannel] = useState<string | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [editing, setEditing] = useState<StudioPost | null>(null);
  const [composeDate, setComposeDate] = useState<string | null>(null);

  const applySnapshot = useCallback((json: StudioSnapshot) => {
    setUser(json.user);
    setChannels(json.channels || []);
    setPosts(json.posts || []);
    setMedia(json.media || []);
    setAvailability(json.availability);
    setLoaded(true);
  }, []);

  const reload = useCallback(async (options?: { throwOnError?: boolean }) => {
    try {
      await syncRef.current?.refresh(true);
    } catch (error) {
      if (options?.throwOnError) throw error;
    }
  }, []);

  useEffect(() => {
    // The old, unscoped browser snapshot could display another signed-in
    // account's stale calendar. Only authenticated responses populate state.
    try { sessionStorage.removeItem("ss-studio-snapshot"); } catch {}
    const sync = createStudioSync<StudioSnapshot>({
      onSnapshot: applySnapshot,
      onSuccess: () => setSyncError(null),
      onError: (error) => {
        if (error.message === "session_expired") {
          setUser(null); setPosts([]); setChannels([]); setMedia([]);
          setAvailability(null); setLoaded(false);
          setEditing(null); setPostOpen(false);
          setSyncError("session_expired");
        } else {
          setSyncError(navigator.onLine ? "unavailable" : "offline");
        }
      },
    });
    syncRef.current = sync;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const active = () => !stopped && !document.hidden && navigator.onLine;
    async function refresh() {
      clearTimeout(timer);
      if (!active()) return;
      try { await sync.refresh(); failures = 0; } catch { failures += 1; }
      clearTimeout(timer);
      if (active()) timer = setTimeout(refresh, Math.min(5_000 * 2 ** failures, 30_000));
    }
    function wake() { void refresh(); }
    function offline() { clearTimeout(timer); setSyncError("offline"); }
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    if (!navigator.onLine) offline();
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
      sync.stop();
      syncRef.current = null;
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [applySnapshot]);

  // Resolved after mount: prefersEnglish() reads navigator, which the server
  // cannot see, so computing it during render caused hydration mismatches.
  const [english, setEnglish] = useState(false);
  useEffect(() => {
    setEnglish(englishFrom(user));
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      english,
      channels,
      posts,
      media,
      availability,
      loaded,
      syncError,
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
    [user, english, channels, posts, media, availability, loaded, syncError, activeChannel, addOpen, postOpen, editing, composeDate, reload],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("StudioProvider missing");
  return ctx;
}
