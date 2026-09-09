// Isolated HTTP acceptance test of the assistant connection flow.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {SignJWT} from 'jose';
import {hash} from 'bcryptjs';
const directory = await mkdtemp(join(tmpdir(), 'scrollshow-connect-'));
const base = 'http://127.0.0.1:3108';
const secret = randomBytes(32).toString('hex');
const now = new Date().toISOString();
const user = {id:'connection-qa',email:'connection@example.invalid',name:'Connection QA',plan:'pro',settings:{timezone:'America/Los_Angeles',defaultPostTime:'20:30'},emailVerifiedAt:now,onboarding:{completedAt:now},createdAt:now,passwordHash:await hash('ScrollShow-QA-only-2026',4)};
const other = {...user,id:'other',email:'other@example.invalid'};
await writeFile(join(directory,'store.json'),JSON.stringify({users:[user,other],accounts:[],posts:[],channels:[],media:[],apiKeys:[],runs:[]}),{mode:0o600});
const env={...process.env,NODE_ENV:'production',SCROLLSHOW_DATA_DIR:directory,AUTH_SECRET:secret,NEXT_PUBLIC_SITE_URL:base};
for(const key of ['DATABASE_URL','VERCEL','VERCEL_ENV','SCROLLSHOW_USE_BLOB','BLOB_READ_WRITE_TOKEN','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','RESEND_API_KEY','EMAIL_FROM','CRON_SECRET','TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET'])env[key]='';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3108'],{env,stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs=(logs+d).slice(-10000));child.stderr.on('data',d=>logs=(logs+d).slice(-10000));
let count=0;
function check(ok,message){assert.ok(ok,message);count++;console.log('PASS '+message)}
async function cookie(u){return 'ss_session='+await new SignJWT({email:u.email,sv:0}).setProtectedHeader({alg:'HS256'}).setSubject(u.id).setExpirationTime('30m').sign(new TextEncoder().encode(secret));}
const headers={Cookie:await cookie(user),'Content-Type':'application/json'};
const otherHeaders={Cookie:await cookie(other),'Content-Type':'application/json'};
async function rpc(method,params,id,bearer){
 const response=await fetch(base+'/api/mcp',{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',Accept:'application/json, text/event-stream','mcp-protocol-version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 const raw=await response.text();if(!response.ok)throw new Error('MCP '+method+': '+response.status);
 return JSON.parse(raw.startsWith('event:')||raw.startsWith('data:')?raw.split('\n').find(l=>l.startsWith('data: ')).slice(6):raw);
}
try {
 let ready=false;for(let i=0;i<80;i++){if(child.exitCode!==null)throw new Error(logs);try{ready=(await fetch(base+'/connect')).ok}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250))}
 check(ready,'isolated production server starts');
 check((await fetch(base+'/api/studio/connections')).status===401,'anonymous connection status is denied');
 const anonymous=await fetch(base+'/connect').then(r=>r.text());
 check(anonymous.includes('Me connecter')&&!anonymous.includes(user.email),'public page does not reveal an account');
  const metadata = await fetch(base + "/.well-known/oauth-protected-resource").then(r => r.json());
  const beforeConnect = await fetch(base + "/api/studio/connections", { headers }).then(r => r.json());
  check(beforeConnect.account?.active && beforeConnect.grants.length === 0, "active account is distinct from an authorized assistant");
  const redirectUri = "http://127.0.0.1:9876/callback";
  const registration = await fetch(base + "/api/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Codex QA", redirect_uris: [redirectUri] }) });
  const { client_id } = await registration.json();
  check(registration.status === 201 && !!client_id, "assistant registers through production OAuth route");
  const verifier = randomBytes(32).toString("base64url");
  const form = new URLSearchParams({ client_id, redirect_uri: redirectUri, code_challenge: createHash("sha256").update(verifier).digest("base64url"), resource: metadata.resource, state: "qa-state", decision: "allow" });
  const authorized = await fetch(base + "/api/oauth/authorize", { method: "POST", headers: { Cookie: headers.Cookie }, body: form, redirect: "manual" });
  const callback = new URL(authorized.headers.get("location"));
  check(authorized.status === 303 && callback.searchParams.has("code") && callback.searchParams.get("state") === "qa-state" && callback.origin === "http://127.0.0.1:9876", "authorization preserves the host callback and state");
  check((await fetch(base + "/api/studio/connections", { headers }).then(r => r.json())).grants.length === 0, "consent alone does not falsely claim completed authorization");
  const exchangeForm = new URLSearchParams({ grant_type: "authorization_code", client_id, redirect_uri: redirectUri, code: callback.searchParams.get("code"), code_verifier: verifier });
  const exchange = await fetch(base + "/api/oauth/token", { method: "POST", body: exchangeForm });
  const oauth = await exchange.json();
  check(exchange.ok && !!oauth.access_token, "host exchanges the code after consent");
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "connection-qa", version: "1" } }, 79, oauth.access_token);
  check(!!init.result?.serverInfo, "OAuth MCP handshake succeeds");
  const oauthWhoami = await rpc("tools/call", { name: "whoami", arguments: {} }, 80, oauth.access_token);
  check(!!oauthWhoami.result?.content?.length && !oauthWhoami.result.isError, "OAuth whoami works immediately without another login");
  const identity = JSON.parse(oauthWhoami.result.content[0].text);
  check(identity.calendar?.timezone === "America/Los_Angeles" && identity.calendar.defaultPostTime === "20:30" && /^\d{4}-\d{2}-\d{2}$/.test(identity.calendar.today), "assistant can read the actual workspace calendar settings");
  let rpcId = 100;
  async function callTool(name, args) {
    const response = await rpc("tools/call", {name, arguments: args}, rpcId++, oauth.access_token);
    assert.ok(!response.result?.isError, name + " failed: " + JSON.stringify(response.result));
    return JSON.parse(response.result.content[0].text);
  }
  const recipe = {editable: true, slides: [{backgroundColor: "#111111", overlays: [{text: "A useful hook", x: 50, y: 30}]}, {backgroundColor: "#111111", overlays: [{text: "One concrete takeaway", x: 50, y: 30}]}]};
  const {post: prepared} = await callTool("create_post", {caption: "Calendar workflow QA", date: "2030-09-10", time: "20:30", status: "draft", recipe});
  check(prepared.inCalendar && prepared.recipe.slides.length === 2 && prepared.date === "2030-09-10", "complete editable content is saved in the calendar even before TikTok is connected");
  const {post: fork} = await callTool("fork_post", {id: prepared.id});
  check(!fork.inCalendar, "a library duplication starts outside the calendar");
  const {post: added} = await callTool("set_calendar", {id: fork.id, inCalendar: true});
  check(added.inCalendar && added.status === "draft" && added.recipe.slides[0].overlays[0].text === "A useful hook", "assistant can place a finished duplication in the calendar without losing its recipe or publishing it");
  const saved = await callTool("list_posts", {});
  check(saved.posts.some(post => post.id === fork.id && post.inCalendar), "calendar placement persists in a fresh read");
  const storeBeforeReads = await readFile(join(directory, 'store.json'), 'utf8');
  const studio = await fetch(base + '/api/studio', {headers});
  const etag = studio.headers.get('etag');
  const snapshot = await studio.json();
  check(studio.ok && snapshot.posts.some(post => post.id === prepared.id), 'studio sees a carousel created through MCP');
  const unchanged = await fetch(base + '/api/studio', {headers: {...headers, 'If-None-Match': etag}});
  check(unchanged.status === 304 && !(await unchanged.text()) && unchanged.headers.get('cache-control') === 'private, no-store', 'unchanged studio poll returns no payload and cannot be cached publicly');
  check(await readFile(join(directory, 'store.json'), 'utf8') === storeBeforeReads, 'studio reads never rewrite the database snapshot');
  const isolated = await fetch(base + '/api/studio', {headers: {...otherHeaders, 'If-None-Match': etag}});
  check(isolated.status === 200 && (await isolated.json()).posts.length === 0, 'studio conditional responses remain scoped to the signed-in workspace');
  await callTool('update_post', {id: prepared.id, caption: 'Updated through MCP'});
  const changed = await fetch(base + '/api/studio', {headers: {...headers, 'If-None-Match': etag}});
  check(changed.status === 200 && changed.headers.get('etag') !== etag && (await changed.json()).posts.find(post => post.id === prepared.id).body === 'Updated through MCP', 'MCP edits invalidate the studio snapshot immediately');
  const missingChoices = await rpc("tools/call", {name: "update_post", arguments: {id: fork.id, status: "scheduled"}}, rpcId++, oauth.access_token);
  check(missingChoices.result?.isError, "automatic publication cannot be enabled without a connected destination and publishing choices");
  await fetch(base + "/api/studio/marketplace/" + fork.id, {method: "PATCH", headers: otherHeaders, body: JSON.stringify({inCalendar: false})});
  check((await callTool("list_posts", {})).posts.find(post => post.id === fork.id).inCalendar, "another workspace cannot remove this carousel from the calendar");
  const connectionResponse = await fetch(base + "/api/studio/connections", { headers });
  const connected = await connectionResponse.json();
  check(connectionResponse.headers.get("cache-control") === "no-store" && connected.grants[0]?.name === "Codex QA", "connection status detects the actual OAuth grant without caching");
  const connectedPage = await fetch(base + "/connect", { headers }).then(r => r.text());
  check(connectedPage.includes("Ton assistant est autorisé") && connectedPage.includes("Codex QA"), "connect page shows completed authorization after token exchange");
  check((await fetch(base + "/api/studio/connections", { headers: otherHeaders }).then(r => r.json())).grants.length === 0, "another account cannot see this assistant authorization");
  await fetch(base + "/api/studio/connections", {method: "DELETE", headers: otherHeaders, body: JSON.stringify({grantId: connected.grants[0].grantId})});
  check((await fetch(base + "/api/studio/connections", {headers}).then(r => r.json())).grants.length === 1, "another account cannot revoke this assistant");
  if (process.argv.includes('--browser')) {
    console.log('Browser QA: '+base+'/app/mcp; sign in with connection@example.invalid / ScrollShow-QA-only-2026');
    console.log('Press Enter after browser QA to finish the checks.');
    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));
    process.stdin.pause();
  }
  if (process.argv.includes('--sync-browser')) {
    async function browserStep(message) {
      console.log(message + ' Press Enter to continue.');
      process.stdin.resume();
      await new Promise(resolve => process.stdin.once('data', resolve));
      process.stdin.pause();
    }
    console.log('Calendar QA: ' + base + '/app; connection@example.invalid / ScrollShow-QA-only-2026');
    await browserStep('Open the calendar and leave the page loaded. Next: create through MCP.');
    const {post: live} = await callTool('create_post', {caption: 'Synchronisation sans rechargement', date: now.slice(0, 10), time: '18:00', status: 'draft', recipe});
    console.log('Created via MCP at ' + new Date().toISOString());
    await browserStep('Verify automatic appearance; open this post and type an unsaved caption. Next: external edit.');
    await callTool('update_post', {id: live.id, caption: 'Mis à jour depuis l’agent'});
    console.log('Edited via MCP at ' + new Date().toISOString());
    await browserStep('Verify your unsaved caption survived, then close the editor and check the new calendar title. Next: delete.');
    await callTool('delete_post', {id: live.id});
    console.log('Deleted via MCP at ' + new Date().toISOString());
    await browserStep('Verify automatic removal from the calendar. Next: finish and stop the isolated server.');
  }
  const revoked = await fetch(base + "/api/studio/connections", { method: "DELETE", headers, body: JSON.stringify({ grantId: connected.grants[0].grantId }) });
  check(revoked.ok && (await revoked.json()).grants.length === 0, "revoking access removes the completed connection");
  const afterRevoke = await fetch(base + "/api/mcp", { method: "POST", headers: { Authorization: `Bearer ${oauth.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 81, method: "tools/call", params: { name: "whoami", arguments: {} } }) });
  check(afterRevoke.status === 401, "revocation immediately blocks the assistant");
  const afterRevocation = await fetch(base + "/api/studio", {headers}).then(r => r.json());
  check(afterRevocation.posts.some(post => post.id === fork.id && post.inCalendar && post.recipe.slides.length === 2), "removing assistant access keeps the completed carousel in the calendar");

 console.log(count+' connection checks passed.');

}finally{if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit')}await rm(directory,{recursive:true,force:true})}
