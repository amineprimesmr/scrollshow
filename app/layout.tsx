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
    default: "ScrollShow — Connect TikTok, publish carousels",
    template: "%s · ScrollShow",
  },
  description:
    "ScrollShow connects TikTok via Login Kit and publishes photo carousels with the Content Posting API.",
  icons: { icon: "/favicon.svg", apple: "/icon-1024.png" },
  openGraph: {
    title: "ScrollShow",
    description: "Connect TikTok. Preview carousels. Set privacy. Publish. View stats.",
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
