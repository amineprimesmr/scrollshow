/** TikTok QR responses differ between the table and examples in its Login Kit docs. */
export type TikTokQrStatus = "new" | "scanned" | "confirmed" | "expired" | "utilised";

export function ticketedScanUrl(raw: string, ticket: string) {
  const url = new URL(raw);
  url.searchParams.set("client_ticket", ticket);
  return url.toString();
}

export function parseQrStatus(payload: Record<string, unknown>) {
  const status = payload.status;
  if (!["new", "scanned", "confirmed", "expired", "utilised"].includes(String(status))) {
    throw new Error("invalid_qr_response");
  }
  let code = typeof payload.code === "string" ? payload.code : "";
  let state = typeof payload.state === "string" ? payload.state : "";
  let redirectUri: string | null = null;
  // TikTok documents redirect_uri, a URL in code, and a bare code.
  const redirect = typeof payload.redirect_uri === "string" ? payload.redirect_uri : /^https?:\/\//.test(code) ? code : "";
  if (redirect) {
    const url = new URL(redirect);
    code = url.searchParams.get("code") || "";
    const returnedState = url.searchParams.get("state") || "";
    if (state && returnedState && state !== returnedState) throw new Error("state_mismatch");
    state ||= returnedState;
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    redirectUri = url.toString();
  }
  return { status: status as TikTokQrStatus, code, state, redirectUri, clientTicket: typeof payload.client_ticket === "string" ? payload.client_ticket : "" };
}

export function validQrConfirmation(result: ReturnType<typeof parseQrStatus>, ticket: string, state: string) {
  // A missing ticket is NOT evidence of integrity. TikTok's confirmed example
  // omits state, so verify it whenever returned and always require the ticket.
  return Boolean(ticket) && result.clientTicket === ticket && (!result.state || result.state === state);
}
