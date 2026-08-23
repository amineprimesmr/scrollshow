"use client";

import { useEffect, useState } from "react";
import { useStudio } from "./StudioContext";

export function CreatePostModal() {
  const { postOpen, setPostOpen, channels, media, editing, setEditing, reload, activeChannel } = useStudio();
  const [body, setBody] = useState("");
  const [date, setDate] = useState("2026-08-23");
  const [time, setTime] = useState("18:00");
  const [status, setStatus] = useState<"draft" | "scheduled">("scheduled");
  const [image, setImage] = useState(media[0]?.url || "/assets/tiktoks/01-glowup-188k.png");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!postOpen) return;
    if (editing) {
      setBody(editing.body);
      setDate(editing.date);
      setTime(editing.time);
      setStatus(editing.status === "published" ? "scheduled" : editing.status);
      setImage(editing.image);
      setChannelIds(editing.channelIds);
      return;
    }
    setBody("");
    setDate(new Date().toISOString().slice(0, 10));
    setTime("18:00");
    setStatus("scheduled");
    setImage(media[0]?.url || "/assets/tiktoks/01-glowup-188k.png");
    setChannelIds(activeChannel === "all" ? channels.slice(0, 1).map((item) => item.id) : [activeChannel]);
  }, [postOpen, editing, channels, media, activeChannel]);

  if (!postOpen) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const payload = { body, date, time, status, image, channelIds };
    if (editing?.id) {
      await fetch(`/api/studio/posts/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/studio/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setPending(false);
    setPostOpen(false);
    setEditing(null);
    reload();
  }

  return (
    <div
      className="ss-modal"
      onClick={() => {
        setPostOpen(false);
        setEditing(null);
      }}
    >
      <div className="ss-dialog" onClick={(event) => event.stopPropagation()}>
        <h2>{editing ? "Edit post" : "Create Post"}</h2>
        <form className="ss-form" onSubmit={save}>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Caption…" required />
          <div className="ss-checks">
            {channels.map((channel) => (
              <label key={channel.id}>
                <input
                  type="checkbox"
                  checked={channelIds.includes(channel.id)}
                  onChange={(event) => {
                    setChannelIds((current) =>
                      event.target.checked ? [...current, channel.id] : current.filter((id) => id !== channel.id),
                    );
                  }}
                />
                {channel.name}
              </label>
            ))}
          </div>
          <select value={image} onChange={(event) => setImage(event.target.value)}>
            {media.map((item) => (
              <option key={item.id} value={item.url}>
                {item.name}
              </option>
            ))}
          </select>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
          <select value={status} onChange={(event) => setStatus(event.target.value as "draft" | "scheduled")}>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
          </select>
          <button className="ss-btn-purple" disabled={pending || !channelIds.length}>
            {pending ? "…" : editing ? "Save" : "Schedule"}
          </button>
        </form>
      </div>
    </div>
  );
}
