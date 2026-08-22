import { getStore } from '@netlify/blobs';
import { banks, expiry } from './assessment-bank.js';
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const isTax=q=>/VAT|Corporate Tax|Tax Controls/i.test(q.topic||'');
function pickLevel(level){const pool=banks[level]||[];const tax=shuffle(pool.filter(isTax));const other=shuffle(pool.filter(q=>!isTax(q)));const selected=[...tax.slice(0,2),...other.slice(0,10)];return shuffle(selected);}
export default async(req)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(Date.now()>Date.parse(expiry))return json({error:'This assessment is no longer available.'},410);
 const b=await req.json().catch(()=>({}));
 const name=(b.name||'').trim(),email=(b.email||'').trim(),salary=String(b.salary??'').trim(),mobile=(b.mobile||'').trim();
 if(!name||!/^\S+@\S+\.\S+$/.test(email)||!salary)return json({error:'Please complete the required candidate details.'},400);
 const technical=[...pickLevel(1),...pickLevel(2),...pickLevel(3)];
 const level4=shuffle(banks[4]||[]);
 if(technical.length!==36||level4.length!==24)return json({error:'Assessment configuration error.'},500);
 const all=[...technical,...level4];
 const session=crypto.randomUUID(),startedAt=new Date().toISOString();
 const store=getStore({name:'nps-assessment-sessions',consistency:'strong'});
 await store.setJSON('session/'+session,{session,startedAt,candidate:{name,email,mobile,salary},ids:all.map(x=>x.id),completed:false});
 const questions=all.map(q=>{const opts=shuffle(q.options.map((text,original)=>({text,original})));return{id:q.id,level:q.level,topic:q.topic,question:q.question,options:opts.map(x=>x.text),map:opts.map(x=>x.original)}});
 return json({session,startedAt,questions});
};
