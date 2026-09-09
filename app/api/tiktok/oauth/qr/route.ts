import { readStudioSession as readSession } from "@/lib/auth";
import { consumeLimit } from "@/lib/rate-limit";
import { pollTikTokQr, qrFailure, resumeTikTokQr, startTikTokQr } from "@/lib/tiktok-qr-session";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const renderQr = (url: string) => QRCode.toString(url, { type: "svg", margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });

export async function POST(request: Request) {
  const timing = qrTiming();
  try {
    // A server-owned attempt is bound to the authenticated workspace, not to
    // a single mutable cookie shared by every browser tab.
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return timing.json({ error: "invalid_origin", retryable: false }, { status: 403 });
    const user = await timing.measure("session", readSession);
    if (!user) return timing.json({ error: "unauthorized", retryable: false }, { status: 401 });
    if (!(await consumeLimit(`tiktok-qr:${user.id}`, 10, 60_000))) {
      return timing.json({ error: "rate_limited", retryable: true, retryAfter: 60 }, { status: 429 });
    }
    const qr = await timing.measure("create", () => startTikTokQr(user));
    return timing.json({ id: qr.id, svg: await renderQr(qr.scanUrl), expiresAt: qr.expiresAt });
  } catch (error) { return qrError(error, timing); }
}

export async function GET(request: Request) {
  const timing = qrTiming();
  try {
    const user = await timing.measure("session", readSession);
    if (!user) return timing.json({ error: "unauthorized", retryable: false }, { status: 401 });
    const url = new URL(request.url);
    const parsed = z.string().uuid().safeParse(url.searchParams.get("id"));
    if (!parsed.success) {
      // An open tab from the previous release can safely request a new QR.
      if (url.searchParams.has("token")) return timing.json({ status: "expired" });
      return timing.json({ error: "invalid_attempt", retryable: false }, { status: 400 });
    }
    if (!(await consumeLimit(`tiktok-qr-poll:${user.id}`, 120, 60_000))) {
      return timing.json({ error: "rate_limited", retryable: true, retryAfter: 60 }, { status: 429 });
    }
    const progress = await timing.measure("progress", () => pollTikTokQr(user, parsed.data));
    if (url.searchParams.get("resume") === "1" && ["new", "scanned", "retrying"].includes(progress.status)) {
      const qr = await resumeTikTokQr(user, parsed.data);
      if (qr) return timing.json({ ...progress, svg: await renderQr(qr.scanUrl), expiresAt: qr.expiresAt });
    }
    return timing.json(progress);
  } catch (error) { return qrError(error, timing); }
}

function qrError(error: unknown, timing: ReturnType<typeof qrTiming>) {
  const failure = qrFailure(error);
  console.warn("tiktok_qr_route_failed", failure);
  return timing.json(failure, { status: 502 });
}

/** Expose durations, never tokens or account identifiers. */
function qrTiming() {
  const started = performance.now();
  const phases: string[] = [];
  return {
    async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try { return await work(); }
      finally { phases.push(`${name};dur=${(performance.now() - start).toFixed(1)}`); }
    },
    json(body: unknown, init: ResponseInit = {}) {
      const headers = new Headers(init.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("Vary", "Cookie");
      headers.set("Server-Timing", [...phases, `total;dur=${(performance.now() - started).toFixed(1)}`].join(", "));
      return NextResponse.json(body, { ...init, headers });
    },
  };
}
