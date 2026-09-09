import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";

export function isPublicAddress(address: string) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress()) ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === "unicast";
  } catch { return false; }
}

/** DNS is resolved once and pinned to the socket; every redirect is validated. */
export async function safeFetchBytes(input: string | URL, options: { maxBytes?: number; headers?: Record<string, string>; timeoutMs?: number; method?: "GET" | "HEAD" } = {}) {
  let url = new URL(input);
  const deadline = Date.now() + (options.timeoutMs || 10000);
  const maxBytes = options.maxBytes || 15_000_000;
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443"].includes(url.port))) throw new Error("unsafe_url");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const answers = await lookup(host, { all: true });
    if (!answers.length || answers.some(a => !isPublicAddress(a.address))) throw new Error("unsafe_url");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("fetch_timeout");
    const answer = answers[0];
    const result = await new Promise<{ status: number; location?: string; bytes: Buffer; contentType: string; contentLength?: number }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).get(url, {
        method: options.method || "GET",
        headers: { ...options.headers, "Accept-Encoding": "identity" },
        // Node's autoSelectFamily asks for `all`: it then expects a list, and
        // answering with a bare string leaves the socket without an address.
        lookup: (_host, opts, callback) =>
          (opts as { all?: boolean })?.all
            ? (callback as unknown as (err: null, addresses: { address: string; family: number }[]) => void)(null, [
                { address: answer.address, family: answer.family },
              ])
            : callback(null, answer.address, answer.family),
      }, response => {
        const chunks: Buffer[] = [];
        let size = 0;
        if (options.method !== "HEAD" && Number(response.headers["content-length"]) > maxBytes) { request.destroy(new Error("response_too_large")); return; }
        if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
          response.resume();
          resolve({ status: response.statusCode!, location: response.headers.location, bytes: Buffer.alloc(0), contentType: "" });
          return;
        }
        response.on("data", chunk => {
          size += chunk.length;
          if (size > maxBytes) request.destroy(new Error("response_too_large"));
          else chunks.push(Buffer.from(chunk));
        });
        response.on("error", reject);
        response.on("end", () => resolve({ status: response.statusCode || 502, bytes: Buffer.concat(chunks), contentType: String(response.headers["content-type"] || ""), contentLength: response.headers["content-length"] === undefined ? undefined : Number(response.headers["content-length"]) }));
      });
      const timer = setTimeout(() => request.destroy(new Error("fetch_timeout")), remaining);
      request.on("close", () => clearTimeout(timer));
      request.on("error", reject);
    });
    if (result.location) { url = new URL(result.location, url); continue; }
    if (result.status < 200 || result.status >= 300) throw new Error(`upstream_${result.status}`);
    return { ...result, url: url.toString() };
  }
  throw new Error("too_many_redirects");
}
