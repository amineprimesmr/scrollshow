import { get } from "@vercel/blob";
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Production media credential required");
const file=await get("scrollshow-store.json",{access:"private",useCache:false,token:process.env.BLOB_READ_WRITE_TOKEN});
if (!file?.stream) throw new Error("Production legacy store not found; do not create an empty replacement");
const data=await new Response(file.stream).json();
for(const key of ["users","accounts","posts","channels","media","apiKeys"]) if(!Array.isArray(data[key])) throw new Error(`Invalid legacy collection ${key}`);
console.log(JSON.stringify({users:data.users.length,paidUsers:data.users.filter(u=>u.plan&&u.plan!=="free").length,subscriptions:data.users.filter(u=>u.stripeSubscriptionId).length,posts:data.posts.length,scheduled:data.posts.filter(p=>p.status==="scheduled").length,channels:data.channels.length,media:data.media.length,accounts:data.accounts.length,apiKeys:data.apiKeys.length}));
