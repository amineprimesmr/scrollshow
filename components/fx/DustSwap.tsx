"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

type Side = "a" | "b";
type Props = {
  /** Texte affiché au départ, puis celui en lequel il se transforme. */
  from: string;
  to: string;
  /** Suite de la ligne, qui glisse quand la largeur du mot change. */
  rest: string;
  /** Couleur des quelques grains « braise » mêlés à la poussière. */
  accent?: string;
};

const PAD_X = 130;
const PAD_Y = 100;
const GLYPH_PAD = 8;
const MAX_PARTICLES = 5200;
const SWEEP = 0.55;
const HANDOFF = 0.28;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type TextBox = { text: string; x: number; base: number; w: number; top: number; h: number };

/** Positions (px CSS, relatives au coin du texte) des pixels encrés d'un mot. */
function sampleGlyphs(box: TextBox, font: string, spacing: string, dpr: number, step: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((box.w + GLYPH_PAD * 2) * dpr);
  canvas.height = Math.ceil((box.h + GLYPH_PAD * 2) * dpr);
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return [];
  g.scale(dpr, dpr);
  g.font = font;
  try { (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing; } catch { /* moteur ancien */ }
  g.textBaseline = "alphabetic";
  g.fillStyle = "#000";
  g.fillText(box.text, GLYPH_PAD, GLYPH_PAD + (box.base - box.top));
  const { data, width, height } = g.getImageData(0, 0, canvas.width, canvas.height);
  const points: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > 110) points.push(x / dpr - GLYPH_PAD, y / dpr - GLYPH_PAD);
    }
  }
  return points;
}

/** Trie les points de gauche à droite, avec un peu de désordre : la poussière
    part en vague, sans que chaque grain traverse tout le mot. */
function orderByX(points: number[]) {
  const count = points.length / 2;
  const keys = new Float32Array(count);
  const index = new Uint32Array(count);
  for (let i = 0; i < count; i++) { keys[i] = points[i * 2] + Math.random() * 34; index[i] = i; }
  return Array.from(index).sort((p, q) => keys[p] - keys[q]);
}

/**
 * Un mot se désagrège en poussière et se recompose en un autre. Le mot réel
 * reste dans le DOM (lisible, sélectionnable) ; le canvas ne vit que le temps
 * de la transition. Se joue une fois à l'entrée dans l'écran, puis au survol
 * ou au toucher.
 */
