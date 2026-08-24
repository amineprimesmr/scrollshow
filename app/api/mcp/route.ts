import {
  agentAnalytics,
  agentCreatePost,
  agentDeletePost,
  agentGetAccount,
  agentLibrary,
  agentListPosts,
  agentMedia,
  agentChannels,
  agentPublish,
  agentReport,
  agentUpdatePost,
  agentWhoami,
} from "@/lib/agent";
import { agentOptions } from "@/lib/agent-http";
import { resolveApiKey } from "@/lib/api-keys";
import { hasStudioAccess } from "@/lib/plans";
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
        description: "List carousel images available to attach to a post.",
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
          "Create a TikTok carousel in the ScrollShow calendar. Use status=draft or scheduled. Does not publish live until the user asks.",
        inputSchema: z.object({
          caption: z.string().min(1).max(2200),
          channelId: z.string().optional(),
          date: z.string().optional(),
          time: z.string().optional(),
          status: statusSchema.optional(),
          image: z.string().optional(),
          photo_images: z.array(z.string()).optional(),
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
        description: "Edit caption, schedule, status, or image of an existing post.",
        inputSchema: z.object({
          id: z.string(),
          caption: z.string().optional(),
          date: z.string().optional(),
          time: z.string().optional(),
          status: statusSchema.optional(),
          channelId: z.string().optional(),
          image: z.string().optional(),
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
      "You are connected to the user's ScrollShow workspace. Create, schedule, and publish TikTok photo carousels, read analytics, search the research library, and write reports. Call whoami if you do not know whether TikTok is connected. Use create_post to draft or schedule. Use publish_now only when the user explicitly asked to post now. Prefer get_report when they want a full picture. Present findings in plain language with tables, not raw JSON dumps.",
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
