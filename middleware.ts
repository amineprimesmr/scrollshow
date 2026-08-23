import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/app", "/api/accounts", "/api/runs", "/api/studio", "/api/tiktok"];

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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
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
  ],
};
