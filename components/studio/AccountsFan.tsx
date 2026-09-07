"use client";

import { t } from "@/lib/i18n";
import type { Account, Channel } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  since?: string;
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
    since: a.createdAt,
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

type Geo = { step: number; gap: number; lift: number; w: number; h: number; tilt: number };

const DESKTOP: Geo = { step: 46, gap: 128, lift: 0, w: 168, h: 208, tilt: -56 };
const MOBILE: Geo = { step: 32, gap: 84, lift: 0, w: 116, h: 148, tilt: -54 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (v: number) => {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Horizontal offset of an item sitting `d` slots away from the focus. */
function offsetX(d: number, g: Geo) {
  // Items before the focus pack tightly; the focus opens a gap after itself.
  return d * g.step + g.gap * smooth(d);
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function AccountsFan() {
  const router = useRouter();
  const { channels, english: en, setActiveChannel, setAddOpen } = useStudio();
  const [clippers, setClippers] = useState<Account[]>([]);
  const [sort, setSort] = useState<SortKey>("followers");
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
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

  const geo = narrow ? MOBILE : DESKTOP;
  const count = items.length;
  const totalFollowers = useMemo(() => items.reduce((n, i) => n + i.followers, 0), [items]);

  /* ---------------- spring-driven focus (no React re-render per frame) ---------------- */
  const stageRef = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const focus = useRef(0); // animated value
  const target = useRef(0); // where the spring goes
  const velocity = useRef(0);
  const raf = useRef<number | null>(null);
  const lastT = useRef(0);
  const reduced = useRef(false);
  const drag = useRef<{ x: number; start: number; moved: boolean; lastX: number; lastT: number; v: number } | null>(null);
  const hoveredRef = useRef<number | null>(null);
  hoveredRef.current = hovered;

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const paint = useCallback(() => {
    const f = focus.current;
    const stage = stageRef.current;
    if (!stage) return;
    const cx = stage.clientWidth * (narrow ? 0.4 : 0.4);
    const cy = stage.clientHeight * (narrow ? 0.62 : 0.56);
    const g = narrow ? MOBILE : DESKTOP;
    let selX = cx;
    for (let i = 0; i < nodes.current.length; i += 1) {
      const el = nodes.current[i];
      if (!el) continue;
      const d = i - f;
      const ad = Math.abs(d);
      const near = 1 - smooth(ad); // 1 at focus, 0 one slot away
      const isHover = hoveredRef.current === i;
      const x = cx + offsetX(d, g);
      const z = near * 70 + (isHover ? 34 : 0);
      const y = cy - near * 10 - (isHover ? 16 : 0);
      const rot = g.tilt + near * 9 + (isHover ? 5 : 0);
      const scale = 1 + near * 0.06;
      el.style.transform = `translate3d(${x - g.w / 2}px, ${y - g.h / 2}px, ${z}px) rotateY(${rot}deg) scale(${scale})`;
      el.style.zIndex = String(1000 - Math.round(ad * 10));
      el.style.opacity = String(clamp(1 - Math.max(0, ad - 4) * 0.06, 0.35, 1));
      el.style.filter = ad > 0.5 ? `brightness(${clamp(1 - ad * 0.03, 0.62, 1)})` : "none";
      if (i === Math.round(f)) selX = x;
    }
    const card = cardRef.current;
    if (card) {
      // Desktop: above-left of the focused folder, its green dot touching the
      // tab. Narrow screens: centred above the folder and kept inside the stage.
      const cw = card.offsetWidth || (narrow ? 196 : 236);
      const cardX = narrow
        ? clamp(selX - cw / 2, 12, Math.max(12, stage.clientWidth - cw - 12))
        : selX - g.w / 2 - 150;
      const cardY = narrow ? cy - g.h / 2 - 96 : cy - g.h / 2 - 58;
      card.style.transform = `translate3d(${cardX}px, ${cardY}px, 140px)`;
    }
    const handle = handleRef.current;
    if (handle && count > 1) {
      const p = clamp(f / (count - 1), 0, 1);
      const w = stage.clientWidth;
      const hx = w * 0.18 + p * w * 0.64;
      const hy = 46 - Math.sin(p * Math.PI) * 26;
      handle.style.transform = `translate3d(${hx - 18}px, ${hy - 18}px, 0)`;
    }
  }, [narrow, count]);

  const settle = useCallback(() => {
    const idx = clamp(Math.round(target.current), 0, Math.max(0, count - 1));
    setSelected((prev) => (prev === idx ? prev : idx));
  }, [count]);

  const tick = useCallback(
    (now: number) => {
      const gap = now - (lastT.current || now);
      const dt = Math.min(0.05, gap / 1000 || 0.016);
      lastT.current = now;
      if (reduced.current || gap > 250) {
        // Reduced motion, or the tab was throttled/hidden: land immediately
        // instead of replaying a stale spring when frames resume.
        focus.current = target.current;
        velocity.current = 0;
      } else {
        // Critically damped spring: snappy, no overshoot.
        const k = 190;
        const c = 2 * Math.sqrt(k);
        const dx = target.current - focus.current;
        const a = k * dx - c * velocity.current;
        velocity.current += a * dt;
        focus.current += velocity.current * dt;
      }
      paint();
      const resting = Math.abs(target.current - focus.current) < 0.0015 && Math.abs(velocity.current) < 0.003;
      if (resting) {
        focus.current = target.current;
        velocity.current = 0;
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
      target.current = clamp(idx, 0, Math.max(0, count - 1));
      settle();
      kick();
    },
    [count, settle, kick],
  );

  useEffect(() => {
    // Sorting or data changes: keep the focus valid and repaint.
    target.current = clamp(target.current, 0, Math.max(0, count - 1));
    focus.current = clamp(focus.current, 0, Math.max(0, count - 1));
    settle();
    paint();
  }, [count, sort, paint, settle]);

  useEffect(() => {
    paint();
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [paint]);

  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);

  useLayoutEffect(() => {
    paint();
  }, [hovered, selected, paint]);

  /* ---------------- pointer: drag to scrub, click to select ---------------- */
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, start: target.current, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    if (!d.moved) return;
    const now = performance.now();
    const dtms = Math.max(1, now - d.lastT);
    d.v = (e.clientX - d.lastX) / dtms; // px per ms
    d.lastX = e.clientX;
    d.lastT = now;
    target.current = clamp(d.start - dx / geo.step, -0.4, count - 0.6);
    kick();
  }
  function onPointerUp() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (!d.moved) return;
    // Project the fling, then snap to the nearest account.
    const fling = -d.v * 90;
    goTo(Math.round(target.current + fling / geo.step));
  }

  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  useEffect(() => {
    // Horizontal trackpad swipes scrub the fan; vertical wheel keeps scrolling
    // the page. Registered natively so preventDefault is honoured (React's
    // wheel listeners are passive).
    const stage = stageRef.current;
    if (!stage) return;
    let acc = 0;
    let cooldown = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      if (now < cooldown) return;
      acc += e.deltaX;
      if (Math.abs(acc) < 40) return;
      goToRef.current(Math.round(target.current) + (acc > 0 ? 1 : -1));
      acc = 0;
      cooldown = now + 140;
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

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

  /* ---------------- arc handle: drag along the arc to scrub ---------------- */
  function onArcPointer(e: React.PointerEvent) {
    const stage = stageRef.current;
    if (!stage || count < 2) return;
    const rect = stage.getBoundingClientRect();
    const p = clamp((e.clientX - rect.left - rect.width * 0.18) / (rect.width * 0.64), 0, 1);
    target.current = p * (count - 1);
    kick();
    if (e.type === "pointerup") goTo(Math.round(target.current));
  }

  const current = items[selected] || null;
  const share = current && totalFollowers ? Math.round((current.followers / totalFollowers) * 100) : 0;

  function openInCalendar(item: FanItem) {
    if (item.kind === "channel") setActiveChannel(item.id.slice(3));
    router.push("/app");
  }

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
          <Link href="/app/clippers" className="ss-fan__chip">
            {t("Clippers", "Clippers", en)} →
          </Link>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`ss-fan__stage ${count ? "" : "is-empty"}`}
        tabIndex={0}
        role="listbox"
        aria-activedescendant={current ? `fan-${current.id}` : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
              ref={(el) => {
                nodes.current[i] = el;
              }}
              role="option"
              aria-selected={isSel}
              className={`ss-folder ${isSel ? "is-selected" : ""} ${item.connected ? "is-live" : ""}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onClick={() => {
                if (drag.current?.moved) return;
                goTo(i);
              }}
            >
              <div className="ss-folder__tab" />
              <div className="ss-folder__body">
                <div className="ss-folder__lines">
                  <i style={{ width: "72%" }} />
                  <i style={{ width: "54%" }} />
                  <i style={{ width: "64%" }} />
                  <i style={{ width: "38%" }} />
                </div>
                {item.avatar ? <img className="ss-folder__avatar" src={item.avatar} alt="" loading="lazy" /> : null}
                <div className="ss-folder__count">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden>
                    <circle cx="9" cy="8" r="3.4" />
                    <circle cx="16.5" cy="9.5" r="2.6" />
                    <path d="M3 18.5c0-3 2.7-5 6-5s6 2 6 5v.5H3z" />
                    <path d="M15.5 19v-.5c0-1.6-.6-3-1.6-4 .8-.4 1.7-.6 2.6-.6 2.6 0 4.5 1.6 4.5 4.1v1z" />
                  </svg>
                  <span>{compact(item.followers)}</span>
                </div>
                <div className="ss-folder__label">@{item.handle}</div>
              </div>
            </div>
          );
        })}

        {current ? (
          <div ref={cardRef} className="ss-fan__card">
            <div className="ss-fan__card-inner" key={current.id}>
            <div className="ss-fan__card-head">
              <div>
                <b>{current.name}</b>
                <span>
                  {current.kind === "channel"
                    ? current.connected
                      ? t("Connecté", "Connected", en)
                      : t("Compte lié", "Linked", en)
                    : t("Clipper", "Clipper", en)}
                  {" · "}
                  {current.platform === "tiktok" ? "TikTok" : current.platform === "instagram" ? "Instagram" : current.platform}
                  {current.since ? ` · ${new Date(current.since).toLocaleDateString(en ? "en-US" : "fr-FR", { month: "short", year: "numeric" })}` : ""}
                </span>
              </div>
              <button type="button" className="ss-fan__card-arrow" onClick={() => openInCalendar(current)} aria-label={t("Ouvrir", "Open", en)}>
                →
              </button>
            </div>
            <div className="ss-fan__card-big">
              {compact(current.followers)}
              <small>{t("abonnés", "followers", en)}</small>
            </div>
            <div className="ss-fan__card-dot" aria-hidden>
              <i />
            </div>
            </div>
          </div>
        ) : null}

        {!count ? (
          <div className="ss-fan__empty">
            <b>{t("Aucun compte pour l'instant", "No account yet", en)}</b>
            <span>{t("Connecte un TikTok ou ajoute un clipper pour remplir l'éventail.", "Connect a TikTok or add a clipper to fill the fan.", en)}</span>
            <button type="button" className="ss-btn-purple" onClick={() => setAddOpen(true)}>
              {t("Connecter un compte", "Connect an account", en)}
            </button>
          </div>
        ) : null}
      </div>

      {current ? (
        <div className="ss-fan__detail" key={`d-${current.id}`}>
          <div className="ss-fan__detail-id">
            {current.avatar ? <img src={current.avatar} alt="" /> : <span>{current.handle.slice(0, 2).toUpperCase()}</span>}
            <div>
              <b>{current.name}</b>
              <span>
                @{current.handle} · {current.platform === "tiktok" ? "TikTok" : current.platform}
                {current.verdict ? ` · ${current.verdict}` : ""}
              </span>
            </div>
            <span className={`ss-badge ${current.connected ? "is-ready" : "is-wait"}`}>
              {current.connected ? t("Connecté", "Connected", en) : current.kind === "clipper" ? t("Réseau", "Network", en) : t("Lié", "Linked", en)}
            </span>
          </div>
          <dl className="ss-fan__stats">
            <div>
              <dt>{t("Abonnés", "Followers", en)}</dt>
              <dd>{compact(current.followers)}</dd>
            </div>
            <div>
              <dt>Likes</dt>
              <dd>{compact(current.likes)}</dd>
            </div>
            <div>
              <dt>Posts</dt>
              <dd>{compact(current.posts)}</dd>
            </div>
            <div>
              <dt>{t("Part du réseau", "Share of network", en)}</dt>
              <dd>{share}%</dd>
            </div>
          </dl>
          <div className="ss-fan__detail-actions">
            {current.kind === "channel" ? (
              <button type="button" className="ss-fan__chip is-on" onClick={() => openInCalendar(current)}>
                {t("Calendrier du compte", "Account calendar", en)}
              </button>
            ) : (
              <Link href="/app/clippers" className="ss-fan__chip is-on">
                {t("Fiche clipper", "Clipper card", en)}
              </Link>
            )}
            <Link href="/app/analytics" className="ss-fan__chip">
              Analytics
            </Link>
            <a href={`https://www.tiktok.com/@${current.handle}`} target="_blank" rel="noreferrer" className="ss-fan__chip">
              TikTok ↗
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
