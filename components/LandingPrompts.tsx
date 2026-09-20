"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import "./landing-prompts.css";

type Copy = { fr: string; en: string };
type ExampleId = "research" | "create" | "schedule" | "analyse";
type Example = {
  id: ExampleId;
  label: Copy;
  agent: { name: string; icon: string };
  glow: string;
  prompt: Copy;
  steps: { tool: string; detail: Copy }[];
  summary: Copy;
};

const EXAMPLES: Example[] = [
  {
    id: "research",
    label: { fr: "Rechercher", en: "Research" },
    agent: { name: "Claude Code", icon: "/assets/ai/claude-transparent.png" },
    glow: "#3c47f3",
    prompt: {
      fr: "Trouve les carrousels TikTok qui cartonnent sur le sommeil, 10 k vues minimum.",
      en: "Find the TikTok carousels taking off in the sleep niche, 10k views minimum.",
    },
    steps: [
      { tool: "whoami", detail: { fr: "Ton app, ton audience", en: "Your app, your audience" } },
      { tool: "start_research", detail: { fr: "3 mots-clés · 10 k vues min", en: "3 keywords · 10k views min" } },
      { tool: "compare_accounts", detail: { fr: "12 comptes mesurés", en: "12 accounts measured" } },
    ],
    summary: { fr: "38 carrousels au-dessus de 10 k vues, triés par vues.", en: "38 carousels above 10k views, sorted by views." },
  },
  {
    id: "create",
    label: { fr: "Créer", en: "Create" },
    agent: { name: "Codex", icon: "/assets/ai/codex-transparent.png" },
    glow: "#d97757",
    prompt: {
      fr: "Inspire-toi du meilleur format et crée un carrousel de 5 slides pour mon app.",
      en: "Use the best format as inspiration and create an original 5-slide carousel for my app.",
    },
    steps: [
      { tool: "get_content_brief", detail: { fr: "Formats étudiés", en: "Studied formats" } },
      { tool: "fork_post", detail: { fr: "Format adapté à ton app", en: "Format adapted to your app" } },
      { tool: "update_recipe", detail: { fr: "5 slides, textes éditables", en: "5 slides, editable text" } },
    ],
    summary: { fr: "Carrousel prêt dans ton studio, modifiable slide par slide.", en: "Carousel ready in your studio, editable slide by slide." },
  },
  {
    id: "schedule",
    label: { fr: "Planifier", en: "Schedule" },
    agent: { name: "Cursor", icon: "/assets/ai/cursor-transparent.png" },
    glow: "#8b7bff",
    prompt: {
      fr: "Planifie un carrousel par jour cette semaine, à 18 h.",
      en: "Schedule one carousel a day this week, at 6 pm.",
    },
    steps: [
      { tool: "list_posts", detail: { fr: "Créneaux libres repérés", en: "Free slots found" } },
      { tool: "create_post", detail: { fr: "7 carrousels créés", en: "7 carousels created" } },
      { tool: "update_post", detail: { fr: "Planifiés · 18:00", en: "Scheduled · 6:00 pm" } },
    ],
    summary: { fr: "Ta semaine est planifiée. Chaque post part à l'heure que tu as validée.", en: "Your week is scheduled. Every post goes out at the time you approved." },
  },
  {
    id: "analyse",
    label: { fr: "Analyser", en: "Analyse" },
    agent: { name: "Claude Code", icon: "/assets/ai/claude-transparent.png" },
    glow: "#369cfa",
    prompt: {
      fr: "Quels carrousels ont le mieux marché ce mois-ci, et pourquoi ?",
      en: "Which carousels performed best this month, and why?",
    },
    steps: [
      { tool: "get_analytics", detail: { fr: "30 derniers jours", en: "Last 30 days" } },
      { tool: "compare_formats", detail: { fr: "3 formats comparés", en: "3 formats compared" } },
      { tool: "save_format_analysis", detail: { fr: "Gagnant retenu", en: "Winner saved" } },
    ],
    summary: { fr: "Les listes « 5 erreurs » font trois fois ta médiane.", en: "“5 mistakes” lists do three times your median." },
  },
];

const CHAR_MS = 21;
const STEP_MS = 680;
const HOLD_MS = 4800;

type Phase = "typing" | "steps" | "result";

const ICONS: Record<ExampleId, string> = {
  research: "M11 4a7 7 0 1 0 4.4 12.5l4 4M11 4a7 7 0 0 1 7 7",
  create: "M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5ZM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z",
  schedule: "M7 3v3m10-3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  analyse: "M5 20V11m7 9V4m7 16v-6",
};

