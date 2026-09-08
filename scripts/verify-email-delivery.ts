import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
async function main() {
  Object.assign(process.env, JSON.parse(await readFile(".data/operations/preview-email.json", "utf8")));
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.VERCEL;
  delete process.env.SCROLLSHOW_USE_BLOB;
  process.env.SCROLLSHOW_DATA_DIR = await mkdtemp(join(tmpdir(), "scrollshow-email-test-"));
  const { sendAccountEmail } = await import("../lib/email");
  const result = await sendAccountEmail("contact@usev2.xyz", "ScrollShow — test de livraison des emails", "Test technique demandé pour ScrollShow. Le domaine mail.scrollshow.io est vérifié et l’envoi transactionnel est configuré en préproduction. Aucun achat ni publication TikTok n’a été effectué. Ce message ne demande aucune action et ne contient aucun secret.");
  await writeFile(".data/operations/email-delivery-test.json", JSON.stringify({ ...result, requestedAt: new Date().toISOString(), to: "contact@usev2.xyz", status: "provider_accepted_not_yet_delivery_confirmed" }), { mode: 0o600 });
  console.log(`PASS Resend accepted test email ${result.id}. Delivery still requires provider or mailbox confirmation.`);
}
void main().catch(() => { console.error("Email verification failed; no provider credentials logged."); process.exitCode = 1; });
