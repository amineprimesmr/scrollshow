"use client";

import { t } from "@/lib/i18n";
import type { Account, Channel } from "@/lib/types";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "./StudioContext";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

export type FanItem = {
  id: string;
  kind: "channel" | "clipper";
  platform: string;
  handle: string;
  name: string;
  avatar: string;
  followers: number;
  likes: number;
  posts: number;
  avgViews: number;
  connected: boolean;
  verdict?: Account["verdict"];
};

type SortKey = "followers" | "likes" | "posts";

function fromChannel(c: Channel): FanItem {
  return {
    id: `ch:${c.id}`,
    kind: "channel",
    platform: c.platform,
    handle: c.handle,
    name: c.name || c.handle,
    avatar: c.avatar || "",
    followers: c.followers || 0,
    likes: c.likes || 0,
    posts: c.videoCount || 0,
    avgViews: 0,
    connected: Boolean(c.connected),
  };
}

function fromAccount(a: Account): FanItem {
  return {
    id: `ac:${a.id}`,
    kind: "clipper",
    platform: "tiktok",
    handle: a.handle,
    name: a.nickname || a.handle,
    avatar: a.avatar || "",
    followers: a.followers || 0,
    likes: a.likes || 0,
    posts: a.posts || 0,
    avgViews: a.avgViews || 0,
    connected: false,
    verdict: a.verdict,
  };
}