/** Exemples de prompts joués en boucle : saisie, appels d'outils, résultat. */
export function LandingPrompts({ english = false }: { english?: boolean }) {
  const t = useCallback((c: Copy) => (english ? c.en : c.fr), [english]);
  const [active, setActive] = useState(0);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);
  const [stepsDone, setStepsDone] = useState(0);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  const rootRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pausedRef = useRef(false);
  const copyTimer = useRef<number | undefined>(undefined);

  const example = EXAMPLES[active];
  const prompt = t(example.prompt);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // La pastille glisse sous l'onglet actif ; sur téléphone le rail défile seul.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = () => {
      const chip = chipRefs.current[active];
      if (!chip) return;
      setThumb({ x: chip.offsetLeft, w: chip.offsetWidth });
      const target = chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2;
      rail.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rail);
    return () => ro.disconnect();
  }, [active, english]);

  useEffect(() => {
    if (!inView) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const length = prompt.length;
    const stepCount = EXAMPLES[active].steps.length;
    if (reduce) {
      setTyped(length);
      setStepsDone(stepCount);
      setPhase("result");
      return;
    }

    let cancelled = false;
    let raf = 0;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>(resolve => { timers.push(window.setTimeout(resolve, ms)); });
    const type = () => new Promise<void>(resolve => {
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const count = Math.min(length, Math.floor((now - start) / CHAR_MS));
        setTyped(count);
        if (count < length) raf = requestAnimationFrame(tick);
        else resolve();
      };
      raf = requestAnimationFrame(tick);
    });

    void (async () => {
      setPhase("typing");
      setTyped(0);
      setStepsDone(0);
      await wait(420);
      if (cancelled) return;
      await type();
      await wait(380);
      if (cancelled) return;
      setPhase("steps");
      for (let i = 1; i <= stepCount; i++) {
        await wait(STEP_MS);
        if (cancelled) return;
        setStepsDone(i);
      }
      await wait(260);
      if (cancelled) return;
      setPhase("result");
      let left = HOLD_MS;
      while (left > 0) {
        await wait(100);
        if (cancelled) return;
        if (!pausedRef.current) left -= 100;
      }
      setActive(index => (index + 1) % EXAMPLES.length);
      setRun(n => n + 1);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      timers.forEach(id => window.clearTimeout(id));
    };
  }, [active, run, inView, prompt]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const select = (index: number) => {
    setActive(index);
    setRun(n => n + 1);
  };

  const onKey = (event: React.KeyboardEvent) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (active + delta + EXAMPLES.length) % EXAMPLES.length;
    select(next);
    chipRefs.current[next]?.focus();
  };

  const hover = (value: boolean) => {
    if (value && !window.matchMedia("(hover: hover)").matches) return;
    pausedRef.current = value;
    setPaused(value);
  };

  async function copy() {
    try { await navigator.clipboard.writeText(prompt); } catch { return; }
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  const resultOn = phase === "result";

  return (
    <section
      ref={rootRef}
      className={`af-pr${inView ? " is-live" : ""}${paused ? " is-paused" : ""}`}
      style={{ "--af-pr-glow": example.glow } as CSSProperties}
      aria-labelledby="af-pr-title"
    >
      <header className="af-pr__head">
        <h2 id="af-pr-title">{t({ fr: "Puis parle-lui normalement", en: "Then just talk to it" })}</h2>
        <p>{t({ fr: "Quelques prompts à essayer. Regarde ce que ton agent en fait.", en: "A few prompts to try. Watch what your agent does with them." })}</p>
      </header>

      <div className="af-pr__rail lg lg--lens" ref={railRef} role="tablist" aria-label={t({ fr: "Exemples de prompts", en: "Prompt examples" })} onKeyDown={onKey}>
        {thumb ? <span className="af-pr__thumb" aria-hidden="true" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} /> : null}
        {EXAMPLES.map((item, index) => (
          <button
            key={item.id}
            ref={node => { chipRefs.current[index] = node; }}
            type="button"
            role="tab"
            id={`af-pr-tab-${item.id}`}
            aria-selected={index === active}
            aria-controls="af-pr-panel"
            tabIndex={index === active ? 0 : -1}
            className={`af-pr__chip lg-press${index === active ? " is-active" : ""}`}
            onClick={() => select(index)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[item.id]} /></svg>
            {t(item.label)}
          </button>
        ))}
      </div>

      <div
        className="af-pr__panel"
        id="af-pr-panel"
        role="tabpanel"
        aria-labelledby={`af-pr-tab-${example.id}`}
        onMouseEnter={() => hover(true)}
        onMouseLeave={() => hover(false)}
      >
        <div className="af-pr__bar">
          <span className="af-pr__agent" key={example.agent.name + run}>
            <img src={example.agent.icon} alt="" width={18} height={18} />
            {example.agent.name}
          </span>
          <span className="af-pr__linked"><i aria-hidden="true" />{t({ fr: "ScrollShow connecté", en: "ScrollShow connected" })}</span>
        </div>

        <div className="af-pr__body" key={`${example.id}-${run}`}>
          <div className="af-pr__talk">
            <div className={`af-pr__composer${phase === "typing" ? " is-typing" : ""}`}>
              <p className="af-pr__sr">{prompt}</p>
              <p className="af-pr__prompt" aria-hidden="true">
                <span>{prompt.slice(0, typed)}</span>
                <i className="af-pr__caret" />
                <span className="af-pr__ghost">{prompt.slice(typed)}</span>
              </p>
              <button type="button" className={`af-pr__copy${copied ? " is-copied" : ""}`} onClick={() => void copy()} aria-label={t({ fr: "Copier ce prompt", en: "Copy this prompt" })}>
                {copied
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 12 5 5L20 6" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>}
              </button>
            </div>

            <ol className="af-pr__steps">
              {example.steps.map((step, index) => {
                const state = phase === "typing" ? "idle" : index < stepsDone ? "done" : index === stepsDone && phase === "steps" ? "running" : "idle";
                return (
                  <li key={step.tool} className={`af-pr__step is-${state}`}>
                    <span className="af-pr__status" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    </span>
                    <code>{step.tool}</code>
                    <span className="af-pr__detail">{t(step.detail)}</span>
                  </li>
                );
              })}
            </ol>

            <p className={`af-pr__summary${resultOn ? " is-on" : ""}`}>{t(example.summary)}</p>
          </div>

          <div className={`af-pr__stage${resultOn ? " is-on" : ""}`} aria-hidden="true">
            <Result id={example.id} english={english} />
          </div>
        </div>

        <span className={`af-pr__progress${resultOn ? " is-on" : ""}`} aria-hidden="true" key={`p-${example.id}-${run}`}><i style={{ animationDuration: `${HOLD_MS}ms` }} /></span>
      </div>

      <p className="af-pr__note">{t({ fr: "Exemples illustratifs. Tes chiffres, eux, sont mesurés sur tes vrais comptes.", en: "Illustrative examples. Your numbers are measured on your real accounts." })}</p>
    </section>
  );
}

