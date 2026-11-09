/* Suivi Turf Turbo V4 — moteur local d'arbitrage à 7 perspectives v0.1.0
 * Règles déterministes et transparentes, PAS sept IA indépendantes.
 * Les données absentes ne sont jamais remplacées par des suppositions.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TurfV4Experts=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const ROLES=[
 {id:'conseil',name:'Conseil',description:'Synthèse équilibrée entre forme, aptitude et marché.',weights:{form:.34,aptitude:.30,value:.12,scenario:.12,market:.12,connections:0}},
 {id:'contradicteur',name:'Contradicteur',description:'Repère les favoris fragiles et pénalise les dossiers incomplets.',weights:{form:.24,aptitude:.28,value:.12,scenario:.18,market:.08,connections:0},risk:true},
 {id:'architecte',name:'Architecte',description:'Privilégie les profils cohérents avec la distance, la piste et la discipline.',weights:{form:.22,aptitude:.45,value:.10,scenario:.13,market:.10,connections:0}},
 {id:'optimiste',name:'Optimiste',description:'Recherche les chevaux capables de progresser malgré un marché réservé.',weights:{form:.36,aptitude:.25,value:.14,scenario:.13,market:.12,connections:0},value:true},
 {id:'exterieur',name:'Extérieur',description:'Regarde les profils délaissés par le marché et les angles peu visibles.',weights:{form:.27,aptitude:.28,value:.20,scenario:.12,market:.13,connections:0},value:true},
 {id:'executant',name:'Exécutant',description:'Contrôle la complétude et privilégie les dossiers documentés.',weights:{form:.27,aptitude:.25,value:.12,scenario:.12,market:.10,connections:0,quality:.14},quality:true},
 {id:'president',name:'Président de séance',description:'Arbitre les contributions et rend visibles les désaccords.',weights:{form:.28,aptitude:.28,value:.12,scenario:.14,market:.10,connections:0,quality:.10},chair:true}
];
function value(r,k){const x=r[k];return x&&typeof x==='object'&&'value'in x?x.value:x;}
function scoreOne(r,base,apt,marketMax,role){
 const form=base?.form??null, aptitude=apt?.score??base?.context??null, odds=value(r,'odds');
 const market=base?.market??null;
 // La présence d'un jockey ou d'un entraîneur n'est pas une mesure de performance.
 // Sans statistiques vérifiées, l'entourage est affiché comme information, jamais noté.
 const connections=null;
 const rawValue=value(r,'valueSuitability'), rawScenario=value(r,'scenarioSuitability');
 const valueScore=rawValue!==null&&rawValue!==undefined&&rawValue!==''&&Number.isFinite(Number(rawValue))?clamp(Number(rawValue)):null;
 const scenario=rawScenario!==null&&rawScenario!==undefined&&rawScenario!==''&&Number.isFinite(Number(rawScenario))?clamp(Number(rawScenario)):null;
 const oddsField=r.odds&&typeof r.odds==='object'?r.odds:null;
 const marketUsable=!oddsField||!['stale','conflicting','missing'].includes(oddsField.status);
 const effectiveMarket=marketUsable?market:null;
 const parts=[['form',form],['aptitude',aptitude],['value',valueScore],['scenario',scenario],['market',effectiveMarket],['connections',connections]];
 let total=0,weight=0,used=[];
 for(const [key,v] of parts){if(v===null||v===undefined)continue;let w=role.weights[key]||0;if(role.risk&&key==='market'&&market!==null&&market>65)w*=.55;if(role.value&&key==='market'&&market!==null&&market<40)w*=.25;if(role.quality&&key==='connections'&&connections!==null)w*=.5;total+=v*w;weight+=w;used.push(key);}
 let score=weight?total/weight:null;
 const missing=parts.filter(([,v])=>v===null||v===undefined).map(([k])=>k);
 const entouragePresent=!!(value(r,'jockey')||value(r,'trainer'));
 const oddsStatus=oddsField?.status||'non précisé';
 if(score!==null&&role.risk&&missing.length>=2)score-=8;
 if(score!==null&&role.value&&market!==null&&market<35&&form!==null&&form>=65)score+=5;
 return {id:r.id,number:r.number,name:r.name,score:score===null?null:Math.round(clamp(score)*10)/10,used,missing,odds:odds??null,entouragePresent,oddsStatus};
}
function analyze(race,statsResult,aptitudeByRunner={}){
 if(!race||!Array.isArray(race.runners)||!statsResult||!Array.isArray(statsResult.ranked))throw new Error('Course et présélection statistique requis.');
 const active=race.runners.filter(r=>r.status==='runner');
 if(active.length<3)throw new Error('Au moins trois partants confirmés sont nécessaires.');
 const base=new Map(statsResult.ranked.map(x=>[x.id,x]));
 const reports=ROLES.map(role=>{
  const ranking=active.map(r=>scoreOne(r,base.get(r.id),aptitudeByRunner[r.id],null,role)).filter(x=>x.score!==null).sort((a,b)=>b.score-a.score);
  return {id:role.id,name:role.name,description:role.description,ranking,top5:ranking.slice(0,5).map(x=>x.number),top7:ranking.slice(0,7).map(x=>x.number),limitations:ranking.length<active.length?`${active.length-ranking.length} partant(s) sans score exploitable.`:'Certaines dimensions peuvent rester absentes.',kind:'perspective_locale_deterministe'};
 });
 const rankMaps=reports.map(rep=>new Map(rep.ranking.map((x,i)=>[x.id,i+1])));
 const consensus=active.map(r=>{
  const positions=rankMaps.map(m=>m.get(r.id)).filter(Number.isFinite);
  const scores=reports.map(rep=>rep.ranking.find(x=>x.id===r.id)?.score).filter(Number.isFinite);
  const mean=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;
  const spread=positions.length?Math.max(...positions)-Math.min(...positions):null;
  return {id:r.id,number:r.number,name:r.name,score:mean===null?null:Math.round(mean*10)/10,expertCoverage:positions.length,averageRank:positions.length?Math.round(positions.reduce((a,b)=>a+b,0)/positions.length*10)/10:null,disagreement:spread,tag:spread!==null&&spread>=4?'désaccord important':spread!==null&&spread>=2?'désaccord modéré':'avis relativement convergents'};
 }).filter(x=>x.score!==null).sort((a,b)=>b.score-a.score);
 if(consensus.length<3)throw new Error('Données insuffisantes pour confronter les perspectives.');
 const selected5=consensus.slice(0,5), selected7=consensus.slice(0,7);
 const dissent=consensus.filter(x=>x.disagreement>=3).sort((a,b)=>b.disagreement-a.disagreement);
 const factorCoverage={
  formeRecente:active.filter(r=>base.get(r.id)?.form!==null&&base.get(r.id)?.form!==undefined).length,
  aptitude:active.filter(r=>aptitudeByRunner[r.id]?.score!==null&&aptitudeByRunner[r.id]?.score!==undefined).length,
  conditions:active.filter(r=>{const a=aptitudeByRunner[r.id];return a&&(a.dimensions?.groundMatchRate!==null&&a.dimensions?.groundMatchRate!==undefined||a.dimensions?.trackMatchRate!==null&&a.dimensions?.trackMatchRate!==undefined);}).length,
  entourageDocumente:active.filter(r=>!!(value(r,'jockey')||value(r,'trainer'))).length,
  valeurHandicap:active.filter(r=>value(r,'valueSuitability')!==null&&value(r,'valueSuitability')!==undefined).length,
  scenarioCourse:active.filter(r=>value(r,'scenarioSuitability')!==null&&value(r,'scenarioSuitability')!==undefined).length
 };
 const factorStatus={
  formeRecente:factorCoverage.formeRecente?'évaluable':'absente',
  aptitude:factorCoverage.aptitude?'évaluable':'absente',
  conditions:factorCoverage.conditions?'partielle':'absente',
  entourageDocumente:factorCoverage.entourageDocumente?'identité disponible, performance non notée':'absente',
  valeurHandicap:factorCoverage.valeurHandicap?'indice de valeur renseigné (0–100)':'non renseignée',
  scenarioCourse:factorCoverage.scenarioCourse?'indice de scénario renseigné (0–100)':'non renseigné'
 };
 const reserves=consensus.slice(7,10);
 const outsiders=consensus.filter(x=>{const r=race.runners.find(y=>y.id===x.id),odds=Number(value(r,'odds'));return Number.isFinite(odds)&&odds>=12&&x.score>=45;}).slice(0,4);
 return {version:'0.1.2',method:'Agrégation locale de sept perspectives déterministes sur les mêmes données : forme, aptitude historique, indice de valeur, scénario et marché lorsque disponibles ; aucune IA indépendante ni collecte externe.',reports,consensus,factorCoverage,factorStatus,selection5:selected5.map(x=>x.number),selection7:selected7.map(x=>x.number),reserves:reserves.map(x=>x.number),outsiders:outsiders.map(x=>x.number),dissent:dissent.map(x=>({number:x.number,name:x.name,disagreement:x.disagreement,tag:x.tag})),confidenceLabel:consensus.length===active.length?'couverture des partants scorés complète':'couverture partielle',warning:'Ce moteur simule sept angles de lecture par des règles explicites. Il ne s’agit pas de sept experts humains ou de sept IA indépendantes. Les scores ne sont pas des probabilités. Les cotes ne prouvent pas la valeur réelle d’un cheval. Pronostic à vérifier et à valider par l’utilisateur.'};
}
return {version:'0.1.2',ROLES,analyze};
});
