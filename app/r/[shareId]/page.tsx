import { findPostByShareId } from "@/lib/agent";
import { BrandMark } from "@/components/BrandMark";
import { SlidePreview } from "@/components/studio/SlidePreview";
import { ensureRecipe, GOOGLE_FONTS_HREF, publicRecipe, recipeJsonUrl } from "@/lib/recipe";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "./share.css";

type Params = { params: Promise<{ shareId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { shareId } = await params;
  const post = await findPostByShareId(shareId);
  if (!post) return { title: "TikTok introuvable" };
  return {
    title: post.body.slice(0, 60) || "TikTok ScrollShow",
    description: "Source exacte d’un carrousel ScrollShow — police, slides, textes.",
  };
}

export default async function Page({ params }: Params) {
  const { shareId } = await params;
  const post = await findPostByShareId(shareId);
  if (!post) notFound();
  const recipe = ensureRecipe(post);
  const payload = publicRecipe(post);
  const jsonUrl = recipeJsonUrl(shareId);

  return (
    <main className="ss-share">
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      <header className="ss-share__top">
        <a href="/" className="ss-share__brand" aria-label="ScrollShow">
          <BrandMark size={32} />
          ScrollShow
        </a>
        <span>Marketplace</span>
      </header>
      <section className="ss-share__hero">
        <p className="ss-share__kicker">{recipe.editable ? "TikTok éditable" : post.origin === "import" ? "Import brut" : "TikTok source"}</p>
        <h1>{post.body || "Carrousel ScrollShow"}</h1>
        <p>
          {recipe.editable
            ? `Ceci est le TikTok recréé en calques éditables — police ${recipe.fontFamily}, textes dans overlays. Modifier les textes puis update_recipe. Ne pas réimporter l’image originale.`
            : post.origin === "import"
            ? "Import brut : le texte est encore dans les JPEG. Appelle reconstruct_post pour recréer des calques éditables, puis update_recipe."
            : `Ceci est le code exact du TikTok — même police (${recipe.fontFamily}), mêmes slides, mêmes textes. Ne pas recréer un modèle. Modifier uniquement ce qui est demandé, puis enregistrer avec update_recipe.`}
        </p>
        <p className="ss-share__meta">
          {recipe.slides.length} slides
          {post.authorHandle ? ` · @${post.authorHandle}` : ""}
          {post.views ? ` · ${post.views.toLocaleString("fr-FR")} vues` : ""}
          {post.origin === "import" ? " · importé" : post.origin === "ai" ? " · IA" : " · manuel"}
        </p>
        {post.tiktokUrl ? (
          <p className="ss-share__meta">
            <a href={post.tiktokUrl} target="_blank" rel="noreferrer">
              {post.tiktokUrl}
            </a>
          </p>
        ) : null}
      </section>
      <div className="ss-share__slides">
        {recipe.slides.map((slide, index) => (
          <figure key={slide.id}>
            <SlidePreview slide={slide} recipe={recipe} width={220} original={Boolean(slide.keepPhoto)} />
            <figcaption>Slide {index + 1}</figcaption>
          </figure>
        ))}
      </div>
      <section className="ss-share__box">
        <h2>Pour l’IA</h2>
        <ol>
          <li>
            Récupère le JSON : <code>{jsonUrl}</code>
          </li>
          <li>
            Ou MCP ScrollShow : <code>get_recipe</code> avec id <code>{post.id}</code> / shareId <code>{shareId}</code>
          </li>
          <li>
            {recipe.editable
              ? "Les textes sont dans overlays — update_recipe pour les changer, puis publish_now avec id pour rasterizer"
              : post.origin === "import"
              ? "Appelle reconstruct_post avant de modifier les textes (ils sont encore dans le JPEG)"
              : "Garde fontFamily, positions des overlays, html et css"}
          </li>
          <li>
            Applique les changements avec <code>update_recipe</code> — ne régénère pas un nouveau TikTok
          </li>
        </ol>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </section>
      <script type="application/json" id="scrollshow-recipe" dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }} />
    </main>
  );
}

export const dynamic = "force-dynamic";
