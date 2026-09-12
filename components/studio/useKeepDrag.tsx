"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AccountVideo } from "@/lib/types";
import { t } from "@/lib/i18n";
import { coverSrc } from "./cover";
import { IconMedia } from "./icons";

/** Mêmes seuils que le calendrier : à la souris on soulève dès que ça bouge,
 *  au doigt il faut un appui maintenu, sinon on ne pourrait plus faire défiler. */
const HOLD_MS = 260;
const HOLD_SLOP = 8;
const MOUSE_SLOP = 6;

export type KeepDragPost = { post: AccountVideo; handle: string; url: string };

type Lifted = KeepDragPost & { x: number; y: number; dx: number; dy: number; width: number; over: boolean };

/**
 * Glisser un carrousel de la Recherche vers la Bibliothèque, avec exactement le
 * geste du calendrier : un fantôme sous le pointeur, la tuile d'origine
 * estompée, et une cible flottante qui grossit quand on l'atteint.
 *
 * Pointeur et non glisser-déposer HTML5, pour la même raison que le calendrier :
 * le HTML5 ne fonctionne pas au doigt.
 */
export function useKeepDrag({ english, onKeep }: { english: boolean; onKeep: (item: KeepDragPost) => void }) {
  const [drag, setDrag] = useState<Lifted | null>(null);
  const dragRef = useRef<Lifted | null>(null);
  const press = useRef<{ id: number; x: number; y: number; timer: number | null; lifted: boolean; card: HTMLElement } | null>(null);

  const update = useCallback((next: Lifted | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const blockScroll = useCallback((event: TouchEvent) => {
    if (dragRef.current) event.preventDefault();
  }, []);

  const overTargetAt = useCallback((x: number, y: number) => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    return Boolean(element?.closest('[data-drop="library"]'));
  }, []);

  const stop = useCallback(() => {
    update(null);
    document.body.classList.remove("ss-dragging");
    document.removeEventListener("touchmove", blockScroll);
  }, [update, blockScroll]);

  /** Fait défiler le mur quand le pointeur frôle le haut ou le bas. */
  const autoScroll = useCallback((y: number) => {
    const body = document.querySelector<HTMLElement>(".ss-main__body");
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const edge = 56;
    if (y < rect.top + edge) body.scrollTop -= Math.ceil((rect.top + edge - y) / 4);
    else if (y > rect.bottom - edge) body.scrollTop += Math.ceil((y - (rect.bottom - edge)) / 4);
  }, []);

  const handlers = useCallback(
    (item: KeepDragPost) => {
      function lift(card: HTMLElement, x: number, y: number) {
        if (!press.current || press.current.lifted) return;
        press.current.lifted = true;
        card.setPointerCapture(press.current.id);
        const rect = card.getBoundingClientRect();
        document.body.classList.add("ss-dragging");
        document.addEventListener("touchmove", blockScroll, { passive: false });
        if (navigator.vibrate) navigator.vibrate(12);
        update({ ...item, x, y, dx: x - rect.left, dy: y - rect.top, width: rect.width, over: overTargetAt(x, y) });
      }

      return {
        onPointerDown(event: React.PointerEvent<HTMLElement>) {
          if (event.button !== 0 || !item.url) return;
          const card = event.currentTarget;
          const start = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: null as number | null, lifted: false, card };
          press.current = start;
          if (event.pointerType !== "mouse") start.timer = window.setTimeout(() => lift(card, start.x, start.y), HOLD_MS);
        },
        onPointerMove(event: React.PointerEvent<HTMLElement>) {
          const current = press.current;
          if (!current || current.id !== event.pointerId) return;
          const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
          if (current.lifted) {
            const held = dragRef.current;
            if (!held) return;
            autoScroll(event.clientY);
            update({ ...held, x: event.clientX, y: event.clientY, over: overTargetAt(event.clientX, event.clientY) });
            return;
          }
          if (event.pointerType === "mouse") {
            if (distance > MOUSE_SLOP) lift(current.card, event.clientX, event.clientY);
          } else if (distance > HOLD_SLOP && current.timer) {
            // Le doigt fait défiler : on abandonne l'appui long.
            window.clearTimeout(current.timer);
            current.timer = null;
          }
        },
        onPointerUp(event: React.PointerEvent<HTMLElement>) {
          const current = press.current;
          if (!current || current.id !== event.pointerId) return;
          if (current.timer) window.clearTimeout(current.timer);
          const lifted = current.lifted;
          press.current = null;
          if (!lifted) return;
          const held = dragRef.current;
          stop();
          // La cible est relue au relâchement : un dépôt rapide peut n'avoir
          // produit aucun mouvement intermédiaire.
          if (held && overTargetAt(event.clientX, event.clientY)) onKeep(held);
        },
        onPointerCancel(event: React.PointerEvent<HTMLElement>) {
          const current = press.current;
          if (!current || current.id !== event.pointerId) return;
          if (current.timer) window.clearTimeout(current.timer);
          press.current = null;
          stop();
        },
      };
    },
    [autoScroll, blockScroll, onKeep, overTargetAt, stop, update],
  );

  const overlay =
    typeof document === "undefined" || !drag
      ? null
      : createPortal(
          <>
            <div
              className={`ss-keep-ghost${drag.over ? " is-over" : ""}`}
              style={{ transform: `translate(${drag.x - drag.dx}px, ${drag.y - drag.dy}px)`, width: drag.width }}
              aria-hidden
            >
              {drag.post.cover || drag.post.images?.[0] ? (
                <img src={coverSrc(drag.post.images?.[0] || drag.post.cover)} alt="" />
              ) : null}
            </div>
            <div className={`ss-keep-target lg${drag.over ? " is-over" : ""}`} data-drop="library" role="presentation">
              <IconMedia size={18} />
              <span>
                {drag.over
                  ? t("Relâche pour garder", "Release to keep", english)
                  : t("Glisse ici pour garder", "Drag here to keep", english)}
              </span>
            </div>
          </>,
          document.body,
        );

  return { handlers, overlay, dragging: Boolean(drag), draggedId: drag?.post.id ?? null };
}
