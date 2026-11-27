import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const BASE='https://alphaflow-observation-lab.wl03005685.chatgpt.site';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const allowed=/^\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}\.(?:html|js|mjs|css|png|svg|ico|webp|woff2?)$/;
// A successful public HTML response can include a per-request script owned by
// the hosting CDN. It is not app source and cannot run on GitHub's origin.
export function normalizeHostedIndex(html){
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>tag.includes('__CF$cv$params')&&tag.includes('/cdn-cgi/challenge-platform/')?'':tag);
}

function localAsset(ref,parent,base,{externalCss=false}={}){
 if(ref.startsWith('data:')){if(externalCss)return null;throw Error('Inline data executable UI dependency');}
 if(ref.startsWith('#'))return null;
 const url=new URL(ref,parent);
 if(url.origin!==base.origin){if(externalCss)return null;throw Error('External executable UI dependency: '+url.origin);}
 if(url.username||url.password||!allowed.test(url.pathname)||url.pathname.includes('//'))throw Error('Unsupported UI asset path: '+url.pathname);
 return url;
}
export function uiDependencies(text,url,base){
 const found=[];
 const add=(ref,options)=>{const asset=localAsset(ref,url,base,options);if(asset)found.push(asset);};
 if(url.pathname.endsWith('.html')){
  for(const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi))add(m[1]);
  for(const m of text.matchAll(/<link\b[^>]*>/gi))if(/\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/i.test(m[0])){const ref=m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(ref)add(ref,{externalCss:true});}
 }else if(/\.m?js$/.test(url.pathname)){
  for(const m of text.matchAll(/\b(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?['"]([^'"]+)['"]/g))add(m[1]);
  for(const m of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g))add(m[1]);
 }else if(url.pathname.endsWith('.css')){
  for(const m of text.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/gi))add(m[1]??m[2],{externalCss:true});
 }
 return found;
}

export function adaptPreviewIndex(html,overlay){
 if(!/<\/head>/i.test(html)||!/<\/header>/i.test(html)||!/<\/body>/i.test(html))throw Error('Source HTML layout changed; review preview overlays');
 return html.replace(/<\/head>/i,overlay.head+'</head>').replace(/<\/header>/i,'</header>'+overlay.banner).replace(/<\/body>/i,overlay.tail+'</body>');
}

