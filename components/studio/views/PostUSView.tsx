"use client";

import { t } from "@/lib/i18n";
import { US_AGENT_PROMPT, US_COST, US_GOLDEN_RULE, US_STEPS, US_TASK_TOTAL, type UsStep } from "@/lib/us-guide";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevron } from "../icons";
import { useStudio } from "../StudioContext";
import "../post-us.css";

/** Un lien vers l'extérieur s'ouvre dans un onglet, un lien du studio non. */
function Out({ href, children }: { href: string; children: React.ReactNode }) {
  if (href.startsWith("/")) return <Link href={href}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function AgentPrompt({ en }: { en: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = en ? US_AGENT_PROMPT.en : US_AGENT_PROMPT.fr;

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <button type="button" className={`ss-us-copy${copied ? " is-copied" : ""}`} onClick={() => void copy()}>
      {copied ? <IconCheck size={15} /> : null}
      {copied ? t("Copié", "Copied", en) : t("Copier le prompt de l'agent", "Copy the agent prompt", en)}
    </button>
  );
}

function Step({
  step,
  index,
  en,
  done,
  toggle,
  open,
  setOpen,
}: {
  step: UsStep;
  index: number;
  en: boolean;
  done: Set<string>;
  toggle: (id: string) => void;
  open: boolean;
  setOpen: (id: string | null) => void;
}) {
  const checked = step.tasks.filter((task) => done.has(task.id)).length;
  const complete = checked === step.tasks.length;

  return (
    <li className={`ss-us-step${complete ? " is-done" : ""}${open ? " is-open" : ""}`}>
      <button type="button" className="ss-us-step__head" onClick={() => setOpen(open ? null : step.id)} aria-expanded={open}>
        <span className="ss-us-step__num">{complete ? <IconCheck size={15} /> : index + 1}</span>
        <strong>{t(step.fr, step.en, en)}</strong>
        <span className="ss-us-step__count">
          {checked}/{step.tasks.length}
        </span>
        <i>{step.minutes} min</i>
        <IconChevron dir={open ? "down" : "right"} size={15} />
      </button>

      <div className="ss-us-step__body" hidden={!open}>
        <ul className="ss-us-tasks">
          {step.tasks.map((task) => {
            const on = done.has(task.id);
            const detail = en ? task.detailEn : task.detailFr;
            return (
              <li key={task.id} className={on ? "is-done" : ""}>
                <label>
                  <input type="checkbox" checked={on} onChange={() => toggle(task.id)} />
                  <span className="ss-us-tasks__box" aria-hidden>
                    <IconCheck size={11} />
                  </span>
                  <span className="ss-us-tasks__text">
                    <b>{t(task.fr, task.en, en)}</b>
                    {detail ? <em>{detail}</em> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {step.agentPrompt ? <AgentPrompt en={en} /> : null}

        {step.links?.length ? (
          <p className="ss-us-links">
            {step.links.map((link) => (
              <Out key={link.href} href={link.href}>
                {t(link.fr, link.en, en)}
              </Out>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function PostUSView() {
  const { english: en } = useStudio();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Ce que le serveur a déjà : ouvrir la page ne doit pas déclencher un PUT.
  const savedRef = useRef<string>("");

  useEffect(() => {
    fetch("/api/studio/us-guide")
      .then((res) => res.json())
      .then((json) => {
        const saved = new Set<string>(Array.isArray(json.done) ? json.done : []);
        savedRef.current = Array.from(saved).sort().join(",");
        setDone(saved);
        // On ouvre la première étape non terminée : on reprend où on s'est arrêté.
        const next = US_STEPS.find((step) => step.tasks.some((task) => !saved.has(task.id)));
        setOpen(next?.id ?? US_STEPS[0].id);
      })
      .catch(() => setOpen(US_STEPS[0].id))
      .finally(() => setLoaded(true));
  }, []);

  const doneList = useMemo(() => Array.from(done), [done]);
  const signature = useMemo(() => [...doneList].sort().join(","), [doneList]);

  useEffect(() => {
    if (!loaded || signature === savedRef.current) return;
    const handle = window.setTimeout(() => {
      fetch("/api/studio/us-guide", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: doneList }),
      })
        .then(() => {
          savedRef.current = signature;
        })
        .catch(() => {});
    }, 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pct = US_TASK_TOTAL ? Math.round((done.size / US_TASK_TOTAL) * 100) : 0;

  return (
    <div className="ss-us">
      <header className="ss-us__bar">
        <div className="ss-us__title">
          <h1>{t("Poster aux US", "Post to the US", en)}</h1>
          <p>{t(US_COST.fr, US_COST.en, en)}</p>
        </div>
        <div className="ss-us__progress">
          <div className="ss-us__bar-track">
            <i style={{ width: `${pct}%` }} />
          </div>
          <span>
            {done.size}/{US_TASK_TOTAL}
          </span>
        </div>
      </header>

      <div className="ss-us__page">
        <ol className="ss-us-steps">
          {US_STEPS.map((step, index) => (
            <Step
              key={step.id}
              step={step}
              index={index}
              en={en}
              done={done}
              toggle={toggle}
              open={open === step.id}
              setOpen={setOpen}
            />
          ))}
        </ol>

        <p className="ss-us-rule">{t(US_GOLDEN_RULE.fr, US_GOLDEN_RULE.en, en)}</p>
      </div>
    </div>
  );
}
