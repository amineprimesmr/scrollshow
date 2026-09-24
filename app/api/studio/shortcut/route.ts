import { readStudioSession as readSession } from "@/lib/auth";
import { AgentError } from "@/lib/agent";
import { consumeLimit } from "@/lib/rate-limit";
import { cancelRecreation, saveShortcutMode, removeTrigger, retryRecreation, saveTrigger, shortcutStatus, testTrigger } from "@/lib/shortcut-recreate";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

const privateHeaders = { "Cache-Control": "private, no-store" };
const english = (request: Request) => new URL(request.url).searchParams.get("lang") === "en";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), url: z.string().min(10).max(300), token: z.string().min(10).max(400) }),
  z.object({ action: z.literal("remove") }),
  z.object({ action: z.literal("mode"), mode: z.enum(["ask", "recreate", "save"]) }),
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("retry"), id: z.string().min(4).max(80) }),
  z.object({ action: z.literal("cancel"), id: z.string().min(4).max(80) }),
]);

/** Etat du raccourci : agent connecte, routine Claude, dernieres demandes. Le jeton de routine ne sort jamais. */
export async function GET(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
  return NextResponse.json(await shortcutStatus(user, english(request)), { headers: privateHeaders });
}

export async function POST(request: Request) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: privateHeaders });
  const input = parsed.data;
  // Un test ou une relance lance une session Claude payee par l'utilisateur : pas de rafale.
  if ((input.action === "test" || input.action === "retry") && !(await consumeLimit(`shortcut-fire:${user.id}`, 10, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: privateHeaders });
  }
  try {
    let result: unknown = { ok: true };
    if (input.action === "save") await saveTrigger(user, input.url, input.token);
    if (input.action === "remove") await removeTrigger(user);
    if (input.action === "mode") await saveShortcutMode(user, input.mode);
    if (input.action === "test") result = await testTrigger(user);
    if (input.action === "retry") result = await retryRecreation(user, input.id, english(request));
    if (input.action === "cancel") await cancelRecreation(user, input.id);
    return NextResponse.json({ result, status: await shortcutStatus(user, english(request)) }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof AgentError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    throw error;
  }
}