export function DustSwap({ from, to, rest, accent = "#d97757" }: Props) {
  const [side, setSide] = useState<Side>("a");
  const [dusting, setDusting] = useState(false);
  const lineRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLElement>(null);
  const aRef = useRef<HTMLSpanElement>(null);
  const bRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLElement>(null);
  const restRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const sideRef = useRef<Side>("a");
  const raf = useRef(0);

  const play = useCallback(() => {
    const line = lineRef.current, word = wordRef.current, base = baseRef.current;
    const restEl = restRef.current, canvas = canvasRef.current;
    if (busy.current || !line || !word || !base || !restEl || !canvas) return;
    const next: Side = sideRef.current === "a" ? "b" : "a";
    const current = sideRef.current === "a" ? aRef.current : bRef.current;
    const incoming = next === "a" ? aRef.current : bRef.current;
    if (!current || !incoming) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sideRef.current = next;
      setSide(next);
      return;
    }
    busy.current = true;

    // Mesure avant / après l'échange, sans peinture entre les deux.
    const measure = (el: HTMLElement): TextBox => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent ?? "", x: r.left, top: r.top, w: r.width, h: r.height, base: base.getBoundingClientRect().top };
    };
    const source = measure(current);
    const restBefore = restEl.getBoundingClientRect();
    flushSync(() => { setSide(next); setDusting(true); });
    sideRef.current = next;
    const target = measure(incoming);
    const restAfter = restEl.getBoundingClientRect();
    const frame = line.getBoundingClientRect();

    // La suite de la ligne glisse vers sa nouvelle place au lieu de sauter.
    restEl.style.transition = "none";
    restEl.style.transform = `translate(${restBefore.left - restAfter.left}px, ${restBefore.top - restAfter.top}px)`;
    void restEl.offsetWidth;
    restEl.style.transition = "transform 1.35s cubic-bezier(0.65, 0, 0.35, 1) 0.3s";
    restEl.style.transform = "";

    const style = getComputedStyle(word);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    const ink = style.color;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let step = Math.max(1, Math.round(dpr));
    let src = sampleGlyphs(source, font, spacing, dpr, step);
    let dst = sampleGlyphs(target, font, spacing, dpr, step);
    while (Math.max(src.length, dst.length) / 2 > MAX_PARTICLES && step < 6) {
      step += 1;
      src = sampleGlyphs(source, font, spacing, dpr, step);
      dst = sampleGlyphs(target, font, spacing, dpr, step);
    }
    const nS = src.length / 2, nT = dst.length / 2;
    const ctx = canvas.getContext("2d");
    if (!nS || !nT || !ctx) {
      busy.current = false;
      setDusting(false);
      return;
    }

    const width = frame.width + PAD_X * 2, height = frame.height + PAD_Y * 2;
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const mask = document.createElement("canvas");
    mask.width = canvas.width;
    mask.height = canvas.height;
    const mctx = mask.getContext("2d");
    const ox = PAD_X - frame.left, oy = PAD_Y - frame.top;
    const cell = step / dpr;

    const n = Math.max(nS, nT);
    const orderS = orderByX(src), orderT = orderByX(dst);
    const sx = new Float32Array(n), sy = new Float32Array(n), tx = new Float32Array(n), ty = new Float32Array(n);
    const delay = new Float32Array(n), span = new Float32Array(n), angle = new Float32Array(n), reach = new Float32Array(n);
    const swirl = new Float32Array(n), phase = new Float32Array(n), grain = new Float32Array(n);
    const ember = new Uint8Array(n);
    let end = 0;
    for (let i = 0; i < n; i++) {
      const s = orderS[Math.floor((i * nS) / n)], d = orderT[Math.floor((i * nT) / n)];
      sx[i] = source.x + ox + src[s * 2];
      sy[i] = source.top + oy + src[s * 2 + 1];
      tx[i] = target.x + ox + dst[d * 2];
      ty[i] = target.top + oy + dst[d * 2 + 1];
      delay[i] = (src[s * 2] / Math.max(1, source.w)) * SWEEP + Math.random() * 0.14;
      span[i] = 1.2 + Math.random() * 0.45;
      // Vent vers le haut et la droite, avec de la dispersion.
      angle[i] = -0.5 + (Math.random() - 0.5) * 1.6;
      const r = Math.random();
      reach[i] = 16 + r * r * 82;
      swirl[i] = (Math.random() - 0.5) * 3.2;
      phase[i] = Math.random() * Math.PI * 2;
      grain[i] = 0.7 + Math.random() * 1.1;
      ember[i] = Math.random() < 0.07 ? 1 : 0;
      end = Math.max(end, delay[i] + span[i]);
    }
    const total = end + HANDOFF;
    const progress = new Float32Array(n);

    const setup = (g: CanvasRenderingContext2D) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.font = font;
      try { (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing; } catch { /* moteur ancien */ }
      g.textBaseline = "alphabetic";
      g.fillStyle = ink;
    };
    setup(ctx);
    if (mctx) setup(mctx);

    const start = performance.now();
    let revealed = false;
    const draw = (now: number) => {
      const time = (now - start) / 1000;
      let launched = 0, landed = 0;
      for (let i = 0; i < n; i++) {
        const p = clamp01((time - delay[i]) / span[i]);
        progress[i] = p;
        if (p > 0) launched++;
        if (p >= 1) landed++;
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, width, height);

      // 1. Le mot de départ, troué là où les grains sont déjà partis.
      if (launched < n) {
        ctx.fillStyle = ink;
        ctx.fillText(source.text, source.x + ox, source.base + oy);
        ctx.globalCompositeOperation = "destination-out";
        for (let i = 0; i < n; i++) if (progress[i] > 0) ctx.fillRect(sx[i] - 0.6, sy[i] - 0.6, cell + 1.2, cell + 1.2);
        ctx.globalCompositeOperation = "source-over";
      }

      // 2. Le mot d'arrivée, révélé uniquement sous les grains déjà posés.
      if (landed === n) {
        ctx.fillStyle = ink;
        ctx.fillText(target.text, target.x + ox, target.base + oy);
      } else if (landed > 0 && mctx) {
        mctx.globalCompositeOperation = "source-over";
        mctx.clearRect(0, 0, width, height);
        for (let i = 0; i < n; i++) if (progress[i] >= 1) mctx.fillRect(tx[i] - 0.6, ty[i] - 0.6, cell + 1.2, cell + 1.2);
        mctx.globalCompositeOperation = "source-in";
        mctx.fillText(target.text, target.x + ox, target.base + oy);
        ctx.drawImage(mask, 0, 0, width, height);
      }

      // 3. Les grains en vol : deux passes pour ne changer de couleur qu'une fois.
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? accent : ink;
        for (let i = 0; i < n; i++) {
          const p = progress[i];
          if (p <= 0 || p >= 1 || ember[i] !== pass) continue;
          const e = easeInOut(p);
          const bell = Math.sin(Math.PI * p);
          const a = angle[i] + swirl[i] * p;
          const wobble = 7 * bell;
          const x = sx[i] + (tx[i] - sx[i]) * e + Math.cos(a) * reach[i] * bell + Math.sin(p * 7 + phase[i]) * wobble;
          const y = sy[i] + (ty[i] - sy[i]) * e + Math.sin(a) * reach[i] * bell + Math.cos(p * 6 + phase[i]) * wobble;
          const size = cell + (grain[i] * (pass ? 1.5 : 1) - cell) * Math.min(1, bell * 1.6);
          ctx.globalAlpha = pass ? 0.55 + 0.45 * bell : 1 - 0.5 * bell;
          ctx.fillRect(x, y, size, size);
        }
      }

      // 4. Passage de relais au vrai texte, en fondu croisé.
      if (time >= end && !revealed) {
        revealed = true;
        setDusting(false);
      }
      if (time >= end) canvas.style.opacity = String(1 - clamp01((time - end) / HANDOFF));

      if (time < total) {
        raf.current = requestAnimationFrame(draw);
      } else {
        canvas.width = 0;
        canvas.height = 0;
        canvas.style.opacity = "";
        busy.current = false;
      }
    };
    canvas.style.opacity = "1";
    raf.current = requestAnimationFrame(draw);
  }, [accent]);

  // Première transformation : une fois le titre bien à l'écran.
  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    let timer: number | undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      timer = window.setTimeout(() => { if (sideRef.current === "a") play(); }, 1300);
    }, { threshold: 0.95 });
    io.observe(line);
    return () => { io.disconnect(); window.clearTimeout(timer); };
  }, [play]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const onEnter = () => { if (window.matchMedia("(hover: hover)").matches) play(); };

  return (
    <span ref={lineRef} className={`af-dust${dusting ? " is-dusting" : ""}`} onMouseEnter={onEnter} onClick={play}>
      <em ref={wordRef} className="af-dust__word">
        <i ref={baseRef} className="af-dust__base" aria-hidden="true" />
        <span ref={aRef} className={side === "a" ? "is-shown" : ""} aria-hidden={side !== "a"}>{from}</span>
        <span ref={bRef} className={side === "b" ? "is-shown" : ""} aria-hidden={side !== "b"}>{to}</span>
      </em>{" "}
      <span ref={restRef} className="af-dust__rest">{rest}</span>
      <canvas ref={canvasRef} className="af-dust__canvas" aria-hidden="true" width={0} height={0} style={{ left: -PAD_X, top: -PAD_Y }} />
    </span>
  );
}
