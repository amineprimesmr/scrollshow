import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const viewport: Viewport = {
  themeColor: "#000000",
};

const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://scrollshow.io"),
  title: {
    default: "ScrollShow — Connect TikTok, publish carousels",
    template: "%s · ScrollShow",
  },
  description:
    "ScrollShow connects TikTok via Login Kit and publishes photo carousels with the Content Posting API.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-1024.png", sizes: "1024x1024", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/icon-1024.png", sizes: "1024x1024" },
    ],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "ScrollShow",
    description: "Connect TikTok. Preview carousels. Set privacy. Publish. View stats.",
    url: "https://scrollshow.io",
    siteName: "ScrollShow",
    locale: "fr_FR",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ScrollShow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScrollShow",
    description: "Connect TikTok. Preview carousels. Set privacy. Publish. View stats.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sans.variable} ${serif.variable}`}>
      <body className="antialiased grain">{children}</body>
    </html>
  );
}
