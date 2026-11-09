/* Suivi Turf Turbo V4 — moteur d'aptitude contextuelle v0.1.0
 * Estimation descriptive à partir de résultats historiques fournis et sourcés.
 * Ne collecte aucune donnée et ne transforme pas l'aptitude en probabilité de victoire.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TurfV4Aptitude=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const num=v=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const norm=v=>String(v??'').trim().toLocaleLowerCase('fr');
const VALID_SOURCE=new Set(['verified','corroborated']);
function validRecord(p,raceDate){
 if(!p||!VALID_SOURCE.has(p.sourceStatus))return false;
 if(!p.date||!Number.isFinite(Date.parse(p.date)))return false;
 if(raceDate&&Date.parse(p.date)>Date.parse(raceDate))return false;
 if(!p.discipline||!num(p.distanceM)||num(p.distanceM)<=0)return false;
 if(!Number.isInteger(num(p.placing))||num(p.placing)<=0)return false;
 if(!Number.isInteger(num(p.fieldSize))||num(p.fieldSize)<2||num(p.placing)>num(p.fieldSize))return false;
 if(p.status&&p.status!=='finished')return false;
 return true;
}
function comparePerformance(p,race){
 const d=num(p.distanceM), target=num(race.distanceM);
 if(norm(p.discipline)!==norm(race.discipline))return null;
 if(target&&Math.abs(d-target)/target>0.15)return null;
 const distanceFit=target?clamp(100-(Math.abs(d-target)/target)*500):null;
 const trackKnown=!!race.track, trackMatch=trackKnown&&norm(p.track)===norm(race.track);
 const groundKnown=!!(race.ground&&race.ground.value), groundMatch=groundKnown&&norm(p.ground)===norm(race.ground.value);
 const surfaceKnown=!!(race.surface&&race.surface.value), surfaceMatch=surfaceKnown&&norm(p.surface)===norm(race.surface.value);
 const placing=num(p.placing), field=num(p.fieldSize);
 const resultScore=100*(field-placing)/(field-1);
 const ageDays=Math.max(0,(Date.parse(race.date)-Date.parse(p.date))/86400000);
 const recency=Math.exp(-ageDays/730);
 let relevance=.45;
 if(trackKnown)relevance+=trackMatch?.20:0;
 if(target)relevance+=.20*(distanceFit/100);
 if(groundKnown)relevance+=groundMatch?.10:0;
 if(surfaceKnown)relevance+=surfaceMatch?.05:0;
 relevance*=.75+.25*recency;
 return {date:p.date,track:p.track||null,distanceM:d,ground:p.ground||null,placing,fieldSize:field,resultScore:Math.round(resultScore*10)/10,relevance:Math.round(relevance*1000)/1000,trackMatch,distanceFit:distanceFit===null?null:Math.round(distanceFit),groundMatch,surfaceMatch,sourceStatus:p.sourceStatus,source:p.source||null,sourceUrl:p.sourceUrl||null};
}
function summarize(values){const xs=values.filter(v=>v!==null&&v!==undefined);return xs.length?Math.round(xs.reduce((a,b)=>a+b,0)/xs.length):null;}
function analyzeAptitude(race,performances=[]){
 if(!race||!Array.isArray(performances))throw new Error('Course et historique de performances requis.');
 const reasons=[];
 if(!race.discipline||race.discipline==='autre')reasons.push('Discipline de la course cible inconnue.');
 if(!race.distanceM)reasons.push('Distance de la course cible inconnue.');
 const eligible=performances.filter(p=>validRecord(p,race.date));
 const compared=eligible.map(p=>comparePerformance(p,race)).filter(Boolean).sort((a,b)=>b.date.localeCompare(a.date));
 const weightedTotal=compared.reduce((s,p)=>s+p.resultScore*p.relevance,0);
 const totalWeight=compared.reduce((s,p)=>s+p.relevance,0);
 const score=totalWeight?Math.round(weightedTotal/totalWeight):null;
 const count=compared.length;
 const classification=count>=3?'demontree':count>=1?'probable':'insuffisante';
 if(count===0)reasons.push('Aucune performance historique comparable, valide et antérieure à la course.');
 if(count>0&&count<3)reasons.push('Échantillon trop réduit pour parler d’aptitude démontrée.');
 if(compared.some(p=>p.sourceStatus!=='verified'))reasons.push('Certaines sources sont corroborées mais pas vérifiées individuellement.');
 const sourceQuality=count?compared.filter(p=>p.sourceStatus==='verified').length/count:0;
 const sampleFactor=Math.min(1,count/5);
 const confidence=score===null?0:Math.round(100*sampleFactor*(.6+.4*sourceQuality));
 return {score,classification,confidence,sampleSize:count,eligibleHistoryCount:eligible.length,dimensions:{discipline:race.discipline,distanceM:race.distanceM,track:race.track||null,ground:race.ground?.value??null,surface:race.surface?.value??null,trackMatchRate:count&&race.track?Math.round(100*compared.filter(p=>p.trackMatch).length/count):null,meanDistanceFit:summarize(compared.map(p=>p.distanceFit)),groundMatchRate:count&&race.ground?.value?Math.round(100*compared.filter(p=>p.groundMatch).length/count):null},reasons,performances:compared,warning:'Indice descriptif exploratoire fondé sur les performances historiques disponibles. Ce score n’est ni une probabilité de victoire ni une garantie de réussite. Les performances non vérifiées, futures, invalides ou non comparables sont exclues.'};
}
return {version:'0.1.0',analyzeAptitude,validRecord};
});
