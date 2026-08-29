import { readSession } from "@/lib/auth";
import { prefersEnglish, t } from "@/lib/i18n";
import { pushConfigured, sendPushToUser } from "@/lib/push";
import { readStore } from "@/lib/store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 400 });

  const data = await readStore();
  const user = data.users.find((item) => item.id === session.id);
  const english = user?.settings?.locale ? user.settings.locale === "en" : prefersEnglish(request.headers.get("accept-language"));

  const { sent } = await sendPushToUser(session.id, {
    title: "ScrollShow",
    body: t("Notification de test — tout fonctionne.", "Test notification — everything works.", english),
    tag: "test",
  });
  if (!sent) return NextResponse.json({ error: "no_subscription" }, { status: 404 });
  return NextResponse.json({ ok: true, sent });
}
