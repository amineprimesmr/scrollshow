"use client";

import { useMemo, useState } from "react";
import { useStudio } from "./StudioContext";

const DOW_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function ymd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(year: number, month: number) {
  const date = new Date(year, month, 1);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function CalendarView() {
  const { posts, activeChannel, setEditing, setPostOpen } = useStudio();
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setMode] = useState<"day" | "week" | "month">("month");
  const locale = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("fr") ? "fr-FR" : "en-US";
  const dow = locale.startsWith("fr") ? DOW_FR : DOW_EN;
  const today = ymd(new Date());

  const visible = posts.filter((post) => activeChannel === "all" || post.channelIds.includes(activeChannel));

  const cells = useMemo(() => {
    const start = startOfMonth(cursor.getFullYear(), cursor.getMonth());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = ymd(date);
      return { date, key, inMonth: date.getMonth() === cursor.getMonth() };
    });
  }, [cursor]);

  const label = cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });

  function open(postId?: string) {
    setEditing(visible.find((item) => item.id === postId) || null);
    setPostOpen(true);
  }

  if (mode === "week") {
    const start = startOfWeek(cursor);
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date, key: ymd(date), inMonth: true };
    });
    return (
      <>
        <Toolbar french={locale.startsWith("fr")} label={label} mode={mode} setMode={setMode} setCursor={setCursor} />
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
    const key = today;
    return (
      <>
        <Toolbar french={locale.startsWith("fr")} label={label} mode={mode} setMode={setMode} setCursor={setCursor} />
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
              <h2>{locale.startsWith("fr") ? "Rien aujourd’hui" : "Nothing today"}</h2>
              <p>{locale.startsWith("fr") ? "Crée un post pour le calendrier." : "Create a post for the calendar."}</p>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Toolbar french={locale.startsWith("fr")} label={label} mode={mode} setMode={setMode} setCursor={setCursor} />
      <div className="ss-grid">
          {dow.map((day) => (
          <div key={day} className="ss-dow">
            {day}
          </div>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.key}
            className={`ss-day ${cell.inMonth ? "" : "is-out"} ${cell.key === today ? "is-today" : ""}`}
            onDoubleClick={() => open()}
          >
            <div className="ss-day__n">{cell.date.getDate()}</div>
            {visible
              .filter((post) => post.date === cell.key)
              .slice(0, 3)
              .map((post) => (
                <button key={post.id} className="ss-post" onClick={() => open(post.id)}>
                  <span className="ss-post__bar" />
                  <img src={post.image} alt="" />
                  <p>
                    {post.status === "draft" ? "Draft: " : ""}
                    {post.body}
                  </p>
                </button>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}

function Toolbar({
  french,
  label,
  mode,
  setMode,
  setCursor,
}: {
  french: boolean;
  label: string;
  mode: "day" | "week" | "month";
  setMode: (mode: "day" | "week" | "month") => void;
  setCursor: React.Dispatch<React.SetStateAction<Date>>;
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
    </div>
  );
}
