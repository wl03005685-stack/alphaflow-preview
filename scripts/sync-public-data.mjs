import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const base='https://alphaflow-observation-lab.wl03005685.chatgpt.site',root=new URL('../public/',import.meta.url);
async function get(name){if(!/^[a-zA-Z0-9-]+\.json$/.test(name))throw Error('Invalid public filename');const r=await fetch(base+'/'+name,{cache:'no-store',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(name+': '+r.status);const text=await r.text();return {text,value:JSON.parse(text)};}
const before=await get('update-status.json'),catalog=await get('catalog.json'),tracking=await get('tracking-data.json');
const names=new Set(JSON.parse(await readFile(new URL('./public-files.json',import.meta.url))));
for(const s of catalog.value.snapshots)names.add(s.path.replace(/^\//,''));
const queue=[...names],files=new Map();await Promise.all(Array.from({length:6},async()=>{while(queue.length){const name=queue.shift(),data=await get(name);files.set(name,data.text);}}));
const after=await get('update-status.json');if(before.value.contentId!==after.value.contentId)throw Error('Source updated during sync. Retry without publishing mixed data.');
for(const s of tracking.value.snapshots){const text=files.get(s.path.slice(1));if(!text||createHash('sha256').update(text).digest('hex')!==s.sha256)throw Error('Snapshot hash mismatch: '+s.path);}
for(const [name,text] of files)await writeFile(new URL(name,root),text);
const status={syncedAt:new Date().toISOString(),source:base,sourceContentId:after.value.contentId,files:files.size,snapshots:catalog.value.snapshots.length,funds:after.value.funds.map(f=>({symbol:f.fundSymbol,asOf:f.latestSavedAsOf,acquisition:f.acquisition}))};
await writeFile(new URL('sync-status.json',root),JSON.stringify(status,null,2));console.log(JSON.stringify(status));
