"use client";

import { useRef } from "react";

const poster = "/assets/scrollshow-demo-poster.png";

export function LandingDemo() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openPreview = () => dialogRef.current?.showModal();

  return (
    <div className="af-demo">
      <div className="af-demo__frame">
        <div className="af-demo__topbar" aria-hidden="true">
          <span className="af-demo__window-dots"><i /><i /><i /></span>
          <span>ScrollShow <span className="af-demo__separator">/</span> Le studio</span>
          <span className="af-demo__live-dot" />
        </div>
        <button className="af-demo__poster" onClick={openPreview} aria-label="Agrandir l’aperçu de ScrollShow — vidéo bientôt disponible">
          <img src={poster} alt="Aperçu du studio ScrollShow : comptes TikTok, carrousels et configuration de l’agent." width={2940} height={1674} loading="lazy" />
          <span className="af-demo__scrim" />
          <span className="af-demo__play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 5.7c0-.8.9-1.3 1.6-.9l9 5.4a1 1 0 0 1 0 1.7l-9 5.4c-.7.4-1.6-.1-1.6-.9V5.7Z" /></svg>
          </span>
          <span className="af-demo__poster-label" aria-hidden="true">Découvre le studio</span>
        </button>
        <div className="af-demo__controls">
          <span className="af-demo__status"><span /> Vidéo bientôt disponible</span>
          <span className="af-demo__track" aria-hidden="true"><i /></span>
          <button className="af-demo__expand" onClick={openPreview} aria-label="Agrandir la capture du studio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" /></svg>
          </button>
        </div>
      </div>
      <dialog ref={dialogRef} className="af-demo-dialog" aria-labelledby="af-demo-dialog-title" onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
        <div className="af-demo-dialog__content">
          <header>
            <div><h2 id="af-demo-dialog-title">Découvre ScrollShow</h2><p>Aperçu du studio · La vidéo de présentation arrive bientôt.</p></div>
            <button onClick={() => dialogRef.current?.close()} aria-label="Fermer l’aperçu" autoFocus>×</button>
          </header>
          <img src={poster} alt="Capture du studio ScrollShow en grand format." width={2940} height={1674} />
        </div>
      </dialog>
    </div>
  );
}
