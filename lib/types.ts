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

export type StoreData = {
  users: User[];
  accounts: Account[];
  runs: Run[];
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  plan: Plan;
};
