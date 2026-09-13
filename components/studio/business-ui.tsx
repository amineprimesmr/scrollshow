"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./icons";

export async function businessRequest<T>(path: string, body?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/business${path}`, body === undefined
    ? { cache: "no-store", signal }
    : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "request_failed");
  return data as T;
}

export function businessError(error: unknown, en: boolean) {
  const code = error instanceof Error ? error.message : "request_failed";
  const messages: Record<string, [string, string]> = {
    invalid_input: ["Vérifie les champs : dates, limites et adresses HTTPS publiques.", "Check the fields: dates, limits and public HTTPS addresses."],
    connection_input_invalid: ["Vérifie les identifiants et les champs de cette connexion.", "Check the credentials and fields for this connection."],
    provider_credentials_invalid: ["La clé n’est pas valide pour ce fournisseur ou cet environnement.", "The key is invalid for this provider or environment."],
    provider_permissions_missing: ["La clé n’a pas les permissions de lecture nécessaires.", "The key is missing the required read permissions."],
    provider_rate_limited: ["Le fournisseur limite temporairement les requêtes. Réessaie dans un instant.", "The provider is temporarily limiting requests. Try again shortly."],
    provider_environment_mismatch: ["La clé ne correspond pas à l’environnement choisi.", "The key does not match the selected environment."],
    provider_account_mismatch: ["La clé et l’identifiant ne correspondent pas au même compte.", "The key and ID do not match the same account."],
    stripe_key_invalid: ["Utilise une clé secrète ou restreinte Stripe avec les permissions de lecture.", "Use a Stripe secret or restricted key with read permissions."],
    stripe_webhook_secret_invalid: ["Le secret du webhook Stripe doit commencer par whsec_.", "The Stripe webhook secret must begin with whsec_."],
    lemonsqueezy_store_id_required: ["Renseigne l’identifiant numérique du magasin Lemon Squeezy.", "Enter the numeric Lemon Squeezy store ID."],
    lemonsqueezy_webhook_secret_invalid: ["Le secret Lemon Squeezy doit contenir entre 16 et 40 caractères.", "The Lemon Squeezy secret must contain between 16 and 40 characters."],
    paddle_account_unverifiable: ["Paddle doit contenir une première transaction avec l’adresse du vendeur pour vérifier ce compte.", "Paddle needs a first transaction with the seller address to verify this account."],
    revenuecat_project_id_required: ["Renseigne l’identifiant du projet RevenueCat (proj…).", "Enter the RevenueCat project ID (proj…)."],
    revenuecat_secret_key_required: ["Utilise une clé secrète RevenueCat v2, pas une clé publique SDK.", "Use a RevenueCat v2 secret key, not a public SDK key."],
    revenuecat_app_not_in_project: ["Une application sélectionnée n’appartient pas au projet RevenueCat.", "A selected app does not belong to the RevenueCat project."],
    revenuecat_apps_required: ["Ajoute au moins une application dans ce projet RevenueCat.", "Add at least one app to this RevenueCat project."],
    stripe_revenuecat_overlap: ["Exclus les transactions Stripe du miroir RevenueCat pour éviter un double comptage.", "Exclude mirrored Stripe transactions in RevenueCat to avoid double counting."],
    connection_sync_busy: ["Une synchronisation est déjà en cours. Réessaie après sa fin.", "A sync is already running. Try again after it finishes."],
    invalid_csv_headers: ["Les colonnes CSV ne correspondent pas au modèle indiqué.", "CSV columns do not match the provided template."],
    csv_invalid_date: ["Utilise une date passée ISO avec fuseau horaire.", "Use a past ISO date with a time zone."],
    csv_duplicate_or_missing_id: ["Identifiant manquant ou présent plusieurs fois dans le fichier.", "An ID is missing or repeated in the file."],
    csv_invalid_minor_units: ["Les montants doivent être des entiers positifs en unités mineures ; la taxe ne peut pas dépasser le total.", "Amounts must be positive minor-unit integers; tax cannot exceed the total."],
    csv_invalid_currency: ["La devise doit avoir trois lettres majuscules.", "Currency must use three uppercase letters."],
    csv_invalid_kind: ["Type accepté : initial, renewal, one_time ou unknown.", "Accepted kind: initial, renewal, one_time or unknown."],
    csv_invalid_refund_reference: ["Le remboursement doit référencer une vente existante de même devise.", "The refund must reference an existing sale in the same currency."],
    csv_column_count: ["Le nombre de valeurs ne correspond pas aux colonnes.", "The value count does not match the columns."],
    foreign_publication: ["Cette publication n’appartient pas au projet actif.", "This publication does not belong to the active project."],
    auth: ["Reconnecte-toi pour continuer.", "Sign in again to continue."],
    unauthorized: ["La connexion n'a pas été autorisée.", "The connection was not authorized."],
    database_not_migrated: ["Le stockage des résultats doit être initialisé avant la première utilisation.", "Results storage must be initialized before first use."],
    business_database_not_migrated: ["Le stockage des résultats doit être initialisé avant la première utilisation.", "Results storage must be initialized before first use."],
    encryption_not_configured: ["Le chiffrement des connexions doit être configuré sur le serveur.", "Connection encryption must be configured on the server."],
    business_encryption_not_configured: ["Le chiffrement des connexions doit être configuré sur le serveur.", "Connection encryption must be configured on the server."],
    invalid_credentials: ["Les identifiants n'ont pas pu être vérifiés. Vérifie la clé et ses permissions.", "Credentials could not be verified. Check the key and its permissions."],
    invalid_request: ["Vérifie les champs du formulaire.", "Check the form fields."],
    invalid_url: ["Utilise une URL https valide.", "Use a valid https URL."],
    invalid_csv: ["Le CSV contient des erreurs. Corrige-les avant l'import.", "The CSV contains errors. Correct them before importing."],
    not_found: ["Cet élément n'est plus disponible dans ce projet.", "This item is no longer available in this project."],
  };
  const message = messages[code];
  return message ? message[en ? 1 : 0] : en ? "The request could not be completed. Check the setup and try again." : "La demande n'a pas abouti. Vérifie la configuration puis réessaie.";
}

export function BusinessModal({ title, children, onClose, wide = false, english = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; english?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("input, select, textarea, button, a[href]")?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']") || []);
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKey); document.body.style.overflow = bodyOverflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="ss-br ss-br__scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} className={`ss-br__modal lg${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="ss-br__modal-head"><h2 id={titleId}>{title}</h2><button type="button" className="ss-br__icon-button lg-press" onClick={onClose} aria-label={english ? "Close" : "Fermer"}><IconX size={18} /></button></div>
      {children}
    </div>
  </div>, document.body);
}

export function BusinessField({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`ss-br__field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function BusinessEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="ss-br__empty"><span className="ss-br__empty-mark" aria-hidden>↗</span><h3>{title}</h3><p>{body}</p>{action}</div>;
}

export function CopyButton({ value, english, label }: { value: string; english: boolean; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  return <button type="button" className="ss-br__button lg lg--lens lg-press" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setFailed(false); } catch { setFailed(true); } }}>
    {failed ? (english ? "Select and copy the text" : "Sélectionne et copie le texte") : copied ? (english ? "Copied" : "Copié") : label || (english ? "Copy" : "Copier")}
  </button>;
}

export function formatBusinessMoney(amount: number | null | undefined, currency: string, english: boolean) {
  if (amount == null || !Number.isFinite(amount)) return "—";
  try { const formatter = new Intl.NumberFormat(english ? "en-GB" : "fr-FR", { style: "currency", currency }); const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2; return formatter.format(amount / 10 ** digits); }
  catch { return `${(amount / 100).toFixed(2)} ${currency}`; }
}

export function moneyToMinor(amount: string, currency: string) {
  const value = Number(amount.replace(",", "."));
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(value * 10 ** digits);
}
