/* Suivi Turf Turbo V4 — adaptateur PDF.js.
 * Le PDF est lu localement dans le navigateur. Ce module ne fait aucun OCR.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TurfV4PdfReader=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX_FILE_BYTES=20*1024*1024;
const MAX_PAGES=30;
async function extractFile(file,pdfjs,layout,options={}){
 if(!file)throw new Error('Sélectionne un fichier PDF.');
 if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name||''))throw new Error('Le fichier sélectionné ne semble pas être un PDF.');
 const maxBytes=options.maxFileBytes||MAX_FILE_BYTES,maxPages=options.maxPages||MAX_PAGES;
 if(Number(file.size)>maxBytes)throw new Error(`Fichier trop volumineux : limite de ${Math.round(maxBytes/1024/1024)} Mo.`);
 if(!pdfjs||typeof pdfjs.getDocument!=='function')throw new Error('La bibliothèque PDF.js n’est pas disponible. Vérifie ta connexion Internet puis réessaie.');
 if(!layout||typeof layout.reconstructDocument!=='function')throw new Error('Le module de reconstruction des tableaux PDF est indisponible.');
 const buffer=await file.arrayBuffer();
 const task=pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false});
 let doc;
 try{doc=await task.promise;}catch(e){throw new Error('PDF illisible ou protégé : '+(e?.message||'erreur de lecture'));}
 try{
  if(!Number.isInteger(doc.numPages)||doc.numPages<1)throw new Error('Le PDF ne contient aucune page exploitable.');
  if(doc.numPages>maxPages)throw new Error(`Ce PDF contient ${doc.numPages} pages. Limite actuelle : ${maxPages}. Découpe le document et réessaie.`);
  const pages=[];
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n);
   const content=await page.getTextContent({includeMarkedContent:false});
   pages.push({items:content.items||[]});
   page.cleanup?.();
  }
  const result=layout.reconstructDocument(pages);
  return {...result,fileName:file.name||'document.pdf',fileSize:Number(file.size)||buffer.byteLength,pageCount:doc.numPages,method:'Texte natif PDF extrait localement avec PDF.js',ocr:false};
 }finally{try{await doc.destroy?.();}catch(_){}}
}
return {extractFile,MAX_FILE_BYTES,MAX_PAGES};
});
