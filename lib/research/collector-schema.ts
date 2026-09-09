import { z } from "zod";
import { allowedCoverUrl } from "../tiktok-cover";
const image=z.string().max(5000).refine(v=>!!allowedCoverUrl(v),"invalid_image_host");
export const collectedPostSchema=z.object({
  id:z.string().regex(/^\d{5,30}$/),title:z.string().max(140),caption:z.string().max(10000).optional(),
  cover:z.string().max(5000),views:z.number().finite().min(0),likes:z.number().finite().min(0),comments:z.number().finite().min(0),shares:z.number().finite().min(0),saves:z.number().finite().min(0).optional(),
  createdAt:z.number().finite().min(0),kind:z.enum(["photo","video"]),url:z.string().max(5000).refine(v=>/^https:\/\/www\.tiktok\.com\/@[\w.]+\/(photo|video)\/\d+$/.test(v)),
  images:z.array(image).max(35).optional(),hashtags:z.array(z.string().max(100)).max(30).optional(),
  missingMetrics:z.array(z.enum(["views","likes","comments","shares","saves"])).max(5).optional(),measuredAt:z.string().datetime().optional(),
});
const candidate=z.object({handle:z.string().regex(/^[a-z0-9._]{1,40}$/),nickname:z.string().max(150).optional(),bio:z.string().max(2000).optional(),followers:z.number().finite().min(0).optional(),sourceUrl:z.string().max(200),keyword:z.string().max(100),posts:z.array(collectedPostSchema).max(100)});
export const collectorResultSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("search"),candidates:z.array(candidate).max(100),hasMore:z.boolean(),cursor:z.number().finite().min(0),searchId:z.string().max(200).optional()}),
  z.object({kind:z.literal("measure"),posts:z.array(collectedPostSchema).max(1000),followers:z.number().finite().min(0).optional(),nickname:z.string().max(150).optional(),bio:z.string().max(2000).optional(),cursor:z.number().finite().min(0).optional(),hasMore:z.boolean(),complete:z.boolean().optional()}),
  z.object({kind:z.literal("error"),error:z.string().max(200),needsAttention:z.boolean().optional()}),
]);
