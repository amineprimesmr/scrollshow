import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyStore, readStore } from "../lib/store";
import { backfillProjects } from "../lib/projects";
import { processAccountDeletion } from "../lib/account-deletion";
import type { User } from "../lib/types";

test("interrupted account deletion resumes provider checkpoints and purges all owned references", async () => {
  delete process.env.DATABASE_URL; delete process.env.VERCEL; delete process.env.SCROLLSHOW_USE_BLOB;
  const dir=await mkdtemp(join(tmpdir(),"scrollshow-delete-")); process.env.SCROLLSHOW_DATA_DIR=dir;
  const data=emptyStore();
  data.users=["u","v"].map(id=>({id,email:`${id}@example.invalid`,name:id,createdAt:"2026-01-01",plan:"lifetime"} as User));
  data.users[0].stripeSubscriptionId="sub_fixture";
  backfillProjects(data); data.projects![0].logo="/api/i/logo-fixture.png";
  data.channels=["one","two"].map(id=>({id,userId:"u",projectId:"prj_u_1",platform:"tiktok",accessToken:id,refreshToken:id} as never));
  data.oauthTokens=[{ userId:"u",grantId:"grant" } as never];
  data.oauthUsedRefresh=[{ grantId:"grant" } as never];
  data.revenueCatOutbox=[{ appUserId:"u" } as never];
  (data as unknown as Record<string,unknown>).automations=[{userId:"u"},{userId:"v"}];
  const cancelled:string[]=[], revoked:string[]=[]; let fail=true;
  const external={async cancelSubscription(id:string){cancelled.push(id);}, async revokeToken(token:string){if(token==="two"&&fail)throw Error("temporary");revoked.push(token);}};
  try {
    await writeFile(join(dir,"store.json"),JSON.stringify(data));
    assert.equal((await processAccountDeletion("u",true,external)).pending,true);
    const interrupted=await readStore();
    assert.ok(interrupted.users[0].deletionPendingAt); assert.equal(interrupted.users[0].stripeSubscriptionId,undefined);
    assert.equal(interrupted.channels[0].accessToken,undefined);
    fail=false;
    assert.equal((await processAccountDeletion("u",false,external)).pending,false);
    assert.deepEqual(cancelled,["sub_fixture"]); assert.deepEqual(revoked,["one","two"]);
    const deleted=await readStore();
    assert.deepEqual(deleted.users.map(u=>u.id),["v"]); assert.equal(deleted.channels.length,0);
    assert.ok(deleted.projects!.every(p=>p.userId==="v")); assert.equal(deleted.oauthTokens?.length,0);
    assert.equal(deleted.oauthUsedRefresh?.length,0); assert.equal(deleted.revenueCatOutbox?.length,0);
    assert.ok(deleted.mediaDeletionQueue?.some(m=>m.name==="logo-fixture.png"));
    assert.deepEqual((deleted as unknown as Record<string,unknown>).automations,[{userId:"v"}]);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test("expired TikTok access can be deleted after refresh, including an already expired grant", async () => {
  const { TikTokApiError } = await import('../lib/tiktok');
  delete process.env.DATABASE_URL; delete process.env.VERCEL; delete process.env.SCROLLSHOW_USE_BLOB;
  for (const deadGrant of [false, true]) {
    const dir=await mkdtemp(join(tmpdir(),'scrollshow-delete-expired-'));process.env.SCROLLSHOW_DATA_DIR=dir;
    const data=emptyStore();data.users=[{id:'u',email:'u@example.invalid',name:'u',plan:'free',createdAt:'2026-01-01'}];backfillProjects(data);
    data.channels=[{id:'c',userId:'u',projectId:'prj_u_1',platform:'tiktok',accessToken:'expired',refreshToken:'refresh'} as never];
    const revoked:string[]=[];
    try {
      await writeFile(join(dir,'store.json'),JSON.stringify(data));
      const result=await processAccountDeletion('u',true,{
        async cancelSubscription(){throw Error('unexpected payment');},
        async revokeToken(token){revoked.push(token);if(token==='expired')throw new TikTokApiError('invalid_grant','expired');},
        async refreshToken(){if(deadGrant)throw new TikTokApiError('invalid_grant','expired');return {access_token:'fresh',refresh_token:'rotated',open_id:'o',scope:'',expires_at:Date.now()+60000};},
      });
      assert.equal(result.pending,false);assert.deepEqual(revoked,deadGrant?['expired']:['expired','fresh']);assert.equal((await readStore()).users.length,0);
    } finally {await rm(dir,{recursive:true,force:true});}
  }
});
