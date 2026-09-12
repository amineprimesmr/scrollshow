"use client";

import { IconLock } from "./icons";
import "./coming-soon.css";

/** Verrouille une page entière : le contenu reste là, flouté et inerte, et une
    carte de verre annonce l'ouverture. Retirer le composant suffit à rouvrir la
    page — rien n'est supprimé côté vue ni côté API. */
export function ComingSoon({
  children,
  badge,
  title,
  note,
  action,
}: {
  children: React.ReactNode;
  badge: string;
  title: string;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ss-soon">
      {/* inert coupe le clavier, la souris et le lecteur d'écran d'un coup :
          un bouton flouté ne doit pas rester atteignable au Tab. */}
      <div className="ss-soon__under" inert>
        {children}
      </div>
      <div className="ss-soon__veil">
        <div className="ss-soon__card">
          <span className="ss-soon__lock">
            <IconLock size={24} />
          </span>
          <span className="ss-soon__badge">{badge}</span>
          <h2>{title}</h2>
          <p>{note}</p>
          {action}
        </div>
      </div>
    </div>
  );
}
