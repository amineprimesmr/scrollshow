"use client";

import { dateInTimeZone } from "@/lib/settings";
import type { StudioPost } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconAlert, IconCalendar, IconCheck, IconChevron, IconInbox, IconPlus } from "./icons";
import { useStudio } from "./StudioContext";

type Mode = "day" | "week" | "month";
type Status = "published" | "scheduled" | "draft" | "failed";

const DOW_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

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

export function CalendarView() {
  const { posts, activeChannel, setEditing, setPostOpen, setComposeDate, user, english } = useStudio();
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setModeState] = useState<Mode>("month");

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
  }, [step, mode]);

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
        <Stat tone="good" icon={<IconCheck size={14} />} count={stats.published} name={t("publiés", "published")} />
        <Stat tone="info" icon={<IconCalendar size={14} />} count={stats.scheduled} name={t("planifiés", "scheduled")} />
        <Stat tone="warn" icon={<IconInbox size={14} />} count={stats.draft} name={t("brouillons", "drafts")} />
        {stats.failed > 0 ? <Stat tone="bad" icon={<IconAlert size={14} />} count={stats.failed} name={t("échecs", "failed")} /> : null}
      </div>
    </div>
  );

  if (mode === "day") {
    const key = ymd(cursor);
    const dayPosts = byDate.get(key) || [];
    return (
      <>
        {toolbar}
        <div className="ss-dayview">
          {dayPosts.length ? (
            <ol className="ss-daylist">
              {dayPosts.map((post) => (
                <li key={post.id}>
                  <time>{post.time}</time>
                  <PostCard post={post} onOpen={openPost} english={english} large />
                </li>
              ))}
            </ol>
          ) : (
            <div className="ss-empty">
              <h2>{key === today ? t("Rien aujourd’hui", "Nothing today") : t("Rien ce jour-là", "Nothing this day")}</h2>
              <p>{t("Planifie un post pour cette date.", "Schedule a post for this date.")}</p>
              <button className="ss-btn-purple" type="button" onClick={() => newPost(key)}>
                {t("Nouveau post", "New post")}
              </button>
            </div>
          )}
        </div>
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
                className={`ss-week-col ${key === today ? "is-today" : ""} ${key < today ? "is-past" : ""}`}
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
                    <PostCard key={post.id} post={post} onOpen={openPost} english={english} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
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
          const classes = ["ss-day", date.getMonth() !== cursor.getMonth() && "is-out", key === today && "is-today", key < today && "is-past"]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={key}
              className={classes}
              role="button"
              tabIndex={0}
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
                <PostCard key={post.id} post={post} onOpen={openPost} english={english} compact />
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

function PostCard({
  post,
  onOpen,
  english,
  compact,
  large,
}: {
  post: StudioPost;
  onOpen: (post: StudioPost) => void;
  english: boolean;
  compact?: boolean;
  large?: boolean;
}) {
  const status = statusOf(post);
  const statusName = {
    published: english ? "Published" : "Publié",
    scheduled: english ? "Scheduled" : "Planifié",
    draft: english ? "Draft" : "Brouillon",
    failed: english ? "Failed" : "Échec",
  }[status];
  const classes = ["ss-post", `is-${status}`, compact && "is-compact", large && "is-large"].filter(Boolean).join(" ");
  return (
    <button type="button" className={classes} onClick={() => onOpen(post)} title={`${post.time} · ${statusName}`}>
      <span className="ss-post__bar" />
      <img src={post.image} alt="" loading="lazy" />
      <span className="ss-post__text">
        {!compact ? (
          <small>{large ? statusName : post.time}</small>
        ) : null}
        <p>{post.body || (english ? "Untitled post" : "Post sans titre")}</p>
      </span>
    </button>
  );
}
