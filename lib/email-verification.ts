import { createHash, randomBytes } from "node:crypto";
import { updateStore } from "./store";
import { accountLink, sendAccountEmail } from "./email";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function issueVerification(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const email = await updateStore(data => {
    const user = data.users.find(u => u.id === userId && !u.deletionPendingAt);
    if (!user || user.emailVerifiedAt) return null;
    user.verificationHash = digest(token);
    user.verificationExpiresAt = Date.now() + 86400000;
    return user.email;
  });
  return email ? { email, token } : null;
}
export async function deliverVerification(userId: string) {
  const item = await issueVerification(userId);
  if (item) await sendAccountEmail(item.email, "ScrollShow — Confirmer ton adresse email", `Confirme ton adresse dans les 24 heures : ${accountLink("/verify-email", item.token)}\nSi tu n’as pas créé ce compte, ignore cet email.`);
}
export async function redeemVerification(token: string) {
  return updateStore(data => {
    const user = data.users.find(u => !u.deletionPendingAt && u.verificationHash === digest(token) && (u.verificationExpiresAt || 0) > Date.now());
    if (!user) return null;
    user.emailVerifiedAt = new Date().toISOString();
    user.verificationHash = undefined; user.verificationExpiresAt = undefined;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    return user;
  });
}

export async function issueEmailChange(userId: string, nextEmail: string) {
  const oldToken = randomBytes(32).toString("base64url");
  const newToken = randomBytes(32).toString("base64url");
  const oldEmail = await updateStore(data => {
    const user = data.users.find(u => u.id === userId && !u.deletionPendingAt);
    if (!user || user.email === nextEmail || data.users.some(u => u.email === nextEmail)) throw new Error("email_unavailable");
    user.emailChange = { email: nextEmail, oldHash: digest(oldToken), newHash: digest(newToken), expiresAt: Date.now() + 1800000, oldConfirmed: false, newConfirmed: false };
    return user.email;
  });
  return { oldEmail, oldToken, newToken };
}
export async function redeemEmailChange(token: string) {
  return updateStore(data => {
    const hash = digest(token);
    const user = data.users.find(u => !u.deletionPendingAt && u.emailChange && u.emailChange.expiresAt > Date.now() && [u.emailChange.oldHash, u.emailChange.newHash].includes(hash));
    const change = user?.emailChange;
    if (!user || !change) return "invalid";
    if (change.oldHash === hash) { change.oldConfirmed = true; change.oldHash = ""; }
    else { change.newConfirmed = true; change.newHash = ""; }
    if (!change.oldConfirmed || !change.newConfirmed) return "pending";
    if (data.users.some(u => u.id !== user.id && u.email === change.email)) { user.emailChange = undefined; return "unavailable"; }
    user.email = change.email; user.emailChange = undefined;
    user.emailVerifiedAt = new Date().toISOString();
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    user.googleId = undefined;
    user.recoveryHash = undefined; user.verificationHash = undefined;
    data.apiKeys = data.apiKeys.filter(k => k.userId !== user.id);
    return "complete";
  });
}
