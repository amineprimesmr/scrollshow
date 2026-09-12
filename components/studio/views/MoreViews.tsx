"use client";

import { t } from "@/lib/i18n";
import type { WarmedListing } from "@/lib/warmed";
import type { WarmedOrder, WarmedOrderStatus } from "@/lib/types";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "../StudioContext";
import { LoadingOrb } from "@/components/fx/Orb";
import { ComingSoon } from "../ComingSoon";

type Filter = { region: "all" | "us" | "eu"; platform: "all" | "tiktok" | "instagram" };

const STATUS_LABEL: Record<WarmedOrderStatus, { fr: string; en: string; cls: string }> = {
  requested: { fr: "Demande envoyée", en: "Request sent", cls: "is-wait" },
  contacted: { fr: "En cours", en: "In progress", cls: "is-review" },
  delivered: { fr: "Livré", en: "Delivered", cls: "is-ready" },
  cancelled: { fr: "Annulé", en: "Cancelled", cls: "is-mute" },
};

function euro(n: number) {
  return `${n} €`;
}

export function WarmedAccountsView() {
  const { english: en } = useStudio();
  const [catalog, setCatalog] = useState<WarmedListing[]>([]);
  const [orders, setOrders] = useState<WarmedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>({ region: "all", platform: "all" });
  const [selected, setSelected] = useState<WarmedListing | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [niche, setNiche] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/studio/warmed")
      .then((res) => res.json())
      .then((json) => {
        setCatalog(json.catalog || []);
        setOrders(json.orders || []);
      })
      .catch(() => setError(t("Impossible de charger le catalogue.", "Could not load the catalog.", en)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () =>
      catalog.filter(
        (item) => (filter.region === "all" || item.region === filter.region) && (filter.platform === "all" || item.platform === filter.platform),
      ),
    [catalog, filter],
  );

  const listingById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/warmed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: selected.id, quantity, niche, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "failed");
      setOrders(json.orders || []);
      setSelected(null);
      setQuantity(1);
      setNiche("");
      setNote("");
      setFlash(t("Demande envoyée. On te recontacte sous 24 h avec les comptes disponibles.", "Request sent. We get back to you within 24h with available accounts.", en));
    } catch {
      setError(t("La demande n'a pas pu être envoyée. Réessaie.", "The request could not be sent. Try again.", en));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    const res = await fetch("/api/studio/warmed", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancel" }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setOrders(json.orders || []);
  }

  return (
    <div className="ss-warmed">
      <div className="ss-panel">
        <h2>{t("Comptes warmés", "Warmed accounts", en)}</h2>
        <p className="ss-lead">
          {t(
            "Comptes TikTok et Instagram US/EU chauffés sur de vrais téléphones, sans SIM, avec VPN résidentiel du pays. Tu reçois un compte prêt à connecter à ScrollShow, avec remplacement gratuit sous 30 jours.",
            "US/EU TikTok and Instagram accounts warmed on real phones, no SIM, with an in-country residential VPN. You get an account ready to connect to ScrollShow, with a free replacement within 30 days.",
            en,
          )}
        </p>
        <div className="ss-warmed-filters">
          {(["all", "us", "eu"] as const).map((region) => (
            <button
              key={region}
              type="button"
              className={`ss-pill ${filter.region === region ? "" : "is-mute"}`}
              onClick={() => setFilter((f) => ({ ...f, region }))}
            >
              {region === "all" ? t("Toutes régions", "All regions", en) : region.toUpperCase()}
            </button>
          ))}
          <span className="ss-warmed-filters__sep" />
          {(["all", "tiktok", "instagram"] as const).map((platform) => (
            <button
              key={platform}
              type="button"
              className={`ss-pill ${filter.platform === platform ? "" : "is-mute"}`}
              onClick={() => setFilter((f) => ({ ...f, platform }))}
            >
              {platform === "all" ? t("Toutes plateformes", "All platforms", en) : platform === "tiktok" ? "TikTok" : "Instagram"}
            </button>
          ))}
        </div>

        {loading ? <LoadingOrb state="working" text={t("Chargement…", "Loading…", en)} /> : null}
        {error ? <p className="ss-lead ss-lead--err">{error}</p> : null}
        {flash ? <p className="ss-lead ss-warmed-flash">{flash}</p> : null}

        <div className="ss-warmed-grid">
          {visible.map((item) => (
            <article key={item.id} className={`ss-warmed-card ${selected?.id === item.id ? "is-selected" : ""}`}>
              <header>
                <span className={`ss-badge ${item.region === "us" ? "is-ready" : "is-review"}`}>{item.region.toUpperCase()}</span>
                <h3>{t(item.fr, item.en, en)}</h3>
              </header>
              <dl>
                <div>
                  <dt>{t("Âge", "Age", en)}</dt>
                  <dd>{item.ageDays} {t("jours", "days", en)}</dd>
                </div>
                <div>
                  <dt>{t("Abonnés", "Followers", en)}</dt>
                  <dd>
                    {item.followersMin}–{item.followersMax}
                  </dd>
                </div>
                <div>
                  <dt>{t("Prix", "Price", en)}</dt>
                  <dd>
                    <b>{euro(item.monthlyEur)}</b> / {t("mois", "mo", en)}
                    {item.setupEur ? ` + ${euro(item.setupEur)} ${t("setup", "setup", en)}` : ""}
                  </dd>
                </div>
              </dl>
              <ul className="ss-feat">
                {item.includes.map((inc) => (
                  <li key={inc.fr}>{t(inc.fr, inc.en, en)}</li>
                ))}
              </ul>
              <button type="button" className="ss-btn-purple" onClick={() => setSelected(item)}>
                {t("Demander ce compte", "Request this account", en)}
              </button>
            </article>
          ))}
        </div>
        {!loading && !visible.length ? <p className="ss-lead">{t("Aucune offre pour ce filtre.", "No offer for this filter.", en)}</p> : null}
      </div>

      {selected ? (
        <div className="ss-panel ss-warmed-form">
          <h2>
            {t("Demande :", "Request:", en)} {t(selected.fr, selected.en, en)}
          </h2>
          <div className="ss-warmed-form__row">
            <label>
              <span>{t("Nombre de comptes", "Number of accounts", en)}</span>
              <input
                className="ss-input"
                type="number"
                min={1}
                max={20}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </label>
            <label>
              <span>{t("Niche (optionnel)", "Niche (optional)", en)}</span>
              <input
                className="ss-input"
                value={niche}
                maxLength={80}
                placeholder={t("ex. debloat, glow up, e-commerce", "e.g. debloat, glow up, e-commerce", en)}
                onChange={(e) => setNiche(e.target.value)}
              />
            </label>
          </div>
          <label>
            <span>{t("Message (optionnel)", "Message (optional)", en)}</span>
            <textarea className="ss-input" rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="ss-lead">
            {t("Total estimé :", "Estimated total:", en)}{" "}
            <b>
              {euro(selected.monthlyEur * quantity)} / {t("mois", "mo", en)}
            </b>
            {selected.setupEur ? ` + ${euro(selected.setupEur * quantity)} ${t("setup", "setup", en)}` : ""}.{" "}
            {t("Aucun paiement maintenant : on valide la dispo avec toi d'abord.", "No payment now: we confirm availability with you first.", en)}
          </p>
          <div className="ss-warmed-form__actions">
            <button type="button" className="ss-btn-purple" disabled={submitting} onClick={submit}>
              {submitting ? t("Envoi…", "Sending…", en) : t("Envoyer la demande", "Send request", en)}
            </button>
            <button type="button" className="ss-btn-ghost" onClick={() => setSelected(null)}>
              {t("Annuler", "Cancel", en)}
            </button>
          </div>
        </div>
      ) : null}

      <div className="ss-panel">
        <h2>{t("Mes demandes", "My requests", en)}</h2>
        {!orders.length ? (
          <p className="ss-lead">{t("Aucune demande pour l'instant.", "No request yet.", en)}</p>
        ) : (
          <div className="ss-shadow-table">
            <table>
              <thead>
                <tr>
                  <th>{t("Offre", "Offer", en)}</th>
                  <th>{t("Qté", "Qty", en)}</th>
                  <th>{t("Niche", "Niche", en)}</th>
                  <th>{t("Statut", "Status", en)}</th>
                  <th>{t("Date", "Date", en)}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const listing = listingById.get(order.listingId);
                  const status = STATUS_LABEL[order.status];
                  return (
                    <tr key={order.id}>
                      <td>{listing ? t(listing.fr, listing.en, en) : order.listingId}</td>
                      <td>{order.quantity}</td>
                      <td>{order.niche || "—"}</td>
                      <td>
                        <span className={`ss-badge ${status.cls}`}>{t(status.fr, status.en, en)}</span>
                      </td>
                      <td>{new Date(order.createdAt).toLocaleDateString(en ? "en-US" : "fr-FR")}</td>
                      <td>
                        {order.status === "requested" || order.status === "contacted" ? (
                          <button type="button" className="ss-btn-ghost" onClick={() => cancel(order.id)}>
                            {t("Annuler", "Cancel", en)}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ss-lead">
          {t("Tu préfères le faire toi-même ?", "Prefer doing it yourself?", en)}{" "}
          <Link href="/app/post-us">{t("Guide : développer une audience US", "Guide: grow a US audience", en)}</Link>
        </p>
      </div>
    </div>
  );
}

/** La page Comptes warmés n'est pas ouverte : le catalogue reste affiché, mais
    flouté et inerte, derrière une carte « bientôt disponible ». Pour rouvrir la
    page, rendre WarmedAccountsView directement depuis la route. */
export function WarmedAccountsLocked() {
  const { english: en } = useStudio();
  return (
    <ComingSoon
      badge={t("Bientôt disponible", "Coming soon", en)}
      title={t("Comptes warmés", "Warmed accounts", en)}
      note={t(
        "Des comptes US déjà chauffés sur de vrais téléphones. On finit de les préparer.",
        "US accounts already warmed on real phones. We are finishing them.",
        en,
      )}
      action={<Link href="/app/post-us">{t("Faire le mien en 1 h", "Make mine in an hour", en)}</Link>}
    >
      <WarmedAccountsView />
    </ComingSoon>
  );
}
