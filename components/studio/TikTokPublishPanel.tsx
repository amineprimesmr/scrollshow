"use client";

import { t } from "@/lib/i18n";
import {
  BRANDED_CONTENT_POLICY_URL,
  MUSIC_USAGE_URL,
  PRIVACY_LEVELS,
  commercialLabel,
  declarationFor,
  type CreatorSnapshot,
  type OptionsError,
  type TikTokPostOptions,
  validatePostOptions,
} from "@/lib/tiktok-compliance";
import { useCallback, useEffect, useState } from "react";

// The "Post to TikTok" page, built to the letter of TikTok's Content Sharing
// Guidelines → Required UX Implementation in Your App (points 1-5):
//  1a nickname from a fresh creator_info · 1b stop when the creator can't post
//  2a title · 2b privacy from privacy_level_options, no default
//  2c "Allow comment" off by default, greyed when the creator disabled it
//  3  commercial disclosure off by default, brand/branded sub-options, labels
//  3b branded content can't be private · 4 declaration text per case
//  5d "may take a few minutes" · 5e publish status

export type CreatorState = {
  loading: boolean;
  connected: boolean;
  creator: CreatorSnapshot | null;
  blocked: string | null;
  error: string;
  handle: string;
};

export function useTikTokCreator(active: boolean): CreatorState & { refresh: () => void } {
  const [state, setState] = useState<CreatorState>({ loading: false, connected: false, creator: null, blocked: null, error: "", handle: "" });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: "" }));
    fetch("/api/tiktok/creator", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ loading: false, connected: true, creator: null, blocked: null, error: String(json.error || "creator"), handle: "" });
          return;
        }
        setState({
          loading: false,
          connected: Boolean(json.connected),
          creator: json.creator || null,
          blocked: json.blocked || null,
          error: "",
          handle: String(json.handle || ""),
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, connected: false, creator: null, blocked: null, error: "network", handle: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [active, tick]);

  return { ...state, refresh };
}

export function optionsErrorCopy(code: OptionsError | string, english: boolean) {
  switch (code) {
    case "title_required":
      return t("Ajoute un titre.", "Add a title.", english);
    case "privacy_required":
      return t("Choisis qui peut voir ce post.", "Choose who can view this post.", english);
    case "privacy_not_allowed":
      return t("Cette confidentialité n'est pas disponible pour ce compte.", "This privacy option is not available for this account.", english);
    case "commercial_choice_required":
      return t(
        "Tu dois indiquer si ton contenu fait ta promotion, celle d'un tiers, ou les deux.",
        "You need to indicate if your content promotes yourself, a third party, or both.",
        english,
      );
    case "branded_content_private":
      return t("La visibilité d'un contenu de marque ne peut pas être privée.", "Branded content visibility cannot be set to private.", english);
    case "comment_disabled_by_creator":
      return t("Les commentaires sont désactivés dans tes réglages TikTok.", "Comments are disabled in your TikTok settings.", english);
    default:
      return "";
  }
}

export function blockedCopy(reason: string, english: boolean) {
  const base = t(
    "TikTok n'autorise pas ce compte à publier pour le moment. Réessaie plus tard.",
    "TikTok is not allowing this account to post right now. Please try again later.",
    english,
  );
  if (reason === "private_account_required") {
    return t(
      "Ce compte doit être en privé pour publier via ScrollShow tant que l'app n'est pas auditée. Passe le compte en privé, puis réessaie.",
      "This account must be private to post through ScrollShow until the app is audited. Set the account to private, then try again.",
      english,
    );
  }
  if (reason === "too_many_posts" || reason === "too_many_pending") {
    return t(
      "Tu as atteint la limite de publications TikTok pour aujourd'hui. Réessaie plus tard.",
      "You have reached TikTok's posting limit for today. Please try again later.",
      english,
    );
  }
  return base;
}

type Props = {
  english: boolean;
  creatorState: CreatorState;
  options: TikTokPostOptions;
  setOptions: (next: TikTokPostOptions) => void;
  onRefresh: () => void;
};

