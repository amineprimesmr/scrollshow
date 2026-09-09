"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "./landing-spotlight.css";

function t(fr: string, en: string, english: boolean) {
  return english ? en : fr;
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        io.disconnect();
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, shown };
}

/** Compte de 0 à `value` dès que `run` passe à true, en easing out. */
function useCountUp(value: number, run: boolean, duration = 1150) {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, run, duration]);

  return n;
}

/** Parallaxe au défilement + inclinaison 3D suivie à la souris, amorties en rAF. */
function useDepth(hostRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const fine = window.matchMedia("(pointer: fine)").matches;
    let visible = false;
    let raf = 0;
    // cibles / valeurs lissées
    let tx = 0, ty = 0, x = 0, y = 0, tp = 0, p = 0;

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };

    const frame = () => {
      const r = host.getBoundingClientRect();
      // -1 (section sous le pli) → 1 (section au-dessus)
      tp = Math.max(-1, Math.min(1, (window.innerHeight / 2 - (r.top + r.height / 2)) / (window.innerHeight / 2 + r.height / 2)));
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      p += (tp - p) * 0.14;
      host.style.setProperty("--px", x.toFixed(4));
      host.style.setProperty("--py", y.toFixed(4));
      host.style.setProperty("--sp", p.toFixed(4));
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        const next = Boolean(entry?.isIntersecting);
        if (next === visible) return;
        visible = next;
        if (visible) {
          if (fine) {
            host.addEventListener("pointermove", onMove);
            host.addEventListener("pointerleave", onLeave);
          }
          raf = requestAnimationFrame(frame);
        } else {
          host.removeEventListener("pointermove", onMove);
          host.removeEventListener("pointerleave", onLeave);
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: "10% 0px" },
    );
    io.observe(host);

    return () => {
      io.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [hostRef]);
}

function PhoneMockup({ english }: { english: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Ne joue la vidéo que lorsqu'elle est à l'écran : pas de décodage inutile.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="af-ld-spot__device">
      <div className="af-ld-spot__glow" aria-hidden="true" />
      <div className="af-ld-spot__phone">
        <div className="af-ld-spot__tilt">
          <div className="af-ld-spot__frame">
            <div className="af-ld-spot__screen">
              <video
                ref={videoRef}
                className="af-ld-spot__video"
                src="/assets/showcase/process-debloat.mp4"
                poster="/assets/showcase/process-debloat-poster.jpg"
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={t(
                  "Compte TikTok Process Debloat piloté depuis ScrollShow",
                  "Process Debloat TikTok account driven from ScrollShow",
                  english,
                )}
              />
              <div className="af-ld-spot__notch" aria-hidden="true" />
              <div className="af-ld-spot__gloss" aria-hidden="true" />
            </div>
          </div>
        </div>
        <span className="af-ld-spot__badge" aria-hidden="true">
          <span className="af-ld-spot__badge-dot" />
          {t("Automatisé", "Automated", english)}
        </span>
      </div>
    </div>
  );
}

/* Courbe des vues sur 60 jours, relevée dans TikTok Studio (11 juil → 8 sept). */
const VIEWS_SERIES = [
  6, 5, 6, 7, 6, 5, 6, 7, 52, 110, 72, 76, 60, 80, 148, 78, 42, 50, 44, 40, 38,
  42, 62, 88, 80, 58, 62, 105, 62, 40, 36, 38, 32, 30, 28, 26, 32, 34, 30, 44,
  36, 30, 28, 26,
];

const CHART_W = 620;
const CHART_H = 132;

