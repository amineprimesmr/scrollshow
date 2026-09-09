import { randomUUID } from "node:crypto";
import { readStore, updateStore } from "./store";
import { checkQrCode, createQrCode, exchangeCode, TikTokApiError } from "./tiktok";
import { saveTikTokAccount, type TikTokTokens } from "./tiktok-link";
import { ticketedScanUrl, validQrConfirmation } from "./tiktok-qr";
import type { SessionUser, StoreData } from "./types";

const TTL = 10 * 60_000;
const RETENTION = 30 * 60_000;
const LEASE = 60_000;

/** Private server data: never return tokens, tickets or codes to the browser. */
export type TikTokQrAttempt = {
  id: string; userId: string; token: string; ticket: string; state: string;
  scanUrl: string; expiresAt: number; retainUntil: number;
  status: "new" | "scanned" | "saving" | "connected" | "expired" | "error";
  code?: string; redirectUri?: string | null; tokens?: TikTokTokens;
  claim?: string; leaseUntil?: number; channelId?: string; error?: string;
};

type Progress = {
  status: TikTokQrAttempt["status"] | "retrying";
  expiresAt?: number; error?: string; retryable?: boolean; retryAfter?: number;
  account?: { id: string; name: string; handle: string };
};

function find(data: StoreData, user: SessionUser, id: string) {
  return data.tiktokQrAttempts?.find(item => item.id === id && item.userId === user.id && item.retainUntil > Date.now());
}

function storedProgress(data: StoreData, entry: TikTokQrAttempt): Progress | null {
  if (entry.status === "connected") {
    const channel = data.channels.find(item => item.id === entry.channelId && item.userId === entry.userId && item.connected);
    return channel
      ? { status: "connected", account: { id: channel.id, name: channel.name, handle: channel.handle } }
      : { status: "error", error: "account_removed", retryable: false };
  }
  if (entry.status === "error") return { status: "error", error: entry.error, retryable: false };
  // A code already received before expiry can still be saved after a retry.
  if (entry.status === "expired" || (entry.expiresAt <= Date.now() && !entry.code && !entry.tokens)) return { status: "expired" };
  return null;
}

export async function startTikTokQr(user: SessionUser) {
  const state = randomUUID(), ticket = randomUUID();
  const qr = await createQrCode(state);
  const entry: TikTokQrAttempt = {
    id: randomUUID(), userId: user.id, token: qr.token, state, ticket,
    scanUrl: ticketedScanUrl(qr.scanUrl, ticket), status: "new",
    expiresAt: Date.now() + TTL, retainUntil: Date.now() + RETENTION,
  };
  await updateStore(data => {
    data.tiktokQrAttempts = (data.tiktokQrAttempts || []).filter(item => item.retainUntil > Date.now());
    data.tiktokQrAttempts.push(entry);
  });
  return { id: entry.id, expiresAt: entry.expiresAt, scanUrl: entry.scanUrl };
}

export async function resumeTikTokQr(user: SessionUser, id: string) {
  const entry = find(await readStore(), user, id);
  if (!entry || entry.expiresAt <= Date.now() || !["new", "scanned"].includes(entry.status)) return null;
  return { scanUrl: entry.scanUrl, expiresAt: entry.expiresAt };
}

function assertClaim(data: StoreData, user: SessionUser, id: string, claim: string) {
  const entry = find(data, user, id);
  if (!entry || entry.claim !== claim) throw new Error("qr_claim_lost");
  return entry;
}

function clearSecrets(entry: TikTokQrAttempt) {
  entry.token = ""; entry.ticket = ""; entry.state = ""; entry.scanUrl = "";
  delete entry.code; delete entry.tokens; delete entry.redirectUri;
}