export function TikTokPublishPanel({ english, creatorState, options, setOptions, onRefresh }: Props) {
  const { creator, loading, blocked, error, connected } = creatorState;
  const privacyOptions = creator?.privacyOptions.length
    ? creator.privacyOptions
    : PRIVACY_LEVELS.map((item) => item.id);
  const label = commercialLabel(options);
  const declaration = declarationFor(options);
  const invalid = validatePostOptions(options, creator);
  const commentDisabled = Boolean(creator?.commentDisabled);
  const isPrivate = options.privacy === "SELF_ONLY";

  function patch(next: Partial<TikTokPostOptions>) {
    setOptions({ ...options, ...next });
  }

  function choosePrivacy(value: string) {
    // Guideline 3b: picking "Only me" while "Branded content" is on would be
    // contradictory, so the branded option is dropped and the user is told.
    if (value === "SELF_ONLY" && options.commercial && options.brandContent) {
      patch({ privacy: value, brandContent: false });
      return;
    }
    patch({ privacy: value });
  }

  if (!connected) {
    return (
      <section className="ss-ttp">
        <p className="ss-lead">
          {t("Connecte TikTok pour publier en Direct Post.", "Connect TikTok to publish with Direct Post.", english)}{" "}
          <a href="/api/tiktok/oauth/start">{t("Continuer avec TikTok", "Continue with TikTok", english)}</a>
        </p>
      </section>
    );
  }

  return (
    <section className="ss-ttp" aria-label={t("Publier sur TikTok", "Post to TikTok", english)}>
      <header className="ss-ttp__creator">
        {loading ? (
          <span className="ss-ttp__muted">{t("Chargement du compte TikTok…", "Loading TikTok account…", english)}</span>
        ) : creator ? (
          <>
            {creator.avatar ? <img src={creator.avatar} alt="" width={36} height={36} /> : <span className="ss-ttp__avatar" />}
            <div>
              <span className="ss-ttp__muted">{t("Sera publié sur le compte", "Will be posted to", english)}</span>
              <b>{creator.nickname || creator.username || creatorState.handle}</b>
              {creator.username ? <span className="ss-ttp__muted"> @{creator.username}</span> : null}
            </div>
          </>
        ) : (
          <span className="ss-ttp__muted">
            {blocked ? "" : error ? t("Impossible de lire le compte TikTok.", "Could not read the TikTok account.", english) : ""}
          </span>
        )}
        <button type="button" className="ss-ttp__refresh" onClick={onRefresh} disabled={loading} title={t("Actualiser", "Refresh", english)}>
          ↻
        </button>
      </header>

      {blocked ? <p className="ss-ttp__alert" role="alert">{blockedCopy(blocked, english)}</p> : null}

      <label className="ss-ttp__field">
        <span>{t("Titre", "Title", english)}</span>
        <input
          type="text"
          maxLength={90}
          value={options.title}
          placeholder={t("Titre du post (modifiable)", "Post title (editable)", english)}
          onChange={(event) => patch({ title: event.target.value })}
          required
        />
        <small>{options.title.length} / 90</small>
      </label>

      <label className="ss-ttp__field">
        <span>{t("Qui peut voir ce post", "Who can view this post", english)}</span>
        <select value={options.privacy} onChange={(event) => choosePrivacy(event.target.value)} required>
          <option value="" disabled>
            {t("Sélectionner…", "Select privacy…", english)}
          </option>
          {privacyOptions.map((id) => {
            const meta = PRIVACY_LEVELS.find((item) => item.id === id);
            const lockedByBranded = id === "SELF_ONLY" && options.commercial && options.brandContent;
            return (
              <option
                key={id}
                value={id}
                disabled={lockedByBranded}
                title={lockedByBranded ? t("La visibilité d'un contenu de marque ne peut pas être privée.", "Branded content visibility cannot be set to private.", english) : undefined}
              >
                {meta ? (english ? meta.en : meta.fr) : id}
                {lockedByBranded ? ` — ${t("indisponible avec un contenu de marque", "unavailable with branded content", english)}` : ""}
              </option>
            );
          })}
        </select>
      </label>

      <label className={`ss-ttp__check${commentDisabled ? " is-disabled" : ""}`} title={commentDisabled ? t("Désactivé dans tes réglages TikTok", "Disabled in your TikTok settings", english) : undefined}>
        <input
          type="checkbox"
          checked={options.allowComment && !commentDisabled}
          disabled={commentDisabled}
          onChange={(event) => patch({ allowComment: event.target.checked })}
        />
        <span>{t("Autoriser les commentaires", "Allow comment", english)}</span>
        {commentDisabled ? <small>{t("Désactivé dans tes réglages TikTok", "Disabled in your TikTok settings", english)}</small> : null}
      </label>

      <div className="ss-ttp__disclose">
        <label className="ss-ttp__toggle">
          <span>
            <b>{t("Divulguer un contenu commercial", "Disclose commercial content", english)}</b>
            <small>
              {t(
                "Indique si ce contenu fait ta promotion, celle d'une marque, d'un produit ou d'un service.",
                "Indicate whether this content promotes yourself, a brand, product or service.",
                english,
              )}
            </small>
          </span>
          <span className="ss-switch">
            <input
              type="checkbox"
              checked={options.commercial}
              onChange={(event) =>
                patch(event.target.checked ? { commercial: true } : { commercial: false, brandOrganic: false, brandContent: false })
              }
            />
            <i />
          </span>
        </label>

        {options.commercial ? (
          <div className="ss-ttp__brands">
            <label className="ss-ttp__check">
              <input type="checkbox" checked={options.brandOrganic} onChange={(event) => patch({ brandOrganic: event.target.checked })} />
              <span>{t("Ta marque", "Your brand", english)}</span>
              <small>{t("Tu fais ta propre promotion ou celle de ton entreprise.", "You are promoting yourself or your own business.", english)}</small>
            </label>
            <label
              className={`ss-ttp__check${isPrivate ? " is-disabled" : ""}`}
              title={isPrivate ? t("La visibilité d'un contenu de marque ne peut pas être privée.", "Branded content visibility can't be private.", english) : undefined}
            >
              <input
                type="checkbox"
                checked={options.brandContent}
                disabled={isPrivate}
                onChange={(event) => patch({ brandContent: event.target.checked })}
              />
              <span>{t("Contenu de marque", "Branded content", english)}</span>
              <small>
                {isPrivate
                  ? t("La visibilité d'un contenu de marque ne peut pas être privée.", "Branded content visibility can't be private.", english)
                  : t("Tu fais la promotion d'une autre marque ou d'un tiers.", "You are promoting another brand or a third party.", english)}
              </small>
            </label>
            {label === "promotional" ? (
              <p className="ss-ttp__note">{t("Ta photo sera étiquetée « Contenu promotionnel ».", "Your photo will be labeled as 'Promotional content'.", english)}</p>
            ) : label === "paid_partnership" ? (
              <p className="ss-ttp__note">{t("Ta photo sera étiquetée « Partenariat rémunéré ».", "Your photo will be labeled as 'Paid partnership'.", english)}</p>
            ) : (
              <p className="ss-ttp__note ss-ttp__note--warn">{optionsErrorCopy("commercial_choice_required", english)}</p>
            )}
          </div>
        ) : null}
      </div>

      <p className="ss-ttp__declaration">
        {declaration === "branded" ? (
          <>
            {t("En publiant, tu acceptes la ", "By posting, you agree to TikTok's ", english)}
            <a href={BRANDED_CONTENT_POLICY_URL} target="_blank" rel="noreferrer">
              {t("Politique de contenu de marque", "Branded Content Policy", english)}
            </a>
            {t(" et la ", " and ", english)}
            <a href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer">
              {t("Confirmation d'utilisation de musique", "Music Usage Confirmation", english)}
            </a>
            {t(" de TikTok.", ".", english)}
          </>
        ) : (
          <>
            {t("En publiant, tu acceptes la ", "By posting, you agree to TikTok's ", english)}
            <a href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer">
              {t("Confirmation d'utilisation de musique", "Music Usage Confirmation", english)}
            </a>
            {t(" de TikTok.", ".", english)}
          </>
        )}
      </p>
      <p className="ss-ttp__muted">
        {t(
          "Après la publication, TikTok peut mettre quelques minutes à traiter le contenu avant qu'il apparaisse sur ton profil.",
          "After publishing, it may take a few minutes for TikTok to process the content and show it on your profile.",
          english,
        )}
      </p>
      {invalid && invalid !== "commercial_choice_required" ? <p className="ss-ttp__note ss-ttp__note--warn">{optionsErrorCopy(invalid, english)}</p> : null}
    </section>
  );
}

