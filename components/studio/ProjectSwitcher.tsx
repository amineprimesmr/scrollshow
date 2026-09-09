"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStudio } from "./StudioContext";
import { t } from "@/lib/i18n";

import type { PublicProject } from "@/lib/types";

export type ProjectSummary = PublicProject;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function ProjectSwitcher() {
  const { english, reload } = useStudio();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Le menu est monte en portal sur body : la sidebar cree son propre contexte
  // d'empilement et un menu absolu passerait sous la navigation.
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setProjects(json.projects || []);
        setActiveId(json.activeId || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = box.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 248) });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error === "last_project"
          ? t("Un dernier projet doit rester.", "One project must remain.", english)
          : t("Action impossible pour le moment.", "That did not work. Try again.", english));
        return false;
      }
      setProjects(json.projects || []);
      setActiveId(json.activeId || null);
      return true;
    } catch {
      setError(t("Connexion perdue.", "Connection lost.", english));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function select(project: ProjectSummary) {
    if (!project.completed) {
      // Un brouillon reprend son onboarding la ou il s'est arrete.
      setOpen(false);
      router.push(`/onboarding?project=${encodeURIComponent(project.id)}`);
      return;
    }
    if (project.id === activeId) { setOpen(false); return; }
    if (await send({ action: "select", id: project.id })) {
      setOpen(false);
      await reload();
      router.refresh();
    }
  }

  const active = projects.find((item) => item.id === activeId) || null;
  const label = active?.name || t("Projet", "Project", english);

  return (
    <div className={`ss-project${open ? " is-open" : ""}`} ref={box}>
      <button
        type="button"
        className="ss-project__btn lg-press"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="ss-project__mark" aria-hidden="true">
          {active?.logo ? <img src={active.logo} alt="" /> : <span>{initials(label)}</span>}
        </span>
        <span className="ss-project__name">{label}</span>
        <svg className="ss-project__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && anchor ? createPortal(
        <div className="ss-project__menu" role="menu" ref={menu} style={{ top: anchor.top, left: anchor.left, width: anchor.width }}>
          <p className="ss-project__label">{t("Projets", "Projects", english)}</p>
          <div className="ss-project__list">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                role="menuitemradio"
                aria-checked={project.id === activeId}
                className={`ss-project__item${project.id === activeId ? " is-active" : ""}`}
                onClick={() => void select(project)}
                disabled={busy}
              >
                <span className="ss-project__mark" aria-hidden="true">
                  {project.logo ? <img src={project.logo} alt="" /> : <span>{initials(project.name)}</span>}
                </span>
                <span className="ss-project__item-text">
                  <strong>{project.name}</strong>
                  {!project.completed
                    ? <em className="ss-project__draft">{t("Configuration à terminer", "Setup to finish", english)}</em>
                    : project.business?.name && project.business.name !== project.name ? <em>{project.business.name}</em> : null}
                </span>
                {project.id === activeId ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </button>
            ))}
          </div>

          <Link href="/onboarding?project=new" className="ss-project__action" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t("Nouveau projet", "New project", english)}
          </Link>

          <Link href="/app/settings?tab=project" className="ss-project__action" onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {t("Réglages du projet", "Project settings", english)}
          </Link>

          {error ? <p className="ss-project__error" role="alert">{error}</p> : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
