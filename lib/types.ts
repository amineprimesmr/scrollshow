export type Plan = "free" | "pro";

export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  plan: Plan;
  createdAt: string;
};

export type Account = {
  id: string;
  userId: string;
  handle: string;
  niche: string;
  followers: number;
  avgViews: number;
  posts: number;
  verdict: "keep" | "watch" | "skip";
  notes: string;
  createdAt: string;
};

export type Run = {
  id: string;
  userId: string;
  keywords: string;
  status: "queued" | "done";
  found: number;
  createdAt: string;
};

export type Channel = {
  id: string;
  userId: string;
  platform: string;
  name: string;
  handle: string;
  avatar: string;
};

export type StudioPost = {
  id: string;
  userId: string;
  channelIds: string[];
  body: string;
  date: string;
  time: string;
  status: "draft" | "scheduled" | "published";
  image: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

export type MediaItem = {
  id: string;
  userId: string;
  url: string;
  name: string;
  createdAt: string;
};

export type StoreData = {
  users: User[];
  accounts: Account[];
  runs: Run[];
  channels: Channel[];
  posts: StudioPost[];
  media: MediaItem[];
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  plan: Plan;
};
