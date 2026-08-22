import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
const ADMIN_HASH='a5abc26ff83a620fae8a850d82dddd43c1b805b063bb1c2e9e63407afd112355';
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
export default async(req)=>{
 const auth=req.headers.get('x-admin-key')||'';const h=createHash('sha256').update(auth).digest('hex');if(h!==ADMIN_HASH)return json({error:'Unauthorized'},401);
 const store=getStore({name:'nps-assessment-results',consistency:'strong'});const {blobs}=await store.list({prefix:'result/'});const out=[];for(const b of blobs){const r=await store.get(b.key,{type:'json'});if(r)out.push(r)}out.sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));return json({results:out});
};
