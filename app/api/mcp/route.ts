import {
  agentAnalytics,
  agentCreatePost,
  agentDeletePost,
  agentForkPost,
  agentGetAccount,
  agentGetRecipe,
  agentImportTikTok,
  agentLibrary,
  agentListMarketplace,
  agentListPosts,
  agentMedia,
  agentChannels,
  agentPublish,
  agentReport,
  agentSetVisibility,
  agentUpdatePost,
  agentUpdateRecipe,
  agentWhoami,
} from "@/lib/agent";
import { agentOptions } from "@/lib/agent-http";
import { resolveApiKey } from "@/lib/api-keys";
import { hasStudioAccess } from "@/lib/plans";
import { recipeInputSchema } from "@/lib/recipe";
import type { SessionUser } from "@/lib/types";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

export const maxDuration = 60;

const statusSchema = z.enum(["draft", "scheduled", "published"]);

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "error";
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

function userFrom(ctx: { http?: { authInfo?: AuthInfo } }): SessionUser {
  const extra = ctx.http?.authInfo?.extra as { user?: SessionUser } | undefined;
  if (!extra?.user?.id) throw new Error("unauthorized");
  return extra.user;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "whoami",
      {
        title: "Who am I",
        description: "Return the ScrollShow workspace, plan, and TikTok connection status. Call this first.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          return text(await agentWhoami(userFrom(ctx)));
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "list_channels",
      {
        title: "List channels",
        description: "List TikTok channels in this workspace.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          return text({ channels: await agentChannels(userFrom(ctx)) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "list_media",
      {
        title: "List media",
        description:
          "List raw slide images. For reusable TikToks with the exact recipe (fonts, overlays, HTML), use list_posts then get_recipe.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          return text({ media: await agentMedia(userFrom(ctx)) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "list_posts",
      {
        title: "List posts",
        description: "List draft, scheduled, or published carousel posts.",
        inputSchema: z.object({
          status: statusSchema.optional(),
        }),
      },
      async (args, ctx) => {
        try {
          return text({ posts: await agentListPosts(userFrom(ctx), args.status) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "create_post",
      {
        title: "Create or schedule a post",
        description:
          "Create a TikTok carousel in the ScrollShow calendar. Pass recipe (slides, fontFamily, html, css, overlays) to store the exact source so it can be reused later. Use status=draft or scheduled. Does not publish live until the user asks.",
        inputSchema: z.object({
          caption: z.string().min(1).max(2200),
          channelId: z.string().optional(),
          date: z.string().optional(),
          time: z.string().optional(),
          status: statusSchema.optional(),
          image: z.string().optional(),
          photo_images: z.array(z.string()).optional(),
          origin: z.enum(["ai", "manual"]).optional(),
          recipe: recipeInputSchema.optional(),
        }),
      },
      async (args, ctx) => {
        try {
          return text({ post: await agentCreatePost(userFrom(ctx), args) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "update_post",
      {
        title: "Update a post",
        description:
          "Edit caption, schedule, status, images, or the exact recipe of an existing post. Prefer update_recipe when changing texts or fonts of an existing TikTok.",
        inputSchema: z.object({
          id: z.string(),
          caption: z.string().optional(),
          date: z.string().optional(),
          time: z.string().optional(),
          status: statusSchema.optional(),
          channelId: z.string().optional(),
          image: z.string().optional(),
          photo_images: z.array(z.string()).optional(),
          recipe: recipeInputSchema.optional(),
        }),
      },
      async (args, ctx) => {
        try {
          const { id, ...input } = args;
          return text({ post: await agentUpdatePost(userFrom(ctx), id, input) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "delete_post",
      {
        title: "Delete a post",
        description: "Remove a draft or scheduled post.",
        inputSchema: z.object({ id: z.string() }),
      },
      async (args, ctx) => {
        try {
          return text(await agentDeletePost(userFrom(ctx), args.id));
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "get_recipe",
      {
        title: "Get exact TikTok recipe",
        description:
          "Return the exact source of an existing carousel — imported TikToks included. For imports, reuse photo_images and caption pixel-perfect; do not redraw. Works with post id or shareId. Public marketplace items are readable too.",
        inputSchema: z.object({ id: z.string() }),
      },
      async (args, ctx) => {
        try {
          return text(await agentGetRecipe(userFrom(ctx), args.id));
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "update_recipe",
      {
        title: "Patch an existing TikTok recipe",
        description:
          "Patch texts, images, fonts or overlays of an existing carousel in place. Keep positions, html and css unless the user asked to change them. Pass the post id or shareId. Set replaceSlides=true only when replacing the whole slide list.",
        inputSchema: recipeInputSchema.extend({
          id: z.string(),
          caption: z.string().optional(),
        }),
      },
      async (args, ctx) => {
        try {
          const { id, ...input } = args;
          return text(await agentUpdateRecipe(userFrom(ctx), id, input));
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "fork_post",
      {
        title: "Duplicate a TikTok",
        description:
          "Clone an existing carousel with the same recipe (fonts, overlays, html, images) as a new private draft. Works on your posts and on public marketplace formats.",
        inputSchema: z.object({ id: z.string() }),
      },
      async (args, ctx) => {
        try {
          return text({ post: await agentForkPost(userFrom(ctx), args.id) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "publish_now",
      {
        title: "Publish to TikTok now",
        description:
          "Direct-post a photo carousel to the connected TikTok account right now. Only use when the user explicitly asked to publish.",
        inputSchema: z.object({
          caption: z.string().min(1).max(2200),
          title: z.string().max(90).optional(),
          photo_images: z.array(z.string()).optional(),
          image: z.string().optional(),
          privacy_level: z.string().optional(),
          disable_comment: z.boolean().optional(),
        }),
      },
      async (args, ctx) => {
        try {
          return text(await agentPublish(userFrom(ctx), args));
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "list_marketplace",
      {
        title: "List marketplace TikToks",
        description:
          "List private (your library) or public (community) carousel formats. Public items are the best-performing formats users shared.",
        inputSchema: z.object({
          tab: z.enum(["private", "public"]).optional(),
        }),
      },
      async (args, ctx) => {
        try {
          return text({ items: await agentListMarketplace(userFrom(ctx), args.tab || "private") });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "import_tiktok",
      {
        title: "Import a TikTok by URL",
        description:
          "Import a public TikTok photo carousel from its URL into the marketplace, pixel-perfect: original slides, caption, author, music and stats. Do not redraw. Use visibility=public to share the format with other ScrollShow users.",
        inputSchema: z.object({
          url: z.string().min(8),
          visibility: z.enum(["private", "public"]).optional(),
        }),
      },
      async (args, ctx) => {
        try {
          return text({ post: await agentImportTikTok(userFrom(ctx), args) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "set_visibility",
      {
        title: "Publish or unpublish a format",
        description: "Set a marketplace TikTok to private or public so other users can clone the exact format.",
        inputSchema: z.object({
          id: z.string(),
          visibility: z.enum(["private", "public"]),
        }),
      },
      async (args, ctx) => {
        try {
          return text({ post: await agentSetVisibility(userFrom(ctx), args.id, args.visibility) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "get_analytics",
      {
        title: "Get analytics",
        description: "TikTok profile stats, recent videos, and calendar post performance.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          return text(await agentAnalytics(userFrom(ctx)));
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "get_report",
      {
        title: "Full performance report",
        description:
          "Generate a complete ScrollShow report: connection, analytics, library Keep/Watch/Skip, scheduled posts, and recommendations. Present it as a strategist, not as JSON.",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          return text(await agentReport(userFrom(ctx)));
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "search_library",
      {
        title: "Search research library",
        description: "Search TikTok slideshow accounts already saved in the user's research library.",
        inputSchema: z.object({
          query: z.string().optional(),
          verdict: z.enum(["keep", "watch", "skip"]).optional(),
        }),
      },
      async (args, ctx) => {
        try {
          return text({ accounts: await agentLibrary(userFrom(ctx), args.query, args.verdict) });
        } catch (error) {
          return fail(error);
        }
      },
    );

    server.registerTool(
      "get_account",
      {
        title: "Get one library account",
        description: "Read one research-library account by id or @handle.",
        inputSchema: z.object({ idOrHandle: z.string() }),
      },
      async (args, ctx) => {
        try {
          return text({ account: await agentGetAccount(userFrom(ctx), args.idOrHandle) });
        } catch (error) {
          return fail(error);
        }
      },
    );
  },
  {
    serverInfo: { name: "scrollshow", version: "1.0.0" },
    instructions:
      "You are connected to the user's ScrollShow workspace. Create, schedule, and publish TikTok photo carousels, read analytics, search the research library, and write reports. Call whoami if you do not know whether TikTok is connected. Marketplace: import_tiktok clones a public TikTok pixel-perfect (exact slides + caption). list_marketplace lists private or public formats. get_recipe then update_recipe to edit in place — never regenerate a new template. For imported TikToks, reuse photo_images as-is. Use create_post to draft or schedule. Use publish_now only when the user explicitly asked to post now. Prefer get_report when they want a full picture. Present findings in plain language with tables, not raw JSON dumps.",
  },
);

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const user = await resolveApiKey(bearerToken);
  if (!user || !hasStudioAccess(user.plan)) return undefined;
  return {
    token: bearerToken,
    clientId: user.id,
    scopes: ["scrollshow"],
    extra: { user },
  };
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["scrollshow"],
  resourceUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io").replace(/\/$/, "")}/api/mcp`,
});

async function handle(request: Request) {
  if (request.method === "OPTIONS") return agentOptions();
  return authHandler(request);
}

export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS };
