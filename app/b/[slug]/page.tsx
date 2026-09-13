import { notFound } from "next/navigation";
import { findPublicBio, listRecords } from "@/lib/business-analytics/repository";
import { scopeIsLive } from "@/lib/business-analytics/tracking";
import { readStoreSlice } from "@/lib/store";
import { publicDestination } from "@/lib/business-analytics/validation";
import "../bio.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Links · ScrollShow", robots: { index: false, follow: true } };
export default async function BusinessBioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) notFound();
  const settings = await findPublicBio(slug);
  if (!settings || !await scopeIsLive(settings)) notFound();
  const [links, publications, store] = await Promise.all([listRecords(settings, "links", { limit: 100 }), listRecords(settings, "publications", { limit: 1000 }), readStoreSlice([])]);
  const project = store.projects?.find(p => p.userId === settings.userId && p.id === settings.projectId);
  if (!project) notFound();
  const name = project.business?.name || project.name; const logo = project.logo || project.business?.logo;
  let logoUrl: string | null = null;
  try { if (logo) logoUrl = publicDestination(logo); } catch {}
  return <main className="ss-bio"><div className="ss-bio-halo" aria-hidden="true" /><header>
    {logoUrl ? <img src={logoUrl} alt="" width={80} height={80} referrerPolicy="no-referrer" /> : <div className="ss-bio-monogram" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>}
    <h1>{name}</h1>{project.business?.tagline && <p>{project.business.tagline}</p>}
  </header><nav aria-label="Links" className="ss-bio-links">
    {links.filter(l => l.active).map(link => { const publication = publications.find(p => p.id === link.publicationId); return <a key={link.id} href={`/go/${link.slug}`} className="ss-bio-link"><span>{link.label}<small>{publication?.title}</small></span><span aria-hidden="true">↗</span></a>; })}
    {!links.some(l => l.active) && <p>De nouveaux liens arrivent bientôt. New links are coming soon.</p>}
  </nav><footer><a href="https://scrollshow.io">Made with ScrollShow</a><p>Les ouvertures de liens peuvent être mesurées pour comprendre les résultats du contenu. Aucun cookie n’est placé sur cette page.</p></footer></main>;
}
