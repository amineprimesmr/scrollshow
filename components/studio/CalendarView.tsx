"use client";

import { dateInTimeZone } from "@/lib/settings";
import type { StudioPost } from "@/lib/types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconAlert, IconCalendar, IconCheck, IconChevron, IconInbox, IconLock, IconPlus, IconTrash, IconX } from "./icons";
import { useStudio } from "./StudioContext";
import { SlidePreview } from "./SlidePreview";

type Mode = "day" | "week" | "month";
type Status = "published" | "scheduled" | "draft" | "failed";

const DOW_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Appui long avant de soulever une carte au doigt ; a la souris un petit deplacement suffit. */
const HOLD_MS = 260;
const HOLD_SLOP = 8;
const MOUSE_SLOP = 6;

function ymd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date, weekStartsOn: 0 | 1) {
  const start = new Date(date);
  const day = (start.getDay() - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

function statusOf(post: StudioPost): Status {
  if (post.publishError || post.publishState === "FAILED") return "failed";
  return post.status;
}

function byTime(a: StudioPost, b: StudioPost) {
  return (a.time || "").localeCompare(b.time || "");
}

/** Miroir de assertEditable cote serveur : un post publie ou en cours de publication ne bouge plus. */
function isLocked(post: StudioPost) {
  if (post.status === "published") return true;
  return Boolean(post.publishId) || ["PREPARING", "INITIATING", "PROCESSING", "REVIEW_REQUIRED"].includes(post.publishState || "");
}

type Drag = {
  post: StudioPost;
  x: number;
  y: number;
  /** Decalage entre le pointeur et le coin de la carte, pour que le fantome ne saute pas. */
  dx: number;
  dy: number;
  width: number;
  over: { kind: "day"; date: string } | { kind: "trash" } | null;
};

type Toast = { tone: "ok" | "bad"; text: string };

function errorCopy(code: string, english: boolean) {
  const table: Record<string, [string, string]> = {
    publication_locked: ["Ce post est en cours de publication : il ne peut plus bouger.", "This post is being published and can no longer move."],
    invalid_schedule: ["Date invalide.", "Invalid date."],
    tiktok_not_connected: ["Le compte TikTok de ce post n’est plus connecté.", "This post’s TikTok account is no longer connected."],
    missing: ["Ce post n’existe plus.", "This post no longer exists."],
    tiktok_options_required: ["Ce post planifié n’a pas ses options TikTok : ouvre-le pour les compléter.", "This scheduled post is missing its TikTok options: open it to complete them."],
    channel_not_owned: ["Ce compte n’appartient pas au projet.", "This account does not belong to the project."],
    network: ["Hors connexion : le post n’a pas été déplacé.", "Offline: the post was not moved."],
  };
  const hit = table[code];
  if (hit) return english ? hit[1] : hit[0];
  return english ? "The change could not be saved." : "Le changement n’a pas pu être enregistré.";
}

export function CalendarView() {
  const { posts, channels, activeChannel, setActiveChannel, setEditing, setPostOpen, setComposeDate, user, english, loaded, syncError, reload, patchPostLocal, removePostLocal } = useStudio();
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setModeState] = useState<Mode>("month");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StudioPost | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState<string>("");
  const dragRef = useRef<Drag | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Remember the last view (read after mount so server and client render the same first frame).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("ss-cal-mode");
      if (saved === "day" || saved === "week") setModeState(saved);
    } catch {}
  }, []);
  const locale = english ? "en-US" : "fr-FR";
  const t = useCallback((fr: string, en: string) => (english ? en : fr), [english]);
  const weekStartsOn = user?.settings.weekStartsOn === 0 ? 0 : 1;
  const dowBase = english ? DOW_EN : DOW_FR;
  const dow = weekStartsOn === 0 ? [dowBase[6], ...dowBase.slice(0, 6)] : dowBase;
  const today = dateInTimeZone(user?.settings.timezone || "Europe/Paris");
  const activeChannelRow = activeChannel === "all" ? null : channels.find((channel) => channel.id === activeChannel) || null;

  const showToast = useCallback((next: Toast) => {
    setToast(next);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), next.tone === "ok" ? 2600 : 4200);
  }, []);

  const visible = useMemo(
    () =>
      posts.filter(
        (post) =>
          post.inCalendar !== false && (activeChannel === "all" || post.channelIds.includes(activeChannel)),
      ),
    [posts, activeChannel],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, StudioPost[]>();
    for (const post of visible) {
      const list = map.get(post.date) || [];
      list.push(post);
      map.set(post.date, list);
    }
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [visible]);

  // Days shown in the current mode. The month grid only has as many rows as the month needs.
  const days = useMemo(() => {
    if (mode === "day") return [new Date(cursor)];
    if (mode === "week") {
      const start = startOfWeek(cursor, weekStartsOn);
      return Array.from({ length: 7 }, (_, index) => addDays(start, index));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const start = startOfWeek(first, weekStartsOn);
    const span = Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1;
    const rows = Math.ceil(span / 7);
    return Array.from({ length: rows * 7 }, (_, index) => addDays(start, index));
  }, [cursor, mode, weekStartsOn]);

  // Vue jour : la semaine autour du jour sert de bandeau de navigation et de cibles de depot.
  const weekStrip = useMemo(() => {
    const start = startOfWeek(cursor, weekStartsOn);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursor, weekStartsOn]);

  // Stats describe what is on screen, not the whole account.
  const stats = useMemo(() => {
    const counts = { published: 0, scheduled: 0, draft: 0, failed: 0 };
    for (const day of days) {
      for (const post of byDate.get(ymd(day)) || []) counts[statusOf(post)] += 1;
    }
    return counts;
  }, [days, byDate]);

  const label = useMemo(() => {
    if (mode === "day") {
      return cursor.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
    }
    if (mode === "week") {
      const start = days[0];
      const end = days[6];
      const sameMonth = start.getMonth() === end.getMonth();
      const from = start.toLocaleDateString(locale, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
      const to = end.toLocaleDateString(locale, { day: "numeric", month: "short" });
      return `${from} – ${to}`;
    }
    return cursor.toLocaleDateString(locale, { month: "long" });
  }, [cursor, days, locale, mode]);

  const step = useCallback(
    (direction: -1 | 1) => {
      setCursor((date) => {
        if (mode === "day") return addDays(date, direction);
        if (mode === "week") return addDays(date, 7 * direction);
        return new Date(date.getFullYear(), date.getMonth() + direction, 1);
      });
    },
    [mode],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && dragRef.current) {
        cancelDrag();
        return;
      }
      if (event.key === "Escape" && confirmDelete) {
        setConfirmDelete(null);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (target?.isContentEditable || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
      else if (event.key.toLowerCase() === "t") setCursor(new Date());
      else if (event.key === "Escape" && mode !== "month") setMode(mode === "day" ? "week" : "month");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode, confirmDelete]);

  function openPost(post: StudioPost) {
    setEditing(post);
    setPostOpen(true);
  }

  function newPost(date?: string) {
    setEditing(null);
    setComposeDate(date || null);
    setPostOpen(true);
  }

  function goToDay(date: Date) {
    setCursor(date);
    setModeState("day");
    try {
      window.localStorage.setItem("ss-cal-mode", "day");
    } catch {}
  }

  // Switching to a finer view lands on today when it is in the visible range,
  // otherwise on the first day of the current range; never on a stale cursor.
  function setMode(next: Mode) {
    setModeState(next);
    try {
      window.localStorage.setItem("ss-cal-mode", next);
    } catch {}
    if (next === "month") return;
    const now = new Date();
    const inRange = days.some((day) => ymd(day) === ymd(now));
    if (inRange) setCursor(now);
    else if (mode === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  }

  /** Click on the empty part of a day: open that day. Clicks on posts and buttons keep their own action. */
  function onDayClick(event: React.MouseEvent, date: Date) {
    if ((event.target as HTMLElement).closest("button")) return;
    goToDay(date);
  }

  // ---- Glisser-deposer -----------------------------------------------------

  function updateDrag(next: Drag | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function cancelDrag() {
    updateDrag(null);
    document.body.classList.remove("ss-dragging");
    document.removeEventListener("touchmove", blockScroll);
  }

  /** Cible sous le pointeur : un jour (data-date) ou la corbeille. */
  function targetAt(x: number, y: number): Drag["over"] {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zone = el?.closest<HTMLElement>("[data-drop]");
    if (!zone) return null;
    if (zone.dataset.drop === "trash") return { kind: "trash" };
    if (zone.dataset.drop === "day" && zone.dataset.date) return { kind: "day", date: zone.dataset.date };
    return null;
  }

  /** Fait defiler le conteneur quand le pointeur frole le haut ou le bas. */
  function autoScroll(y: number) {
    const body = document.querySelector<HTMLElement>(".ss-main__body");
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const edge = 56;
    if (y < rect.top + edge) body.scrollTop -= Math.ceil((rect.top + edge - y) / 4);
    else if (y > rect.bottom - edge) body.scrollTop += Math.ceil((y - (rect.bottom - edge)) / 4);
  }

  // Sur tactile, touch-action doit laisser defiler avant l'appui long ; une fois
  // la carte soulevee, on bloque le defilement natif a la main.
  const blockScroll = useCallback((event: TouchEvent) => {
    if (dragRef.current) event.preventDefault();
  }, []);

  function beginDrag(post: StudioPost, card: HTMLElement, x: number, y: number) {
    const rect = card.getBoundingClientRect();
    document.body.classList.add("ss-dragging");
    document.addEventListener("touchmove", blockScroll, { passive: false });
    if (navigator.vibrate) navigator.vibrate(12);
    updateDrag({ post, x, y, dx: x - rect.left, dy: y - rect.top, width: rect.width, over: targetAt(x, y) });
  }

  function moveDrag(x: number, y: number) {
    const current = dragRef.current;
    if (!current) return;
    autoScroll(y);
    updateDrag({ ...current, x, y, over: targetAt(x, y) });
  }

  async function endDrag() {
    const current = dragRef.current;
    cancelDrag();
    if (!current) return;
    // La cible est relue au relachement : un depot rapide peut n'avoir eu aucun mouvement intermediaire.
    const over = targetAt(current.x, current.y) || current.over;
    if (!over) return;
    if (over.kind === "trash") {
      setConfirmDelete(current.post);
      return;
    }
    const date = over.date;
    if (date === current.post.date) return;
    await movePost(current.post, date);
  }

  async function movePost(post: StudioPost, date: string) {
    if (isLocked(post)) {
      showToast({ tone: "bad", text: errorCopy("publication_locked", english) });
      return;
    }
    const previous = post.date;
    patchPostLocal(post.id, { date });
    setBusy(post.id);
    try {
      const res = await fetch(`/api/studio/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json.error || "server"));
      const when = new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }).replace(/\.$/, "");
      showToast({ tone: "ok", text: t(`Déplacé au ${when}.`, `Moved to ${when}.`) });
      void reload();
    } catch (error) {
      patchPostLocal(post.id, { date: previous });
      const code = error instanceof TypeError ? "network" : error instanceof Error ? error.message : "server";
      showToast({ tone: "bad", text: errorCopy(code, english) });
    } finally {
      setBusy("");
    }
  }

  async function deletePost(post: StudioPost) {
    setConfirmDelete(null);
    setBusy(post.id);
    try {
      const res = await fetch(`/api/studio/posts/${post.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json.error || "server"));
      removePostLocal(post.id);
      showToast({ tone: "ok", text: t("Post supprimé.", "Post deleted.") });
      void reload();
    } catch (error) {
      const code = error instanceof TypeError ? "network" : error instanceof Error ? error.message : "server";
      showToast({ tone: "bad", text: errorCopy(code, english) });
    } finally {
      setBusy("");
    }
  }

  const dragHandlers = { beginDrag, moveDrag, endDrag, cancelDrag };

  const overDate = drag?.over?.kind === "day" ? drag.over.date : null;
  const overTrash = drag?.over?.kind === "trash";

  const filterChip = activeChannelRow ? (
    <button type="button" className="ss-cal-filter lg--lens lg-press" onClick={() => setActiveChannel("all")} title={t("Afficher tous les comptes", "Show all channels")}>
      <img src={activeChannelRow.avatar || "/logo.png"} alt="" />
      <span>{activeChannelRow.name}</span>
      <IconX size={12} />
    </button>
  ) : null;

  const toolbar = (
    <div className="ss-cal-bar">
      <div className="ss-cal-nav">
        <button className="ss-btn-ghost ss-cal-nav__arrow" type="button" aria-label={t("Précédent", "Previous")} onClick={() => step(-1)}>
          <IconChevron dir="left" size={16} />
        </button>
        <h1 className="ss-cal-label">{label}</h1>
        <button className="ss-btn-ghost ss-cal-nav__arrow" type="button" aria-label={t("Suivant", "Next")} onClick={() => step(1)}>
          <IconChevron dir="right" size={16} />
        </button>
        {filterChip}
      </div>
      <div className="ss-cal-tools">
        <div className="ss-seg" role="tablist">
          {(
            [
              ["day", t("Jour", "Day")],
              ["week", t("Semaine", "Week")],
              ["month", t("Mois", "Month")],
            ] as const
          ).map(([id, name]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? "is-on" : ""} onClick={() => setMode(id)}>
              {name}
            </button>
          ))}
        </div>
        <button className="ss-btn-purple ss-cal-new" type="button" onClick={() => newPost(mode === "day" ? ymd(cursor) : undefined)}>
          <IconPlus size={16} />
          {t("Nouveau post", "New post")}
        </button>
      </div>
      <div className="ss-cal-stats" aria-label={t("Résumé de la période", "Period summary")}>
        {loaded ? <>
        <Stat tone="good" icon={<IconCheck size={14} />} count={stats.published} name={t("publiés", "published")} />
        <Stat tone="info" icon={<IconCalendar size={14} />} count={stats.scheduled} name={t("planifiés", "scheduled")} />
        <Stat tone="warn" icon={<IconInbox size={14} />} count={stats.draft} name={t("brouillons", "drafts")} />
        {stats.failed > 0 ? <Stat tone="bad" icon={<IconAlert size={14} />} count={stats.failed} name={t("échecs", "failed")} /> : null}
        </> : !syncError ? <span role="status">{t("Chargement du calendrier…", "Loading calendar…")}</span> : null}
        {syncError ? <div className="ss-cal-sync-error" role="status">
          <IconAlert size={14} />
          <span>{syncError === "session_expired"
            ? t("Ta session a expiré. Reconnecte-toi pour retrouver ton calendrier.", "Your session expired. Sign in to see your calendar.")
            : syncError === "offline"
              ? t("Hors connexion. Le calendrier se mettra à jour au retour du réseau.", "Offline. Your calendar will update when the connection returns.")
              : t("Actualisation interrompue. Nouvelle tentative automatique en cours.", "Refresh interrupted. Retrying automatically.")}</span>
          {syncError === "session_expired"
            ? <Link className="ss-btn-ghost" href="/signup?mode=signin&next=/app">{t("Me reconnecter", "Sign in")}</Link>
            : <button className="ss-btn-ghost" type="button" onClick={() => void reload()}>{t("Réessayer", "Retry")}</button>}
        </div> : null}
      </div>
    </div>
  );

  // Calques flottants : fantome sous le pointeur, corbeille, confirmation, toast.
  const overlays = typeof document === "undefined" ? null : createPortal(
    <>
      {drag ? (
        <div
          className={`ss-drag-ghost is-${statusOf(drag.post)}${overTrash ? " is-doomed" : ""}`}
          style={{ transform: `translate(${drag.x - drag.dx}px, ${drag.y - drag.dy}px)`, width: drag.width }}
          aria-hidden
        >
          <PostCard post={drag.post} english={english} compact={mode === "month"} large={mode === "day"} />
        </div>
      ) : null}
      {drag ? (
        <div className={`ss-drag-trash lg${overTrash ? " is-over" : ""}`} data-drop="trash" role="presentation">
          <IconTrash size={18} />
          <span>{overTrash ? t("Relâche pour supprimer", "Release to delete") : t("Glisse ici pour supprimer", "Drag here to delete")}</span>
        </div>
      ) : null}
      {confirmDelete ? (
        <div className="ss-cal-scrim" onClick={() => setConfirmDelete(null)}>
          <div className="ss-cal-confirm lg" role="alertdialog" aria-modal="true" aria-labelledby="ss-cal-confirm-title" onClick={(event) => event.stopPropagation()}>
            <IconTrash size={22} />
            <h2 id="ss-cal-confirm-title">{t("Supprimer ce post ?", "Delete this post?")}</h2>
            <p>{confirmDelete.body?.slice(0, 120) || t("Post sans titre", "Untitled post")}</p>
            <div className="ss-cal-confirm__actions">
              <button type="button" className="ss-btn-ghost lg-press" onClick={() => setConfirmDelete(null)} autoFocus>
                {t("Annuler", "Cancel")}
              </button>
              <button type="button" className="ss-btn-danger lg-press" onClick={() => void deletePost(confirmDelete)}>
                {t("Supprimer", "Delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className={`ss-cal-toast lg is-${toast.tone}`} role="status">
          {toast.tone === "ok" ? <IconCheck size={14} /> : <IconAlert size={14} />}
          <span>{toast.text}</span>
        </div>
      ) : null}
    </>,
    document.body,
  );

  if (!loaded) return <>{toolbar}<div className="ss-empty" aria-busy={!syncError}>
    <IconCalendar size={28} />
    <p>{syncError ? t("En attente du calendrier", "Waiting for calendar") : t("Récupération de tes publications…", "Fetching your posts…")}</p>
  </div></>;

  if (mode === "day") {
    const key = ymd(cursor);
    const dayPosts = byDate.get(key) || [];
    return (
      <>
        {toolbar}
        <div className="ss-daystrip" role="tablist" aria-label={t("Semaine", "Week")}>
          {weekStrip.map((date) => {
            const strip = ymd(date);
            const count = (byDate.get(strip) || []).length;
            const classes = ["ss-daystrip__day", strip === key && "is-on", strip === today && "is-today", overDate === strip && "is-drop"].filter(Boolean).join(" ");
            return (
              <button key={strip} type="button" role="tab" aria-selected={strip === key} className={classes} data-drop="day" data-date={strip} onClick={() => setCursor(date)}>
                <span>{date.toLocaleDateString(locale, { weekday: "short" })}</span>
                <b>{date.getDate()}</b>
                {count ? <i aria-label={`${count}`}>{count}</i> : null}
              </button>
            );
          })}
        </div>
        <div className="ss-dayview">
          {dayPosts.length ? (
            <ol className="ss-daylist">
              {dayPosts.map((post) => (
                <li key={post.id} className={busy === post.id ? "is-busy" : ""}>
                  <time>{post.time}</time>
                  <PostCard post={post} onOpen={openPost} english={english} large drag={dragHandlers} hidden={drag?.post.id === post.id} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="ss-empty">
              <h2>{key === today ? t("Rien aujourd’hui", "Nothing today") : t("Rien ce jour-là", "Nothing this day")}</h2>
              <p>{activeChannelRow ? t(`Aucun post de ${activeChannelRow.name} ce jour-là.`, `No ${activeChannelRow.name} post this day.`) : t("Planifie un post pour cette date.", "Schedule a post for this date.")}</p>
              <button className="ss-btn-purple" type="button" onClick={() => newPost(key)}>
                {t("Nouveau post", "New post")}
              </button>
            </div>
          )}
        </div>
        {overlays}
      </>
    );
  }

  if (mode === "week") {
    return (
      <>
        {toolbar}
        <div className="ss-week">
          {days.map((date) => {
            const key = ymd(date);
            const dayPosts = byDate.get(key) || [];
            return (
              <section
                key={key}
                className={`ss-week-col ${key === today ? "is-today" : ""} ${key < today ? "is-past" : ""} ${overDate === key ? "is-drop" : ""}`}
                data-drop="day"
                data-date={key}
                onClick={(event) => onDayClick(event, date)}
              >
                <header className="ss-week-col__head">
                  <span className="ss-week-col__date">
                    <span>{date.toLocaleDateString(locale, { weekday: "short" })}</span>
                    <b className="ss-day__n">{date.getDate()}</b>
                  </span>
                  <button type="button" className="ss-day__add" aria-label={t("Nouveau post ce jour", "New post this day")} onClick={() => newPost(key)}>
                    <IconPlus size={14} />
                  </button>
                </header>
                <div className="ss-week-col__list">
                  {dayPosts.map((post) => (
                    <PostCard key={post.id} post={post} onOpen={openPost} english={english} drag={dragHandlers} hidden={drag?.post.id === post.id} busy={busy === post.id} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {overlays}
      </>
    );
  }

  return (
    <>
      {toolbar}
      <div className="ss-grid" style={{ gridTemplateRows: `auto repeat(${days.length / 7}, minmax(0, 1fr))` }}>
        {dow.map((day) => (
          <div key={day} className="ss-dow">
            {day}
          </div>
        ))}
        {days.map((date) => {
          const key = ymd(date);
          const dayPosts = byDate.get(key) || [];
          const extra = dayPosts.length - 3;
          const classes = ["ss-day", date.getMonth() !== cursor.getMonth() && "is-out", key === today && "is-today", key < today && "is-past", overDate === key && "is-drop"]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={key}
              className={classes}
              role="button"
              tabIndex={0}
              data-drop="day"
              data-date={key}
              aria-label={date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
              onClick={(event) => onDayClick(event, date)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  goToDay(date);
                }
              }}
            >
              <div className="ss-day__head">
                <span className="ss-day__n">{date.getDate()}</span>
                <button type="button" className="ss-day__add" aria-label={t("Nouveau post ce jour", "New post this day")} onClick={() => newPost(key)}>
                  <IconPlus size={14} />
                </button>
              </div>
              {dayPosts.slice(0, 3).map((post) => (
                <PostCard key={post.id} post={post} onOpen={openPost} english={english} compact drag={dragHandlers} hidden={drag?.post.id === post.id} busy={busy === post.id} />
              ))}
              {extra > 0 ? (
                <button type="button" className="ss-day__more" onClick={() => goToDay(date)}>
                  +{extra} {t("de plus", "more")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {overlays}
    </>
  );
}

function Stat({ tone, icon, count, name }: { tone: "good" | "info" | "warn" | "bad"; icon: React.ReactNode; count: number; name: string }) {
  return (
    <span className={`ss-cal-stat is-${tone}`}>
      {icon}
      <b>{count}</b>
      <span>{name}</span>
    </span>
  );
}

type DragHandlers = {
  beginDrag: (post: StudioPost, card: HTMLElement, x: number, y: number) => void;
  moveDrag: (x: number, y: number) => void;
  endDrag: () => void;
  cancelDrag: () => void;
};

function PostCard({
  post,
  onOpen,
  english,
  compact,
  large,
  drag,
  hidden,
  busy,
}: {
  post: StudioPost;
  onOpen?: (post: StudioPost) => void;
  english: boolean;
  compact?: boolean;
  large?: boolean;
  drag?: DragHandlers;
  /** La carte d'origine reste en place, estompee, pendant que son fantome se deplace. */
  hidden?: boolean;
  busy?: boolean;
}) {
  const status = statusOf(post);
  const locked = isLocked(post);
  const statusName = {
    published: english ? "Published" : "Publié",
    scheduled: english ? "Scheduled" : "Planifié",
    draft: english ? "Draft" : "Brouillon",
    failed: english ? "Failed" : "Échec",
  }[status];
  const classes = ["ss-post", `is-${status}`, compact && "is-compact", large && "is-large", hidden && "is-lifted", busy && "is-busy", locked && "is-locked", drag && !locked && "is-draggable"].filter(Boolean).join(" ");
  const slide = post.recipe?.slides[0];

  // Appui long (tactile) ou petit deplacement (souris) : on soulève la carte.
  const press = useRef<{ id: number; x: number; y: number; timer: number | null; lifted: boolean; card: HTMLElement } | null>(null);

  function lift(card: HTMLElement, x: number, y: number) {
    if (!press.current || press.current.lifted || !drag) return;
    press.current.lifted = true;
    card.setPointerCapture(press.current.id);
    drag.beginDrag(post, card, x, y);
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag || locked || event.button !== 0) return;
    const card = event.currentTarget;
    const start = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: null as number | null, lifted: false, card };
    press.current = start;
    if (event.pointerType !== "mouse") {
      start.timer = window.setTimeout(() => lift(card, start.x, start.y), HOLD_MS);
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const current = press.current;
    if (!current || current.id !== event.pointerId) return;
    const dist = Math.hypot(event.clientX - current.x, event.clientY - current.y);
    if (current.lifted) {
      drag?.moveDrag(event.clientX, event.clientY);
      return;
    }
    if (event.pointerType === "mouse") {
      if (dist > MOUSE_SLOP) lift(current.card, event.clientX, event.clientY);
    } else if (dist > HOLD_SLOP && current.timer) {
      // Le doigt fait defiler : on abandonne l'appui long.
      window.clearTimeout(current.timer);
      current.timer = null;
    }
  }

  function finishPress(event: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const current = press.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.timer) window.clearTimeout(current.timer);
    press.current = null;
    if (!current.lifted) return;
    try {
      current.card.releasePointerCapture(event.pointerId);
    } catch {}
    if (cancelled) drag?.cancelDrag();
    else drag?.endDrag();
    // Le clic qui suit un depot ne doit pas ouvrir le post.
    current.card.dataset.justDragged = "1";
    window.setTimeout(() => delete current.card.dataset.justDragged, 0);
  }

  function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (event.currentTarget.dataset.justDragged) {
      event.preventDefault();
      return;
    }
    onOpen?.(post);
  }

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPress(event, false)}
      onPointerCancel={(event) => finishPress(event, true)}
      onContextMenu={(event) => {
        if (press.current) event.preventDefault();
      }}
      title={locked ? `${post.time} · ${statusName} · ${english ? "Locked" : "Verrouillé"}` : `${post.time} · ${statusName}`}
    >
      <span className="ss-post__bar" />
      {slide && post.recipe && !slide.html && !post.recipe.html ? (
        <span className="ss-post__preview" aria-hidden="true">
          <SlidePreview slide={slide} recipe={post.recipe} width={large ? 40 : compact ? 20 : 24} />
        </span>
      ) : <img src={post.image} alt="" loading="lazy" draggable={false} />}
      <span className="ss-post__text">
        {!compact ? (
          <small>{large ? statusName : post.time}</small>
        ) : null}
        <p>{post.body || (english ? "Untitled post" : "Post sans titre")}</p>
      </span>
      {locked && !compact ? <span className="ss-post__lock" aria-hidden><IconLock size={12} /></span> : null}
    </button>
  );
}
