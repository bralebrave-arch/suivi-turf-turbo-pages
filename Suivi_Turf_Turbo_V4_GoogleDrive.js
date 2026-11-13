(function(root){
'use strict';
const API='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME='suivi-turf-turbo-sauvegarde-v4.json';
function createGoogleDriveBackup(options={}){
 const fetcher=options.fetch||root.fetch?.bind(root);
 const storage=options.storage||root.localStorage;
 const validateBackup=options.validateBackup||((data)=>root.TurfV4Backup?.validateBackup?.(data));
 const getGoogleApi=()=>options.google||root.google||null;
 let gisPromise=null;
 const loadGIS=options.loadGIS||(()=>new Promise((resolve,reject)=>{
  if(getGoogleApi()?.accounts?.oauth2){resolve();return;}
  if(gisPromise){gisPromise.then(resolve,reject);return;}
  if(!root.document?.head){reject(new Error('Le navigateur ne permet pas de charger le service Google.'));return;}
  gisPromise=new Promise((ok,no)=>{
   const existing=root.document.querySelector('script[data-turf-google-identity]');
   if(existing){existing.addEventListener('load',ok,{once:true});existing.addEventListener('error',()=>no(new Error('Impossible de charger le service de connexion Google.')),{once:true});return;}
   const script=root.document.createElement('script');
   script.src='https://accounts.google.com/gsi/client';
   script.async=true;
   script.dataset.turfGoogleIdentity='true';
   script.onload=ok;
   script.onerror=()=>no(new Error('Impossible de charger le service de connexion Google.'));
   root.document.head.appendChild(script);
  });
  gisPromise.then(resolve,reject);
 }));
 let token=null,tokenExpiresAt=0,tokenClient=null;
 function requireFetch(){if(typeof fetcher!=='function')throw new Error('Connexion Internet indisponible.');}
 function getFileId(){try{return storage?.getItem('turf-v4-drive-backup-file-id')||null;}catch(_){return null;}}
 function setFileId(id){try{storage?.setItem('turf-v4-drive-backup-file-id',id);}catch(_){throw new Error('Impossible de mémoriser la référence du fichier Drive sur cet appareil.');}}
 function clearFileId(){try{storage?.removeItem('turf-v4-drive-backup-file-id');}catch(_){}}
 async function connect(clientId){
  if(!clientId||!/^\\S+\\.apps\\.googleusercontent\\.com$/.test(clientId))throw new Error('Identifiant client Google OAuth invalide ou manquant.');
  await loadGIS();
  const googleApi=getGoogleApi();
  if(!googleApi?.accounts?.oauth2?.initTokenClient)throw new Error('Le service de connexion Google n’est pas disponible après son chargement.');
  return new Promise((resolve,reject)=>{
   tokenClient=googleApi.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPE,callback:response=>{
    if(response?.error){token=null;reject(new Error('Connexion Google refusée : '+response.error));return;}
    if(!response?.access_token){reject(new Error('Google n’a pas fourni de jeton d’accès.'));return;}
    token=response.access_token;tokenExpiresAt=Date.now()+Math.max(60,Number(response.expires_in||3600)-60)*1000;resolve({connected:true,expiresIn:Number(response.expires_in||3600)});
   },error_callback:error=>reject(new Error(error?.message||'La fenêtre de connexion Google a échoué.'))});
   tokenClient.requestAccessToken({prompt:'consent'});
  });
 }
 function auth(){if(!token||Date.now()>=tokenExpiresAt)throw new Error('La connexion Google a expiré. Reconnecte ton compte avant la sauvegarde.');return {Authorization:'Bearer '+token};}
 async function checked(response,context){if(!response.ok){let detail='';try{detail=(await response.json()).error?.message||'';}catch(_){}throw new Error(context+' ('+response.status+'). '+detail);}return response;}
 async function findBackup(){requireFetch();const q=encodeURIComponent("name='"+FILE_NAME+"' and trashed=false");const res=await checked(await fetcher(`${API}/files?q=${q}&spaces=appDataFolder&fields=files(id,name,modifiedTime,size)`,{headers:auth()}),'Recherche Drive impossible');const data=await res.json();return data.files?.[0]||null;}
 async function uploadBackup(backup){
  requireFetch();const validation=validateBackup(backup);if(!validation?.valid)throw new Error(validation?.reason||'Sauvegarde locale invalide.');
  let id=getFileId();if(!id){const existing=await findBackup();if(existing?.id)id=existing.id;}
  const metadata=id?{}:{name:FILE_NAME,mimeType:'application/json',parents:['appDataFolder']};
  const boundary='turf_backup_'+Math.random().toString(36).slice(2);
  const body='--'+boundary+'\\r\\nContent-Type: application/json; charset=UTF-8\\r\\n\\r\\n'+JSON.stringify(metadata)+'\\r\\n--'+boundary+'\\r\\nContent-Type: application/json; charset=UTF-8\\r\\n\\r\\n'+JSON.stringify(backup)+'\\r\\n--'+boundary+'--';
  const url=id?`${UPLOAD}/${encodeURIComponent(id)}?uploadType=multipart&fields=id,name,modifiedTime,size`:`${UPLOAD}?uploadType=multipart&fields=id,name,modifiedTime,size`;
  const method=id?'PATCH':'POST';
  const res=await checked(await fetcher(url,{method,headers:{...auth(),'Content-Type':'multipart/related; boundary='+boundary},body}),'Envoi de la sauvegarde vers Google Drive impossible');
  const file=await res.json();if(!file.id)throw new Error('Google Drive n’a pas confirmé l’identifiant du fichier sauvegardé.');setFileId(file.id);
  return {saved:true,fileId:file.id,modifiedTime:file.modifiedTime||null,size:Number(file.size||0)};
 }
 async function downloadBackup(){
  requireFetch();let id=getFileId();if(!id){const f=await findBackup();id=f?.id||null;}if(!id)throw new Error('Aucune sauvegarde Suivi Turf Turbo trouvée dans le dossier privé de l’application Google Drive.');
  const res=await checked(await fetcher(`${API}/files/${encodeURIComponent(id)}?alt=media`,{headers:auth()}),'Téléchargement de la sauvegarde Drive impossible');
  const data=await res.json();const check=validateBackup(data);if(!check?.valid)throw new Error('La sauvegarde téléchargée est invalide : '+(check?.reason||'format inconnu'));
  setFileId(id);return data;
 }
 function disconnect(){token=null;tokenExpiresAt=0;tokenClient=null;}
 return {connect,uploadBackup,downloadBackup,disconnect,clearFileId,isConnected:()=>!!token&&Date.now()<tokenExpiresAt,fileName:FILE_NAME,scope:SCOPE};
}
root.TurfV4GoogleDrive=createGoogleDriveBackup;
if(typeof module!=='undefined'&&module.exports)module.exports={createGoogleDriveBackup,FILE_NAME,SCOPE};
})(typeof window!=='undefined'?window:globalThis);
