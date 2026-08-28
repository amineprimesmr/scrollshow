"use client";

import { dateInTimeZone } from "@/lib/settings";
import { useMemo, useState } from "react";
import { IconAlert, IconCalendar, IconCheck, IconInbox } from "./icons";
import { useStudio } from "./StudioContext";

const DOW_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function ymd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(year: number, month: number, weekStartsOn: 0 | 1) {
  const date = new Date(year, month, 1);
  const day = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

function startOfWeek(date: Date, weekStartsOn: 0 | 1) {
  const start = new Date(date);
  const day = (start.getDay() - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function CalendarView() {
  const { posts, activeChannel, setEditing, setPostOpen, setComposeDate, user, english } = useStudio();
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setMode] = useState<"day" | "week" | "month">("month");
  const locale = english ? "en-US" : "fr-FR";
  const weekStartsOn = user?.settings.weekStartsOn === 0 ? 0 : 1;
  const dowBase = locale.startsWith("fr") ? DOW_FR : DOW_EN;
  const dow = weekStartsOn === 0 ? [dowBase[6], ...dowBase.slice(0, 6)] : dowBase;
  const today = dateInTimeZone(user?.settings.timezone || "Europe/Paris");

  const visible = posts.filter(
    (post) =>
      post.inCalendar !== false && (activeChannel === "all" || post.channelIds.includes(activeChannel)),
  );

  const stats = useMemo(
    () => ({
      published: visible.filter((post) => post.status === "published").length,
      draft: visible.filter((post) => post.status === "draft").length,
      scheduled: visible.filter((post) => post.status === "scheduled").length,
      failed: visible.filter((post) => Boolean(post.publishError) || post.publishState === "FAILED").length,
    }),
    [visible],
  );

  const cells = useMemo(() => {
    const start = startOfMonth(cursor.getFullYear(), cursor.getMonth(), weekStartsOn);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = ymd(date);
      return { date, key, inMonth: date.getMonth() === cursor.getMonth() };
    });
  }, [cursor, weekStartsOn]);

  const label = cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });

  function open(postId?: string, date?: string) {
    if (postId) {
      setEditing(visible.find((item) => item.id === postId) || null);
    } else {
      setEditing(null);
      setComposeDate(date || null);
    }
    setPostOpen(true);
  }

  if (mode === "week") {
    const start = startOfWeek(cursor, weekStartsOn);
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, key: ymd(date), inMonth: true };
    });
    return (
      <>
        <Toolbar french={locale.startsWith("fr")} label={label} mode={mode} setMode={setMode} setCursor={setCursor} stats={stats} />
        <div className="ss-week">
          {week.map((cell) => (
            <div key={cell.key} className="ss-week-col">
              <strong>
                {cell.date.toLocaleDateString(locale, { weekday: "short", day: "numeric" })}
              </strong>
              {visible
                .filter((post) => post.date === cell.key)
                .map((post) => (
                  <button key={post.id} className="ss-post" onClick={() => open(post.id)}>
                    <span className="ss-post__bar" />
                    <img src={post.image} alt="" />
                    <p>{post.body}</p>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </>
    );
  }

  if (mode === "day") {
    const key = ymd(cursor);
    const isToday = key === today;
    const dayLabel = cursor.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
    return (
      <>
        <Toolbar french={locale.startsWith("fr")} label={dayLabel} mode={mode} setMode={setMode} setCursor={setCursor} stats={stats} />
        <div className="ss-dayview">
          {visible.filter((post) => post.date === key).length ? (
            visible
              .filter((post) => post.date === key)
              .map((post) => (
                <article key={post.id}>
                  <button className="ss-post" onClick={() => open(post.id)}>
                    <span className="ss-post__bar" />
                    <img src={post.image} alt="" />
                    <p>
                      {post.time} · {post.body}
                    </p>
                  </button>
                </article>
              ))
          ) : (
            <div className="ss-empty">
              <h2>
                {isToday
                  ? locale.startsWith("fr")
                    ? "Rien aujourd’hui"
                    : "Nothing today"
                  : locale.startsWith("fr")
                    ? "Rien ce jour-là"
                    : "Nothing this day"}
              </h2>
              <p>{locale.startsWith("fr") ? "Crée un post pour le calendrier." : "Create a post for the calendar."}</p>
              <button className="ss-btn-purple" type="button" onClick={() => open(undefined, key)}>
                {locale.startsWith("fr") ? "Nouveau post" : "New post"}
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Toolbar french={locale.startsWith("fr")} label={label} mode={mode} setMode={setMode} setCursor={setCursor} stats={stats} />
      <div className="ss-grid">
          {dow.map((day) => (
          <div key={day} className="ss-dow">
            {day}
          </div>
        ))}
        {cells.map((cell) => {
          const dayPosts = visible.filter((post) => post.date === cell.key);
          const extra = dayPosts.length - 3;
          return (
            <div
              key={cell.key}
              className={`ss-day ${cell.inMonth ? "" : "is-out"} ${cell.key === today ? "is-today" : ""}`}
              onDoubleClick={() => open(undefined, cell.key)}
            >
              <div className="ss-day__n">{cell.date.getDate()}</div>
              {dayPosts.slice(0, 3).map((post) => (
                <button key={post.id} className="ss-post" onClick={() => open(post.id)}>
                  <span className="ss-post__bar" />
                  <img src={post.image} alt="" />
                  <p>
                    {post.status === "draft" ? "Draft: " : ""}
                    {post.body}
                  </p>
                </button>
              ))}
              {extra > 0 ? (
                <button
                  type="button"
                  className="ss-day__more"
                  onClick={() => {
                    setCursor(cell.date);
                    setMode("day");
                  }}
                >
                  +{extra} {english ? "more" : "de plus"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

type CalendarStats = { published: number; draft: number; scheduled: number; failed: number };

function Toolbar({
  french,
  label,
  mode,
  setMode,
  setCursor,
  stats,
}: {
  french: boolean;
  label: string;
  mode: "day" | "week" | "month";
  setMode: (mode: "day" | "week" | "month") => void;
  setCursor: React.Dispatch<React.SetStateAction<Date>>;
  stats: CalendarStats;
}) {
  const modes = french
    ? ([
        ["day", "Jour"],
        ["week", "Semaine"],
        ["month", "Mois"],
      ] as const)
    : ([
        ["day", "Day"],
        ["week", "Week"],
        ["month", "Month"],
      ] as const);
  return (
    <div className="ss-cal-bar">
      <div className="ss-cal-nav">
        <button className="ss-btn-ghost" onClick={() => setCursor((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}>
          ‹
        </button>
        <strong>{label}</strong>
        <button className="ss-btn-ghost" onClick={() => setCursor((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}>
          ›
        </button>
        <button className="ss-btn-ghost" onClick={() => setCursor(new Date())}>
          {french ? "Aujourd’hui" : "Today"}
        </button>
      </div>
      <div className="ss-seg">
        {modes.map(([id, name]) => (
          <button key={id} className={mode === id ? "is-on" : ""} onClick={() => setMode(id)}>
            {name}
          </button>
        ))}
      </div>
      <div className="ss-cal-stats">
        <span className="ss-cal-stat is-good" title={french ? "Publiés" : "Published"}>
          <IconCheck size={16} />
          {stats.published}
        </span>
        <span className="ss-cal-stat is-warn" title={french ? "Brouillons" : "Drafts"}>
          <IconInbox size={16} />
          {stats.draft}
        </span>
        <span className="ss-cal-stat is-info" title={french ? "Planifiés" : "Scheduled"}>
          <IconCalendar size={16} />
          {stats.scheduled}
        </span>
        <span className="ss-cal-stat is-bad" title={french ? "Échecs" : "Failed"}>
          <IconAlert size={16} />
          {stats.failed}
        </span>
      </div>
    </div>
  );
}