export function qrFailure(error: unknown) {
  const code = error instanceof TikTokApiError ? error.code : error instanceof Error ? error.message : "qr_unavailable";
  const terminal = ["invalid_client", "invalid_scope", "access_denied", "invalid_grant", "invalid_code", "invalid_request", "state_mismatch", "missing_code", "confirmation_lost", "redirect_mismatch"];
  return { error: terminal.includes(code) ? code : "qr_unavailable", retryable: !terminal.includes(code) };
}

/** A lease serializes the one-use check/code exchange across tabs and requests.
 * Each received credential is checkpointed before the next network call, and
 * the success receipt is committed atomically with the channel.
 */
export async function pollTikTokQr(user: SessionUser, id: string): Promise<Progress> {
  const snapshot = await readStore();
  const known = find(snapshot, user, id);
  if (!known) return { status: "expired" };
  const complete = storedProgress(snapshot, known);
  if (complete) return complete;

  const claim = randomUUID();
  const acquired = await updateStore(data => {
    const entry = find(data, user, id);
    if (!entry) return { progress: { status: "expired" } as Progress };
    const done = storedProgress(data, entry);
    if (done) return { progress: done };
    if ((entry.leaseUntil || 0) > Date.now()) return { progress: { status: entry.status, expiresAt: entry.expiresAt } as Progress };
    entry.claim = claim; entry.leaseUntil = Date.now() + LEASE;
    return { entry: { ...entry } };
  });
  if (acquired.progress) return acquired.progress;
  const entry = acquired.entry!;
  let stage = "check";
  try {
    if (!entry.code && !entry.tokens) {
      const result = await checkQrCode(entry.token);
      if (result.status === "utilised") throw new Error("confirmation_lost");
      if (result.status !== "confirmed") {
        await updateStore(data => {
          const current = assertClaim(data, user, id, claim);
          current.status = result.status as "new" | "scanned" | "expired";
          if (result.status === "expired") clearSecrets(current);
          delete current.claim; delete current.leaseUntil;
        });
        return { status: result.status, expiresAt: entry.expiresAt };
      }
      if (!validQrConfirmation(result, entry.ticket, entry.state)) throw new Error("state_mismatch");
      if (!result.code) throw new Error("missing_code");
      stage = "save_code";
      entry.code = result.code; entry.redirectUri = result.redirectUri;
      await updateStore(data => Object.assign(assertClaim(data, user, id, claim), { code: entry.code, redirectUri: entry.redirectUri, status: "saving" }));
    }
    if (!entry.tokens) {
      stage = "exchange";
      entry.tokens = await exchangeCode(entry.code!, entry.redirectUri ?? null);
      stage = "save_tokens";
      await updateStore(data => {
        const current = assertClaim(data, user, id, claim);
        current.tokens = entry.tokens;
        delete current.code;
      });
    }
    stage = "save_account";
    let channelId = "";
    const account = await saveTikTokAccount(user, entry.tokens, (data, channel) => {
      const current = assertClaim(data, user, id, claim);
      current.channelId = channel.id; channelId = channel.id; current.status = "connected";
      clearSecrets(current);
      delete current.claim; delete current.leaseUntil;
    });
    return { status: "connected", account: { id: channelId, ...account } };
  } catch (error) {
    const failure = qrFailure(error);
    // Deliberately exclude the provider message, credential and account data.
    console.warn("tiktok_qr_failed", { stage, ...failure });
    await updateStore(data => {
      const current = find(data, user, id);
      if (!current || current.claim !== claim) return;
      if (!failure.retryable) { current.status = "error"; current.error = failure.error; clearSecrets(current); }
      else if (entry.tokens) {
        // A transient checkpoint write failure must not discard a token that
        // TikTok has already issued in this request.
        current.tokens = entry.tokens; current.status = "saving"; delete current.code;
      } else if (entry.code) {
        current.code = entry.code; current.redirectUri = entry.redirectUri; current.status = "saving";
      }
      delete current.claim; delete current.leaseUntil;
    });
    return { status: failure.retryable ? "retrying" : "error", ...failure, expiresAt: entry.expiresAt, retryAfter: 3 };
  }
}