const WALL: { hook: Copy; views: string; cover: string }[] = [
  { hook: { fr: "5 habitudes qui ruinent ton sommeil", en: "5 habits ruining your sleep" }, views: "214 k", cover: "linear-gradient(160deg,#27306f,#0d1130 70%)" },
  { hook: { fr: "30 jours sans écran le soir", en: "30 days, no screens at night" }, views: "96 k", cover: "linear-gradient(160deg,#5a2f6e,#190d24 70%)" },
  { hook: { fr: "Ce que ton réveil dit de toi", en: "What your alarm says about you" }, views: "58 k", cover: "linear-gradient(160deg,#1f5a66,#08191d 70%)" },
  { hook: { fr: "La routine du soir en 4 étapes", en: "The 4-step evening routine" }, views: "31 k", cover: "linear-gradient(160deg,#6b4526,#1d1209 70%)" },
];

const BARS: { label: Copy; views: string; size: number }[] = [
  { label: { fr: "5 erreurs avant de dormir", en: "5 mistakes before bed" }, views: "212 k", size: 1 },
  { label: { fr: "Routine du soir", en: "Evening routine" }, views: "74 k", size: 0.52 },
  { label: { fr: "Avant / après 30 jours", en: "Before / after 30 days" }, views: "41 k", size: 0.36 },
  { label: { fr: "Témoignage utilisateur", en: "User story" }, views: "12 k", size: 0.17 },
];

function Result({ id, english }: { id: ExampleId; english: boolean }) {
  const t = (c: Copy) => (english ? c.en : c.fr);
  const delay = (i: number) => ({ "--i": i } as CSSProperties);

  if (id === "research") {
    return (
      <div className="af-pr-wall">
        {WALL.map((tile, i) => (
          <div className="af-pr-wall__tile" key={tile.views} style={{ ...delay(i), backgroundImage: tile.cover }}>
            <strong>{t(tile.hook)}</strong>
            <span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>{tile.views}</span>
          </div>
        ))}
      </div>
    );
  }

  if (id === "create") {
    return (
      <div className="af-pr-deck">
        {[0, 1, 2, 3, 4].map(i => (
          <div className="af-pr-deck__slide" key={i} style={{ ...delay(i), "--o": i - 2 } as CSSProperties}>
            {i === 0 ? <strong>{t({ fr: "Tu dors 8 h et tu es quand même fatigué ?", en: "8 hours of sleep and still tired?" })}</strong> : null}
            {i > 0 && i < 4 ? <><b>{i}</b><i /><i /><i /></> : null}
            {i === 4 ? <><strong>{t({ fr: "Essaie ce soir", en: "Try it tonight" })}</strong><em>{t({ fr: "Télécharger", en: "Download" })}</em></> : null}
          </div>
        ))}
      </div>
    );
  }

  if (id === "schedule") {
    const days = english ? ["M", "T", "W", "T", "F", "S", "S"] : ["L", "M", "M", "J", "V", "S", "D"];
    return (
      <div className="af-pr-week">
        {days.map((day, i) => (
          <div className="af-pr-week__day" key={i} style={delay(i)}>
            <span>{day}</span>
            <div className="af-pr-week__slot"><i /></div>
            <small>{english ? "6 pm" : "18:00"}</small>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="af-pr-bars">
      {BARS.map((bar, i) => (
        <div className={`af-pr-bars__row${i === 0 ? " is-top" : ""}`} key={bar.views} style={{ ...delay(i), "--s": bar.size } as CSSProperties}>
          <span>{t(bar.label)}</span>
          <div><i /></div>
          <b>{bar.views}</b>
        </div>
      ))}
    </div>
  );
}
