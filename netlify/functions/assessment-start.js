import { getStore } from '@netlify/blobs';
import { bank, expiry } from './assessment-bank.js';
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json'}});
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
export default async(req)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(Date.now()>Date.parse(expiry))return json({error:'This assessment has expired.'},410);
 const b=await req.json().catch(()=>({}));
 if(!b.name?.trim()||!/^\S+@\S+\.\S+$/.test(b.email||'')||!b.salary?.toString().trim())return json({error:'Please complete name, email and expected salary.'},400);
 const selected=shuffle(bank.filter(x=>x.level<=3)).slice(0,36); // bank currently contains exactly 36 technical questions
 const l4=shuffle(bank.filter(x=>x.level===4));
 const all=[...selected,...l4];
 const session=crypto.randomUUID();
 const startedAt=new Date().toISOString();
 const store=getStore({name:'nps-assessment-sessions',consistency:'strong'});
 await store.setJSON('session/'+session,{session,startedAt,candidate:{name:b.name.trim(),email:b.email.trim(),mobile:(b.mobile||'').trim(),salary:b.salary.toString().trim()},ids:all.map(x=>x.id),completed:false});
 const questions=all.map(x=>{const opts=shuffle(x.options.map((text,original)=>({text,original})));return{id:x.id,level:x.level,topic:x.topic,question:x.question,options:opts.map(o=>o.text),map:opts.map(o=>o.original)}});
 return json({session,startedAt,expiry,questions});
};
