/* Suivi Turf Turbo V4 — reconstruction prudente de tableaux depuis les éléments texte PDF.js.
 * Ce module ne charge pas PDF.js et ne réalise aucun OCR. Il transforme uniquement
 * les items positionnés fournis par PDF.js en texte tabulé à prévisualiser.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TurfV4PdfLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
const HEADER_WORDS=new Set(['n','no','numero','num','chevaux','cheval','nom','jockey','jockeys','driver','drivers','entraineur','entraineurs','corde','poids','perf','performances','cote','cotes','musique']);
function normalize(s){return clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function itemPosition(item){const t=item?.transform;if(!Array.isArray(t)||t.length<6)return null;const x=Number(t[4]),y=Number(t[5]);if(!Number.isFinite(x)||!Number.isFinite(y))return null;const str=clean(item.str);if(!str)return null;const width=Number(item.width);return {str,x,y,width:Number.isFinite(width)&&width>0?width:Math.max(1,str.length*3),endX:x+(Number.isFinite(width)&&width>0?width:Math.max(1,str.length*3))};}
function groupLines(items,tolerance=2.5){const positioned=(items||[]).map(itemPosition).filter(Boolean).sort((a,b)=>b.y-a.y||a.x-b.x);const lines=[];for(const item of positioned){let line=lines.find(l=>Math.abs(l.y-item.y)<=tolerance);if(!line){line={y:item.y,items:[]};lines.push(line);}line.items.push(item);line.y=line.items.reduce((s,x)=>s+x.y,0)/line.items.length;}for(const line of lines)line.items.sort((a,b)=>a.x-b.x);return lines.sort((a,b)=>b.y-a.y);}
function isHeaderLine(line){const words=line.items.map(x=>normalize(x.str));return words.filter(w=>HEADER_WORDS.has(w)||[...HEADER_WORDS].some(h=>h.length>2&&w.includes(h))).length>=2;}
function reconstructPage(textContent,options={}){
 const items=textContent?.items||textContent||[];
 const lines=groupLines(items,Number.isFinite(options.lineTolerance)?options.lineTolerance:2.5);
 if(!lines.length)throw new Error('Aucun texte positionné exploitable dans cette page PDF. Le document est peut-être scanné ou vide.');
 const norm=items=>items.map(x=>normalize(x.str)).join(' ');
 const headerIndex=lines.findIndex(line=>{const s=norm(line.items);return (s.includes('chevaux')||s.includes('cheval'))&&(s.includes('jockeys')||s.includes('jockey'))&&(s.includes('entraineurs')||s.includes('entraineur'))&&s.includes('poids')&&s.includes('corde')&&(s.includes('perf')||s.includes('performance'));});
 if(headerIndex<0)throw new Error('En-têtes du tableau des partants non reconnus sur cette page.');
 const header=lines[headerIndex];
 // Ce journal place le tableau principal dans la zone x=20..410. Les pronostics
 // des médias à droite sont un autre tableau : ils ne doivent jamais devenir des partants.
 const boundaries=[34,86,132,184,244,260,280,310,335,365];
 const headers=['numero','cheval','jockey','entraineur','proprietaire','sexe_age','corde','poids','perf','gains'];
 const rows=[];
 for(const line of lines.slice(headerIndex+1)){
  const main=line.items.filter(x=>x.x<410);
  const first=main.find(x=>x.x>=20&&x.x<35&&/^\d{1,2}$/.test(x.str));
  if(!first)continue;
  const number=Number(first.str);
  if(!Number.isInteger(number)||number<1||number>30)continue;
  const cells=Array(headers.length).fill('');
  for(const item of main){
   if(item===first) {cells[0]=String(number);continue;}
   let col=boundaries.findIndex(edge=>item.x<edge);
   if(col<0)continue;
   cells[col]=clean(cells[col]+' '+item.str);
  }
  const name=cells[1].replace(/\s+/g,' ').trim();
  const weight=cells[7].replace(/\s+/g,'').replace(/,/g,'.');
  if(name.length<2||!/^\d{1,2}(?:\.\d)?(?:kg)?$/i.test(weight))continue;
  rows.push({number,cells});
 }
 rows.sort((a,b)=>a.number-b.number);
 const unique=[];const seen=new Set();
 for(const row of rows){if(seen.has(row.number))continue;seen.add(row.number);unique.push(row);}
 if(unique.length<5)throw new Error('Le tableau a été détecté, mais moins de cinq lignes de partants cohérentes ont été reconnues. Import interrompu.');
 const output=[headers.join('\t'),...unique.map(r=>r.cells.join('\t'))];
 return {text:output.join('\n'),headers,rowCount:unique.length,ignoredLineCount:Math.max(0,lines.length-headerIndex-1-unique.length),pageNumber:options.pageNumber??null,warnings:['Tableau des partants extrait depuis les positions réelles du texte PDF. Les colonnes de pronostics des journaux ont été exclues.','Les données restent à vérifier avant intégration.']};
}
function reconstructDocument(pages){if(!Array.isArray(pages)||!pages.length)throw new Error('Aucune page PDF à analyser.');const results=[];for(let i=0;i<pages.length;i++){try{const r=reconstructPage(pages[i],{pageNumber:i+1});results.push(r);}catch(error){results.push({pageNumber:i+1,error:error.message,text:'',rowCount:0,headers:[],warnings:[]});}}const usable=results.filter(x=>x.text);let combined='',rowCount=0;let canonical=null;const errors=results.filter(x=>x.error&&!/^En-têtes de tableau non reconnus\./.test(x.error)).map(x=>({pageNumber:x.pageNumber,message:x.error}));const skippedPages=results.filter(x=>x.error&&/^En-têtes de tableau non reconnus\./.test(x.error));for(const page of usable){const normalized=page.headers.map(normalize);if(canonical===null){canonical=normalized;combined=page.text;rowCount+=page.rowCount;continue;}if(normalized.length!==canonical.length||normalized.some((h,i)=>h!==canonical[i])){errors.push({pageNumber:page.pageNumber,message:'Les colonnes de cette page diffèrent des en-têtes de la première page exploitable ; cette page n’a pas été fusionnée.'});continue;}const dataLines=page.text.split('\n').slice(1);if(dataLines.length)combined+='\n'+dataLines.join('\n');rowCount+=page.rowCount;}return {pages:results,text:combined,rowCount,warnings:[...new Set([...results.flatMap(x=>x.warnings||[]),...(skippedPages.length?[`${skippedPages.length} page(s) sans tableau de partants reconnu(s) ont été ignorées.`]:[])])],errors};}
return {groupLines,reconstructPage,reconstructDocument};
});
