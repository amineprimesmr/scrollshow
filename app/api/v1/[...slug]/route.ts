import {
  agentAnalytics,
  agentCreatePost,
  agentDeletePost,
  agentForkPost,
  agentGetAccount,
  agentGetRecipe,
  agentImportTikTok,
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
import { after, NextResponse } from "next/server";
import { discoverResearchAccounts, researchLibrary, contentBrief, researchSchema } from "@/lib/research";

import { startResearch, workResearch, listResearchJobs, getResearchJob, advanceResearch, controlResearch } from "@/lib/research/jobs";
import { prepareStudy, advanceStudy, getStudy, saveInterpretation, formatLibrary, exportStudy } from "@/lib/research/formats";
import { filtersSchema } from "@/lib/research/model";
import { extractTikTokHandle, findShortLink } from "@/lib/library-add";
import { ImportError } from "@/lib/tiktok-import";
export const maxDuration = 300;

export function OPTIONS() {
  return agentOptions();
}

export async function GET(request: Request, context: { params: Promise<{ slug?: string[] }> }) {
  try {
    const user = await requireAgentUser(request);
    const { slug = [] } = await context.params;
    const [head, id] = slug;
    const url = new URL(request.url);
    if (head === "research" && !id) return agentResponse({ items: await researchLibrary(user, url.searchParams.get("q") || "") });
    if(head==="research-jobs") return agentResponse(id?await getResearchJob(user,id):{jobs:await listResearchJobs(user)});
    if(head==="format-studies"&&id&&slug[2]==="export") return new NextResponse(Buffer.from(await exportStudy(user,id)),{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="research-${id}.zip"`,"Cache-Control":"private, no-store"}});
    if(head==="format-studies") return agentResponse(id?await getStudy(user,id):await formatLibrary(user));
    if (head === "brief" && !id) return agentResponse(await contentBrief(user));
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
    if (head === "library" && !id) {
      // Raccourci iOS (Partager -> ScrollShow) : un post (video, carrousel ou
      // lien court) est importe dans la Bibliotheque, comme « Importer un TikTok ».
      const raw = String(body.url || body.text || "").slice(0, 2000);
      const english = String(request.headers.get("accept-language") || "").toLowerCase().startsWith("en");
      const postUrl = raw.match(/https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[^\s/]+\/(?:video|photo)\/\d+[^\s]*/i)?.[0] || findShortLink(raw);
      if (!postUrl) {
        const profile = extractTikTokHandle(raw);
        const message = profile
          ? english ? `@${profile} is a profile: share one of its posts (video or carousel) to import it.` : `@${profile} est un profil : partage un de ses posts (video ou carrousel) pour l'importer.`
          : english ? "No TikTok post found in what was shared." : "Aucun post TikTok trouve dans ce qui a ete partage.";
        return agentResponse({ error: "invalid", message }, 400);
      }
      try {
        const post = await agentImportTikTok(user, { url: postUrl, visibility: "private" });
        const author = post.authorHandle ? `@${post.authorHandle}` : "TikTok";
        return agentResponse({ post, message: english ? `${author} post imported into your Library.` : `Post de ${author} importe dans ta Bibliotheque.` }, 201);
      } catch (error) {
        if (error instanceof ImportError) return agentResponse({ error: error.message, message: english ? "Import failed: this post could not be read." : "Import impossible : ce post n'a pas pu etre lu." }, 400);
        throw error;
      }
    }
    if (head === "research" && !id) {
      const parsed = researchSchema.safeParse(body);
      if (!parsed.success) return agentResponse({ error: "invalid" }, 400);
      const job=parsed.data.action==="analyze"?await startResearch(user,{kind:"analyze",keywords:[parsed.data.query]}):await discoverResearchAccounts(user,parsed.data.query);
      after(()=>workResearch(user,job.id));return agentResponse(job,202);
    }
    if(head==="research-jobs") {
      if(!id){const job=await startResearch(user,body);if(job.input.source==="provider")after(()=>workResearch(user,job.id));return agentResponse(job,202);}
      if(body.action==="advance")return agentResponse(await advanceResearch(user,id));
      if(!["pause","resume","stop"].includes(body.action))return agentResponse({error:"invalid_action"},400);
      const job=await controlResearch(user,id,body.action,body.filters?filtersSchema.partial().parse(body.filters):undefined);
      if(body.action==="resume"&&job.input.source==="provider")after(()=>workResearch(user,id));return agentResponse(job);
    }
    if(head==="format-studies") {
      if(id&&body.interpretation)return agentResponse(await saveInterpretation(user,id,body.interpretation));
      const studyId=id||(await prepareStudy(user,String(body.accountId||""),String(body.postId||""))).id;
      return agentResponse(await advanceStudy(user,studyId));
    }
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
            tiktok: body.tiktok,
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
          id: body.id,
          channelId: body.channelId || body.channel_id,
          photo_images: body.photo_images,
          image: body.image,
          privacy_level: String(body.privacy_level || ""),
          allow_comment: body.allow_comment === true || body.disable_comment === false,
          commercial_content: Boolean(body.commercial_content),
          brand_organic: Boolean(body.brand_organic),
          brand_content: Boolean(body.brand_content),
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
        tiktok: body.tiktok,
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