export type PublishProgress = {
  publishId: string;
  status: string;
  tiktokId?: string;
  failReason?: string;
};

export function PublishStatus({ progress, english, handle }: { progress: PublishProgress; english: boolean; handle: string }) {
  if (progress.status === "PUBLISH_COMPLETE") {
    const url = progress.tiktokId && handle ? `https://www.tiktok.com/@${handle}/photo/${progress.tiktokId}` : handle ? `https://www.tiktok.com/@${handle}` : "";
    return (
      <p className="ss-ttp__status is-ok" role="status">
        {t("Publié sur TikTok.", "Posted to TikTok.", english)}{" "}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {t("Voir sur TikTok", "View on TikTok", english)}
          </a>
        ) : null}
      </p>
    );
  }
  if (progress.status === "FAILED") {
    return (
      <p className="ss-ttp__status is-err" role="alert">
        {t("TikTok a refusé la publication", "TikTok rejected the post", english)}
        {progress.failReason ? ` : ${progress.failReason}` : "."}
      </p>
    );
  }
  return (
    <p className="ss-ttp__status" role="status">
      <span className="ss-spin" />{" "}
      {t(
        "Envoyé. TikTok traite le post — cela peut prendre quelques minutes avant qu'il soit visible sur ton profil.",
        "Sent. TikTok is processing the post — it may take a few minutes before it is visible on your profile.",
        english,
      )}
    </p>
  );
}
