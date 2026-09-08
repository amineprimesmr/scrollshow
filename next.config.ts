import path from "path";
import type { NextConfig } from "next";

const tessFiles = [
  "./node_modules/tesseract.js/**/*",
  "./node_modules/tesseract.js-core/**/*",
  "./node_modules/wasm-feature-detect/**/*",
  "./node_modules/@tesseract.js-data/eng/**/*",
  "./node_modules/sharp/**/*",
];

const nextConfig: NextConfig = {
  distDir: process.env.SCROLLSHOW_BUILD_DIR || ".next",
  reactStrictMode: true,
  // Keep client-side navigations within the studio instant: once a route's
  // RSC payload is fetched, reuse it instead of re-requesting on every click.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "wasm-feature-detect", "sharp"],
  outputFileTracingIncludes: {
    "/api/studio/posts/[id]/reconstruct": tessFiles,
    "/api/v1/[...slug]": tessFiles,
    "/api/mcp": tessFiles,
  },
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    const cors = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET, POST, PATCH, DELETE, OPTIONS" },
      { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version" },
    ];
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ] },
      { source: "/api/mcp", headers: cors },
      { source: "/api/v1/:path*", headers: cors },
    ];
  },
};

export default nextConfig;
