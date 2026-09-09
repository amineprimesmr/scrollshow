export function githubRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/github/callback`;
}

export function githubConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function buildGithubAuthUrl(origin: string, state: string) {
  const config = githubConfig();
  if (!config) throw new Error("github_not_configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: githubRedirectUri(origin),
    // GitHub often hides the address on /user, so the address comes from /user/emails.
    scope: "read:user user:email",
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeGithubCode(origin: string, code: string) {
  const config = githubConfig();
  if (!config) throw new Error("github_not_configured");
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: githubRedirectUri(origin),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("github_token");
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error("github_token");
  return { access_token: data.access_token };
}

function githubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ScrollShow",
  };
}

export async function fetchGithubProfile(accessToken: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: githubHeaders(accessToken),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("github_userinfo");
  const data = (await res.json()) as { id?: number; login?: string; name?: string; email?: string };
  if (!data.id) throw new Error("github_userinfo");

  // Never trust the profile address: it can be unverified, or a noreply alias.
  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: githubHeaders(accessToken),
    signal: AbortSignal.timeout(10000),
  });
  if (!emailsRes.ok) throw new Error("github_email");
  const emails = (await emailsRes.json()) as { email?: string; primary?: boolean; verified?: boolean }[];
  const usable = emails.filter(item => item.email && item.verified && !item.email.endsWith("users.noreply.github.com"));
  const email = (usable.find(item => item.primary) || usable[0])?.email;
  if (!email) throw new Error("github_email");

  const name = (data.name || data.login || email.split("@")[0] || "Creator").slice(0, 40);
  return { githubId: String(data.id), email: email.toLowerCase(), name };
}
