"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main style={{ maxWidth: 560, margin: "15vh auto", padding: 24, textAlign: "center" }}>
    <h1>Ton espace est momentanément indisponible</h1>
    <p>Nous n’avons pas pu charger les données. Ta session est conservée.</p>
    <button type="button" onClick={reset}>Réessayer</button>
  </main>;
}
