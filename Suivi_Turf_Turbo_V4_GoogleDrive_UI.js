(() => {
'use strict';
const DriveFactory=window.TurfV4GoogleDrive;
const Backup=window.TurfV4Backup;
if(!DriveFactory||!Backup)return;
const STORAGE_KEY='suivi-turf-turbo-v4-races-v1';
const SNAPSHOT_KEY=STORAGE_KEY+'-previous-snapshot';
const CLIENT_KEY='turf-v4-google-client-id';
const $=id=>document.getElementById(id);
const backupCard=$('backupInput')?.closest('.card');
if(!backupCard)return;
const panel=document.createElement('section');
panel.className='card';
panel.innerHTML=`
 <h2>8 bis. Sauvegarde privée Google Drive</h2>
 <p class="hint">La sauvegarde est envoyée dans l’espace privé de l’application Google Drive. Le fichier JSON local reste disponible comme solution de secours. Une connexion Internet est nécessaire.</p>
 <label>Identifiant client OAuth Google
  <input id="turfDriveClientId" type="text" autocomplete="off" placeholder="xxxxx.apps.googleusercontent.com">
 </label>
 <div class="actions">
  <button type="button" id="turfDriveConnect">Connecter Google</button>
  <button type="button" id="turfDriveDisconnect" class="secondary">Déconnecter</button>
 </div>
 <div class="actions">
  <button type="button" id="turfDriveUpload" class="secondary">Envoyer la sauvegarde maintenant</button>
  <button type="button" id="turfDriveRestore" class="secondary">Restaurer depuis Google Drive</button>
 </div>
 <p id="turfDriveStatus" class="status" role="status" aria-live="polite">Google Drive n’est pas connecté.</p>
 <p class="small">L’identifiant client n’est pas un mot de passe. Configure dans Google Cloud l’origine exacte de l’application publiée et active l’API Google Drive. Autorisation demandée : accès au dossier privé de l’application uniquement.</p>
`;
backupCard.insertAdjacentElement('afterend',panel);
const clientInput=$('turfDriveClientId'),status=$('turfDriveStatus');
try{clientInput.value=localStorage.getItem(CLIENT_KEY)||'';}catch(_){}
let drive=null,uploadBusy=false;
function setStatus(message,type=''){status.className='status '+type;status.textContent=message;}
function getDrive(){if(!drive)drive=DriveFactory({validateBackup:Backup.validateBackup});return drive;}
getDrive().prepare().then(()=>setStatus('Service Google chargé. Identifiant OAuth requis pour connecter le compte.','')).catch(error=>setStatus('Service Google indisponible : '+error.message,'warn'));
function buildLocalBackup(){
 const races=Backup.readStoredRaces(localStorage,STORAGE_KEY);
 return Backup.buildBackup(races);
}
async function uploadWithRetry(reason){
 if(uploadBusy)return;
 const api=getDrive();
 if(!api.isConnected()){if(reason==='envoi manuel')setStatus('Connecte d’abord ton compte Google pour envoyer la sauvegarde.','warn');return;}
 uploadBusy=true;
 try{
  const backup=buildLocalBackup();
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const result=await api.uploadBackup(backup);
    setStatus(`Sauvegarde Google Drive confirmée · ${backup.races.length} course(s) · ${result.modifiedTime?new Date(result.modifiedTime).toLocaleString():'date non fournie'}.`,'good');
    return;
   }catch(error){lastError=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
  }
  throw lastError;
 }catch(error){setStatus(`Sauvegarde locale conservée. Échec de la copie Google Drive (${reason}) : ${error.message}`,'warn');}
 finally{uploadBusy=false;}
}
$('turfDriveConnect').addEventListener('click',async()=>{
 const clientId=clientInput.value.trim();
 if(!clientId){setStatus('Saisis d’abord l’identifiant client OAuth Google.','warn');return;}
 try{localStorage.setItem(CLIENT_KEY,clientId);setStatus('Ouverture de la connexion Google…');await getDrive().connect(clientId);setStatus('Compte Google connecté. Tu peux envoyer ou restaurer une sauvegarde.','good');}
 catch(error){setStatus('Connexion Google impossible : '+error.message,'bad');}
});
$('turfDriveDisconnect').addEventListener('click',()=>{if(drive)drive.disconnect();setStatus('Connexion Google interrompue sur cet appareil.','');});
$('turfDriveUpload').addEventListener('click',()=>uploadWithRetry('envoi manuel'));
$('turfDriveRestore').addEventListener('click',async()=>{
 try{
  const api=getDrive();
  if(!api.isConnected())throw new Error('Connecte d’abord ton compte Google.');
  if(!window.confirm('Télécharger la sauvegarde Google Drive et fusionner les courses ? Les courses locales existantes ne seront pas écrasées. Les conflits seront exportés séparément.'))return;
  setStatus('Téléchargement de la sauvegarde Google Drive…');
  const remote=await api.downloadBackup();
  const incoming=remote.races.map(r=>window.TurfV4DataCore?.normalizeRace?window.TurfV4DataCore.normalizeRace(r):r);
  const existing=Backup.readStoredRaces(localStorage,STORAGE_KEY);
  const merged=Backup.mergeRaces(existing,incoming);
  Backup.writeStoredRaces(localStorage,STORAGE_KEY,SNAPSHOT_KEY,merged.races);
  if(merged.conflictItems.length){
   const blob=new Blob([JSON.stringify({app:'Suivi Turf Turbo V4',exportType:'restore-conflicts',createdAt:new Date().toISOString(),conflicts:merged.conflictItems},null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='suivi-turf-v4-conflits-drive-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  setStatus(`Restauration locale terminée : ${merged.added} ajoutée(s), ${merged.duplicates} doublon(s) ignoré(s), ${merged.conflicts} conflit(s) exporté(s). Aucune course locale existante n’a été écrasée. Recharge la page pour actualiser la liste.`,merged.conflicts?'warn':'good');
 }catch(error){setStatus('Restauration Google Drive impossible : '+error.message,'bad');}
});
$('save')?.addEventListener('click',()=>setTimeout(()=>{const message=$('readiness')?.textContent||'';if(message.includes('Course enregistrée localement.'))uploadWithRetry('après enregistrement local');},0));
})();
