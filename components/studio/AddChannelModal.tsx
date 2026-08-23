"use client";

import { PLATFORMS } from "@/lib/platforms";
import { useState } from "react";
import { useStudio } from "./StudioContext";

export function AddChannelModal() {
  const { addOpen, setAddOpen, reload } = useStudio();
  const [platform, setPlatform] = useState("tiktok");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [pending, setPending] = useState(false);

  if (!addOpen) return null;

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    await fetch("/api/studio/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, name, handle }),
    });
    setPending(false);
    setName("");
    setHandle("");
    setAddOpen(false);
    reload();
  }

  return (
    <div className="ss-modal" onClick={() => setAddOpen(false)}>
      <div className="ss-dialog" onClick={(event) => event.stopPropagation()}>
        <h2>Add Channel</h2>
        <div className="ss-platforms">
          {PLATFORMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={platform === item.id ? "is-on" : ""}
              onClick={() => setPlatform(item.id)}
            >
              <span className="ss-dot" style={{ background: item.color }} />
              {item.name}
            </button>
          ))}
        </div>
        <form className="ss-form" onSubmit={connect} style={{ marginTop: 16 }}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom du compte" required />
          <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@handle" required />
          <button className="ss-btn-purple" disabled={pending}>
            {pending ? "…" : "Connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
