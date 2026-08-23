"use client";

import { useMemo, useState } from "react";
import { useStudio } from "./StudioContext";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(year: number, month: number) {
  const date = new Date(year, month, 1);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

export function CalendarView() {
  const { posts, activeChannel, setEditing, setPostOpen } = useStudio();
  const [cursor, setCursor] = useState(() => new Date(2026, 7, 1));
  const [mode, setMode] = useState<"day" | "week" | "month">("month");

  const visible = posts.filter((post) => activeChannel === "all" || post.channelIds.includes(activeChannel));

  const cells = useMemo(() => {
    const start = startOfMonth(cursor.getFullYear(), cursor.getMonth());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date, key, inMonth: date.getMonth() === cursor.getMonth() };
    });
  }, [cursor]);

  const today = "2026-08-23";
  const label = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function open(postId?: string) {
    setEditing(visible.find((item) => item.id === postId) || null);
    setPostOpen(true);
  }

  if (mode === "week") {
    const week = cells.slice(7, 14);
    return (
      <>
        <Toolbar label={label} mode={mode} setMode={setMode} setCursor={setCursor} />
        <div className="ss-week">
          {week.map((cell) => (
            <div key={cell.key} className="ss-week-col">
              <strong>
                {cell.date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
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
        <Toolbar label={label} mode={mode} setMode={setMode} setCursor={setCursor} />
        <div className="ss-dayview">
          {visible
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
            ))}
        </div>
      </>
    );
  }

  return (
    <>
      <Toolbar label={label} mode={mode} setMode={setMode} setCursor={setCursor} />
      <div className="ss-grid">
        {DOW.map((day) => (
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
  label,
  mode,
  setMode,
  setCursor,
}: {
  label: string;
  mode: "day" | "week" | "month";
  setMode: (mode: "day" | "week" | "month") => void;
  setCursor: React.Dispatch<React.SetStateAction<Date>>;
}) {
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
        <button className="ss-btn-ghost" onClick={() => setCursor(new Date(2026, 7, 1))}>
          Today
        </button>
      </div>
      <div className="ss-seg">
        {(["day", "week", "month"] as const).map((item) => (
          <button key={item} className={mode === item ? "is-on" : ""} onClick={() => setMode(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
