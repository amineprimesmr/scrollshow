import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
      { source: "/api/mcp", headers: cors },
      { source: "/api/v1/:path*", headers: cors },
    ];
  },
};

export default nextConfig;
