import { signupUrl } from "@/lib/auth-urls";
import { hasStudioAccess } from "@/lib/plans";
import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/app", "/api/accounts", "/api/runs", "/api/studio", "/api/tiktok", "/api/keys", "/api/push"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (process.env.MAINTENANCE_MODE === "1") {
    return new NextResponse(pathname.startsWith("/api/") ? JSON.stringify({error:"maintenance"}) : "ScrollShow est en cours de mise à jour. Merci de réessayer dans quelques minutes.", {status:503,headers:{"Retry-After":"300","Cache-Control":"no-store","Content-Type":pathname.startsWith("/api/")?"application/json":"text/plain; charset=utf-8"}});
  }
  if (pathname === "/api/tiktok/oauth/start") return NextResponse.next();
  const token = request.cookies.get("ss_session")?.value;
  const secret = process.env.AUTH_SECRET;

  // Déjà connecté : /signup n'a rien à montrer. On envoie directement dans
  // l'espace, sans repasser par l'écran Google. `?force=1` laisse la porte
  // ouverte pour se connecter avec un autre compte.
  if (pathname === "/signup" && token && secret && !request.nextUrl.searchParams.has("force")) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      const next = request.nextUrl.searchParams.get("next");
      const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
      return NextResponse.redirect(new URL(dest, request.url));
    } catch {
      // Jeton invalide : on laisse la page d'inscription s'afficher.
    }
  }

  const needsAuth = PROTECTED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!needsAuth) return NextResponse.next();

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
    // Current entitlements are checked by the Node route/layout against storage.
    // JWT claims may be stale after checkout, cancellation or revocation.
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
