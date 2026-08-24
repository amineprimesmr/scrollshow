"use client";

import { prefersEnglish, t } from "@/lib/i18n";
import { platformName } from "@/lib/platforms";
import { useEffect, useState } from "react";
import { useStudio } from "./StudioContext";

const PRIVACY = [
  { id: "PUBLIC_TO_EVERYONE", fr: "Tout le monde", en: "Everyone" },
  { id: "MUTUAL_FOLLOW_FRIENDS", fr: "Amis", en: "Friends" },
  { id: "FOLLOWER_OF_CREATOR", fr: "Abonnés", en: "Followers" },
  { id: "SELF_ONLY", fr: "Moi uniquement", en: "Only me" },
];

export function CreatePostModal() {
  const { postOpen, setPostOpen, channels, media, editing, setEditing, reload, activeChannel } = useStudio();
  const [english, setEnglish] = useState(false);
  const [body, setBody] = useState("");
  const [date, setDate] = useState("2026-08-23");
  const [time, setTime] = useState("18:00");
  const [status, setStatus] = useState<"draft" | "scheduled">("scheduled");
  const [image, setImage] = useState(media[0]?.url || "/assets/tiktoks/01-glowup-188k.png");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState("SELF_ONLY");
  const [allowed, setAllowed] = useState<string[]>(PRIVACY.map((item) => item.id));
  const [commentsOff, setCommentsOff] = useState(true);
  const [branded, setBranded] = useState(false);
  const [organic, setOrganic] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const connected = channels.filter((item) => item.connected);

  useEffect(() => {
    setEnglish(prefersEnglish());
  }, []);

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
    setChannelIds(
      activeChannel === "all"
        ? channels.filter((item) => item.connected).slice(0, 1).map((item) => item.id)
        : [activeChannel],
    );
    setMessage("");
  }, [postOpen, editing, channels, media, activeChannel]);

  useEffect(() => {
    if (!postOpen || !connected.length) return;
    fetch("/api/tiktok/creator")
      .then((res) => res.json())
      .then((json) => {
        const options = json.creator?.privacy_level_options;
        if (Array.isArray(options) && options.length) {
          setAllowed(options);
          setPrivacy((current) => (options.includes(current) ? current : options[0]));
        }
      })
      .catch(() => undefined);
  }, [postOpen, connected.length]);

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

  async function publishNow() {
    setPending(true);
    setMessage("");
    const res = await fetch("/api/tiktok/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_images: [image],
        description: body,
        privacy_level: privacy,
        disable_comment: commentsOff,
        brand_content_toggle: branded,
        brand_organic_toggle: organic,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setMessage(json.error || t("Publication impossible", "Could not publish", english));
      return;
    }
    setMessage(t("Envoyé sur TikTok (video.publish)", "Posted to TikTok (video.publish)", english));
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
        <h2>{editing ? t("Modifier le post", "Edit post", english) : t("Publier sur TikTok", "Publish to TikTok", english)}</h2>
        <form className="ss-form" onSubmit={save}>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("Légende…", "Caption…", english)} required />
          {connected.length ? (
            <div className="ss-checks">
              {connected.map((channel) => (
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
                  {channel.name} · {platformName(channel.platform)}
                </label>
              ))}
            </div>
          ) : (
            <p className="ss-lead">
              {t("Connecte TikTok pour publier en Direct Post.", "Connect TikTok to publish with Direct Post.", english)}{" "}
              <a href="/api/tiktok/oauth/start">{t("Continuer avec TikTok", "Continue with TikTok", english)}</a>
            </p>
          )}
          {connected.some((channel) => channel.platform !== "tiktok") ? (
            <p className="ss-lead">
              {t(
                "La publication live est TikTok pour l’instant. Instagram, Facebook et X se connectent déjà.",
                "Live publishing is TikTok for now. Instagram, Facebook, and X can already be connected.",
                english,
              )}
            </p>
          ) : null}
          <select value={image} onChange={(event) => setImage(event.target.value)}>
            {media.map((item) => (
              <option key={item.id} value={item.url}>
                {item.name}
              </option>
            ))}
          </select>
          <select value={privacy} onChange={(event) => setPrivacy(event.target.value)}>
            {PRIVACY.filter((item) => allowed.includes(item.id)).map((item) => (
              <option key={item.id} value={item.id}>
                {english ? item.en : item.fr}
              </option>
            ))}
          </select>
          <label className="ss-checks">
            <input type="checkbox" checked={commentsOff} onChange={(event) => setCommentsOff(event.target.checked)} />
            {t("Désactiver les commentaires", "Disable comments", english)}
          </label>
          <label className="ss-checks">
            <input type="checkbox" checked={organic} onChange={(event) => setOrganic(event.target.checked)} />
            {t("Votre marque (brand_organic_toggle)", "Your brand (brand_organic_toggle)", english)}
          </label>
          <label className="ss-checks">
            <input type="checkbox" checked={branded} onChange={(event) => setBranded(event.target.checked)} />
            {t("Contenu de marque (brand_content_toggle)", "Branded content (brand_content_toggle)", english)}
          </label>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
          <select value={status} onChange={(event) => setStatus(event.target.value as "draft" | "scheduled")}>
            <option value="draft">{t("Brouillon", "Draft", english)}</option>
            <option value="scheduled">{t("Planifié", "Scheduled", english)}</option>
          </select>
          {message ? <p className="ss-lead">{message}</p> : null}
          <div className="ss-form-actions">
            <button className="ss-btn-ghost" type="submit" disabled={pending}>
              {pending ? "…" : editing ? t("Enregistrer", "Save", english) : t("Planifier", "Schedule", english)}
            </button>
            <button className="ss-btn-purple" type="button" disabled={pending || !connected.length || !body.trim()} onClick={publishNow}>
              {pending ? "…" : t("Publier maintenant", "Publish now", english)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
