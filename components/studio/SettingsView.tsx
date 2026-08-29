"use client";

import { t } from "@/lib/i18n";
import { AI_CLIENTS } from "@/lib/ai-clients";
import { formatEuro, isPaidPlan, PLAN } from "@/lib/plans";
import { platformById, platformName } from "@/lib/platforms";
import { formatInTimeZone, PRIVACY_LEVELS, TIMEZONES } from "@/lib/settings";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconAlert,
  IconBell,
  IconCard,
  IconDatabase,
  IconGlobe,
  IconKey,
  IconLock,
  IconLogout,
  IconPlug,
  IconSettings,
  IconUser,
} from "./icons";
import { useStudio } from "./StudioContext";

type Tab =
  | "account"
  | "security"
  | "notifications"
  | "language"
  | "publishing"
  | "storage"
  | "api"
  | "accounts"
  | "plan"
  | "danger";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type PushDevice = { id: string; label: string; createdAt: string };

type StorageItem = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  bytes: number | null;
  inUse: boolean;
};

type StorageTotals = {
  count: number;
  totalBytes: number;
  knownBytes: number;
  unknownCount: number;
  unusedCount: number;
  unusedBytes: number;
  posts: number;
  apiKeys: number;
};

const TABS: { id: Tab; fr: string; en: string; icon: ReactNode }[] = [
  { id: "account", fr: "Compte", en: "Account", icon: <IconUser size={16} /> },
  { id: "security", fr: "Sécurité", en: "Security", icon: <IconLock size={16} /> },
  { id: "notifications", fr: "Notifications", en: "Notifications", icon: <IconBell size={16} /> },
  { id: "language", fr: "Langue & région", en: "Language & region", icon: <IconGlobe size={16} /> },
  { id: "publishing", fr: "Publication", en: "Publishing", icon: <IconSettings size={16} /> },
  { id: "storage", fr: "Stockage", en: "Storage", icon: <IconDatabase size={16} /> },
  { id: "api", fr: "API", en: "API", icon: <IconKey size={16} /> },
  { id: "accounts", fr: "Comptes liés", en: "Connected", icon: <IconPlug size={16} /> },
  { id: "plan", fr: "Abonnement", en: "Plan", icon: <IconCard size={16} /> },
  { id: "danger", fr: "Danger", en: "Danger", icon: <IconAlert size={16} /> },
];

