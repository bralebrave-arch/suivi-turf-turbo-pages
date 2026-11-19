/* Suivi Turf Turbo V4 — import guidé de tableaux copiés depuis un PDF (v0.1.1)
 * Ne lit pas les fichiers PDF et ne réalise pas d'OCR. Traite uniquement un tableau
 * copié sous forme tabulée/CSV, avec validation stricte avant normalisation.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TurfV4TextImporter=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clean=s=>String(s??'').trim();
function delimiterOf(line){const counts={'\t':0,';':0,'|':0};let q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){i++;continue;}q=!q;}else if(!q&&Object.hasOwn(counts,c))counts[c]++;}return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][1]>0?Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]:null;}
function splitLine(line,delimiter){const out=[];let cell='',q=false;for(let i=0;i<line.length;i++){const c=line[i],n=line[i+1];if(q){if(c==='"'&&n==='"'){cell+='"';i++;}else if(c==='"')q=false;else cell+=c;}else if(c==='"'&&cell==='')q=true;else if(c===delimiter){out.push(clean(cell));cell='';}else cell+=c;}if(q)throw new Error('Guillemet non fermé dans le tableau copié.');out.push(clean(cell));return out;}
function parseTable(input){
 const src=String(input||'').replace(/^\uFEFF/,'');
 if(!src.trim())throw new Error('Aucun texte à importer.');
 // Ne pas appliquer trim() aux lignes : cela supprimerait les tabulations finales,
 // donc les cellules vides des colonnes situées à droite dans les tableaux PDF.
 const lines=src.split(/\r?\n/).filter(x=>x.trim()!=='');
 if(lines.length<2)throw new Error('Il faut une ligne d’en-têtes et au moins une ligne de cheval.');
 const delimiter=delimiterOf(lines[0]);
 if(!delimiter)throw new Error('Aucun séparateur de colonnes détecté. Copie le tableau avec ses tabulations, ou utilise un CSV avec ;.');
 const headers=splitLine(lines[0],delimiter);
 if(headers.some(x=>!x))throw new Error('Une colonne du tableau copié a un en-tête vide.');
 const norm=s=>clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
 if(new Set(headers.map(norm)).size!==headers.length)throw new Error('Le tableau contient des colonnes en double.');
 const rows=lines.slice(1).map((line,i)=>{
  const cells=splitLine(line,delimiter);
  if(cells.length!==headers.length)throw new Error('Ligne '+(i+2)+' : '+cells.length+' colonnes au lieu de '+headers.length+'. Reprends la copie du tableau sans perdre de cellules.');
  return Object.fromEntries(headers.map((h,j)=>[h,cells[j]]));
 });
 return rows;
}
function normalizeHeader(s){return clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function findColumn(headers,aliases){return headers.find(h=>aliases.includes(normalizeHeader(h)));}
function filterEditorialRows(rows){
 if(!rows.length)return {rows,ignored:0};
 const headers=Object.keys(rows[0]);
 const numberKey=findColumn(headers,['n','no','numero','num','numero cheval']);
 const nameKey=findColumn(headers,['chevaux','cheval','nom','name','horse']);
 const weightKey=findColumn(headers,['poids','poidskg','poidsporte','poidsporte','weightkg','weight']);
 // Filtrage spécialisé uniquement lorsque le journal présente un tableau hippique
 // structuré avec numéro, nom du cheval et poids. Les autres imports restent intacts.
 if(!numberKey||!nameKey||!weightKey)return {rows,ignored:0};
 const candidates=rows.filter(row=>{
  const numberText=clean(row[numberKey]);
  const number=Number(numberText);
  const name=clean(row[nameKey]);
  const weightText=clean(row[weightKey]).replace(/\s+/g,'').replace(/\.?kg$/i,'').replace(',','.');
  const weight=Number(weightText);
  return /^\d{1,2}$/.test(numberText)&&Number.isInteger(number)&&number>=1&&number<=30&&name.length>=2&&Number.isFinite(weight)&&weight>=30&&weight<=100;
 });
 // Ne filtrer que si le signal est suffisamment fort : au moins 5 chevaux
 // avec numéro, nom et poids plausibles, et des lignes parasites supplémentaires.
 if(candidates.length>=5&&candidates.length<rows.length)return {rows:candidates,ignored:rows.length-candidates.length};
 return {rows,ignored:0};
}
function importText(input,importer,meta={}){
 if(!importer||typeof importer.fromRecords!=='function')throw new Error('Le moteur d’importation principal est indisponible.');
 const parsedRows=parseTable(input);
 const filtered=filterEditorialRows(parsedRows);
 const result=importer.fromRecords(filtered.rows,{...meta,source:meta.source||'Tableau copié depuis un journal hippique LONAB'});
 if(filtered.ignored)result.warnings.unshift(`${filtered.ignored} ligne(s) éditoriale(s) ou non-partant(s) sans poids exploitable ignorée(s) ; ${filtered.rows.length} cheval(aux) avec numéro, nom et poids plausibles conservé(s). Vérifie le PDF original avant intégration.`);
 if(!meta.pdfRead)result.warnings.unshift('Import par texte tabulaire : aucune lecture PDF ni reconnaissance optique automatique n’a été effectuée. Vérifie chaque cheval et chaque colonne sur le document original.');
 return result;
}
return {parseTable,importText};
});
