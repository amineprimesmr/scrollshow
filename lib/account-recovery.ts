import { createHash, randomBytes } from "node:crypto";
import { updateStore } from "./store";
import { hash } from "bcryptjs";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function issueRecovery(email: string) {
  const token = randomBytes(32).toString("base64url");
  const exists = await updateStore(data => {
    const user = data.users.find(u => u.email === email.toLowerCase() && !u.deletionPendingAt);
    if (!user) return false;
    user.recoveryHash = digest(token); user.recoveryExpiresAt = Date.now() + 1800000;
    return true;
  });
  return exists ? token : null;
}
export async function redeemRecovery(token: string, password: string) {
  const passwordHash = await hash(password, 12);
  return updateStore(data => {
    const user = data.users.find(u => !u.deletionPendingAt && u.recoveryHash === digest(token) && (u.recoveryExpiresAt || 0) > Date.now());
    if (!user) return false;
    user.passwordHash = passwordHash;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    user.emailVerifiedAt = new Date().toISOString();
    user.recoveryHash = undefined; user.recoveryExpiresAt = undefined;
    return true;
  });
}
