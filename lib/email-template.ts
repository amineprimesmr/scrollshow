function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Table layout and inline styles keep account emails usable without images or CSS support. */
export function accountEmailHtml(subject: string, text: string, buttonLabel = "Continuer dans ScrollShow") {
  const candidate = text.match(/https?:\/\/[^\s]+/)?.[0];
  const url = candidate && ["http:", "https:"].includes(new URL(candidate).protocol) ? candidate : undefined;
  const title = subject.replace(/^ScrollShow\s*[—–-]\s*/, "");
  const paragraphs = text.replace(url || "\u0000", "").split("\n").filter(Boolean).map(line => `<p style="margin:0 0 16px;color:#52525b;font-size:16px;line-height:1.6">${escapeHtml(line.replace(/\s*:\s*$/, "."))}</p>`).join("");
  const safeUrl = url ? escapeHtml(url) : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(title)} — une dernière étape pour continuer.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f7"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="width:100%;max-width:520px"><tr><td style="padding:0 0 24px;font-size:23px;font-weight:700;letter-spacing:-1px">ScrollShow<span style="color:#7863df">.</span></td></tr>
<tr><td style="padding:36px 28px;background:#ffffff;border:1px solid #e8e8ec;border-radius:24px">
<p style="margin:0 0 16px;color:#7863df;font-size:12px;font-weight:700;letter-spacing:2px">TON ESPACE CRÉATIF</p>
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;letter-spacing:-1px">${escapeHtml(title)}</h1>${paragraphs}
${url ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0"><tr><td bgcolor="#18181b" style="border-radius:12px;text-align:center"><a href="${safeUrl}" target="_blank" style="display:inline-block;border:16px solid #18181b;border-left-width:24px;border-right-width:24px;border-radius:12px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none">${escapeHtml(buttonLabel)} &rarr;</a></td></tr></table>
<p style="margin:0;color:#71717a;font-size:12px;line-height:1.6">Le bouton ne s’ouvre pas ? <a href="${safeUrl}" style="color:#6250b8;text-decoration:underline">Utilise ce lien de secours</a>, ou copie cette adresse dans ton navigateur :</p><p style="margin:8px 0 0;font-size:11px;line-height:1.5;word-break:break-all;color:#71717a">${safeUrl}</p>` : ""}
</td></tr><tr><td style="padding:24px 12px;color:#71717a;font-size:12px;line-height:1.6">Un email de sécurité de ScrollShow. Ne transfère pas ce message : son lien est personnel.</td></tr></table>
</td></tr></table></body></html>`;
}
