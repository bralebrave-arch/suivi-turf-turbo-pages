/* Suivi Turf Turbo V4 — reconstruction prudente de tableaux depuis les éléments texte PDF.js.
 * Ce module ne charge pas PDF.js et ne réalise aucun OCR. Il transforme uniquement
 * les items positionnés fournis par PDF.js en texte tabulé à prévisualiser.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TurfV4PdfLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
function normalize(s){return clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function itemPosition(item){const t=item?.transform;if(!Array.isArray(t)||t.length<6)return null;const x=Number(t[4]),y=Number(t[5]);if(!Number.isFinite(x)||!Number.isFinite(y))return null;const str=clean(item.str);if(!str)return null;const width=Number(item.width);return {str,x,y,width:Number.isFinite(width)&&width>0?width:Math.max(1,str.length*3),endX:x+(Number.isFinite(width)&&width>0?width:Math.max(1,str.length*3))};}
function groupLines(items,tolerance=3.5){
 const positioned=(items||[]).map(itemPosition).filter(Boolean).sort((a,b)=>b.y-a.y||a.x-b.x);
 const lines=[];
 for(const item of positioned){
  // Comparer à la ligne de base initiale évite qu'une longue ligne dérive progressivement.
  let line=lines.find(l=>Math.abs(l.anchorY-item.y)<=tolerance);
  if(!line){line={y:item.y,anchorY:item.y,items:[]};lines.push(line);}
  line.items.push(item);
 }
 for(const line of lines){line.items.sort((a,b)=>a.x-b.x);line.y=line.items.reduce((s,x)=>s+x.y,0)/line.items.length;}
 return lines.sort((a,b)=>b.y-a.y);
}
function reconstructPage(textContent,options={}){
 const items=textContent?.items||textContent||[];
 const lines=groupLines(items,Number.isFinite(options.lineTolerance)?options.lineTolerance:3.5);
 if(!lines.length)throw new Error('Aucun texte positionné exploitable dans cette page PDF. Le document est peut-être scanné ou vide.');
 // Les en-têtes de certains PDF sont répartis sur plusieurs lignes de base.
 // On repère CHEVAUX, puis on vérifie les autres colonnes dans une bande verticale proche.
 let headerIndex=-1,headerY=null;
 for(let i=0;i<lines.length;i++){
  if(!lines[i].items.some(x=>['chevaux','cheval'].includes(normalize(x.str))))continue;
  const band=lines.flatMap(l=>Math.abs(l.y-lines[i].y)<=9?l.items:[]);
  const words=band.map(x=>normalize(x.str));
  const has=(part)=>words.some(w=>w.includes(part));
  if(has('jockey')&&has('entraineur')&&has('poids')&&has('corde')&&has('perf')){headerIndex=i;headerY=lines[i].y;break;}
 }
 if(headerIndex<0)throw new Error('En-têtes du tableau des partants non reconnus sur cette page. Le PDF contient du texte, mais sa structure de colonnes n’a pas été identifiée.');
 // Colonnes du tableau principal LONAB : les pronostics des médias commencent à droite
 // de x≈410 et ne doivent jamais être pris pour des chevaux.
 const boundaries=[34,86,132,184,244,260,280,310,335,365,386,410];
 const headers=['numero','cheval','jockey','entraineur','proprietaire','sexe_age','corde','poids','perf','gains','parisTurfOdds','tierceMagazineOdds'];
 const rows=[];
 const dataLines=lines.filter(l=>l.y<headerY-3);
 for(const line of dataLines){
  const main=line.items.filter(x=>x.x<410);
  const first=main.find(x=>x.x>=15&&x.x<35&&/^\d{1,2}$/.test(x.str));
  if(!first)continue;
  const number=Number(first.str);
  if(!Number.isInteger(number)||number<1||number>30)continue;
  const cells=Array(headers.length).fill('');
  for(const item of main){
   if(item===first){cells[0]=String(number);continue;}
   const col=boundaries.findIndex(edge=>item.x<edge);
   if(col>=0)cells[col]=clean(cells[col]+' '+item.str);
  }
  const name=clean(cells[1]);
  let weight=clean(cells[7]).replace(/\s+/g,'').replace(/\.?kg$/i,'').replace(',','.');
  if(!/^\d{1,2}(?:\.\d)?$/.test(weight)){
   const weightToken=main.find(x=>x.x>=280&&x.x<310&&/^\d{1,2}(?:[,.]\d)?\.?kg$/i.test(x.str));
   if(weightToken)weight=weightToken.str.replace(/\.?kg$/i,'').replace(',','.');
  }
  if(name.length<2||!/^\d{1,2}(?:\.\d)?$/.test(weight))continue;
  cells[7]=weight;
  rows.push({number,cells});
 }
 rows.sort((a,b)=>a.number-b.number);
 const unique=[];const seen=new Set();
 for(const row of rows){if(seen.has(row.number))continue;seen.add(row.number);unique.push(row);}
 if(unique.length<5)throw new Error('Le tableau a été repéré, mais seulement '+unique.length+' ligne(s) de partants sur au moins cinq ont passé les contrôles numéro/nom/poids. Import interrompu pour éviter les données erronées.');
 const output=[headers.join('\t'),...unique.map(r=>r.cells.join('\t'))];
 return {text:output.join('\n'),headers,rowCount:unique.length,ignoredLineCount:Math.max(0,dataLines.length-unique.length),pageNumber:options.pageNumber??null,warnings:['Tableau des partants extrait depuis les positions réelles du texte PDF. Les cotes Paris Turf et Tiercé Magazine sont conservées séparément des cotes PMU.','Les statuts non indiqués restent à confirmer ; les données restent à vérifier avant intégration.']};
}
function reconstructDocument(pages){
 if(!Array.isArray(pages)||!pages.length)throw new Error('Aucune page PDF à analyser.');
 const results=[];
 for(let i=0;i<pages.length;i++){try{results.push(reconstructPage(pages[i],{pageNumber:i+1}));}catch(error){results.push({pageNumber:i+1,error:error.message,text:'',rowCount:0,headers:[],warnings:[]});}}
 const usable=results.filter(x=>x.text),errors=results.filter(x=>x.error&&!/En-têtes du tableau des partants non reconnus/.test(x.error)).map(x=>({pageNumber:x.pageNumber,message:x.error}));
 let combined='',rowCount=0,canonical=null;
 for(const page of usable){
  const normalized=page.headers.map(normalize);
  if(canonical===null){canonical=normalized;combined=page.text;rowCount=page.rowCount;continue;}
  if(normalized.length!==canonical.length||normalized.some((h,i)=>h!==canonical[i])){errors.push({pageNumber:page.pageNumber,message:'Les colonnes de cette page diffèrent des en-têtes de la première page exploitable ; cette page n’a pas été fusionnée.'});continue;}
  const dataLines=page.text.split('\n').slice(1);if(dataLines.length){combined+='\n'+dataLines.join('\n');rowCount+=page.rowCount;}
 }
 const skipped=results.filter(x=>x.error&&/En-têtes du tableau des partants non reconnus/.test(x.error));
 return {pages:results,text:combined,rowCount,warnings:[...new Set([...results.flatMap(x=>x.warnings||[]),...(skipped.length?[String(skipped.length)+' page(s) sans tableau de partants reconnu(s) ont été ignorées.'] : [])])],errors};
}
return {groupLines,reconstructPage,reconstructDocument};
});
