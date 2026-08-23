import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io"),
  title: {
    default: "ScrollShow — Research HQ for TikTok slideshows",
    template: "%s · ScrollShow",
  },
  description:
    "Trouve, analyse et classe les comptes TikTok photo-slideshow. ScrollShow est le QG de recherche des carrousels.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "ScrollShow",
    description: "Le QG de recherche des carrousels TikTok.",
    url: "https://scrollshow.io",
    siteName: "ScrollShow",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sans.variable} ${serif.variable}`}>
      <body className="antialiased grain">{children}</body>
    </html>
  );
}
