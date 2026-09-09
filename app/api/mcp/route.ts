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
  agentReconstructPost,
  agentReport,
  agentShadowbanCheck,
  agentSetVisibility,
  agentUpdatePost,
  agentUpdateRecipe,
  agentWhoami,
} from "@/lib/agent";
import { agentOptions, headerToken } from "@/lib/agent-http";
import { resolveApiKey } from "@/lib/api-keys";
import { MCP_RESOURCE, OAUTH_SCOPE, resolveAccessToken } from "@/lib/oauth";
import { publicUser } from "@/lib/store";
import { hasStudioAccess } from "@/lib/plans";
import { recipeInputSchema } from "@/lib/recipe";
import type { SessionUser } from "@/lib/types";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeResearchAccount, contentBrief, discoverResearchAccounts, researchLibrary } from "@/lib/research";
import { reconcilePublishId } from "@/lib/publish-queue";
import { loadTikTokChannel } from "@/lib/tiktok-account";
import { loadCreator } from "@/lib/tiktok-publish";
import { readStore } from "@/lib/store";
import { consumeLimit } from "@/lib/rate-limit";
import { scrollshowStarterPrompt } from "@/lib/assistant-prompts";

export const maxDuration = 300;

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
    server.registerPrompt("start_scrollshow", {
      title: "Start with ScrollShow",
      description: "Read the business context and create one original private editable draft. No automatic publishing.",
      argsSchema: z.object({ language: z.enum(["fr", "en"]).optional() }),
    }, ({ language }) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: scrollshowStarterPrompt(language === "en") } }] }));
    server.registerTool("analyze_account", {
      title: "Analyze and save a TikTok account",
      description: "Read a real public profile, measure a sample of posts when configured, and save it. Returns median views, slideshow share, top posts, provenance and sample size. Never fabricates unavailable metrics.",
      inputSchema: z.object({ handle: z.string().min(2).max(120), niche: z.string().max(80).optional() }),
    }, async (args, ctx) => { try { return text(await analyzeResearchAccount(userFrom(ctx), args.handle, args.niche)); } catch (e) { return fail(e); } });

    server.registerTool("discover_accounts", {
      title: "Discover TikTok accounts by niche",
      description: "Find indexed TikTok candidates, verify up to five real profiles and save a run. Requires configured search provider; if unavailable, analyze named accounts instead. May take several minutes. Partial saved results remain available in list_runs.",
      inputSchema: z.object({ keywords: z.string().min(2).max(80) }),
    }, async (args, ctx) => { try { return text(await discoverResearchAccounts(userFrom(ctx), args.keywords)); } catch (e) { return fail(e); } });

    server.registerTool("compare_accounts", {
      title: "Compare saved research",
      description: "Compare saved accounts using median views, views per follower, slideshow share, cadence, sample size and dated evidence. Does not refresh external data.",
      inputSchema: z.object({ query: z.string().max(120).optional() }),
      annotations: { readOnlyHint: true },
    }, async (args, ctx) => { try { return text(await researchLibrary(userFrom(ctx), args.query)); } catch (e) { return fail(e); } });

    server.registerTool("get_content_brief", {
      title: "Plan content from the business and research",
      description: "Read business context, saved competitor evidence and calendar. Use this to propose original hooks, slide outlines, CTAs and a content plan; then save user-requested drafts with create_post. The tool supplies evidence, the assistant writes the strategy.",
      inputSchema: z.object({}), annotations: { readOnlyHint: true },
    }, async (_args, ctx) => { try { return text(await contentBrief(userFrom(ctx))); } catch (e) { return fail(e); } });

    server.registerTool("list_runs", {
      title: "Read discovery history", inputSchema: z.object({}), annotations: { readOnlyHint: true },
      description: "Read saved discovery runs, verified account IDs and failures.",
    }, async (_args, ctx) => { try { const user = userFrom(ctx); return text({ runs: (await readStore()).runs.filter(r => r.userId === user.id) }); } catch (e) { return fail(e); } });

    server.registerTool("get_creator_options", {
      title: "Read TikTok publishing options for a chosen account",
      description: "Read fresh allowed privacy and comment settings before asking the user to choose. channelId is required when multiple accounts are connected.",
      inputSchema: z.object({ channelId: z.string().optional() }), annotations: { readOnlyHint: true },
    }, async (args, ctx) => { try { const channel = await loadTikTokChannel(userFrom(ctx).id, args.channelId); if (!channel?.accessToken) throw new Error("tiktok_not_connected"); return text({ channelId: channel.id, handle: channel.handle, ...await loadCreator(channel.accessToken) }); } catch (e) { return fail(e); } });

    server.registerTool("publish_status", {
      title: "Reconcile a TikTok publication",
      description: "Refresh the result of a submitted publication. Processing is not published; only PUBLISH_COMPLETE is final success. Never retry an ambiguous initialization blindly.",
      inputSchema: z.object({ publishId: z.string().min(1) }),
    }, async (args, ctx) => { try { return text(await reconcilePublishId(userFrom(ctx).id, args.publishId)); } catch (e) { return fail(e); } });

    server.registerTool("export_post", {
      title: "Export an owned carousel",
      description: "Return the editable recipe and an authenticated browser download URL for a ZIP of slides and source. The user must be logged into ScrollShow to download. Requires ownership, including after cloning a public template.",
      inputSchema: z.object({ id: z.string().min(1) }), annotations: { readOnlyHint: true },
    }, async (args, ctx) => { try {
      const user = userFrom(ctx); const post = (await readStore()).posts.find(p => p.id === args.id && p.userId === user.id);
      if (!post) throw new Error("post_missing");
      return text({ recipe: await agentGetRecipe(user, args.id), downloadUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io"}/api/studio/posts/${encodeURIComponent(args.id)}/export` });
    } catch (e) { return fail(e); } });
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
          tiktok: z
            .object({
              title: z.string().max(90).optional(),
              privacy: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]).optional(),
              allowComment: z.boolean().optional(),
              commercial: z.boolean().optional(),
              brandOrganic: z.boolean().optional(),
              brandContent: z.boolean().optional(),
            })
            .optional()
            .describe(
              "Direct Post choices the user made: privacy (required before a scheduled post can go out), allowComment (off unless the user asked), commercial + brandOrganic/brandContent disclosure.",
            ),
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
          tiktok: z
            .object({
              title: z.string().max(90).optional(),
              privacy: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]).optional(),
              allowComment: z.boolean().optional(),
              commercial: z.boolean().optional(),
              brandOrganic: z.boolean().optional(),
              brandContent: z.boolean().optional(),
            })
            .optional()
            .describe(
              "Direct Post choices the user made: privacy (required before a scheduled post can go out), allowComment (off unless the user asked), commercial + brandOrganic/brandContent disclosure.",
            ),
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
          "Return the exact source of an existing carousel — imported TikToks included. If recipe.editable is false and overlays are empty, the text is still baked into the JPEGs: call reconstruct_post first. Works with post id or shareId. Public marketplace items are readable too.",
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
          "Direct-post a photo carousel to the connected TikTok account right now. Only use when the user explicitly asked to publish AND told you the privacy level — never pick one for them. Pass id of an editable post to rasterize overlays into fresh PNGs automatically. Comments stay off and no commercial disclosure is set unless the user asked. TikTok processes the post asynchronously: it may take a few minutes to appear on the profile.",
        inputSchema: z.object({
          caption: z.string().min(1).max(2200),
          title: z.string().max(90).optional(),
          id: z.string().optional(),
          channelId: z.string().optional().describe("Destination account from list_channels. Required with multiple connected accounts."),
          photo_images: z.array(z.string()).optional(),
          image: z.string().optional(),
          privacy_level: z
            .enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"])
            .describe("The privacy the user chose. Required."),
          allow_comment: z.boolean().optional().describe("Allow comments. Default false."),
          commercial_content: z.boolean().optional().describe("User disclosed commercial content."),
          brand_organic: z.boolean().optional().describe("Promotes the user's own brand ('Promotional content' label)."),
          brand_content: z.boolean().optional().describe("Promotes a third party ('Paid partnership' label). Not allowed with SELF_ONLY."),
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
          "Import a public TikTok photo carousel from its URL into the marketplace. This first copies the original slides. Pass reconstruct=true to immediately decompose them into editable text layers (same look, texts and images can be changed). Use visibility=public to share the format with other ScrollShow users.",
        inputSchema: z.object({
          url: z.string().min(8),
          visibility: z.enum(["private", "public"]).optional(),
          reconstruct: z.boolean().optional(),
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
      "reconstruct_post",
      {
        title: "Recreate a TikTok as editable layers",
        description:
          "Run vision on imported JPEG slides and rebuild them as a recipe: background color/photo + editable text overlays (font, size, color, position). After this, change texts with update_recipe. Required before editing an imported TikTok in the studio.",
        inputSchema: z.object({ id: z.string() }),
      },
      async (args, ctx) => {
        try {
          return text({ post: await agentReconstructPost(userFrom(ctx), args.id) });
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
      "shadowban_check",
      {
        title: "TikTok shadowban / throttling check",
        description:
          "Tell whether the connected TikTok account(s), or any public account given by handle, are shadowbanned or throttled: a 0-100 probability per account, the distribution-round histogram (R0-R4) behind it, the spam/automation signals found (burst posting, duplicate captions, repeated hashtags, zero-view posts), whether the account is throttled (engagement >=1%) or the content fails the seed test (<1%), the last-10 vs previous-10 trend, and a fix list. Use when the user asks 'am I shadowbanned', 'why did my reach drop', 'why 200 views', or is about to abandon/recreate an account. Present it as a diagnosis with a table, not raw JSON.",
        inputSchema: z.object({
          handle: z.string().optional().describe("Check a public TikTok account by @handle or profile URL instead of the connected ones (one-off, nothing stored)."),
        }),
      },
      async (args, ctx) => {
        try {
          return text(await agentShadowbanCheck(userFrom(ctx), args.handle?.trim() || undefined));
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
      "Use start_scrollshow for the first-carousel workflow. Read whoami and get_content_brief; inspect list_posts to avoid duplicates. Drafting does not authorize scheduling, publication, deletion or public sharing. Confirm writes only from successful tool responses and inspect existing posts before retrying uncertain writes. Never request API keys in chat. " +
      "Always answer the user in their own language, the one they write to you in; most ScrollShow users write French. You are connected to the user's ScrollShow workspace. Create, schedule, and publish TikTok photo carousels, read analytics, search the research library, and write reports. Call whoami first: it returns the user's business profile (name, kind, link, keywords, goal, TikTok stats) that every carousel must be written for, and whether TikTok is connected. Marketplace: import_tiktok copies a public TikTok (slides + caption). The copy is NOT editable yet — text is baked into the JPEGs. Call reconstruct_post (or import_tiktok with reconstruct=true) to decompose each slide into background + text overlays, then update_recipe to change texts, fonts or images. list_marketplace lists private or public formats. Use create_post to draft or schedule. Use publish_now with the post id when they asked to publish now (it rasterizes editable overlays). Prefer get_report when they want a full picture. Present findings in plain language with tables, not raw JSON dumps.",
  },
);

/**
 * Deux porteurs valides : un jeton OAuth (voie normale, l'agent l'obtient seul)
 * ou une cle `ss_live_` (comptes crees avant OAuth). Aucun jeton n'est accepte
 * dans l'URL : la specification l'interdit, et une URL fuit dans les journaux.
 */
async function userFromToken(token: string) {
  if (!token) return null;
  const granted = await resolveAccessToken(token, MCP_RESOURCE);
  if (granted) {
    const { readStore } = await import("@/lib/store");
    const data = await readStore();
    const item = data.users.find((entry) => entry.id === granted.userId);
    if (!item || item.deletionPendingAt || !item.emailVerifiedAt) return null;
    return publicUser(item);
  }
  return resolveApiKey(token);
}

async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  const token = bearerToken?.trim();
  if (!token) return undefined;
  const user = await userFromToken(token);
  if (!user || !hasStudioAccess(user.plan)) return undefined;
  if (!(await consumeLimit(`api:${user.id}`, 120, 60000))) return undefined;
  return {
    token,
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

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io").replace(/\/$/, "");

/** A refusal the agent can act on: say what is missing and where the user fixes it. */
function refuse(status: number, error: string, message: string, action: string) {
  const res = NextResponse.json({ error, message, action }, { status });
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set(
    "WWW-Authenticate",
    `Bearer realm="scrollshow", error="${error}", error_description="${message}", ` +
      `resource_metadata="${SITE}/.well-known/oauth-protected-resource", scope="${OAUTH_SCOPE}"`,
  );
  return res;
}

/** Installer le skill est gratuit ; appeler un outil demande un acces actif. */
async function gate(request: Request) {
  const token = headerToken(request);
  if (!token) return null; // aucun porteur : la couche MCP repond son defi de decouverte
  const user = await userFromToken(token);
  if (!user) {
    return refuse(401, "invalid_token", "This ScrollShow authorization is unknown, expired or was revoked.", `Open ${SITE}/connect for the user and say you did. Give the one action for their host in a single line (Claude Code: /mcp then scrollshow then Authenticate). Then hand the turn back and ask them to reply with one word when it is validated, because nothing will tell you on its own; do not poll and do not retry in a loop. Never ask the user for a key in chat, and never build an authorization URL yourself.`);
  }
  if (!hasStudioAccess(user.plan)) {
    return refuse(402, "payment_required", "This ScrollShow account has no active access, so the tools stay locked.", `The authorization itself worked: say so first, starting the line with a green check mark. Then tell the user the account still needs an active plan, and open ${SITE}/pricing for them (open on macOS, xdg-open on Linux, start on Windows) — say you just opened it, and name the two offers: 29 EUR per month, or 99 EUR once for life. The account is ${user.email}. The authorization stays valid: the tools unlock by themselves as soon as the payment is confirmed, so do not reinstall anything, do not ask for a key, and do not retry in a loop — just invite them to come back to you once it is done.`);
  }
  return null;
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") return agentOptions();
  const refusal = await gate(request);
  if (refusal) return refusal;
  return authHandler(request);
}

export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS };
