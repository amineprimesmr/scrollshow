"use client";

import { t } from "@/lib/i18n";
import { US_AGENT_PROMPT, US_CHECKLIST, US_LINKS } from "@/lib/us-guide";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "../StudioContext";

type Row = { fr: string; en: string };

const COMPARE: { label: Row; a: Row; b: Row }[] = [
  {
    label: { fr: "Objectif", en: "Goal" },
    a: { fr: "Toucher le For You US avec du contenu EN", en: "Reach the US For You with EN content" },
    b: { fr: "Compte enregistré US (country = United States)", en: "Account registered in the US (country = United States)" },
  },
  {
    label: { fr: "VPN", en: "VPN" },
    a: { fr: "Aucun", en: "None" },
    b: { fr: "Serveur Outline perso à Ashburn (Hetzner)", en: "Your own Outline server in Ashburn (Hetzner)" },
  },
  {
    label: { fr: "Téléphone", en: "Phone" },
    a: { fr: "Ton iPhone habituel", en: "Your everyday iPhone" },
    b: { fr: "Téléphone dédié, reset usine, sans SIM", en: "Dedicated phone, factory reset, no SIM" },
  },
  {
    label: { fr: "Compte Apple", en: "Apple ID" },
    a: { fr: "Le tien", en: "Your own" },
    b: { fr: "Apple ID US neuf (ZIP 10001 / 90001, paiement None)", en: "Fresh US Apple ID (ZIP 10001 / 90001, payment None)" },
  },
  {
    label: { fr: "Force la géo ?", en: "Forces geo?" },
    a: { fr: "Non (seules les ads le font)", en: "No (only ads do)" },
    b: { fr: "Oui, tant que le VPN est ON à chaque session", en: "Yes, as long as the VPN is ON every session" },
  },
  {
    label: { fr: "Pour qui", en: "Best for" },
    a: { fr: "Tests rapides, comptes FR/EN", en: "Quick tests, FR/EN accounts" },
    b: { fr: "Comptes US long terme", en: "Long-term US accounts" },
  },
];

const A_SETUP: Row[] = [
  { fr: "Nouveau compte TikTok dédié à la niche US, pas ton compte perso.", en: "New TikTok account dedicated to the US niche, not your personal one." },
  { fr: "Username, display name et bio en anglais. Langue de l'app : English.", en: "Username, display name and bio in English. App language: English." },
  { fr: "Compte Creator ou Business. Un numéro FR suffit pour démarrer.", en: "Creator or Business account. A FR phone number is fine to start." },
  { fr: "Captions 100 % anglais, hashtags EN de niche, sons US tendance.", en: "Captions 100% English, niche EN hashtags, US trending sounds." },
  { fr: "Fuseau du scheduler : America/New_York (Réglages).", en: "Scheduler timezone: America/New_York (Settings)." },
];

const A_WARMUP: Row[] = [
  { fr: "Jour 1 : 3 carrousels EN postés à la main.", en: "Day 1: 3 EN carousels posted by hand." },
  { fr: "Jours 2 à 7 : 1 carrousel par jour via le calendrier, créneau ET.", en: "Days 2 to 7: 1 carousel a day from the calendar, ET window." },
  { fr: "Jamais 5 posts par jour sur un compte neuf.", en: "Never 5 posts a day on a brand-new account." },
  { fr: "Suivre saves, visites profil et commentaires, pas seulement les likes.", en: "Track saves, profile visits and comments, not just likes." },
];

const A_AVOID: Row[] = [
  { fr: "Bots non officiels, auto-post Selenium.", en: "Unofficial bots, Selenium auto-posting." },
  { fr: "VPN à IP tournante.", en: "Rotating-IP VPNs." },
  { fr: "Captions FR « pour les US », spam de hashtags.", en: "French captions “for the US”, hashtag spam." },
  { fr: "Les mêmes images sur tous les posts.", en: "The same images across every post." },
];

const B_BEFORE: Row[] = [
  { fr: "Téléphone dédié, neuf ou reset usine. Pas ton iPhone du quotidien.", en: "Dedicated phone, new or factory-reset. Not your daily iPhone." },
  { fr: "Setup : English (United States), région United States, clavier English (US).", en: "Setup: English (United States), region United States, English (US) keyboard." },
  { fr: "Fuseau New York ou Los Angeles, automatique OFF.", en: "Timezone New York or Los Angeles, automatic OFF." },
  { fr: "Localisation OFF en global. Plus tard TikTok = Never.", en: "Location OFF globally. Later TikTok = Never." },
  { fr: "Aucune SIM, jamais. Wi‑Fi uniquement, à chaque session.", en: "No SIM, ever. Wi‑Fi only, every session." },
  { fr: "Email neuf + Apple ID US : pays United States, paiement None, ZIP 10001 ou 90001.", en: "Fresh email + US Apple ID: country United States, payment None, ZIP 10001 or 90001." },
  { fr: "Compte Hetzner Cloud + CB, token API Read & Write. Ne crée pas le serveur toi-même.", en: "Hetzner Cloud account + card, Read & Write API token. Don't create the server yourself." },
];

