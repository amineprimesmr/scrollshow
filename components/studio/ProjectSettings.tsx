"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BUSINESS_KINDS } from "@/lib/business-kinds";
import { t } from "@/lib/i18n";
import { useStudio } from "./StudioContext";
import type { ProjectSummary } from "./ProjectSwitcher";

/** Onglet « Projet » des réglages : le business actif, son renommage, sa
 * ré-analyse, la bascule vers un autre projet et l'archivage. */
export function ProjectSettings() {
  const router = useRouter();
  const { english, reload } = useStudio();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"" | "rename" | "select" | "archive">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);

  function apply(json: { projects?: ProjectSummary[]; activeId?: string | null }) {
    setProjects(json.projects || []);
    setActiveId(json.activeId || null);
    const active = (json.projects || []).find((item) => item.id === json.activeId);
    if (active) setName(active.name);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { if (!cancelled && json) apply(json); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function send(body: Record<string, unknown>, kind: "rename" | "select" | "archive") {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error === "last_project"
          ? t("Tu dois garder au moins un projet.", "You must keep at least one project.", english)
          : t("Action impossible pour le moment.", "That did not work. Try again.", english));
        return false;
      }
      apply(json);
      return true;
    } catch {
      setError(t("Connexion perdue.", "Connection lost.", english));
      return false;
    } finally {
      setBusy("");
    }
  }

  const active = projects.find((item) => item.id === activeId) || null;
  const others = projects.filter((item) => item.id !== activeId);
  const business = active?.business || null;
  const kindLabel = business ? BUSINESS_KINDS.find((kind) => kind.id === business.kind)?.[english ? "en" : "fr"] : "";
  const site = business?.url ? business.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "";

  return (
    <div key="project" className="ss-tabpanel">
      <form
        className="ss-set-card ss-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!active || !name.trim() || name.trim() === active.name) return;
          if (await send({ action: "rename", id: active.id, name: name.trim() }, "rename")) {
            setNotice(t("Projet renommé.", "Project renamed.", english));
            await reload();
            router.refresh();
          }
        }}
      >
        <h2>{t("Projet actif", "Active project", english)}</h2>
        <p className="ss-lead">
          {t(
            "Chaque projet est un business à part : ses comptes TikTok, son calendrier, sa bibliothèque et ses recherches. Les agents branchés sur ce projet ne voient que lui.",
            "Each project is a separate business: its TikTok accounts, calendar, library and research. Agents connected to this project only see this project.",
            english,
          )}
        </p>

        {active ? (
          <>
            <div className="ss-biz">
              <div className="ss-biz__logo">{active.logo ? <img src={active.logo} alt="" /> : null}</div>
              <div className="ss-biz__text">
                <b>{active.name}</b>
                <span>
                  {business ? [kindLabel, site, business.tiktok ? `@${business.tiktok.handle}` : ""].filter(Boolean).join(" · ") : t("Business non analysé", "Business not analyzed", english)}
                </span>
              </div>
              <a className="ss-btn-ghost" href={`/onboarding?project=${encodeURIComponent(active.id)}&next=${encodeURIComponent("/app/settings?tab=project")}`}>
                {business ? t("Ré-analyser", "Re-analyze", english) : t("Configurer", "Set up", english)}
              </a>
            </div>
            {business?.keywords?.length ? (
              <p className="ss-muted">{t("Mots-clés", "Keywords", english)} · {business.keywords.slice(0, 8).join(", ")}</p>
            ) : null}
            <div className="ss-set-grid">
              <label>
                {t("Nom du projet", "Project name", english)}
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
              </label>
            </div>
            <p className="ss-muted">ID · {active.id}</p>
            {error ? <p className="ss-form-error" role="alert">{error}</p> : null}
            {notice ? <p className="ss-muted" role="status">{notice}</p> : null}
            <div className="ss-form-actions">
              <button className="ss-btn-purple" type="submit" disabled={busy !== "" || !name.trim() || name.trim() === active.name}>
                {busy === "rename" ? <span className="ss-spin" /> : t("Enregistrer", "Save", english)}
              </button>
            </div>
          </>
        ) : (
          <p className="ss-muted">{t("Chargement…", "Loading…", english)}</p>
        )}
      </form>

      <section className="ss-set-card">
        <h2>{t("Tous les projets", "All projects", english)}</h2>
        <p className="ss-lead">{t("Bascule d’un business à l’autre, ou ajoutes-en un nouveau.", "Switch between businesses, or add a new one.", english)}</p>
        <div className="ss-project-list">
          {projects.map((project) => (
            <div key={project.id} className={`ss-project-row${project.id === activeId ? " is-active" : ""}`}>
              <div className="ss-project-row__mark">{project.logo ? <img src={project.logo} alt="" /> : <span>{project.name.slice(0, 2).toUpperCase()}</span>}</div>
              <div className="ss-project-row__text">
                <b>{project.name}</b>
                <span>
                  {!project.completed
                    ? t("Configuration à terminer", "Setup to finish", english)
                    : project.id === activeId ? t("Projet actif", "Active project", english) : project.business?.name || ""}
                </span>
              </div>
              {!project.completed ? (
                <a className="ss-btn-ghost" href={`/onboarding?project=${encodeURIComponent(project.id)}`}>{t("Reprendre", "Resume", english)}</a>
              ) : project.id !== activeId ? (
                <button
                  type="button"
                  className="ss-btn-ghost"
                  disabled={busy !== ""}
                  onClick={async () => {
                    if (await send({ action: "select", id: project.id }, "select")) { await reload(); router.refresh(); }
                  }}
                >
                  {t("Ouvrir", "Open", english)}
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="ss-form-actions">
          <a className="ss-btn-purple" href="/onboarding?project=new">{t("Nouveau projet", "New project", english)}</a>
        </div>
      </section>

      {active ? (
        <section className="ss-set-card ss-set-card--danger">
          <h2>{t("Archiver ce projet", "Archive this project", english)}</h2>
          <p className="ss-lead">
            {others.length
              ? t("Le projet disparaît du sélecteur. Ses comptes, posts et recherches restent en base et ne sont pas supprimés.", "The project leaves the switcher. Its accounts, posts and research stay stored and are not deleted.", english)
              : t("Impossible : c’est ton seul projet. Crée-en un autre avant d’archiver celui-ci.", "Not possible: this is your only project. Create another one before archiving this one.", english)}
          </p>
          {confirmArchive ? (
            <div className="ss-form-actions">
              <button
                type="button"
                className="ss-btn-danger"
                disabled={busy !== ""}
                onClick={async () => {
                  if (await send({ action: "archive", id: active.id }, "archive")) { setConfirmArchive(false); await reload(); router.refresh(); }
                }}
              >
                {busy === "archive" ? <span className="ss-spin" /> : t("Oui, archiver", "Yes, archive", english)}
              </button>
              <button type="button" className="ss-btn-ghost" onClick={() => setConfirmArchive(false)}>{t("Annuler", "Cancel", english)}</button>
            </div>
          ) : (
            <div className="ss-form-actions">
              <button type="button" className="ss-btn-ghost" disabled={!others.length || busy !== ""} onClick={() => setConfirmArchive(true)}>
                {t("Archiver", "Archive", english)}
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
