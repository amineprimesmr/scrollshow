import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const [baselineFile,finalFile]=process.argv.slice(2);
if(!baselineFile||!finalFile||!process.env.DATABASE_URL)throw new Error("Explicit baseline and final snapshots required");
const baseline=JSON.parse(await readFile(baselineFile,"utf8"));
const final=JSON.parse(await readFile(finalFile,"utf8"));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=value=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const sql=postgres(process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL,{max:1,prepare:false});
try {
  const output=await sql.begin(async tx=>{
    const rows=await tx`SELECT data FROM scrollshow_state WHERE id=1 FOR UPDATE`;
    if(rows.length!==1||digest(rows[0].data)!==digest(baseline))throw new Error("Target changed after initial import; refusing overwrite");
    let held=0;
    for(const post of final.posts) if(post.status==="scheduled"&&!post.publishId){post.status="draft";post.publishError="Migration : publication ancienne mise en brouillon. Vérifiez le contenu et choisissez une nouvelle date avant de programmer.";held++;}
    await tx`UPDATE scrollshow_state SET data=${tx.json(final)},updated_at=now() WHERE id=1`;
    return {users:final.users.length,posts:final.posts.length,scheduledMovedToDraft:held};
  });
  console.log(JSON.stringify(output));
} finally {await sql.end();}