const B_SERVER: Row[] = [
  { fr: "Hetzner Ashburn (ash) uniquement, jamais une région EU.", en: "Hetzner Ashburn (ash) only, never an EU region." },
  { fr: "Ubuntu 22.04, type cx22, user data #include get.docker.com.", en: "Ubuntu 22.04, cx22, user data #include get.docker.com." },
  { fr: "Script officiel Jigsaw Outline. Pas WireGuard, pas OpenVPN, pas Nord.", en: "Official Jigsaw Outline script. No WireGuard, no OpenVPN, no Nord." },
  { fr: "Firewall : TCP 22, port API Outline (TCP), port d'accès (TCP + UDP).", en: "Firewall: TCP 22, Outline API port (TCP), access port (TCP + UDP)." },
];

const B_AFTER: Row[] = [
  { fr: "Mac : Outline Manager → Set up Outline anywhere → coller le JSON → serveur Online.", en: "Mac: Outline Manager → Set up Outline anywhere → paste the JSON → server Online." },
  { fr: "Ajouter une clé (ex. iPhone-TikTok) → QR / lien ss://.", en: "Add a key (e.g. iPhone-TikTok) → QR / ss:// link." },
  { fr: "iPhone US : Outline Client depuis l'App Store US → scan QR → Connect.", en: "US phone: Outline Client from the US App Store → scan QR → Connect." },
  { fr: "Safari : whatismyipaddress.com doit afficher United States.", en: "Safari: whatismyipaddress.com must show United States." },
  { fr: "VPN ON → désinstaller TikTok → réinstaller → nouveau compte, country = United States.", en: "VPN ON → uninstall TikTok → reinstall → new account, country = United States." },
  { fr: "Connecter ce compte à ScrollShow depuis l'iPhone US, VPN ON (page Comptes).", en: "Connect that account to ScrollShow from the US phone, VPN ON (Accounts page)." },
];

function List({ rows, en, ordered }: { rows: Row[]; en: boolean; ordered?: boolean }) {
  const items = rows.map((r) => <li key={r.fr}>{t(r.fr, r.en, en)}</li>);
  return ordered ? <ol className="ss-shadow-steps">{items}</ol> : <ul className="ss-feat">{items}</ul>;
}

function AgentPrompt({ en }: { en: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = en ? US_AGENT_PROMPT.en : US_AGENT_PROMPT.fr;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the textarea below stays selectable */
    }
  }
  return (
    <div className="ss-postus-prompt">
      <div className="ss-postus-prompt__head">
        <h3>{t("Prompt agent : serveur Hetzner Ashburn + Outline", "Agent prompt: Hetzner Ashburn + Outline server", en)}</h3>
        <button type="button" className="ss-btn-purple" onClick={copy}>
          {copied ? t("Copié ✓", "Copied ✓", en) : t("Copier le prompt", "Copy prompt", en)}
        </button>
      </div>
      <p className="ss-lead">
        {t(
          "Colle-le tel quel dans Cursor ou Claude Code sur ton Mac. L'agent crée le VPS, installe Outline et te rend le JSON à coller dans Outline Manager. Il ne touche pas au téléphone.",
          "Paste it as is into Cursor or Claude Code on your Mac. The agent creates the VPS, installs Outline and hands you the JSON to paste into Outline Manager. It never touches the phone.",
          en,
        )}
      </p>
      <textarea className="ss-input ss-postus-prompt__text" readOnly value={text} rows={12} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}

