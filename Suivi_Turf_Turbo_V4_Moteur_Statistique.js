/* Suivi Turf Turbo V4 — moteur statistique exploratoire v0.1.0
 * Score transparent de présélection, pas un modèle probabiliste calibré.
 * N'utilise que les données fournies ; ne fabrique aucune performance manquante.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TurfV4Stats=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const numeric=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
function formScore(value){
 const arr=Array.isArray(value)?value:(typeof value==='string'?value.split(/[\s,;/|-]+/):[]);
 const pts=arr.map(x=>{const s=String(x).trim().toUpperCase();if(!s)return null;if(/^DA|^D|^A|^T|^0$/.test(s))return 0;const m=s.match(/^(\d{1,2})/);if(!m)return null;const p=Number(m[1]);return p===1?100:p===2?88:p===3?76:p===4?64:p===5?52:p===6?40:p===7?30:p===8?22:p===9?15:p===10?10:5;}).filter(x=>x!==null).slice(0,8);
 if(!pts.length)return null;let sum=0,w=0;pts.forEach((p,i)=>{const weight=Math.pow(.82,i);sum+=p*weight;w+=weight;});return Math.round(sum/w);
}
function fieldValue(r,k){const f=r[k];return f&&typeof f==='object'&&'value'in f?f.value:f;}
function fieldStatus(r,k){const f=r[k];return f&&typeof f==='object'&&f.status?f.status:'unverified';}
function analyzeRace(race){
 if(!race||!Array.isArray(race.runners))throw new Error('Course invalide : tableau des partants absent.');
 const active=race.runners.filter(r=>r.status==='runner');
 if(active.length<3)throw new Error('Au moins trois chevaux confirmés partants sont nécessaires.');
 const odds=active.map(r=>numeric(fieldValue(r,'odds'))).filter(v=>v>0).sort((a,b)=>a-b);
 const rows=active.map(r=>{
  const form=formScore(fieldValue(r,'recentForm'));
  const suitability=['distanceSuitability','trackSuitability','groundSuitability','disciplineSuitability'].map(k=>numeric(fieldValue(r,k))).filter(v=>v!==null).map(v=>clamp(v));
  const context=suitability.length?suitability.reduce((a,b)=>a+b,0)/suitability.length:null;
  const odd=numeric(fieldValue(r,'odds'));
  let market=null;if(odd>0&&odds.length>1){const rank=odds.filter(x=>x<odd).length;market=100*(1-rank/(odds.length-1));}
  const parts=[{key:'forme récente',value:form,weight:.5},{key:'aptitudes contextuelles',value:context,weight:.35},{key:'indication du marché',value:market,weight:.15}].filter(x=>x.value!==null);
  const weight=parts.reduce((s,p)=>s+p.weight,0);
  const score=weight?parts.reduce((s,p)=>s+p.value*p.weight,0)/weight:null;
  const evidenceFields=['recentForm','distanceSuitability','trackSuitability','groundSuitability','disciplineSuitability','odds'];
  const evidence=evidenceFields.filter(k=>fieldValue(r,k)!=null&&fieldStatus(r,k)!=='missing').length;
  const scoreCoverage=Math.round(100*parts.length/3);
  const confidence=clamp(Math.round((scoreCoverage*.65)+(evidence/evidenceFields.length*35)));
  return {id:r.id,number:r.number,name:r.name,score:score===null?null:Math.round(score*10)/10,confidence,form,context,market,used:parts.map(p=>p.key),missing:evidenceFields.filter(k=>fieldValue(r,k)==null)};
 }).sort((a,b)=>(b.score??-1)-(a.score??-1));
 const ranked=rows.filter(x=>x.score!==null);
 if(ranked.length<3)throw new Error('Données insuffisantes : renseigne au moins une forme récente ou une aptitude pour trois chevaux.');
 const coverage=Math.round(100*rows.filter(x=>x.score!==null).length/active.length);
 return {race:{id:race.id,name:race.raceName,date:race.date},method:'Score exploratoire pondéré : forme 50 %, aptitudes 35 %, marché 15 % (poids renormalisés selon les données disponibles).',coverage,warning:'Ce classement est une présélection heuristique. Ce ne sont ni des probabilités de victoire ni des probabilités calibrées d’arrivée. Les cotes sont un signal secondaire et peuvent être absentes ou fluctuantes.',ranked,selection5:ranked.slice(0,5),selection7:ranked.slice(0,7),excluded:race.runners.filter(r=>r.status!=='runner').map(r=>({number:r.number,name:r.name,status:r.status}))};
}
return {version:'0.1.0',formScore,analyzeRace};
});