/** Catmull-Rom → cubiques : une courbe lisse sans dépendance de dessin. */
function smoothPath(series: number[], w: number, h: number, pad = 6) {
  const max = Math.max(...series);
  const pts = series.map((v, i) => [
    (i / (series.length - 1)) * w,
    h - pad - (v / max) * (h - pad * 2),
  ]);
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const VIEWS_PATH = smoothPath(VIEWS_SERIES, CHART_W, CHART_H);
const VIEWS_AREA = `${VIEWS_PATH} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

function AnalyticsPanel({ english, shown }: { english: boolean; shown: boolean }) {
  const views = useCountUp(2.7, shown);
  const likes = useCountUp(54.8, shown, 1250);
  const shares = useCountUp(3.2, shown, 1350);
  const nf = english ? "en-US" : "fr-FR";
  const one = (v: number) =>
    v.toLocaleString(nf, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const kpis = [
    { key: "views", label: t("Vues de la vidéo", "Video views", english), value: `${one(views)} M`, delta: "+2,7 M", active: true },
    { key: "likes", label: t("J’aime", "Likes", english), value: `${one(likes)} K`, delta: "+54,8 K" },
    { key: "shares", label: t("Partages", "Shares", english), value: `${one(shares)} K`, delta: "+3,2 K" },
  ];

  return (
    <div className={`af-ld-spot__dash${shown ? " is-live" : ""}`} data-i="3">
      <div className="af-ld-spot__dash-head">
        <img
          className="af-ld-spot__dash-net"
          src="/assets/platforms/tiktok.png"
          alt="TikTok"
          width={22}
          height={22}
          loading="lazy"
        />
        <span className="af-ld-spot__dash-id">
          <strong>@mannyprcs</strong>
          <span className="af-ld-spot__dash-meta">
            {t("J’aime", "Likes", english)} <b>51K</b> · Followers <b>2.5K</b> · {t("Suivis", "Following", english)} <b>39</b>
          </span>
        </span>
        <span className="af-ld-spot__dash-period">{t("Exemple illustratif · 28 jours", "Illustrative example · 28 days", english)}</span>
      </div>

      <div className="af-ld-spot__kpis">
        {kpis.map((k) => (
          <div key={k.key} className={`af-ld-spot__kpi${k.active ? " is-active" : ""}`}>
            <span className="af-ld-spot__kpi-label">{k.label}</span>
            <strong className="af-ld-spot__kpi-value">{k.value}</strong>
            <span className="af-ld-spot__kpi-delta">{k.delta}</span>
          </div>
        ))}
      </div>

      <div className="af-ld-spot__chart">
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" role="img" aria-label={t("Vues sur 28 jours", "Views over 28 days", english)}>
          <defs>
            <linearGradient id="af-ld-spot-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a0a0a" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="af-ld-spot__grid">
            <line x1="0" y1="30" x2={CHART_W} y2="30" />
            <line x1="0" y1="72" x2={CHART_W} y2="72" />
            <line x1="0" y1="114" x2={CHART_W} y2="114" />
          </g>
          <path className="af-ld-spot__area" d={VIEWS_AREA} fill="url(#af-ld-spot-fill)" />
          <path className="af-ld-spot__line" d={VIEWS_PATH} fill="none" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="af-ld-spot__axis">
          <span>11 {t("juil.", "Jul", english)}</span>
          <span>27 {t("juil.", "Jul", english)}</span>
          <span>12 {t("août", "Aug", english)}</span>
          <span>28 {t("août", "Aug", english)}</span>
          <span>8 {t("sept.", "Sep", english)}</span>
        </div>
      </div>
    </div>
  );
}

export function LandingSpotlight({ english }: { english: boolean }) {
  const { ref, shown } = useReveal<HTMLElement>();
  useDepth(ref);

  return (
    <section
      ref={ref}
      id="spotlight"
      className={`af-ld-spot${shown ? " is-shown" : ""}`}
      aria-labelledby="af-ld-spot-title"
    >
      <div className="af-ld-spot__dots" aria-hidden="true" />
      <div className="af-ld-spot__aura" aria-hidden="true" />
      <div className="af-ld-spot__inner">
        <div className="af-ld-spot__copy">
          <span className="af-ld-spot__pill" data-i="0">
            <span className="af-ld-spot__pill-inner">
              {t("Cas concret", "Case study", english)}
            </span>
          </span>

          <h2 id="af-ld-spot-title" className="af-ld-spot__title" data-i="1">
            <span>
              <img
                className="af-ld-spot__title-icon"
                src="/assets/showcase/process-icon.png"
                alt=""
                width={56}
                height={56}
              />
              {t("Process Debloat fait", "Process Debloat does", english)}
            </span>
            <span>
              <em>{t("2,7M de vues", "2.7M views", english)}</em> {t("par mois", "a month", english)}
            </span>
          </h2>

          <figure className="af-ld-spot__lede" data-i="2">
            <blockquote>
              {t(
                "« Ça me prend 3 minutes par semaine. Je lance l’agent, il crée et programme mes 35 slideshows, et je n’y retouche plus. Honnêtement ça change la vie. »",
                "“It takes me 3 minutes a week. I start the agent, it creates and schedules my 35 slideshows, and I never touch them again. Honestly, it changes everything.”",
                english,
              )}
            </blockquote>
          </figure>

          <AnalyticsPanel english={english} shown={shown} />

        </div>

        <PhoneMockup english={english} />
      </div>
    </section>
  );
}
