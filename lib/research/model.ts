import { z } from "zod";
import type { AccountVideo } from "../types";

export const filtersSchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
  minSlideshowShare: z.number().min(0).max(1).default(.5),
  minMedianViews: z.number().min(0).max(1e10).default(0),
  minTotalViews: z.number().min(0).max(1e12).default(100000),
  minFollowers: z.number().int().min(0).max(1e10).default(0),
  minPosts: z.number().int().min(1).max(100).default(5),
});
export const startResearchSchema = z.object({
  kind: z.enum(["discover", "analyze"]).default("discover"),
  keywords: z.array(z.string().trim().min(2).max(100)).min(1).max(30),
  source: z.enum(["provider", "browser"]).default("provider"),
  target: z.number().int().min(1).max(50).default(10),
  maxPages: z.number().int().min(1).max(10).default(3),
  searchPages: z.number().int().min(1).max(5).default(2),
  hashtagPivot: z.boolean().default(false),
  filters: filtersSchema.default(() => filtersSchema.parse({})),
  requestId: z.string().min(8).max(100).optional(),
});
export type ResearchInput = z.infer<typeof startResearchSchema>;
export type ResearchFilters = z.infer<typeof filtersSchema>;
export type Candidate = { handle: string; nickname?: string; bio?: string; followers?: number; sourceUrl: string; keyword: string; posts: AccountVideo[]; cursor?: number; pages?: number; measuredPosts?: AccountVideo[] };
export type ResearchResult = { accountId: string; handle: string; measuredAt: string; accepted: boolean; reasons: string[]; coverage: { complete: boolean; pages: number; reason: string }; posts: AccountVideo[]; followers: number };
export type ResearchJob = {
  id: string; userId: string; requestId?: string; input: ResearchInput;
  status: "queued" | "running" | "paused" | "needs_attention" | "done" | "stopped" | "error";
  phase: "search" | "measure"; createdAt: string; updatedAt: string; revision: number;
  keywordIndex: number; searchPage: number; searchCursor: number; searchId?: string;
  candidates: Candidate[]; processed: string[]; results: ResearchResult[];
  failures: Array<{ handle?: string; keyword?: string; error: string }>;
  events: Array<{ at: string; message: string }>; exhausted: boolean;
  lease?: { token: string; until: number }; error?: string;
};
export type StudySlide = { index: number; image: string; text: string; confidence: number | null; status: "pending" | "read" | "unreadable"; words: number; layout?: { textBlocks: number; width: number; height: number } };
export const interpretationSchema = z.object({
  name: z.string().trim().min(3).max(150),
  hook: z.string().max(1500), narrative: z.string().max(2000), emotionalAngle: z.string().max(1000),
  audience: z.string().max(1000), visualPattern: z.string().max(1500), cta: z.string().max(1000),
  adaptation: z.string().max(3000),
  evidenceSlides: z.array(z.number().int().min(1).max(35)).min(1).max(35),
  hypothesis: z.string().min(10).max(2000),
  family: z.enum(["list", "tutorial", "story", "comparison", "myth", "quote", "other"]),
});
export type FormatStudy = {
  id: string; userId: string; accountId: string; postId: string; sourceUrl: string;
  caption: string; createdAt: string; updatedAt: string; measuredAt: string | null;
  status: "pending" | "partial" | "ready"; slides: StudySlide[];
  interpretation?: z.infer<typeof interpretationSchema>;
  interpretationSource?: "assistant"; interpretationAt?: string;
};
