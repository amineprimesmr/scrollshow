"use client";

import { t } from "@/lib/i18n";
import type { ManageAction, ManagedAccount } from "@/lib/account-manage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compact } from "./AccountsFan";
import { rowAvatarSrc } from "./cover";
import { IconEyeOff, IconSearch, IconTrash, IconX } from "./icons";
import { Orb } from "@/components/fx/Orb";
import "./accounts-manager.css";

export type FanSort = "followers" | "likes" | "posts";
type Filter = "all" | "connected" | "tracked" | "research" | "hidden";

/** Mot a recopier avant une suppression lourde : dix comptes, ou un compte connecte. */
const CONFIRM_WORD = { fr: "SUPPRIMER", en: "DELETE" };

/**
 * Gestionnaire de comptes : la seule vue qui liste TOUS les comptes du projet,
 * masques compris. Masquer est reversible ; supprimer efface le compte de
 * ScrollShow (et revoque l'acces TikTok d'un compte connecte).
 */
export function AccountsManager({
  open,
  onClose,
  sort,
  onSort,
  onChanged,
  en,
}: {
  open: boolean;
  onClose: () => void;
  sort: FanSort;
  onSort: (sort: FanSort) => void;
  /** Quelque chose a bouge : l'Overview et le studio relisent leurs comptes. */
  onChanged: () => void;
  en: boolean;
}) {
  const [items, setItems] = useState<ManagedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ManageAction | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/studio/accounts/manage", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "load_failed");
      setItems(json.accounts || []);
    } catch {
      setError(t("Impossible de lire tes comptes. Réessaie.", "Could not load your accounts. Try again.", en));
    }
  }, [en]);

  useEffect(() => {
    if (!open) return;
    setItems(null); setPicked(new Set()); setConfirm(null); setTyped(""); setNotice(null); setQuery(""); setFilter("all");
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirm) { setConfirm(null); setTyped(""); } else onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [open, confirm, onClose]);

  const counts = useMemo(() => {
    const list = items || [];
    return {
      all: list.length,
      connected: list.filter((item) => item.kind === "connected").length,
      tracked: list.filter((item) => item.kind === "tracked").length,
      research: list.filter((item) => item.kind === "research").length,
      hidden: list.filter((item) => item.hidden).length,
    };
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^@/, "");
    return (items || [])
      .filter((item) => filter === "all" || (filter === "hidden" ? item.hidden : item.kind === filter))
      .filter((item) => !needle || `${item.handle} ${item.name}`.toLowerCase().includes(needle))
      .sort((a, b) => b[sort] - a[sort] || a.handle.localeCompare(b.handle));
  }, [items, filter, query, sort]);

  const byKey = useMemo(() => new Map((items || []).map((item) => [item.key, item])), [items]);
  const selection = useMemo(() => [...picked].filter((key) => byKey.has(key)), [picked, byKey]);
  const allVisiblePicked = visible.length > 0 && visible.every((item) => picked.has(item.key));

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAllVisible() {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const item of visible) if (allVisiblePicked) next.delete(item.key); else next.add(item.key);
      return next;
    });
  }

  async function run(action: ManageAction, keys: string[]) {
    if (!keys.length || busy) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/studio/accounts/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, keys }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "failed");
      setItems(json.accounts || []);
      setPicked((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.delete(key);
        return next;
      });
      setConfirm(null);
      setTyped("");
      const n = Number(json.changed || 0);
      setNotice(
        action === "remove"
          ? t(`${n} compte${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""} de ScrollShow.`, `${n} account${n === 1 ? "" : "s"} deleted from ScrollShow.`, en)
          : action === "hide"
            ? t(`${n} compte${n > 1 ? "s" : ""} masqué${n > 1 ? "s" : ""}.`, `${n} account${n === 1 ? "" : "s"} hidden.`, en)
            : t(`${n} compte${n > 1 ? "s" : ""} réaffiché${n > 1 ? "s" : ""}.`, `${n} account${n === 1 ? "" : "s"} shown again.`, en),
      );
      onChanged();
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "failed";
      setError(code === "rate_limited"
        ? t("Trop d'actions d'un coup. Réessaie dans une minute.", "Too many actions at once. Try again in a minute.", en)
        : t("L'action n'a pas abouti. Rien n'a été modifié.", "The action did not go through. Nothing was changed.", en));
    } finally {
      setBusy(null);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const pending = confirm ? confirm.map((key) => byKey.get(key)).filter((item): item is ManagedAccount => Boolean(item)) : [];
  const pendingConnected = pending.filter((item) => item.kind === "connected").length;
  const pendingScheduled = pending.reduce((n, item) => n + item.scheduledPosts, 0);
  const needsWord = pending.length >= 10 || pendingConnected > 0;
  const word = en ? CONFIRM_WORD.en : CONFIRM_WORD.fr;
  const canDelete = !needsWord || typed.trim().toUpperCase() === word;
  const pickedHidden = selection.filter((key) => byKey.get(key)?.hidden).length;

  return createPortal(
    <div className="ss-modal ss-am-modal" onClick={onClose}>
      <div
        ref={dialog}
        className="ss-dialog ss-am"
        role="dialog"
        aria-modal="true"
        aria-label={t("Gérer mes comptes", "Manage my accounts", en)}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ss-am__head">
          <div>
            <h2>{t("Gérer mes comptes", "Manage my accounts", en)}</h2>
            <p>{t("Tes comptes = connectés + suivis. Ceux trouvés par la Recherche ne s'affichent nulle part ailleurs qu'ici et dans Recherche.", "Your accounts = connected + followed. Those found by Research show only here and in Research.", en)}</p>
          </div>
          <button type="button" className="ss-am__close lg-press" onClick={onClose} aria-label={t("Fermer", "Close", en)}>
            <IconX size={16} />
          </button>
        </header>

        <div className="ss-am__tools">
          <label className="ss-am__search">
            <IconSearch size={15} />
            <span className="ss-sr-only">{t("Chercher un compte", "Search an account", en)}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Chercher un compte", "Search an account", en)} />
          </label>
          <div className="ss-am__seg" role="group" aria-label={t("Filtrer", "Filter", en)}>
            {(["all", "connected", "tracked", "research", "hidden"] as const).map((id) => (
              <button key={id} type="button" className={filter === id ? "is-on" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {id === "all" ? t("Tous", "All", en) : id === "connected" ? t("Connectés", "Connected", en) : id === "tracked" ? t("Suivis", "Followed", en) : id === "research" ? t("Recherche", "Research", en) : t("Masqués", "Hidden", en)}
                <em>{counts[id]}</em>
              </button>
            ))}
          </div>
          <label className="ss-am__sort">
            <span>{t("Trier par", "Sort by", en)}</span>
            <select className="ss-input" value={sort} onChange={(event) => onSort(event.target.value as FanSort)}>
              <option value="followers">{t("Abonnés", "Followers", en)}</option>
              <option value="likes">Likes</option>
              <option value="posts">Posts</option>
            </select>
          </label>
        </div>

        {error ? <p className="ss-am__error" role="alert">{error}</p> : null}
        {notice && !error ? <p className="ss-am__notice" role="status">{notice}</p> : null}

        <div className="ss-am__list" aria-busy={items === null}>
          {items === null && !error ? (
            <div className="ss-am__empty"><Orb size={20} state="working" /> {t("Lecture des comptes…", "Loading accounts…", en)}</div>
          ) : null}
          {items !== null && !visible.length ? (
            <div className="ss-am__empty">
              {items.length
                ? t("Aucun compte ne correspond.", "No account matches.", en)
                : t("Aucun compte dans ce projet.", "No account in this project.", en)}
            </div>
          ) : null}
          {visible.length ? (
            <label className="ss-am__all">
              <input type="checkbox" checked={allVisiblePicked} onChange={toggleAllVisible} />
              <span>
                {allVisiblePicked
                  ? t("Tout désélectionner", "Deselect all", en)
                  : t(`Tout sélectionner (${visible.length})`, `Select all (${visible.length})`, en)}
              </span>
            </label>
          ) : null}
          <ul>
            {visible.map((item) => (
              <li key={item.key} className={`ss-am__row${item.hidden ? " is-hidden" : ""}${picked.has(item.key) ? " is-picked" : ""}`}>
                <label className="ss-am__pick">
                  <input type="checkbox" checked={picked.has(item.key)} onChange={() => toggle(item.key)} aria-label={`@${item.handle}`} />
                </label>
                <ManagerAvatar item={item} />
                <div className="ss-am__id">
                  <b>{item.name || `@${item.handle}`}</b>
                  <span>@{item.handle}</span>
                </div>
                <div className="ss-am__tags">
                  <span className={`ss-am__tag${item.kind === "connected" ? (item.connected ? " is-live" : " is-warn") : ""}`}>
                    {item.kind === "connected"
                      ? item.connected ? t("Connecté", "Connected", en) : t("Connexion expirée", "Connection expired", en)
                      : item.kind === "research" ? t("Trouvé par la Recherche", "Found by Research", en) : t("Suivi", "Followed", en)}
                  </span>
                  {item.hidden ? <span className="ss-am__tag is-muted">{t("Masqué", "Hidden", en)}</span> : null}
                  {item.scheduledPosts ? (
                    <span className="ss-am__tag is-warn">
                      {item.scheduledPosts} {t(item.scheduledPosts > 1 ? "planifiés" : "planifié", "scheduled", en)}
                    </span>
                  ) : null}
                </div>
                <span className="ss-am__num"><b>{compact(item.followers)}</b> {t("abonnés", "followers", en)}</span>
                <div className="ss-am__acts">
                  <button
                    type="button"
                    className="ss-am__icon lg-press"
                    disabled={Boolean(busy)}
                    title={item.hidden ? t("Réafficher", "Show again", en) : t("Masquer", "Hide", en)}
                    aria-label={`${item.hidden ? t("Réafficher", "Show again", en) : t("Masquer", "Hide", en)} @${item.handle}`}
                    onClick={() => void run(item.hidden ? "show" : "hide", [item.key])}
                  >
                    {item.hidden ? <EyeOn /> : <IconEyeOff size={16} />}
                  </button>
                  <button
                    type="button"
                    className="ss-am__icon is-danger lg-press"
                    disabled={Boolean(busy)}
                    title={t("Supprimer de ScrollShow", "Delete from ScrollShow", en)}
                    aria-label={`${t("Supprimer", "Delete", en)} @${item.handle}`}
                    onClick={() => { setTyped(""); setConfirm([item.key]); }}
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {confirm ? (
          <footer className="ss-am__bar ss-am__bar--confirm" role="alertdialog" aria-label={t("Confirmer la suppression", "Confirm deletion", en)}>
            <div className="ss-am__confirm-copy">
              <b>
                {pending.length === 1
                  ? t(`Supprimer @${pending[0].handle} de ScrollShow ?`, `Delete @${pending[0].handle} from ScrollShow?`, en)
                  : t(`Supprimer ${pending.length} comptes de ScrollShow ?`, `Delete ${pending.length} accounts from ScrollShow?`, en)}
              </b>
              <span>
                {t("Leurs posts chargés et leurs statistiques sont effacés. Rien ne change sur TikTok.", "Their loaded posts and stats are erased. Nothing changes on TikTok.", en)}
                {pendingConnected ? ` ${t(`${pendingConnected} compte${pendingConnected > 1 ? "s" : ""} connecté${pendingConnected > 1 ? "s" : ""} : l'accès de ScrollShow est révoqué, il faudra reconnecter pour publier.`, `${pendingConnected} connected account${pendingConnected === 1 ? "" : "s"}: ScrollShow's access is revoked, you will need to reconnect to publish.`, en)}` : ""}
                {pendingScheduled ? ` ${t(`${pendingScheduled} post${pendingScheduled > 1 ? "s" : ""} planifié${pendingScheduled > 1 ? "s" : ""} perdront leur compte cible.`, `${pendingScheduled} scheduled post${pendingScheduled === 1 ? "" : "s"} will lose their target account.`, en)}` : ""}
              </span>
              {needsWord ? (
                <label className="ss-am__word">
                  <span>{t(`Écris ${word} pour confirmer`, `Type ${word} to confirm`, en)}</span>
                  <input className="ss-input" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus autoComplete="off" spellCheck={false} />
                </label>
              ) : null}
            </div>
            <div className="ss-am__bar-acts">
              <button type="button" className="ss-btn-ghost lg-press" disabled={busy === "remove"} onClick={() => { setConfirm(null); setTyped(""); }}>
                {t("Annuler", "Cancel", en)}
              </button>
              <button type="button" className="ss-am__danger lg-press" disabled={!canDelete || busy === "remove"} onClick={() => void run("remove", confirm)}>
                {busy === "remove" ? <Orb size={20} state="working" /> : <IconTrash size={15} />}
                {t("Supprimer définitivement", "Delete permanently", en)}
              </button>
            </div>
          </footer>
        ) : selection.length ? (
          <footer className="ss-am__bar">
            <span className="ss-am__count">
              {selection.length} {t(selection.length > 1 ? "sélectionnés" : "sélectionné", "selected", en)}
            </span>
            <div className="ss-am__bar-acts">
              {pickedHidden < selection.length ? (
                <button type="button" className="ss-btn-ghost lg-press" disabled={Boolean(busy)} onClick={() => void run("hide", selection)}>
                  <IconEyeOff size={15} /> {t("Masquer", "Hide", en)}
                </button>
              ) : null}
              {pickedHidden ? (
                <button type="button" className="ss-btn-ghost lg-press" disabled={Boolean(busy)} onClick={() => void run("show", selection)}>
                  <EyeOn /> {t("Réafficher", "Show again", en)}
                </button>
              ) : null}
              <button type="button" className="ss-am__danger lg-press" disabled={Boolean(busy)} onClick={() => { setTyped(""); setConfirm(selection); }}>
                <IconTrash size={15} /> {t("Supprimer", "Delete", en)}
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function ManagerAvatar({ item }: { item: ManagedAccount }) {
  const [dead, setDead] = useState(false);
  const src = rowAvatarSrc(item, 36);
  return (
    <span className="ss-am__avatar" aria-hidden>
      {src && !dead ? <img src={src} alt="" loading="lazy" decoding="async" width={36} height={36} onError={() => setDead(true)} /> : item.handle.slice(0, 2).toUpperCase()}
    </span>
  );
}

function EyeOn() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
