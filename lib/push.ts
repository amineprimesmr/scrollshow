import webpush from "web-push";
import { updateStore } from "./store";

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

function configureWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@scrollshow.io",
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** Sends a push to every device the user subscribed, dropping subscriptions the browser has revoked. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!pushConfigured()) return { sent: 0 };
  configureWebPush();

  const targets = await updateStore((data) => (data.pushSubscriptions || []).filter((item) => item.userId === userId));
  if (!targets.length) return { sent: 0 };

  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the push service no longer knows this endpoint — the browser
        // dropped it (uninstall, cleared data, expired). Keep other errors around;
        // they might be transient (network, rate limit).
        if (status === 404 || status === 410) dead.push(sub.id);
      }
    }),
  );

  if (dead.length) {
    await updateStore((data) => {
      data.pushSubscriptions = (data.pushSubscriptions || []).filter((item) => !dead.includes(item.id));
    });
  }

  return { sent };
}
