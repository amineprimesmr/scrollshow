import type { CSSProperties } from "react";

import { ConnectorRegistry } from "@/components/ConnectorRegistry";

const connections = [
  { name: "TikTok", detail: "ton canal de diffusion", image: "/assets/platforms/tiktok.png", color: "#69e5de" },
  { name: "Claude", detail: "ton agent IA", image: "/assets/ai/claude.png", color: "#dba38c" },
  { name: "Codex", detail: "ton agent IA", image: "/assets/ai/codex.png", color: "#e2e4ed" },
  { name: "Cursor", detail: "ton espace de code", image: "/assets/ai/cursor.png", color: "#a9b8e7" },
  { name: "Instagram", detail: "tes carrousels ailleurs", image: "/assets/platforms/instagram.png", color: "#e7a0c4" },
  { name: "YouTube", detail: "tes formats longs", image: "/assets/platforms/youtube.svg", color: "#f08a8a" },
  { name: "Snapchat", detail: "ton audience mobile", image: "/assets/platforms/snapchat.png", color: "#f5e08a" },
  { name: "Reddit", detail: "les sujets qui montent", image: "/assets/platforms/reddit.png", color: "#f0a878" },
  { name: "Telegram", detail: "tes alertes de publication", image: "/assets/platforms/telegram.svg", color: "#8fc9ee" },
  { name: "Google Reviews", detail: "la preuve sociale", image: "/assets/platforms/google-reviews.png", color: "#9bb8f0" },
  { name: "Apify", detail: "la donnée des créateurs", image: "/assets/platforms/apify.svg", color: "#f0b078" },
  { name: "ElevenLabs", detail: "les voix de tes vidéos", image: "/assets/platforms/elevenlabs.svg", color: "#d4d4d8" },
  { name: "TikTok Shop", detail: "tes produits en ligne", image: "/assets/platforms/tiktok-shop.svg", color: "#f08aa0" },
  { name: "SEO & GEO", detail: "ta visibilité en recherche", image: "/assets/platforms/seo.svg", color: "#8fd4a8" },
  { name: "Web Search", detail: "explore ta niche", icon: "search", color: "#9bafff" },
];

const paths: Record<string, string> = {
  browser: "M4 5h24v22H4z M4 11h24 M8 8h.01 M12 8h.01",
  search: "M22 22l7 7 M25 14a11 11 0 1 1-22 0 11 11 0 0 1 22 0",
  users: "M20 10a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M5 28v-3a9 9 0 0 1 18 0v3 M24 6a5 5 0 0 1 0 10 M27 20a7 7 0 0 1 3 6",
  layers: "M16 3 2 11l14 8 14-8z M2 17l14 8 14-8 M2 23l14 8 14-8",
  library: "M4 5h6v23H4z M13 5h6v23h-6z M23 6l5-1 4 22-5 1z",
  image: "M4 4h24v24H4z M4 23l8-8 6 6 4-4 6 6 M23 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  document: "M7 3h12l6 6v20H7z M19 3v7h6 M11 16h10 M11 21h10",
  slides: "M8 5h17v23H8z M3 10v15 M30 10v15 M12 20l3-4 6 7",
  calendar: "M4 7h24v22H4z M4 14h24 M10 3v8 M22 3v8 M10 20h2 M20 20h2 M10 25h2",
  send: "M29 3 3 14l10 5 5 10z M13 19 29 3",
  chart: "M4 4v24h25 M10 22v-7 M17 22V8 M24 22V3",
  plug: "M11 3v8 M21 3v8 M7 11h18v4a9 9 0 0 1-18 0z M16 24v7",
};

export function LandingConnections() {
  return (
    <section className="af-connections" aria-label="Les agents et les outils de ScrollShow">
      <svg className="af-connections__wires" viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="connection-wire" gradientUnits="userSpaceOnUse" x1="500" y1="0" x2="500" y2="100">
            <stop stopColor="#9fafff" stopOpacity=".85" />
            <stop offset="1" stopColor="#aaa4c0" stopOpacity=".16" />
          </linearGradient>
        </defs>
        {[100, 300, 500, 700, 900].map((x) => (
          <g key={x}>
            <path d={`M500 0 C500 53 ${x} 45 ${x} 100`} stroke="url(#connection-wire)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            <path className="af-connections__pulse" d={`M500 0 C500 53 ${x} 45 ${x} 100`} pathLength="100" stroke="#b1baff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
      <ul className="af-connections__grid">
        {connections.map((item, i) => (
          <li className="af-connections__card" key={item.name} style={{ "--card-accent": item.color, "--card-delay": `${i * 35}ms` } as CSSProperties}>
            <span className="af-connections__icon" aria-hidden="true">
              {item.image ? <img src={item.image} alt="" width={32} height={32} /> : <svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[item.icon!]} /></svg>}
            </span>
            <span className="af-connections__copy"><strong>{item.name}</strong><span>{item.detail}</span></span>
          </li>
        ))}
      </ul>
      <ConnectorRegistry />
      <a className="af-connections__footer" href="#comment">
        <strong>Un agent. Tout ton workflow.</strong>
        <span>Découvre comment ça marche <span aria-hidden="true">→</span></span>
      </a>
    </section>
  );
}
