import { headers } from "next/headers";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { prefersEnglish, t } from "@/lib/i18n";
import "@/app/legal.css";

export async function LegalShell({
  titleFr,
  titleEn,
  childrenFr,
  childrenEn,
}: {
  titleFr: string;
  titleEn: string;
  childrenFr: React.ReactNode;
  childrenEn: React.ReactNode;
}) {
  const english = prefersEnglish((await headers()).get("accept-language"));
  return (
    <main className="ss-legal">
      <div className="ss-legal__inner">
        <Link href="/" className="ss-legal__brand">
          <BrandMark size={36} />
          <span>ScrollShow</span>
        </Link>
        <h1>{t(titleFr, titleEn, english)}</h1>
        <p className="ss-legal__meta">
          {t("Dernière mise à jour : 23 août 2026", "Last updated: August 23, 2026", english)} ·{" "}
          <Link href="/">{t("Accueil", "Home", english)}</Link> ·{" "}
          <Link href="/terms">{t("Conditions", "Terms", english)}</Link> ·{" "}
          <Link href="/privacy">{t("Confidentialité", "Privacy", english)}</Link> ·{" "}
          <Link href="/support">Support</Link>
        </p>
        {english ? childrenEn : childrenFr}
      </div>
    </main>
  );
}