function formatBytes(bytes: number, english: boolean) {
  const units = english ? ["B", "KB", "MB", "GB"] : ["o", "Ko", "Mo", "Go"];
  if (bytes <= 0) return `0 ${units[0]}`;
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exp;
  return `${exp === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function SettingsView() {
  const router = useRouter();
  const { user, english, channels, posts, media, reload } = useStudio();
  const [tab, setTab] = useState<Tab>("account");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [locale, setLocale] = useState<"fr" | "en">("fr");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(1);
  const [defaultPostTime, setDefaultPostTime] = useState("18:00");
  const [defaultPrivacy, setDefaultPrivacy] = useState("PUBLIC_TO_EVERYONE");
  const [defaultStatus, setDefaultStatus] = useState<"draft" | "scheduled">("scheduled");
  const [disableComments, setDisableComments] = useState(false);
  const [disableDuet, setDisableDuet] = useState(true);
  const [disableStitch, setDisableStitch] = useState(true);
  const [autoAddMusic, setAutoAddMusic] = useState(true);
  const [brandContent, setBrandContent] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [notifyPublishSuccess, setNotifyPublishSuccess] = useState(true);
  const [notifyPublishFailure, setNotifyPublishFailure] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [clock, setClock] = useState(() => new Date());
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [keyName, setKeyName] = useState("Studio");
  const [revealed, setRevealed] = useState("");

  const live = channels.filter((item) => item.connected);
  const initials = (user?.name || user?.email || "S")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
  const zones = useMemo(() => {
    if (timezone && !TIMEZONES.includes(timezone)) return [timezone, ...TIMEZONES];
    return TIMEZONES;
  }, [timezone]);
  const clockLabel = formatInTimeZone(timezone, english ? "en-GB" : "fr-FR", clock);
  const planMeta = isPaidPlan(user?.plan) ? PLAN : null;

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((item) => item.id === id)) setTab(id as Tab);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setLocale(user.settings?.locale || (english ? "en" : "fr"));
    setTimezone(user.settings?.timezone || "Europe/Paris");
    setWeekStartsOn(user.settings?.weekStartsOn === 0 ? 0 : 1);
    setDefaultPostTime(user.settings?.defaultPostTime || "18:00");
    setDefaultPrivacy(user.settings?.defaultPrivacy || "PUBLIC_TO_EVERYONE");
    setDefaultStatus(user.settings?.defaultStatus || "scheduled");
    setDisableComments(Boolean(user.settings?.disableComments));
    setDisableDuet(user.settings?.disableDuet !== false);
    setDisableStitch(user.settings?.disableStitch !== false);
    setAutoAddMusic(user.settings?.autoAddMusic !== false);
    setBrandContent(Boolean(user.settings?.brandContent));
    setBrandOrganic(Boolean(user.settings?.brandOrganic));
    setNotifyPublishSuccess(user.settings?.notifyPublishSuccess !== false);
    setNotifyPublishFailure(user.settings?.notifyPublishFailure !== false);
  }, [user, english]);

  useEffect(() => {
    if (tab !== "api") return;
    void loadKeys();
  }, [tab]);

  function go(id: Tab) {
    setTab(id);
    setError("");
    setNotice("");
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams}`);
  }

  async function loadKeys() {
    const res = await fetch("/api/keys");
    const json = await res.json().catch(() => ({}));
    setKeys(json.keys || []);
  }

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? "" : current)), 1400);
  }

  async function patch(payload: Record<string, unknown>) {
    setBusy(String(payload.action));
    setError("");
    setNotice("");
    const res = await fetch("/api/studio/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(
        json.error === "exists"
          ? t("Cet email est déjà pris.", "That email is already taken.", english)
          : json.error === "password"
            ? t("Mot de passe actuel incorrect.", "Current password is wrong.", english)
            : json.error === "need_password"
              ? t("Crée d’abord un mot de passe.", "Create a password first.", english)
              : t("Impossible d’enregistrer.", "Could not save.", english),
      );
      return false;
    }
    setNotice(t("Enregistré.", "Saved.", english));
    window.setTimeout(() => setNotice((current) => (current === t("Enregistré.", "Saved.", english) ? "" : current)), 2600);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    await reload();
    return true;
  }

  function preferencesPayload() {
    return {
      action: "preferences" as const,
      locale,
      timezone,
      weekStartsOn,
      defaultPostTime,
      defaultPrivacy,
      defaultStatus,
      disableComments,
      disableDuet,
      disableStitch,
      autoAddMusic,
      brandContent,
      brandOrganic,
      notifyPublishSuccess,
      notifyPublishFailure,
    };
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    await patch({ action: "profile", name, email });
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t("Les mots de passe ne correspondent pas.", "Passwords don’t match.", english));
      return;
    }
    await patch({
      action: "password",
      currentPassword: user?.hasPassword ? currentPassword : undefined,
      newPassword,
    });
  }

  async function savePrefs(event: React.FormEvent) {
    event.preventDefault();
    await patch(preferencesPayload());
  }

  async function unlinkGoogle() {
    await patch({ action: "unlink_google" });
  }

  async function disconnect(id: string, platform: string) {
    setBusy(id);
    // /api/tiktok/disconnect both revokes the token and removes the channel —
    // calling the generic DELETE first would remove the channel before it can
    // be looked up there, and the revoke would silently never fire.
    if (platform === "tiktok") await fetch("/api/tiktok/disconnect", { method: "POST" });
    else await fetch(`/api/studio/channels/${id}`, { method: "DELETE" });
    setBusy("");
    await reload();
  }

  async function createKey() {
    setBusy("key");
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(t("Limite de clés atteinte (10).", "API key limit reached (10).", english));
      return;
    }
    setRevealed(typeof json.token === "string" && json.token.startsWith("ss_live_") ? json.token : "");
    setNotice(t("Clé créée. Copie-la maintenant, elle ne sera plus visible.", "Key created. Copy it now — it won’t be shown again.", english));
    await loadKeys();
  }

  async function revokeKey(id: string) {
    setBusy(id);
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    setBusy("");
    if (revealed) setRevealed("");
    await loadKeys();
  }

  async function exportData() {
    setBusy("export");
    const res = await fetch("/api/studio/export");
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scrollshow-export.json";
    link.click();
    URL.revokeObjectURL(url);
    setBusy("");
    setNotice(t("Export téléchargé.", "Export downloaded.", english));
  }

  async function openPortal() {
    setBusy("portal");
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (json.url) window.location.href = json.url;
    else window.location.href = "/pricing";
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  async function destroy() {
    if (deleteConfirm !== user?.email) {
      setError(t("Tape ton email pour confirmer.", "Type your email to confirm.", english));
      return;
    }
    setBusy("delete");
    const res = await fetch("/api/studio/settings", { method: "DELETE" });
    setBusy("");
    if (!res.ok) {
      setError(t("Suppression impossible.", "Could not delete the account.", english));
      return;
    }
    router.push("/");
  }

  if (!user) {
    return (
      <div className="ss-empty">
        <h2>{t("Chargement…", "Loading…", english)}</h2>
      </div>
    );
  }

  return (
    <div className="ss-settings">
      <nav className="ss-settings__nav" aria-label={t("Réglages", "Settings", english)}>
        {TABS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? "is-on" : ""} onClick={() => go(item.id)}>
            {item.icon}
            {english ? item.en : item.fr}
          </button>
        ))}
      </nav>

      <div className="ss-settings__main">
        <header className="ss-settings-hero">
          <span className="ss-avatar" aria-hidden>
            {initials || "S"}
          </span>
          <div>
            <strong>{user.name}</strong>
            <p>{user.email}</p>
            <div className="ss-settings-hero__meta">
              <span className="ss-pill">{user.plan === "free" ? "Free" : user.plan}</span>
              {user.hasGoogle ? <span className="ss-pill">Google</span> : null}
              {user.hasPassword ? <span className="ss-pill">{t("Mot de passe", "Password", english)}</span> : null}
              <span className="ss-pill is-mute">
                {t("Créé le", "Created", english)}{" "}
                {new Date(user.createdAt).toLocaleDateString(english ? "en-US" : "fr-FR", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          <div className="ss-settings-hero__actions">
            <button className="ss-btn-ghost" type="button" onClick={() => void copy("id", user.id)}>
              {copied === "id" ? t("Copié", "Copied", english) : t("Copier l’ID", "Copy ID", english)}
            </button>
            <button className="ss-btn-ghost ss-btn-icon" type="button" onClick={() => void signOut()}>
              <IconLogout size={16} />
              {t("Déconnexion", "Log out", english)}
            </button>
          </div>
        </header>

        {notice ? <p className="ss-flash">{notice}</p> : null}
        {error ? <p className="ss-flash is-error">{error}</p> : null}

        {tab === "account" ? (
          <form key="account" className="ss-set-card ss-form ss-tabpanel" onSubmit={saveProfile}>
            <h2>{t("Compte", "Account", english)}</h2>
            <p className="ss-lead">
              {t("Nom et email utilisés dans le studio, les exports et la facturation.", "Name and email used in the studio, exports, and billing.", english)}
            </p>
            <div className="ss-set-grid">
              <label>
                {t("Nom", "Name", english)}
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required />
              </label>
              <label>
                Email
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
            </div>
            <p className="ss-muted">ID · {user.id}</p>
            <div className="ss-form-actions">
              <button className="ss-btn-purple" type="submit" disabled={busy === "profile"}>
                {busy === "profile" ? <span className="ss-spin" /> : t("Enregistrer", "Save", english)}
              </button>
              <button className="ss-btn-ghost" type="button" onClick={() => void signOut()}>
                <IconLogout size={16} />
                {t("Se déconnecter", "Log out", english)}
              </button>
            </div>
          </form>
        ) : null}

        {tab === "security" ? (
          <div key="security" className="ss-tabpanel">
            <form className="ss-set-card ss-form" onSubmit={savePassword}>
              <h2>{t("Mot de passe", "Password", english)}</h2>
              <p className="ss-lead">
                {user.hasPassword
                  ? t("Change le mot de passe de connexion. 8 caractères minimum.", "Change your sign-in password. 8 characters minimum.", english)
                  : t("Compte Google sans mot de passe. Crée-en un pour te connecter aussi par email.", "Google account has no password yet. Create one to also sign in with email.", english)}
              </p>
              {user.hasPassword ? (
                <label>
                  {t("Mot de passe actuel", "Current password", english)}
                  <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
                </label>
              ) : null}
              <div className="ss-set-grid">
                <label>
                  {t("Nouveau mot de passe", "New password", english)}
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
                </label>
                <label>
                  {t("Confirmer", "Confirm", english)}
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
                </label>
              </div>
              <button className="ss-btn-purple" type="submit" disabled={busy === "password"}>
                {busy === "password" ? <span className="ss-spin" /> : user.hasPassword ? t("Mettre à jour", "Update", english) : t("Créer le mot de passe", "Create password", english)}
              </button>
            </form>

            <div className="ss-set-card">
              <h2>Google</h2>
              <p className="ss-lead">
                {user.hasGoogle
                  ? t("Connexion Google active sur ce compte.", "Google sign-in is linked to this account.", english)
                  : t("Lie Google pour te connecter en un clic. L’email Google doit être le même.", "Link Google for one-click sign-in. The Google email must match.", english)}
              </p>
              <div className="ss-form-actions">
                {user.hasGoogle ? (
                  <button className="ss-btn-ghost" type="button" disabled={busy === "unlink_google" || !user.hasPassword} onClick={() => void unlinkGoogle()}>
                    {t("Délier Google", "Unlink Google", english)}
                  </button>
                ) : (
                  <a className="ss-btn-purple" href="/api/auth/google?next=/app/settings">
                    {t("Lier Google", "Link Google", english)}
                  </a>
                )}
              </div>
              {user.hasGoogle && !user.hasPassword ? (
                <p className="ss-muted">{t("Crée un mot de passe avant de délier Google.", "Create a password before unlinking Google.", english)}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "notifications" ? (
          <div key="notifications" className="ss-tabpanel">
            <NotificationsTab
              english={english}
              notifyPublishSuccess={notifyPublishSuccess}
              setNotifyPublishSuccess={setNotifyPublishSuccess}
              notifyPublishFailure={notifyPublishFailure}
              setNotifyPublishFailure={setNotifyPublishFailure}
              prefsBusy={busy === "preferences"}
              onSavePrefs={() => patch(preferencesPayload())}
              onNotice={setNotice}
              onError={setError}
            />
          </div>
        ) : null}

        {tab === "language" ? (
          <form key="language" className="ss-tabpanel" onSubmit={savePrefs}>
            <div className="ss-set-card">
              <h2>{t("Langue & région", "Language & region", english)}</h2>
              <p className="ss-lead">{t("Langue, fuseau et calendrier.", "Language, timezone, and calendar.", english)}</p>
              <div className="ss-set-row">
                <div>
                  <b>{t("Langue", "Language", english)}</b>
                  <p>{t("Tous les écrans du studio.", "Every studio screen.", english)}</p>
                </div>
                <div className="ss-seg" role="group">
                  <button type="button" className={locale === "fr" ? "is-on" : ""} onClick={() => setLocale("fr")}>
                    Français
                  </button>
                  <button type="button" className={locale === "en" ? "is-on" : ""} onClick={() => setLocale("en")}>
                    English
                  </button>
                </div>
              </div>
              <div className="ss-set-row is-stack">
                <div>
                  <b>{t("Fuseau horaire", "Timezone", english)}</b>
                  <p>
                    {t("Heure locale actuelle", "Current local time", english)} · {clockLabel}
                  </p>
                </div>
                <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ss-set-row">
                <div>
                  <b>{t("La semaine commence", "Week starts on", english)}</b>
                  <p>{t("Calendrier jour / semaine / mois.", "Day / week / month calendar.", english)}</p>
                </div>
                <div className="ss-seg" role="group">
                  <button type="button" className={weekStartsOn === 1 ? "is-on" : ""} onClick={() => setWeekStartsOn(1)}>
                    {t("Lundi", "Monday", english)}
                  </button>
                  <button type="button" className={weekStartsOn === 0 ? "is-on" : ""} onClick={() => setWeekStartsOn(0)}>
                    {t("Dimanche", "Sunday", english)}
                  </button>
                </div>
              </div>
            </div>
            <div className="ss-form-actions ss-settings-save">
              <button className="ss-btn-purple" type="submit" disabled={busy === "preferences"}>
                {busy === "preferences" ? <span className="ss-spin" /> : t("Enregistrer", "Save", english)}
              </button>
            </div>
          </form>
        ) : null}

        {tab === "publishing" ? (
          <form key="publishing" className="ss-tabpanel" onSubmit={savePrefs}>
            <div className="ss-set-card">
              <h2>{t("Publication TikTok", "TikTok publishing", english)}</h2>
              <p className="ss-lead">
                {t("Valeurs par défaut du nouveau post et de Direct Post (MCP inclus).", "Defaults for new posts and Direct Post (including MCP).", english)}
              </p>
              <div className="ss-set-grid">
                <label>
                  {t("Heure par défaut", "Default time", english)}
                  <input type="time" value={defaultPostTime} onChange={(event) => setDefaultPostTime(event.target.value)} required />
                </label>
                <label>
                  {t("Confidentialité", "Privacy", english)}
                  <select value={defaultPrivacy} onChange={(event) => setDefaultPrivacy(event.target.value)}>
                    {PRIVACY_LEVELS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {english ? item.en : item.fr}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="ss-set-row">
                <div>
                  <b>{t("Nouveau post", "New post", english)}</b>
                  <p>{t("Brouillon ou déjà planifié à l’ouverture.", "Draft or already scheduled when opened.", english)}</p>
                </div>
                <div className="ss-seg" role="group">
                  <button type="button" className={defaultStatus === "draft" ? "is-on" : ""} onClick={() => setDefaultStatus("draft")}>
                    {t("Brouillon", "Draft", english)}
                  </button>
                  <button type="button" className={defaultStatus === "scheduled" ? "is-on" : ""} onClick={() => setDefaultStatus("scheduled")}>
                    {t("Planifié", "Scheduled", english)}
                  </button>
                </div>
              </div>
              <Switch
                on={disableComments}
                set={setDisableComments}
                title={t("Désactiver les commentaires", "Disable comments", english)}
                hint={t("Par défaut sur chaque publication.", "Default on every publish.", english)}
              />
              <Switch
                on={disableDuet}
                set={setDisableDuet}
                title={t("Désactiver les Duets", "Disable Duets", english)}
                hint={t("Envoyé à TikTok à la publication.", "Sent to TikTok on publish.", english)}
              />
              <Switch
                on={disableStitch}
                set={setDisableStitch}
                title={t("Désactiver les Stitch", "Disable Stitch", english)}
                hint={t("Envoyé à TikTok à la publication.", "Sent to TikTok on publish.", english)}
              />
              <Switch
                on={autoAddMusic}
                set={setAutoAddMusic}
                title={t("Ajouter la musique auto", "Auto-add music", english)}
                hint={t("TikTok auto_add_music sur les carrousels photo.", "TikTok auto_add_music on photo carousels.", english)}
              />
              <Switch
                on={brandOrganic}
                set={setBrandOrganic}
                title={t("Votre marque", "Your brand", english)}
                hint={t("Disclosure brand_organic_toggle.", "brand_organic_toggle disclosure.", english)}
              />
              <Switch
                on={brandContent}
                set={setBrandContent}
                title={t("Contenu de marque / paid partnership", "Branded content / paid partnership", english)}
                hint={t("Disclosure brand_content_toggle.", "brand_content_toggle disclosure.", english)}
              />
            </div>

            <div className="ss-form-actions ss-settings-save">
              <button className="ss-btn-purple" type="submit" disabled={busy === "preferences"}>
                {busy === "preferences" ? <span className="ss-spin" /> : t("Enregistrer les préférences", "Save preferences", english)}
              </button>
            </div>
          </form>
        ) : null}

        {tab === "storage" ? (
          <div key="storage" className="ss-tabpanel">
            <StorageTab english={english} onNotice={setNotice} onError={setError} onExport={() => void exportData()} exportBusy={busy === "export"} />
          </div>
        ) : null}

        {tab === "api" ? (
          <div key="api" className="ss-tabpanel">
            <ApiTab
              english={english}
              keys={keys}
              keyName={keyName}
              setKeyName={setKeyName}
              busy={busy}
              createKey={() => void createKey()}
              revokeKey={(id) => void revokeKey(id)}
              copied={copied}
              copy={copy}
              revealed={revealed}
            />
          </div>
        ) : null}

        {tab === "accounts" ? (
          <div key="accounts" className="ss-set-card ss-tabpanel">
            <h2>{t("Comptes connectés", "Connected accounts", english)}</h2>
            <p className="ss-lead">
              {t("Réseaux liés à ce workspace. La publication live est TikTok pour l’instant.", "Networks linked to this workspace. Live publishing is TikTok for now.", english)}
            </p>
            {live.length ? (
              <ul className="ss-settings-list">
                {live.map((channel) => {
                  const logo = channel.avatar || platformById(channel.platform)?.logo || "/logo.png";
                  return (
                    <li key={channel.id}>
                      <img
                        className={channel.platform === "facebook" ? "ss-platform-logo is-facebook" : ""}
                        src={logo}
                        alt=""
                      />
                      <span>
                        <b>
                          {platformName(channel.platform)} · @{channel.handle}
                        </b>
                        <span>
                          {channel.followers
                            ? `${channel.followers.toLocaleString(english ? "en-US" : "fr-FR")} ${t("abonnés", "followers", english)}`
                            : t("Connecté", "Connected", english)}
                        </span>
                      </span>
                      <button className="ss-btn-ghost" type="button" disabled={busy === channel.id} onClick={() => void disconnect(channel.id, channel.platform)}>
                        {t("Déconnecter", "Disconnect", english)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ss-lead">{t("Aucun compte connecté.", "No account connected.", english)}</p>
            )}
            <div className="ss-form-actions">
              <a className="ss-btn-purple" href="/app/integrations">
                {t("Gérer les connexions", "Manage connections", english)}
              </a>
            </div>
          </div>
        ) : null}

        {tab === "plan" ? (
          <div key="plan" className="ss-tabpanel">
            <div className="ss-set-card">
              <h2>{t("Abonnement", "Subscription", english)}</h2>
              <p className="ss-lead">
                {t("Plan actuel", "Current plan", english)} : <b>{planMeta ? "ScrollShow" : "Free"}</b>
                {planMeta ? ` · ${formatEuro(planMeta.monthly)} € / ${t("mois", "month", english)}` : ""}
              </p>
              <ul className="ss-feat">
                {(planMeta ? (english ? planMeta.featuresEn : planMeta.featuresFr) : english
                  ? ["Calendar + media library", "Connect social accounts", "Upgrade to publish"]
                  : ["Calendrier + médiathèque", "Connexion des comptes", "Passe à un plan pour publier"]
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="ss-usage">
                <div>
                  <strong>{posts.length}</strong>
                  <span>{t("Marketplace", "Marketplace", english)}</span>
                </div>
                <div>
                  <strong>{media.length}</strong>
                  <span>{t("Slides", "Slides", english)}</span>
                </div>
                <div>
                  <strong>{live.length}</strong>
                  <span>{t("Comptes", "Accounts", english)}</span>
                </div>
                <div>
                  <strong>{keys.length}</strong>
                  <span>{t("Clés API", "API keys", english)}</span>
                </div>
              </div>
              <div className="ss-form-actions">
                <a className="ss-btn-purple" href="/pricing">
                  {t("Changer de plan", "Change plan", english)}
                </a>
                {user.plan !== "free" ? (
                  <button className="ss-btn-ghost" type="button" disabled={busy === "portal"} onClick={() => void openPortal()}>
                    {busy === "portal" ? <span className="ss-spin" /> : t("Portail Stripe", "Stripe portal", english)}
                  </button>
                ) : null}
                <a className="ss-btn-ghost" href="/app/billing">
                  {t("Facturation", "Billing", english)}
                </a>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "danger" ? (
          <div key="danger" className="ss-set-card is-danger ss-form ss-tabpanel">
            <h2>{t("Supprimer le compte", "Delete account", english)}</h2>
            <p className="ss-lead">
              {t(
                "Efface définitivement tes posts, médias, clés API, connexions et l’historique. Irréversible.",
                "Permanently wipes posts, media, API keys, connections, and history. This cannot be undone.",
                english,
              )}
            </p>
            <label>
              {t("Tape ton email pour confirmer", "Type your email to confirm", english)}
              <input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder={user.email} autoComplete="off" />
            </label>
            <button className="ss-btn-danger" type="button" disabled={busy === "delete" || deleteConfirm !== user.email} onClick={() => void destroy()}>
              {busy === "delete" ? <span className="ss-spin" /> : t("Supprimer définitivement", "Delete permanently", english)}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Switch({
  on,
  set,
  title,
  hint,
  disabled,
}: {
  on: boolean;
  set: (value: boolean) => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <div className="ss-set-row">
      <div>
        <b>{title}</b>
        <p>{hint}</p>
      </div>
      <label className={`ss-switch${disabled ? " is-disabled" : ""}`}>
        <input type="checkbox" checked={on} disabled={disabled} onChange={(event) => set(event.target.checked)} />
        <i />
      </label>
    </div>
  );
}

function ApiTab({
  english,
  keys,
  keyName,
  setKeyName,
  busy,
  createKey,
  revokeKey,
  copied,
  copy,
  revealed,
}: {
  english: boolean;
  keys: ApiKeyRow[];
  keyName: string;
  setKeyName: (value: string) => void;
  busy: string;
  createKey: () => void;
  revokeKey: (id: string) => void;
  copied: string;
  copy: (id: string, value: string) => void;
  revealed: string;
}) {
  return (
    <div className="ss-set-card">
      <h2>
        <IconKey size={16} /> {t("Clés API", "API keys", english)}
      </h2>
      <p className="ss-lead">
        {t("Pour Claude, Claude Code, Cursor et Codex. Max 10 clés. La valeur secrète n’est montrée qu’une fois.", "For Claude, Claude Code, Cursor and Codex. Max 10 keys. The secret is shown only once.", english)}
      </p>
      <div className="ss-ai-logos" role="group" aria-label={t("Agents", "Agents", english)}>
        {AI_CLIENTS.map((item) => (
          <button key={item.id} type="button" className={keyName === item.label ? "is-on" : ""} onClick={() => setKeyName(item.label)}>
            <img src={item.logo} alt="" style={{ background: item.bg }} />
            {item.label}
          </button>
        ))}
      </div>
      {revealed ? (
        <div className="ss-reveal">
          <code>{revealed}</code>
          <button className="ss-btn-ghost" type="button" onClick={() => copy("token", revealed)}>
            {copied === "token" ? t("Copié", "Copied", english) : t("Copier", "Copy", english)}
          </button>
        </div>
      ) : null}
      <div className="ss-set-grid ss-set-grid--key">
        <label>
          {t("Nom de la clé", "Key name", english)}
          <input value={keyName} onChange={(event) => setKeyName(event.target.value)} maxLength={40} />
        </label>
        <button className="ss-btn-purple" type="button" disabled={busy === "key"} onClick={createKey}>
          {busy === "key" ? <span className="ss-spin" /> : t("Créer une clé", "Create key", english)}
        </button>
      </div>
      {keys.length ? (
        <ul className="ss-settings-list">
          {keys.map((key) => (
            <li key={key.id}>
              <span>
                <b>{key.name}</b>
                <span>
                  {key.prefix}… · {t("créée", "created", english)}{" "}
                  {new Date(key.createdAt).toLocaleDateString(english ? "en-US" : "fr-FR")}
                  {key.lastUsedAt
                    ? ` · ${t("utilisée", "used", english)} ${new Date(key.lastUsedAt).toLocaleDateString(english ? "en-US" : "fr-FR")}`
                    : ""}
                </span>
              </span>
              <button className="ss-btn-ghost" type="button" disabled={busy === key.id} onClick={() => revokeKey(key.id)}>
                {busy === key.id ? <span className="ss-spin" /> : t("Révoquer", "Revoke", english)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ss-muted">{t("Aucune clé pour l’instant.", "No keys yet.", english)}</p>
      )}
      <a className="ss-btn-ghost" href="/app/mcp">
        {t("Guide MCP", "MCP guide", english)}
      </a>
    </div>
  );
}

function StorageTab({
  english,
  onNotice,
  onError,
  onExport,
  exportBusy,
}: {
  english: boolean;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onExport: () => void;
  exportBusy: boolean;
}) {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [totals, setTotals] = useState<StorageTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/studio/storage");
    const json = await res.json().catch(() => ({}));
    setItems(json.items || []);
    setTotals(json.totals || null);
    setLoading(false);
  }

  async function removeItem(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/studio/media/${id}`, { method: "DELETE" });
    setBusyId("");
    if (!res.ok) {
      onError(t("Ce média est utilisé par un post — retire-le du post d’abord.", "This media is used by a post — remove it from the post first.", english));
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    setTotals((current) => (current ? { ...current, count: current.count - 1 } : current));
    onNotice(t("Média supprimé.", "Media deleted.", english));
  }

  async function clearUnused() {
    const unused = items.filter((item) => !item.inUse);
    if (!unused.length) return;
    setBusyId("bulk");
    const results = await Promise.all(unused.map((item) => fetch(`/api/studio/media/${item.id}`, { method: "DELETE" })));
    setBusyId("");
    const ok = results.filter((res) => res.ok).length;
    setItems((current) => current.filter((item) => item.inUse));
    onNotice(
      t(`${ok} média${ok > 1 ? "s" : ""} supprimé${ok > 1 ? "s" : ""}.`, `${ok} file${ok === 1 ? "" : "s"} deleted.`, english),
    );
  }

  const usedBytes = totals ? totals.knownBytes - totals.unusedBytes : 0;
  const barTotal = totals?.knownBytes || 1;
  const usedPct = Math.max(0, Math.min(100, (usedBytes / barTotal) * 100));

  return (
    <>
      <div className="ss-set-card">
        <h2>{t("Stockage", "Storage", english)}</h2>
        <p className="ss-lead">
          {t("Ta médiathèque : slides générés, imports TikTok, et ce qui n’est plus utilisé par aucun post.", "Your media library: generated slides, TikTok imports, and anything no post references anymore.", english)}
        </p>
        {loading ? (
          <div className="ss-usage">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="ss-skeleton" style={{ height: 22, marginBottom: 6 }} />
                <div className="ss-skeleton" style={{ height: 11, width: "60%" }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="ss-usage">
              <div>
                <strong>{totals?.count ?? 0}</strong>
                <span>{t("Fichiers médias", "Media files", english)}</span>
              </div>
              <div>
                <strong>{totals ? formatBytes(totals.totalBytes, english) : "—"}</strong>
                <span>{t("Espace utilisé", "Storage used", english)}</span>
              </div>
              <div>
                <strong>{totals?.posts ?? 0}</strong>
                <span>{t("Posts", "Posts", english)}</span>
              </div>
              <div>
                <strong>{totals?.unusedCount ?? 0}</strong>
                <span>{t("Médias inutilisés", "Unused media", english)}</span>
              </div>
            </div>
            {totals && totals.knownBytes > 0 ? (
              <>
                <div className="ss-storage-bar">
                  <span style={{ width: `${usedPct}%` }} />
                  <span className="is-unused" style={{ width: `${100 - usedPct}%` }} />
                </div>
                <div className="ss-storage-legend">
                  <span>
                    {t("Utilisé", "In use", english)} · {formatBytes(usedBytes, english)}
                  </span>
                  <span className="is-unused">
                    {t("Inutilisé", "Unused", english)} · {formatBytes(totals.unusedBytes, english)}
                  </span>
                  {totals.unknownCount ? (
                    <span>
                      {totals.unknownCount} {t("taille inconnue", "unknown size", english)}
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </>
        )}
        <div className="ss-form-actions">
          <button className="ss-btn-ghost" type="button" disabled={exportBusy} onClick={onExport}>
            {exportBusy ? <span className="ss-spin" /> : t("Exporter mes données", "Export my data", english)}
          </button>
          <button className="ss-btn-ghost" type="button" disabled={!totals?.unusedCount || busyId === "bulk"} onClick={() => void clearUnused()}>
            {busyId === "bulk" ? <span className="ss-spin" /> : t("Nettoyer l’inutilisé", "Clear unused", english)}
          </button>
        </div>
      </div>

      <div className="ss-set-card">
        <h2>{t("Fichiers", "Files", english)}</h2>
        {loading ? (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <div className="ss-skeleton-row" key={i}>
                <div className="ss-skeleton" />
                <div className="ss-skeleton" />
                <div className="ss-skeleton" />
              </div>
            ))}
          </>
        ) : items.length ? (
          items.map((item) => (
            <div className="ss-media-row" key={item.id}>
              <img src={item.url} alt="" loading="lazy" />
              <span>
                <b>{item.name}</b>
                <span>{new Date(item.createdAt).toLocaleDateString(english ? "en-US" : "fr-FR")}</span>
              </span>
              <span className={`ss-tag${item.inUse ? " is-used" : ""}`}>
                {item.inUse ? t("utilisé", "in use", english) : item.bytes != null ? formatBytes(item.bytes, english) : "—"}
              </span>
              <button className="ss-btn-ghost ss-btn-icon" type="button" disabled={item.inUse || busyId === item.id} onClick={() => void removeItem(item.id)}>
                {busyId === item.id ? <span className="ss-spin" /> : t("Suppr.", "Delete", english)}
              </button>
            </div>
          ))
        ) : (
          <p className="ss-muted">{t("Aucun média pour l’instant.", "No media yet.", english)}</p>
        )}
      </div>
    </>
  );
}

function NotificationsTab({
  english,
  notifyPublishSuccess,
  setNotifyPublishSuccess,
  notifyPublishFailure,
  setNotifyPublishFailure,
  prefsBusy,
  onSavePrefs,
  onNotice,
  onError,
}: {
  english: boolean;
  notifyPublishSuccess: boolean;
  setNotifyPublishSuccess: (value: boolean) => void;
  notifyPublishFailure: boolean;
  setNotifyPublishFailure: (value: boolean) => void;
  prefsBusy: boolean;
  onSavePrefs: () => Promise<boolean> | void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [configured, setConfigured] = useState(true);
  const [publicKey, setPublicKey] = useState("");
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
    void loadConfig();
    void loadDevices();
    if (ok) void checkSubscribed();
  }, []);

  async function loadConfig() {
    const res = await fetch("/api/push/config");
    const json = await res.json().catch(() => ({}));
    setConfigured(Boolean(json.configured));
    setPublicKey(json.publicKey || "");
  }

  async function loadDevices() {
    setLoadingDevices(true);
    const res = await fetch("/api/push/subscriptions");
    const json = await res.json().catch(() => ({}));
    setDevices(json.subscriptions || []);
    setLoadingDevices(false);
  }

  async function checkSubscribed() {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setSubscribedHere(Boolean(sub));
    } catch {
      setSubscribedHere(false);
    }
  }

  async function enable() {
    setBusy("enable");
    try {
      let perm = Notification.permission;
      if (perm !== "granted") perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        onError(t("Notifications refusées par le navigateur.", "Notifications were blocked by the browser.", english));
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const json = sub.toJSON();
      await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setSubscribedHere(true);
      onNotice(t("Notifications activées sur cet appareil.", "Notifications enabled on this device.", english));
      await loadDevices();
    } catch {
      onError(t("Impossible d’activer les notifications.", "Could not enable notifications.", english));
    } finally {
      setBusy("");
    }
  }

  async function disable() {
    setBusy("disable");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribedHere(false);
      onNotice(t("Notifications désactivées sur cet appareil.", "Notifications disabled on this device.", english));
      await loadDevices();
    } finally {
      setBusy("");
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    await fetch(`/api/push/subscriptions/${id}`, { method: "DELETE" });
    setBusy("");
    await loadDevices();
    await checkSubscribed();
  }

  async function sendTest() {
    setBusy("test");
    const res = await fetch("/api/push/test", { method: "POST" });
    setBusy("");
    if (res.ok) onNotice(t("Notification de test envoyée.", "Test notification sent.", english));
    else onError(t("Active les notifications sur cet appareil d’abord.", "Enable notifications on this device first.", english));
  }

  return (
    <>
      <div className="ss-set-card">
        <div className="ss-notif-hero">
          <span className="ss-notif-hero__icon" aria-hidden>
            <IconBell size={20} />
          </span>
          <div>
            <strong>{t("Notifications push", "Push notifications", english)}</strong>
            <p>
              {t(
                "Reçois une alerte quand un post planifié se publie — ou échoue — même si l’onglet est fermé.",
                "Get alerted when a scheduled post publishes — or fails — even with the tab closed.",
                english,
              )}
            </p>
          </div>
        </div>

        {!supported ? (
          <p className="ss-muted">{t("Ton navigateur ne supporte pas les notifications push.", "Your browser doesn’t support push notifications.", english)}</p>
        ) : !configured ? (
          <p className="ss-muted">{t("Pas encore configuré côté serveur (clés VAPID manquantes).", "Not configured on the server yet (missing VAPID keys).", english)}</p>
        ) : (
          <>
            <div className="ss-set-row">
              <div>
                <b>{t("Sur cet appareil", "On this device", english)}</b>
                <span className={`ss-status-dot ${subscribedHere ? "is-on" : permission === "denied" ? "is-off" : ""}`}>
                  {permission === "denied"
                    ? t("Bloqué dans le navigateur", "Blocked in browser", english)
                    : subscribedHere
                      ? t("Activées", "Enabled", english)
                      : t("Désactivées", "Disabled", english)}
                </span>
              </div>
              {subscribedHere ? (
                <button className="ss-btn-ghost" type="button" disabled={busy === "disable"} onClick={() => void disable()}>
                  {busy === "disable" ? <span className="ss-spin" /> : t("Désactiver", "Disable", english)}
                </button>
              ) : (
                <button className="ss-btn-purple" type="button" disabled={busy === "enable" || permission === "denied"} onClick={() => void enable()}>
                  {busy === "enable" ? <span className="ss-spin" /> : t("Activer", "Enable", english)}
                </button>
              )}
            </div>
            {permission === "denied" ? (
              <p className="ss-muted">
                {t("Débloque les notifications dans les réglages du site de ton navigateur, puis recharge la page.", "Unblock notifications in your browser's site settings, then reload this page.", english)}
              </p>
            ) : null}

            <Switch
              on={notifyPublishSuccess}
              set={(value) => {
                setNotifyPublishSuccess(value);
                void onSavePrefs();
              }}
              title={t("Publication réussie", "Publish succeeded", english)}
              hint={t("Un post planifié vient d’être publié sur TikTok.", "A scheduled post was just published to TikTok.", english)}
              disabled={prefsBusy}
            />
            <Switch
              on={notifyPublishFailure}
              set={(value) => {
                setNotifyPublishFailure(value);
                void onSavePrefs();
              }}
              title={t("Échec de publication", "Publish failed", english)}
              hint={t("TikTok a rejeté la publication planifiée.", "TikTok rejected the scheduled publish.", english)}
              disabled={prefsBusy}
            />

            <div className="ss-form-actions">
              <button className="ss-btn-ghost" type="button" disabled={!subscribedHere || busy === "test"} onClick={() => void sendTest()}>
                {busy === "test" ? <span className="ss-spin" /> : t("Envoyer un test", "Send a test", english)}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="ss-set-card">
        <h2>{t("Appareils", "Devices", english)}</h2>
        <p className="ss-lead">{t("Tous les navigateurs où tu as activé les notifications.", "Every browser where you've enabled notifications.", english)}</p>
        {loadingDevices ? (
          <div className="ss-skeleton-row">
            <div className="ss-skeleton" style={{ width: 44, height: 44 }} />
            <div className="ss-skeleton" style={{ height: 13 }} />
            <div className="ss-skeleton" style={{ width: 60, height: 20 }} />
          </div>
        ) : devices.length ? (
          <ul className="ss-settings-list">
            {devices.map((device) => (
              <li key={device.id}>
                <span>
                  <b>{device.label || t("Appareil", "Device", english)}</b>
                  <span>
                    {t("ajouté le", "added", english)} {new Date(device.createdAt).toLocaleDateString(english ? "en-US" : "fr-FR")}
                  </span>
                </span>
                <button className="ss-btn-ghost" type="button" disabled={busy === device.id} onClick={() => void revoke(device.id)}>
                  {busy === device.id ? <span className="ss-spin" /> : t("Révoquer", "Revoke", english)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ss-device-empty">{t("Aucun appareil actif.", "No active device.", english)}</p>
        )}
      </div>
    </>
  );
}
