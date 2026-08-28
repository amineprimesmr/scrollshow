import type { SessionUser, StoreData, User } from "./types";

export function resolveStoreUser(data: StoreData, session: Pick<SessionUser, "id" | "email">): User | null {
  return (
    data.users.find((item) => item.id === session.id) ||
    data.users.find((item) => item.email.toLowerCase() === session.email.toLowerCase()) ||
    null
  );
}

export function resolveStoreUserId(data: StoreData, session: Pick<SessionUser, "id" | "email">) {
  return resolveStoreUser(data, session)?.id || session.id;
}