export function compact(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

type Geo = { w: number; h: number; step: number; baseRot: number; focusRot: number };

const DESKTOP: Geo = { w: 184, h: 226, step: 74, baseRot: -58, focusRot: -30 };
const MOBILE: Geo = { w: 128, h: 158, step: 46, baseRot: -56, focusRot: -30 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (v: number) => {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
};
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Where an item sits when it is `d` slots away from the (per-item) focus.
 * The focused folder turns towards the viewer, so its projected width grows:
 * everything after it shifts by exactly that extra footprint. No artificial gap.
 */
function layout(d: number, g: Geo) {
  const near = Math.exp(-(d * d) / 1.3); // 1 at the focus, fades over ~1.5 slots
  const opened = g.w * (Math.cos(rad(g.focusRot)) - Math.cos(rad(g.baseRot)));
  const x = d * g.step + opened * smooth(d);
  const y = 14 * (1 - Math.exp(-(d * d) / 10)) - 16 * near; // far ones sink, focus rises: a wave
  const rot = g.baseRot + (g.focusRot - g.baseRot) * near;
  const z = 64 * near;
  const scale = 1 + 0.05 * near;
  return { x, y, rot, z, scale, near };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function AccountsFan({ onSelect }: { onSelect?: (item: FanItem | null, viaClick: boolean) => void }) {
  const { channels, english: en, setAddOpen } = useStudio();
  const [clippers, setClippers] = useState<Account[]>([]);
  const [sort, setSort] = useState<SortKey>("followers");
  const [selected, setSelected] = useState(0);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((json) => setClippers(json.accounts || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const items = useMemo(() => {
    const list = [...channels.map(fromChannel), ...clippers.map(fromAccount)];
    const seen = new Set<string>();
    const unique = list.filter((item) => {
      const key = `${item.platform}:${item.handle}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.sort((a, b) => b[sort] - a[sort]);
  }, [channels, clippers, sort]);

  const count = items.length;

  /* ---------------- animation state lives in refs: no React work per frame ---------------- */
  const stageRef = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const handleRef = useRef<HTMLDivElement>(null);
  const target = useRef(0); // where the fan is heading (fractional while dragging)
  const cur = useRef<number[]>([]); // each folder's own lagging focus → wave
  const vel = useRef<number[]>([]); // slots per second, used to lean the folders
  const hov = useRef<number[]>([]); // smoothed hover amount per folder
  const hovered = useRef<number | null>(null);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: -1, y: -1 });
  const raf = useRef<number | null>(null);
  const lastT = useRef(0);
  const reduced = useRef(false);
  const narrowRef = useRef(false);
  narrowRef.current = narrow;
  const countRef = useRef(0);
  countRef.current = count;

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const paint = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const g = narrowRef.current ? MOBILE : DESKTOP;
    const n = countRef.current;
    const pivot = Math.round(clamp(target.current, 0, Math.max(0, n - 1)));
    const f = cur.current[pivot] ?? target.current;
    // The stage shrinks when the account panel opens: scale the whole fan so
    // the folders never overflow the bar above.
    const k = clamp((stage.clientHeight - 70) / (narrowRef.current ? 300 : 400), 0.55, 1);
    // Keep the whole fan centred whatever is selected: its horizontal extent
    // depends on where the opened folder sits, so recentre from that.
    const first = layout(0 - f, g).x * k;
    const last = layout(Math.max(0, n - 1) - f, g).x * k;
    const cx = stage.clientWidth / 2 - (first + last) / 2;
    const cy = stage.clientHeight * 0.56 + 18;
    for (let i = 0; i < nodes.current.length; i += 1) {
      const el = nodes.current[i];
      if (!el) continue;
      const d = i - (cur.current[i] ?? target.current);
      const l = layout(d, g);
      const h = hov.current[i] ?? 0;
      const lean = clamp(-(vel.current[i] ?? 0) * 0.55, -5, 5); // lean into the motion
      const x = cx + l.x * k - g.w / 2;
      const y = cy + (l.y - 28 * h - Math.abs(lean) * 0.5) * k - g.h / 2;
      const z = (l.z + 40 * h) * k;
      const rot = l.rot + 8 * h;
      el.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateY(${rot}deg) rotateZ(${lean}deg) scale(${(l.scale + 0.02 * h) * k})`;
      const ad = Math.abs(d);
      // Flat stacking: the folder nearest the focus is always on top and the
      // order never changes — a hovered folder lifts and comes forward but
      // stays in its slot of the pile.
      el.style.zIndex = String(1000 - Math.round(ad * 10));
      el.style.opacity = String(clamp(1 - Math.max(0, ad - 5) * 0.08, 0.3, 1));
      const shade = el.lastElementChild as HTMLElement | null;
      if (shade) shade.style.opacity = String(clamp((ad - 0.6) * 0.06, 0, 0.36) * (1 - h));
    }
    const handle = handleRef.current;
    if (handle && n > 1) {
      const p = clamp(f / (n - 1), 0, 1);
      const w = stage.clientWidth;
      const hx = w * 0.18 + p * w * 0.64;
      const hy = 46 - Math.sin(p * Math.PI) * 26;
      handle.style.transform = `translate3d(${hx - 18}px, ${hy - 18}px, 0)`;
    }
  }, []);

  const settle = useCallback(() => {
    const idx = clamp(Math.round(target.current), 0, Math.max(0, countRef.current - 1));
    setSelected((prev) => (prev === idx ? prev : idx));
  }, []);

  const tick = useCallback(
    (now: number) => {
      const gap = now - (lastT.current || now);
      const dt = clamp(gap / 1000 || 0.016, 0.001, 0.05);
      lastT.current = now;
      const snap = reduced.current || gap > 250 || document.visibilityState === "hidden";
      const n = countRef.current;
      const tgt = target.current;
      const pivot = Math.round(clamp(tgt, 0, Math.max(0, n - 1)));
      let active = false;
      for (let i = 0; i < n; i += 1) {
        const prev = cur.current[i] ?? tgt;
        if (snap) {
          cur.current[i] = tgt;
          vel.current[i] = 0;
        } else {
          // Folders further from the pivot follow later: the move ripples
          // through the stack like a wave instead of sliding as one block.
          const dist = Math.min(Math.abs(i - pivot), 6);
          const rate = 19 - dist * 1.2;
          const a = 1 - Math.exp(-rate * dt);
          const next = prev + (tgt - prev) * a;
          vel.current[i] = (next - prev) / dt;
          cur.current[i] = Math.abs(tgt - next) < 0.0008 ? tgt : next;
        }
        const ht = hovered.current === i ? 1 : 0;
        const hp = hov.current[i] ?? 0;
        const hn = snap ? ht : hp + (ht - hp) * (1 - Math.exp(-16 * dt));
        hov.current[i] = Math.abs(ht - hn) < 0.002 ? ht : hn;
        if (cur.current[i] !== tgt || hov.current[i] !== ht) active = true;
      }
      paint();
      if (!active) {
        for (let i = 0; i < n; i += 1) vel.current[i] = 0;
        paint();
        raf.current = null;
        lastT.current = 0;
        return;
      }
      raf.current = requestAnimationFrame(tick);
    },
    [paint],
  );

  const kick = useCallback(() => {
    if (raf.current == null) raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const goTo = useCallback(
    (idx: number) => {
      target.current = clamp(idx, 0, Math.max(0, countRef.current - 1));
      settle();
      kick();
    },
    [settle, kick],
  );
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  useEffect(() => {
    // Data or sort changed: keep the focus valid, reseed lagging values, repaint.
    target.current = clamp(target.current, 0, Math.max(0, count - 1));
    for (let i = 0; i < count; i += 1) {
      if (cur.current[i] == null) cur.current[i] = target.current;
      if (hov.current[i] == null) hov.current[i] = 0;
    }
    cur.current.length = count;
    vel.current.length = count;
    hov.current.length = count;
    settle();
    kick();
  }, [count, sort, settle, kick]);

  useLayoutEffect(() => {
    paint();
  }, [selected, narrow, paint]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [paint]);

  useEffect(
    () => () => {
      // StrictMode runs this cleanup once on mount: null the id so kick() can
      // start the loop again, otherwise the fan would never animate in dev.
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
      lastT.current = 0;
    },
    [],
  );

  /* ---------------- pointer: press a folder to select, drag to scrub ---------------- */
  const drag = useRef<{ x: number; start: number; moved: boolean; lastX: number; lastT: number; v: number; index: number | null } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const folder = (e.target as HTMLElement).closest<HTMLElement>(".ss-folder");
    const index = folder ? Number(folder.dataset.index) : null;
    drag.current = { x: e.clientX, start: target.current, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0, index };
    dragging.current = true;
    setHover(null);
    const g = narrowRef.current ? MOBILE : DESKTOP;
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 5) d.moved = true;
      if (!d.moved) return;
      const now = performance.now();
      d.v = (ev.clientX - d.lastX) / Math.max(1, now - d.lastT);
      d.lastX = ev.clientX;
      d.lastT = now;
      target.current = clamp(d.start - dx / g.step, -0.35, countRef.current - 0.65);
      settle(); // the green highlight follows the scrub live
      kick();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      dragging.current = false;
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.moved) {
        if (d.index != null) {
          clicked.current = true;
          goToRef.current(d.index);
          // Same folder pressed again: still open its details.
          onSelectRef.current?.(items[d.index] || null, true);
          clicked.current = false;
        }
        return;
      }
      // Project the fling, then settle on the nearest folder.
      goToRef.current(Math.round(target.current - (d.v * 90) / g.step));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function setHover(i: number | null) {
    if (hovered.current === i) return;
    hovered.current = i;
    kick();
  }

  // Chrome re-dispatches mouse events when elements move under a still cursor
  // (after a drag, a wheel scrub or the wave itself). Only a pointer that
  // really moved may hover, and never while the pointer is pressed.
  function onMouseMove(e: React.MouseEvent) {
    if (dragging.current) return;
    if (e.clientX === lastMouse.current.x && e.clientY === lastMouse.current.y) return;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    const folder = (e.target as HTMLElement).closest<HTMLElement>(".ss-folder");
    setHover(folder ? Number(folder.dataset.index) : null);
  }

  useEffect(() => {
    // Horizontal trackpad swipes scrub the fan; vertical wheel keeps scrolling
    // the page. Registered natively so preventDefault is honoured (React's
    // wheel listeners are passive).
    const stage = stageRef.current;
    if (!stage) return;
    let idle: number | null = null;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const g = narrowRef.current ? MOBILE : DESKTOP;
      // Scrub continuously with the gesture, then settle on the nearest folder.
      target.current = clamp(target.current + e.deltaX / (g.step * 1.4), -0.35, countRef.current - 0.65);
      settle();
      kick();
      if (idle != null) window.clearTimeout(idle);
      idle = window.setTimeout(() => goToRef.current(Math.round(target.current)), 110);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);
      if (idle != null) window.clearTimeout(idle);
    };
  }, [kick, settle]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(Math.round(target.current) + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(Math.round(target.current) - 1);
    } else if (e.key === "Home") {
      goTo(0);
    } else if (e.key === "End") {
      goTo(count - 1);
    }
  }

  function onArcPointer(e: React.PointerEvent) {
    const stage = stageRef.current;
    if (!stage || count < 2) return;
    e.stopPropagation();
    const rect = stage.getBoundingClientRect();
    const p = clamp((e.clientX - rect.left - rect.width * 0.18) / (rect.width * 0.64), 0, 1);
    target.current = p * (count - 1);
    kick();
    if (e.type === "pointerup") goTo(Math.round(target.current));
  }

  const current = items[selected] || null;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const clicked = useRef(false);
  useEffect(() => {
    onSelectRef.current?.(current, clicked.current);
    clicked.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  return (
    <section className="ss-fan" aria-label={t("Tous les comptes", "All accounts", en)}>
      <div className="ss-fan__bar">
        <div className="ss-fan__chips">
          <span className="ss-fan__chip is-static">
            {t("Comptes", "Accounts", en)} ({count})
          </span>
          {(["followers", "likes", "posts"] as const).map((key) => (
            <button key={key} type="button" className={`ss-fan__chip ${sort === key ? "is-on" : ""}`} onClick={() => setSort(key)}>
              {key === "followers" ? t("Abonnés", "Followers", en) : key === "likes" ? "Likes" : "Posts"}
            </button>
          ))}
        </div>
        <div className="ss-fan__actions">
          <div className="ss-fan__stack" aria-hidden>
            {items.slice(0, 3).map((item) =>
              item.avatar ? (
                <img key={item.id} src={item.avatar} alt="" />
              ) : (
                <span key={item.id}>{item.handle.slice(0, 2).toUpperCase()}</span>
              ),
            )}
          </div>
          <button type="button" className="ss-fan__chip" onClick={() => setAddOpen(true)}>
            + {t("Connecter", "Connect", en)}
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`ss-fan__stage ${count ? "" : "is-empty"}`}
        tabIndex={0}
        role="listbox"
        aria-activedescendant={current ? `fan-${current.id}` : undefined}
        onPointerDown={onPointerDown}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        {count > 1 ? (
          <div className="ss-fan__arc" onPointerDown={onArcPointer} onPointerMove={(e) => e.buttons === 1 && onArcPointer(e)} onPointerUp={onArcPointer}>
            <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
              <path d="M 18 46 Q 50 -6 82 46" fill="none" stroke="currentColor" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <div ref={handleRef} className="ss-fan__handle" aria-hidden>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
              </svg>
            </div>
          </div>
        ) : null}

        {items.map((item, i) => {
          const isSel = i === selected;
          return (
            <div
              key={item.id}
              id={`fan-${item.id}`}
              data-index={i}
              ref={(el) => {
                nodes.current[i] = el;
              }}
              role="option"
              aria-selected={isSel}
              className={`ss-folder ${isSel ? "is-selected" : ""} ${item.connected ? "is-live" : ""}`}
            >
              <div className="ss-folder__glow" aria-hidden />
              <div className="ss-folder__back" />
              <div className="ss-folder__back-green" aria-hidden />
              <div className="ss-folder__tab" />
              <div className="ss-folder__docs" aria-hidden>
                <div className="ss-folder__doc">
                  <i style={{ width: "62%" }} />
                  <i style={{ width: "84%" }} />
                  <i style={{ width: "48%" }} />
                </div>
                <div className="ss-folder__doc">
                  <i style={{ width: "70%" }} />
                  <i style={{ width: "54%" }} />
                  <i style={{ width: "78%" }} />
                </div>
                <div className="ss-folder__doc">
                  <i style={{ width: "58%" }} />
                  <i style={{ width: "80%" }} />
                  <i style={{ width: "44%" }} />
                </div>
              </div>
              <div className="ss-folder__front">
                <div className="ss-folder__front-green" aria-hidden />
                {item.avatar ? <img className="ss-folder__avatar" src={item.avatar} alt="" loading="lazy" draggable={false} /> : null}
                <div className="ss-folder__count">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
                    <circle cx="9" cy="8" r="3.4" />
                    <circle cx="16.5" cy="9.5" r="2.6" />
                    <path d="M3 18.5c0-3 2.7-5 6-5s6 2 6 5v.5H3z" />
                    <path d="M15.5 19v-.5c0-1.6-.6-3-1.6-4 .8-.4 1.7-.6 2.6-.6 2.6 0 4.5 1.6 4.5 4.1v1z" />
                  </svg>
                  <span>{compact(item.followers)}</span>
                </div>
                <div className="ss-folder__label">@{item.handle}</div>
              </div>
              <i className="ss-folder__shade" aria-hidden />
            </div>
          );
        })}

        {!count ? (
          <div className="ss-fan__empty">
            <b>{t("Aucun compte pour l'instant", "No account yet", en)}</b>
            <span>{t("Connecte un TikTok ou ajoute un compte de ton réseau pour remplir l'éventail.", "Connect a TikTok or add a network account to fill the fan.", en)}</span>
            <button type="button" className="ss-btn-purple" onClick={() => setAddOpen(true)}>
              {t("Connecter un compte", "Connect an account", en)}
            </button>
          </div>
        ) : null}
      </div>

    </section>
  );
}
