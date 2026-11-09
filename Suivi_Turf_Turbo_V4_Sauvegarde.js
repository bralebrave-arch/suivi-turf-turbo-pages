(function(root){
'use strict';
function buildBackup(races, createdAt){
 if(!Array.isArray(races)) throw new Error('Les courses à sauvegarder doivent former une liste.');
 return {app:'Suivi Turf Turbo V4',backupSchema:1,createdAt:createdAt||new Date().toISOString(),raceCount:races.length,races:JSON.parse(JSON.stringify(races))};
}
function validateBackup(data){
 if(!data||data.app!=='Suivi Turf Turbo V4'||data.backupSchema!==1||!Array.isArray(data.races)) return {valid:false,reason:'Format de sauvegarde V4 non reconnu.'};
 if(data.raceCount!==undefined&&data.raceCount!==data.races.length) return {valid:false,reason:'Le nombre de courses annoncé ne correspond pas au contenu du fichier.'};
 const ids=new Set();
 for(const r of data.races){
  if(!r||typeof r!=='object'||!Array.isArray(r.runners)||!r.id) return {valid:false,reason:'Une course de la sauvegarde est invalide, sans identifiant ou ne contient pas de partants.'};
  const id=String(r.id);if(ids.has(id))return {valid:false,reason:'La sauvegarde contient plusieurs courses avec le même identifiant.'};ids.add(id);
 }
 return {valid:true,count:data.races.length};
}
function parseCSVRows(input){
 if(typeof input!=='string')throw new Error('Le contenu CSV doit être du texte.');
 const text=input.replace(/^\uFEFF/,'');
 const firstLine=(text.split(/\r?\n/,1)[0]||'');let commas=0,semicolons=0,quoted=false;
 for(let i=0;i<firstLine.length;i++){const c=firstLine[i];if(c==='"'){if(quoted&&firstLine[i+1]==='"'){i++;continue;}quoted=!quoted;}else if(!quoted&&c===',')commas++;else if(!quoted&&c===';')semicolons++;}
 const delimiter=semicolons>commas?';':',';const rows=[];let row=[],field='',inQuotes=false,closedQuote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(inQuotes){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{inQuotes=false;closedQuote=true;}}else field+=c;continue;}
  if(c==='"'){if(field.length||closedQuote)throw new Error('Guillemets CSV mal placés.');inQuotes=true;continue;}
  if(c===delimiter){row.push(field.trim());field='';closedQuote=false;continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(v=>v!==''))rows.push(row);row=[];field='';closedQuote=false;continue;}
  if(closedQuote&&c!==' '&&c!=='\t')throw new Error('Caractère inattendu après un guillemet CSV fermant.');
  field+=c;
 }
 if(inQuotes)throw new Error('Champ CSV entre guillemets non terminé.');
 row.push(field.trim());if(row.some(v=>v!==''))rows.push(row);
 return rows;
}
function readStoredRaces(storage,key){
 if(!storage||typeof storage.getItem!=='function') throw new Error('Stockage local inaccessible. Aucune donnée ne peut être chargée en sécurité.');
 let raw;
 try{raw=storage.getItem(key);}catch(_){throw new Error('Lecture du stockage local impossible. Enregistrement bloqué pour protéger les données existantes.');}
 if(raw===null)return [];
 let parsed;
 try{parsed=JSON.parse(raw);}catch(_){throw new Error('Le stockage local est illisible ou endommagé. Aucun nouvel enregistrement ne sera effectué afin de protéger les anciennes données.');}
 if(!Array.isArray(parsed))throw new Error('Le stockage local ne contient pas une liste de courses valide. Enregistrement bloqué.');
 if(parsed.some(r=>!r||typeof r!=='object'||!Array.isArray(r.runners)))throw new Error('Une course enregistrée est invalide. Enregistrement bloqué pour éviter toute perte de données.');
 return parsed;
}
function readSnapshotRaces(storage,snapshotKey){
 if(!storage||typeof storage.getItem!=='function') throw new Error('Stockage local inaccessible.');
 let raw;try{raw=storage.getItem(snapshotKey);}catch(_){throw new Error('Lecture de la copie locale impossible.');}
 if(raw===null)throw new Error('Aucune copie locale précédente disponible.');
 let parsed;try{parsed=JSON.parse(raw);}catch(_){throw new Error('La copie locale précédente est illisible ou endommagée.');}
 if(!Array.isArray(parsed)||parsed.some(r=>!r||typeof r!=='object'||!Array.isArray(r.runners)||!r.id)) throw new Error('La copie locale précédente ne contient pas une liste de courses valide.');
 const ids=new Set();for(const r of parsed){const id=String(r.id);if(ids.has(id))throw new Error('La copie locale contient des identifiants de course dupliqués.');ids.add(id);}
 return parsed;
}
function writeStoredRaces(storage,key,snapshotKey,list){
 if(!Array.isArray(list))throw new Error('Les courses à enregistrer doivent former une liste.');
 const previous=readStoredRaces(storage,key);
 const previousRaw=storage.getItem(key);
 let payload;
 try{payload=JSON.stringify(list);if(typeof payload!=='string')throw new Error();}catch(_){throw new Error('Préparation de la sauvegarde impossible.');}
 if(previousRaw!==null){
  try{storage.setItem(snapshotKey,previousRaw);}catch(_){throw new Error('Copie de sécurité impossible. Les données actuelles sont conservées et aucune modification n’a été effectuée.');}
 }
 try{
  storage.setItem(key,payload);
  if(storage.getItem(key)!==payload)throw new Error('La vérification après écriture a échoué.');
 }catch(err){
  try{if(previousRaw===null){if(typeof storage.removeItem==='function')storage.removeItem(key);}else storage.setItem(key,previousRaw);}catch(_){}
  throw new Error('Écriture non confirmée. Les données précédentes ont été préservées autant que le stockage le permet. '+(err&&err.message?err.message:''));
 }
 return list;
}
function mergeRaces(existing,incoming){
 if(!Array.isArray(existing)||!Array.isArray(incoming)) throw new Error('Les données à fusionner doivent être des listes.');
 const result=existing.slice(), ids=new Map();
 existing.forEach((r,i)=>{if(r&&r.id!==undefined&&r.id!==null)ids.set(String(r.id),i);});
 let added=0,duplicates=0,conflicts=0;const conflictItems=[];
 incoming.forEach(r=>{
  if(!r||r.id===undefined||r.id===null){conflicts++;conflictItems.push({reason:'missing_id',incoming:r??null});return;}
  const key=String(r.id);
  if(ids.has(key)){
   const old=result[ids.get(key)];
   if(JSON.stringify(old)===JSON.stringify(r)) duplicates++; else {conflicts++;conflictItems.push({reason:'same_id_different_data',id:key,existing:old,incoming:r});}
   return;
  }
  ids.set(key,result.length);result.push(r);added++;
 });
 return {races:result,added,duplicates,conflicts,conflictItems};
}
root.TurfV4Backup={buildBackup,validateBackup,mergeRaces,readStoredRaces,readSnapshotRaces,writeStoredRaces,parseCSVRows};
})(typeof window!=='undefined'?window:globalThis);
