"use client";

import { useCallback, useRef, useState } from "react";
import { AccountPanel } from "../AccountPanel";
import { AccountsFan, type FanItem } from "../AccountsFan";
import { SetupWidget } from "../SetupWidget";

/** Overview = the accounts fan, full page, with an expandable account panel. */
export function HomeView() {
  const [current, setCurrent] = useState<FanItem | null>(null);
  const [open, setOpen] = useState(true);

  // Un clic sur un dossier ouvre ses details. Faire defiler l'eventail (arc,
  // molette, clavier) change le compte affiche sans rouvrir un panneau que
  // l'utilisateur vient de replier ; un clic dans le vide le replie.
  const seen = useRef(false);
  const onSelect = useCallback((item: FanItem | null, viaClick: boolean) => {
    setCurrent(item);
    // Le tout premier compte s'ouvre de lui-meme ; ensuite seul un clic ouvre.
    if (item && (viaClick || !seen.current)) { setOpen(true); seen.current = true; }
    if (!item) setOpen(false);
  }, []);
  const collapse = useCallback(() => setOpen(false), []);

  // Hors de la scene (marges, bandeau), un clic dans le vide replie aussi.
  // La scene elle-meme distingue clic et glisser, et gere son propre repli.
  const onFanClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest(".ss-fan__stage, .ss-folder, button, a, input, select, label")) return;
    setOpen(false);
  }, []);

  return (
    <div className={`ss-overview ${open ? "is-open" : ""}`}>
      <div className="ss-overview__fan" onClick={onFanClick}>
        <AccountsFan onSelect={onSelect} onBlankClick={collapse} />
      </div>
      <AccountPanel item={current} expanded={open} onToggle={setOpen} />
      <SetupWidget />
    </div>
  );
}