function versionRef(ref,token,parent,base){
 const url=new URL(ref,parent);
 if(url.origin!==base.origin||!/\.(?:m?js|css)$/.test(url.pathname))return ref;
 const [withoutHash,fragment]=ref.split('#'),[pathname,query='']=withoutHash.split('?'),params=new URLSearchParams(query);
 params.set('ui',token);return pathname+'?'+params.toString()+(fragment?'#'+fragment:'');
}
export function versionUIReferences(text,url,base,token){
 const replace=(whole,ref)=>whole.replace(ref,versionRef(ref,token,url,base));
 if(url.pathname.endsWith('.html'))return text.replace(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi,replace);
 if(/\.m?js$/.test(url.pathname))return text.replace(/\b(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?['"]([^'"]+)['"]/g,replace).replace(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,replace);
 if(url.pathname.endsWith('.css'))return text.replace(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/gi,(whole,a,b)=>replace(whole,a??b));
 return text;
}

export async function syncPublicUI({root=new URL('../public/',import.meta.url),fetcher=fetch,base=BASE,now=()=>new Date(),overlayFile=new URL('./preview-overlay.json',import.meta.url)}={}){
 const origin=new URL(base),overlay=JSON.parse(await readFile(overlayFile,'utf8')),entries=new Map(),queue=[new URL('/index.html',origin),new URL('/third-party-data.js',origin)];let rawIndexSha256=null;
 const get=async url=>{
  const response=await fetcher(url.href,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('UI HTTP '+response.status+' at '+url.pathname);
  const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length||bytes.length>4*1024*1024)throw Error('Invalid UI asset size: '+url.pathname);
  return bytes;
 };
 while(queue.length){
  if(entries.size>150)throw Error('UI dependency graph exceeds limit');
  const url=queue.shift();if(entries.has(url.pathname))continue;
  if(['/preview-client.js','/mobile.js','/sw.js','/preview.css','/offline.html'].includes(url.pathname))throw Error('Source conflicts with a protected preview overlay: '+url.pathname);
  let bytes=await get(url);
  if(url.pathname==='/index.html'){rawIndexSha256=digest(bytes);bytes=Buffer.from(normalizeHostedIndex(bytes.toString('utf8')));}
  const text=bytes.toString('utf8');
  entries.set(url.pathname,{url,bytes});
  if(/\.(?:html|m?js|css)$/.test(url.pathname))queue.push(...uiDependencies(text,url,origin));
 }
 const originalIndex=entries.get('/index.html').bytes;
 const verifyQueue=[...entries];
 await Promise.all(Array.from({length:4},async()=>{while(verifyQueue.length){
  const [name,{url,bytes}]=verifyQueue.shift();let again=await get(url);
  if(name==='/index.html')again=Buffer.from(normalizeHostedIndex(again.toString('utf8')));
  if(digest(again)!==digest(bytes))throw Error('Source UI changed during synchronization: '+name);
 }}));
 const overlayHashes={};
 for(const name of ['preview-client.js','mobile.js','sw.js','preview.css','manifest.webmanifest'])try{overlayHashes[name]=digest(await readFile(new URL(name,root)));}catch(error){if(error.code!=='ENOENT')throw error;}
 const graphHash=digest(JSON.stringify({source:[...entries].map(([name,{bytes}])=>[name,digest(bytes)]).sort(),overlay,overlayHashes}));
 const output=new Map();
 for(const [name,{bytes,url}] of entries){
  let body=bytes;
  if(name==='/index.html')body=Buffer.from(versionUIReferences(adaptPreviewIndex(bytes.toString('utf8'),overlay),url,origin,graphHash));
  else if(/\.m?js$/.test(name)){
   const text=bytes.toString('utf8'),prefix=/\bfetch\b/.test(text)?`import {publicFetch as fetch} from '${'../'.repeat(name.slice(1).split('/').length-1)}./preview-client.js';\n`:'';
   body=Buffer.from(versionUIReferences(prefix+text,url,origin,graphHash));
   const checked=spawnSync(process.execPath,['--input-type=module','--check'],{input:body,encoding:'utf8',windowsHide:true});
   if(checked.status!==0)throw Error('Preview module syntax rejected: '+name+' '+checked.stderr.slice(0,200));
  }
  if(name.endsWith('.css'))body=Buffer.from(versionUIReferences(bytes.toString('utf8'),url,origin,graphHash));
  if(/\.(?:html|m?js|css)$/.test(name))body=Buffer.from(body.toString('utf8').replaceAll('\r\n','\n'));
  output.set(name,body);
 }
 // All network, dependency and syntax checks finish before changing public/.
 for(const [name,bytes] of output){const target=new URL(name.slice(1),root);await mkdir(new URL('./',target),{recursive:true});await writeFile(target,bytes);}
 const status={schemaVersion:1,syncedAt:now().toISOString(),source:origin.origin,rawSourceIndexSha256:rawIndexSha256,sourceIndexSha256:digest(originalIndex),sourceGraphSha256:graphHash,overlayHashes,sourceFilesVerifiedAgain:true,excludedHostingOnlyScript:'Cloudflare per-request jsd injection',files:[...entries].map(([name,{bytes}])=>({path:name,sourceSha256:digest(bytes),publishedSha256:digest(output.get(name))})).sort((a,b)=>a.path.localeCompare(b.path)),privateApisBlocked:true,previewOverlayPreserved:true};
 await writeFile(new URL('ui-sync-status.json',root),JSON.stringify(status,null,2));
 console.log(JSON.stringify({uiSyncedAt:status.syncedAt,sourceIndexSha256:status.sourceIndexSha256,uiFiles:status.files.length}));return status;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await syncPublicUI();
