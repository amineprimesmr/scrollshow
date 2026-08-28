"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconEdit, IconX } from "../icons";
import { useStudio } from "../StudioContext";

export function BlitzView() {
  const { posts, english: ctxEnglish, reload, setEditing, setPostOpen } = useStudio();
  const [english, setEnglish] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => setEnglish(prefersEnglish()), []);

  const en = ctxEnglish || english;
  const queue = useMemo(
    () =>
      posts.filter(
        (post) => post.status === "draft" || (post.inCalendar !== false && post.status === "scheduled"),
      ).length
        ? posts.filter((post) => post.status === "draft" || post.status === "scheduled")
        : posts.slice(0, 8),
    [posts],
  );

  const current = queue[index % Math.max(queue.length, 1)];
  const source = queue[(index + 1) % Math.max(queue.length, 1)];

  async function approve() {
    if (!current) return;
    await fetch(`/api/studio/posts/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "scheduled", inCalendar: true }),
    });
    await reload();
    setIndex((i) => i + 1);
  }

  async function reject() {
    setIndex((i) => i + 1);
  }

  function edit() {
    if (!current) return;
    setEditing(current);
    setPostOpen(true);
  }

  if (!current) {
    return (
      <div className="ss-empty">
        <h2>{t("Plus de contenu à swiper", "No more content to swipe", en)}</h2>
        <p>{t("Lance une automation ou importe depuis le Marketplace.", "Launch an automation or import from Marketplace.", en)}</p>
      </div>
    );
  }

  return (
    <div className="ss-blitz">
      <div>
        <p className="ss-lead" style={{ textAlign: "center", marginBottom: 12 }}>
          {t("Remixé depuis", "Remixed from", en)}
        </p>
        <div className="ss-blitz-source">
          <img src={source?.image || current.image} alt="" />
          <div className="ss-trend-card__stats">
            <span>♥ {(source?.likes || current.likes || 540).toLocaleString()}</span>
            <span>👁 {(source?.views || current.views || 10000).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="ss-blitz-tags">
          <span className="ss-blitz-tag">{current.recipe?.slides?.length || 1} slides</span>
          <button type="button" className="ss-blitz-tag is-accent">
            {t("Pourquoi ce contenu ?", "Why This Content?", en)}
          </button>
        </div>
        <div className="ss-blitz-stack">
          <img src={current.image} alt="" />
        </div>
        <div className="ss-blitz-actions">
          <button type="button" className="ss-blitz-btn is-reject" aria-label="Reject" onClick={() => void reject()}>
            <IconX size={22} />
          </button>
          <button type="button" className="ss-blitz-btn is-edit" aria-label="Edit" onClick={edit}>
            <IconEdit size={20} />
          </button>
          <button type="button" className="ss-blitz-btn is-approve" aria-label="Approve" onClick={() => void approve()}>
            <IconCheck size={22} />
          </button>
        </div>
        <p style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: "#71717a" }}>
          {index + 1} / {queue.length}
        </p>
      </div>

      <div aria-hidden style={{ width: 180 }} />
    </div>
  );
}
