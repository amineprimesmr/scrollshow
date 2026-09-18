/**
 * Atmosphere du hero de la landing, reprise a l'identique comme fond des pages
 * du studio. Styles : app/atmosphere.css. A ne pas confondre avec
 * `components/Atmosphere.tsx` (couche fixe plein ecran de l'inscription et de
 * l'onboarding, classes `.ss-atmo`).
 */
export function HeroAtmosphere({ className }: { className?: string }) {
  return (
    <div className={`af-ld-atmosphere${className ? ` ${className}` : ""}`} aria-hidden="true">
      <div className="af-ld-atmosphere__light af-ld-atmosphere__light--cobalt" />
      <div className="af-ld-atmosphere__light af-ld-atmosphere__light--ice" />
      <div className="af-ld-atmosphere__wave af-ld-atmosphere__wave--near" />
      <div className="af-ld-atmosphere__wave af-ld-atmosphere__wave--far" />
      <div className="af-ld-atmosphere__shade" />
      <div className="af-ld-atmosphere__grain" />
    </div>
  );
}
