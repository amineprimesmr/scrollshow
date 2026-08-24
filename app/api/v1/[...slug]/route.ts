import {
  agentAnalytics,
  agentCreatePost,
  agentDeletePost,
  agentForkPost,
  agentGetAccount,
  agentGetRecipe,
  agentLibrary,
  agentListPosts,
  agentMedia,
  agentChannels,
  agentPublish,
  agentReconstructPost,
  agentReport,
  agentUpdatePost,
  agentUpdateRecipe,
  agentWhoami,
} from "@/lib/agent";
import { agentCatch, agentOptions, agentResponse, requireAgentUser } from "@/lib/agent-http";
import { NextResponse } from "next/server";

export const maxDuration = 120;

export function OPTIONS() {
  return agentOptions();
}

export async function GET(request: Request, context: { params: Promise<{ slug?: string[] }> }) {
  try {
    const user = await requireAgentUser(request);
    const { slug = [] } = await context.params;
    const [head, id] = slug;
    const url = new URL(request.url);
    if (head === "me" && !id) return agentResponse(await agentWhoami(user));
    if (head === "channels" && !id) return agentResponse({ channels: await agentChannels(user) });
    if (head === "media" && !id) return agentResponse({ media: await agentMedia(user) });
    if (head === "posts" && !id) {
      const status = url.searchParams.get("status") as "draft" | "scheduled" | "published" | null;
      return agentResponse({ posts: await agentListPosts(user, status || undefined) });
    }
    if (head === "analytics" && !id) return agentResponse(await agentAnalytics(user));
    if (head === "report" && !id) return agentResponse(await agentReport(user));
    if (head === "library" && !id) {
      return agentResponse({
        accounts: await agentLibrary(user, url.searchParams.get("q") || "", url.searchParams.get("verdict") || ""),
      });
    }
    if (head === "library" && id) return agentResponse({ account: await agentGetAccount(user, id) });
    if (head === "posts" && id === "recipe" ) return agentResponse({ error: "not_found" }, 404);
    if (head === "posts" && id) {
      return agentResponse(await agentGetRecipe(user, id));
    }
    if (head === "recipe" && id) return agentResponse(await agentGetRecipe(user, id));
    return agentResponse({ error: "not_found" }, 404);
  } catch (error) {
    return agentCatch(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug?: string[] }> }) {
  try {
    const user = await requireAgentUser(request);
    const { slug = [] } = await context.params;
    const [head, id] = slug;
    const body = await request.json().catch(() => ({}));
    if (head === "posts" && !id) {
      return agentResponse(
        {
          post: await agentCreatePost(user, {
            caption: String(body.caption || body.body || ""),
            channelId: body.channelId || body.channel_id,
            date: body.date,
            time: body.time,
            status: body.status,
            image: body.image,
            photo_images: body.photo_images,
            origin: body.origin,
            recipe: body.recipe,
          }),
        },
        201,
      );
    }
    if (head === "posts" && id === "fork") {
      return agentResponse({ error: "not_found" }, 404);
    }
    if (head === "posts" && id && body.fork) {
      return agentResponse({ post: await agentForkPost(user, id) }, 201);
    }
    if (head === "posts" && slug[2] === "reconstruct" && id) {
      return agentResponse({ post: await agentReconstructPost(user, id) });
    }
    if (head === "posts" && slug[2] === "fork" && id) {
      return agentResponse({ post: await agentForkPost(user, id) }, 201);
    }
    if (head === "recipe" && id) {
      return agentResponse(await agentUpdateRecipe(user, id, body));
    }
    if (head === "publish" && !id) {
      return agentResponse(
        await agentPublish(user, {
          caption: String(body.caption || body.description || body.body || ""),
          title: body.title,
          photo_images: body.photo_images,
          image: body.image,
          privacy_level: body.privacy_level,
          disable_comment: body.disable_comment,
        }),
      );
    }
    return agentResponse({ error: "not_found" }, 404);
  } catch (error) {
    return agentCatch(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ slug?: string[] }> }) {
  try {
    const user = await requireAgentUser(request);
    const { slug = [] } = await context.params;
    const [head, id] = slug;
    if (head !== "posts" || !id) return agentResponse({ error: "not_found" }, 404);
    const body = await request.json().catch(() => ({}));
    return agentResponse({
      post: await agentUpdatePost(user, id, {
        caption: body.caption || body.body,
        date: body.date,
        time: body.time,
        status: body.status,
        channelId: body.channelId || body.channel_id,
        image: body.image,
        photo_images: body.photo_images,
        recipe: body.recipe,
      }),
    });
  } catch (error) {
    return agentCatch(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ slug?: string[] }> }) {
  try {
    const user = await requireAgentUser(request);
    const { slug = [] } = await context.params;
    const [head, id] = slug;
    if (head !== "posts" || !id) return agentResponse({ error: "not_found" }, 404);
    return agentResponse(await agentDeletePost(user, id));
  } catch (error) {
    return agentCatch(error);
  }
}

export async function PUT() {
  return NextResponse.json({ error: "method" }, { status: 405 });
}