function Checklist({ en, done, toggle, saving }: { en: boolean; done: Set<string>; toggle: (id: string) => void; saving: boolean }) {
  const total = US_CHECKLIST.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="ss-postus-check">
      <div className="ss-postus-check__head">
        <h3>{t("Ma checklist", "My checklist", en)}</h3>
        <span>
          {done.size}/{total} {saving ? "·" : ""} {saving ? t("enregistrement…", "saving…", en) : ""}
        </span>
      </div>
      <div className="ss-postus-check__bar">
        <i style={{ width: `${total ? Math.round((done.size / total) * 100) : 0}%` }} />
      </div>
      {US_CHECKLIST.map((group) => (
        <section key={group.id}>
          <h4>{t(group.fr, group.en, en)}</h4>
          <ul>
            {group.items.map((item) => {
              const checked = done.has(item.id);
              return (
                <li key={item.id} className={checked ? "is-done" : ""}>
                  <label>
                    <input type="checkbox" checked={checked} onChange={() => toggle(item.id)} />
                    <span>{t(item.fr, item.en, en)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PostUSView() {
  const { english: en } = useStudio();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/studio/us-guide")
      .then((res) => res.json())
      .then((json) => setDone(new Set<string>(json.done || [])))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const doneList = useMemo(() => Array.from(done), [done]);

  useEffect(() => {
    if (!loaded) return;
    setSaving(true);
    const handle = setTimeout(() => {
      fetch("/api/studio/us-guide", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: doneList }),
      })
        .catch(() => {})
        .finally(() => setSaving(false));
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneList]);

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="ss-postus">
      <div className="ss-panel">
        <h2>{t("Poster aux US à 100 %", "Post to the US, 100%", en)}</h2>
        <p className="ss-lead">
          {t(
            "Deux méthodes coexistent. Choisis-en une par compte et ne les mélange jamais : la méthode A vise le For You US depuis la France sans VPN, la méthode B crée un compte réellement enregistré aux États-Unis.",
            "Two methods coexist. Pick one per account and never mix them: method A targets the US For You from abroad with no VPN, method B creates an account genuinely registered in the United States.",
            en,
          )}
        </p>
        <div className="ss-shadow-table">
          <table>
            <thead>
              <tr>
                <th />
                <th>{t("A — Organique sans VPN", "A — Organic, no VPN", en)}</th>
                <th>{t("B — iPhone US dédié + Outline", "B — Dedicated US iPhone + Outline", en)}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.label.fr}>
                  <th>{t(row.label.fr, row.label.en, en)}</th>
                  <td>{t(row.a.fr, row.a.en, en)}</td>
                  <td>{t(row.b.fr, row.b.en, en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ss-panel">
        <h2>{t("Méthode A — organique depuis la France", "Method A — organic from abroad", en)}</h2>
        <h3>{t("Créer le compte", "Create the account", en)}</h3>
        <List rows={A_SETUP} en={en} />
        <h3>{t("Créneaux de publication (heure de New York)", "Posting windows (New York time)", en)}</h3>
        <div className="ss-shadow-table">
          <table>
            <thead>
              <tr>
                <th>{t("Fenêtre ET", "ET window", en)}</th>
                <th>{t("Paris", "Paris", en)}</th>
                <th>{t("Usage", "Use", en)}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>11:00–14:00</td>
                <td>17:00–20:00</td>
                <td>{t("Principal", "Primary", en)}</td>
              </tr>
              <tr>
                <td>18:00–21:00</td>
                <td>00:00–03:00</td>
                <td>{t("Secondaire", "Secondary", en)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>{t("Warm-up, 7 premiers jours", "Warm-up, first 7 days", en)}</h3>
        <List rows={A_WARMUP} en={en} ordered />
        <h3>{t("À éviter", "Avoid", en)}</h3>
        <List rows={A_AVOID} en={en} />
        <p className="ss-lead">
          {t(
            "Seules les TikTok Ads avec geo = United States forcent la diffusion US avec cette méthode.",
            "Only TikTok Ads with geo = United States force US delivery with this method.",
            en,
          )}
        </p>
      </div>

      <div className="ss-panel">
        <h2>{t("Méthode B — iPhone US dédié + Outline", "Method B — dedicated US iPhone + Outline", en)}</h2>
        <h3>{t("Avant, une seule fois", "Before, once", en)}</h3>
        <List rows={B_BEFORE} en={en} ordered />
        <h3>{t("Serveur VPN (fait par ton agent Cursor / Claude Code)", "VPN server (done by your Cursor / Claude Code agent)", en)}</h3>
        <List rows={B_SERVER} en={en} />
        <AgentPrompt en={en} />
        <h3>{t("Après", "After", en)}</h3>
        <List rows={B_AFTER} en={en} ordered />
        <p className="ss-lead">
          <b>{t("Règle d'or : ", "Golden rule: ", en)}</b>
          {t(
            "chaque session c'est Wi‑Fi sans SIM, Outline Connect, IP USA, et seulement ensuite TikTok. Une seule ouverture sans VPN peut brûler le compte. Ne jamais ouvrir ce compte dans l'app TikTok du Mac ou d'un autre téléphone.",
            "every session is Wi‑Fi with no SIM, Outline Connect, US IP, and only then TikTok. A single open without the VPN can burn the account. Never open this account in TikTok on the Mac or another phone.",
            en,
          )}
        </p>
        <p className="ss-lead">
          {t(
            "Pas envie de gérer le téléphone et le serveur ? On fournit des comptes US déjà warmés sur vrais téléphones.",
            "Don't want to manage the phone and the server? We provide US accounts already warmed on real phones.",
            en,
          )}{" "}
          <Link href="/app/warmed-accounts">{t("Voir les comptes warmés", "See warmed accounts", en)}</Link>
        </p>
        <p className="ss-lead">
          {t("Liens utiles :", "Useful links:", en)}{" "}
          <a href={US_LINKS.hetznerConsole} target="_blank" rel="noreferrer">Hetzner Console</a> ·{" "}
          <a href={US_LINKS.outlineGetStarted} target="_blank" rel="noreferrer">Outline Manager</a> ·{" "}
          <a href={US_LINKS.outlineIos} target="_blank" rel="noreferrer">Outline iOS</a> ·{" "}
          <a href={US_LINKS.ipCheck} target="_blank" rel="noreferrer">{t("Vérifier mon IP", "Check my IP", en)}</a> ·{" "}
          <a href={US_LINKS.textnow} target="_blank" rel="noreferrer">TextNow</a>
        </p>
      </div>

      <div className="ss-panel">
        <Checklist en={en} done={done} toggle={toggle} saving={saving} />
      </div>
    </div>
  );
}
