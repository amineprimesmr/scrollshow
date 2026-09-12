/** Enable only after TikTok has approved Direct Post for the production app. */
export function publishingEnabled() { return process.env.TIKTOK_PUBLISH_ENABLED === "1"; }
