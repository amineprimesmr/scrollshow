import "./atmosphere.css";

/** Fond anime du hero de la landing, en couche fixe plein ecran. */
export function Atmosphere() {
  return (
    <div className="ss-atmo" aria-hidden="true">
      <div className="ss-atmo__light ss-atmo__light--cobalt" />
      <div className="ss-atmo__light ss-atmo__light--ice" />
      <div className="ss-atmo__wave ss-atmo__wave--near" />
      <div className="ss-atmo__wave ss-atmo__wave--far" />
      <div className="ss-atmo__shade" />
      <div className="ss-atmo__grain" />
    </div>
  );
}
