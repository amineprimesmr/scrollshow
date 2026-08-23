import { TikTokReview } from "@/components/TikTokReview";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TikTok review demo",
  description:
    "Public ScrollShow mockup of Login Kit + Content Posting API: profile, stats, video.list, upload, and publish.",
  robots: { index: true, follow: true },
};

export default function ReviewPage() {
  return <TikTokReview />;
}
