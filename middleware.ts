import { signupUrl } from "@/lib/auth-urls";
import { hasStudioAccess } from "@/lib/plans";
import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/app", "/api/accounts", "/api/runs", "/api/studio", "/api/tiktok", "/api/keys"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/tiktok/oauth/start") return NextResponse.next();
  const needsAuth = PROTECTED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get("ss_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const dest = signupUrl({
      mode: "signin",
      next: `${pathname}${request.nextUrl.search}`,
    });
    return NextResponse.redirect(new URL(dest, request.url));
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (!hasStudioAccess(typeof payload.plan === "string" ? payload.plan : undefined)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "payment_required" }, { status: 402 });
      }
      return NextResponse.redirect(new URL("/pricing", request.url));
    }
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const dest = signupUrl({
      mode: "signin",
      next: `${pathname}${request.nextUrl.search}`,
    });
    return NextResponse.redirect(new URL(dest, request.url));
  }
}

export const config = {
  matcher: [
    "/app",
    "/app/:path*",
    "/api/accounts",
    "/api/accounts/:path*",
    "/api/runs",
    "/api/runs/:path*",
    "/api/studio",
    "/api/studio/:path*",
    "/api/tiktok",
    "/api/tiktok/:path*",
    "/api/keys",
    "/api/keys/:path*",
  ],
};
