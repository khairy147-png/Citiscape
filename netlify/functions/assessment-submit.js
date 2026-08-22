import { getStore } from '@netlify/blobs';
import { byId } from './assessment-bank.js';
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json'}});
export default async(req)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const b=await req.json().catch(()=>({})), session=b.session;
 const sessions=getStore({name:'nps-assessment-sessions',consistency:'strong'}), results=getStore({name:'nps-assessment-results',consistency:'strong'});
 const s=await sessions.get('session/'+session,{type:'json'});if(!s)return json({error:'Invalid session'},403);if(s.completed)return json({error:'Assessment already submitted'},410);
 if(!Array.isArray(b.answers)||b.answers.length!==60)return json({error:'All 60 questions must be answered.'},400);
 let acct=0,cog=0,cogN=0;const lc={1:0,2:0,3:0},lt={1:0,2:0,3:0},dims={},dmax={},detail=[];
 s.ids.forEach((id,i)=>{const q=byId[id],sel=Number(b.answers[i]?.original),candidate=q.options[sel]??'No answer';
  if(q.level<=3){lt[q.level]++;const ok=sel===q.answer;if(ok){acct++;lc[q.level]++}detail.push({n:i+1,level:q.level,topic:q.topic,question:q.question,candidate,correct:q.options[q.answer],ok,score:ok?1:0,max:1,type:'technical'});}
  else if(q.type==='cognitive'){cogN++;const ok=sel===q.answer;if(ok)cog++;detail.push({n:i+1,level:4,topic:q.topic,question:q.question,candidate,correct:q.options[q.answer],ok,score:ok?1:0,max:1,type:'cognitive'});}
  else{const d=q.profile.dimension,sc=q.profile.scores[sel]??0;dims[d]=(dims[d]||0)+sc;dmax[d]=(dmax[d]||0)+3;detail.push({n:i+1,level:4,topic:q.topic,question:q.question,candidate,score:sc,max:3,type:'behavior'});}
 });
 const accounting=Math.round(acct/36*100),levels={};[1,2,3].forEach(l=>levels[l]=Math.round(lc[l]/lt[l]*100));const cognitive=Math.round(cog/cogN*100);let bp=0,bm=0,dimensions={};Object.keys(dims).forEach(d=>{bp+=dims[d];bm+=dmax[d];dimensions[d]=Math.round(dims[d]/dmax[d]*100)});const behavior=Math.round(bp/bm*100);
 let technical='Not Recommended at This Stage';if(levels[1]>=75&&levels[2]>=70&&levels[3]>=70&&accounting>=72)technical='Recommended — Chief Accountant';else if(levels[1]>=70&&levels[2]>=65&&accounting>=65)technical='Recommended — Senior Accountant';else if(levels[1]>=60&&accounting>=55)technical='Recommended — General Accountant';
 const fit=Math.round(accounting*.65+cognitive*.20+behavior*.15);const hiring=fit>=85&&accounting>=70?'Highly Recommended':fit>=72&&accounting>=60?'Recommended':fit>=60?'Consider with Interview Review':'Not Recommended at This Stage';
 const completedAt=new Date().toISOString(),elapsed=Math.max(0,Number(b.elapsed)||Math.round((Date.now()-Date.parse(s.startedAt))/1000));
 const report={id:crypto.randomUUID(),candidate:s.candidate,startedAt:s.startedAt,completedAt,elapsed,accounting,accountingCorrect:acct,levels,cognitive,behavior,dimensions,technical,fit,hiring,detail};
 await results.setJSON('result/'+report.id,report,{metadata:{candidate:s.candidate.name,completedAt}});s.completed=true;s.completedAt=completedAt;await sessions.setJSON('session/'+session,s);
 return json({ok:true,message:'Assessment Completed Successfully. Thank you. Your assessment has been submitted to NPS Recruitment.'});
};
