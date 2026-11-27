import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyPreviewUI(root=new URL('../public/',import.meta.url)){
 const status=JSON.parse(await readFile(new URL('ui-sync-status.json',root),'utf8'));
 if(status.schemaVersion!==1||!Array.isArray(status.files)||!status.files.length||status.source!=='https://alphaflow-observation-lab.wl03005685.chatgpt.site'||status.privateApisBlocked!==true||status.previewOverlayPreserved!==true||status.sourceFilesVerifiedAgain!==true||!/^[a-f0-9]{64}$/.test(status.sourceGraphSha256??''))throw Error('Missing synchronized UI evidence');
 const seen=new Set();
 for(const file of status.files){
  if(!/^\/[A-Za-z0-9][A-Za-z0-9._/-]+\.(?:html|js|mjs|css|png|svg|ico|webp|woff2?)$/.test(file.path)||file.path.includes('..')||seen.has(file.path))throw Error('Invalid UI evidence path');
  seen.add(file.path);
  if(digest(await readFile(new URL(file.path.slice(1),root)))!==file.publishedSha256)throw Error('Synchronized UI hash mismatch: '+file.path);
 }
 if(!seen.has('/index.html'))throw Error('Missing UI entrypoint');
 for(const [name,hash] of Object.entries(status.overlayHashes??{}))if(!['preview-client.js','mobile.js','sw.js','preview.css','manifest.webmanifest'].includes(name)||digest(await readFile(new URL(name,root)))!==hash)throw Error('Preview overlay hash mismatch: '+name);
 const index=await readFile(new URL('index.html',root),'utf8');
 if(!index.includes('朋友試用版')||!index.includes('mobile.js')||!index.includes('manifest.webmanifest')||!index.includes('private-help'))throw Error('Preview overlays missing');
 const {publicFetch}=await import(new URL('preview-client.js?verify='+status.sourceGraphSha256,root));
 const originalFetch=globalThis.fetch;let networkCalls=0;
 try{
  globalThis.fetch=async()=>{networkCalls++;throw Error('Private API reached network');};
  for(const input of ['/api/snapshots','api/snapshots','/%61pi/snapshots',new URL('https://friends.example/app/api/snapshots'),new Request('https://friends.example/api/snapshots',{method:'POST',body:'verification-only'})]){
   const response=await publicFetch(input);if(response.status!==403)throw Error('Private API isolation missing');
  }
 }finally{globalThis.fetch=originalFetch;}
 if(networkCalls)throw Error('Private API isolation reached network');
 for(const file of ['mobile.js','sw.js','offline.html','preview.css','manifest.webmanifest','icon-192.png','icon-512.png'])await readFile(new URL(file,root));
 console.log(JSON.stringify({uiVerified:true,sourceIndexSha256:status.sourceIndexSha256,uiFiles:status.files.length}));return status;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await verifyPreviewUI();
