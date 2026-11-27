import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {publicFetch} from '../public/preview-client.js';
import {loadMarketData} from '../public/overseas-market.js';
import {loadReadinessContext} from '../public/morning-readiness.js';

test('readiness scope and snapshots load below the friends repository without duplicating requests',async()=>{
 const original=globalThis.fetch,seen=[],root=new URL('../public/',import.meta.url).href;
 const snapshot=(fundSymbol,assets,symbol)=>({fundSymbol,asOf:'2026-10-23',observation:{netAssetsTwd:assets},holdings:[{symbol}]});
 const big=snapshot('00981A',10000000000,'2330'),small=snapshot('00995A',5000000000,'7777');
 const files={'tracking-data.json':{snapshots:[{path:'/big.json',fundSymbol:big.fundSymbol,asOf:big.asOf},{path:'/small.json',fundSymbol:small.fundSymbol,asOf:small.asOf}]},'big.json':big,'small.json':small};
 try{globalThis.fetch=async url=>{seen.push(url.href);assert.ok(url.href.startsWith(root));return new Response(JSON.stringify(files[url.href.slice(root.length)]));};
  const scope=await loadReadinessContext();assert.equal(scope.scopeKnown,true);assert.deepEqual(scope.funds,['00981A']);assert.equal(scope.excludedCount,1);assert.equal(seen.length,3);assert.ok(!scope.expectedPrices.some(p=>p.symbol==='7777'));
 }finally{globalThis.fetch=original;}
});
test('backtest default market loader uses repository-relative URLs',async()=>{const original=globalThis.fetch,seen=[];try{globalThis.fetch=async url=>{seen.push(url.href);return new Response('{}',{status:seen.length===1?200:404});};const market=await loadMarketData();assert.equal(market.overseas.unavailable,true);assert.equal(seen[0],new URL('../public/market-data.json',import.meta.url).href);}finally{globalThis.fetch=original;}});
test('public mirror blocks private writes and lists',async()=>{for(const method of ['GET','POST']){const r=await publicFetch('/api/snapshots',{method});assert.equal(r.status,403);assert.match((await r.json()).message,/不保存個人資料/);}});
test('root data requests resolve below repository path',async()=>{const original=globalThis.fetch;try{globalThis.fetch=async url=>url;const url=await publicFetch('/catalog.json');assert.equal(url.href,new URL('../public/catalog.json',import.meta.url).href);}finally{globalThis.fetch=original;}});

test('private APIs are blocked for relative, encoded, URL and Request inputs before any network or body consumption',async()=>{
 const original=globalThis.fetch;let networkCalls=0;
 try{
  globalThis.fetch=async()=>{networkCalls++;throw Error('Private API must not reach native fetch');};
  const request=new Request('https://example.com/alphaflow-preview/api/snapshots',{method:'POST',body:'private body'});
  const inputs=['/api','/api/snapshots','api/snapshots','./api/snapshots','../api/snapshots','/alphaflow-preview/api/snapshots','/%61%70%69/snapshots','/%2fapi%2fsnapshots','/%2561pi/snapshots','/%61pi/bad%zz','/a%5capi%5csnapshots','https://other.example/api/snapshots','//other.example/api/snapshots',new URL('https://other.example/alphaflow-preview/%61pi/snapshots'),request];
  for(const input of inputs){const response=await publicFetch(input,{method:'POST'});assert.equal(response.status,403,String(input));assert.match((await response.json()).message,/不保存個人資料/);}
  assert.equal(networkCalls,0);assert.equal(request.bodyUsed,false);
 }finally{globalThis.fetch=original;}
});

test('root URL and Request data paths map into the repository while preserving fetch options and request semantics',async()=>{
 const original=globalThis.fetch,base=new URL('../public/',import.meta.url),options={cache:'no-store',headers:{'X-Override':'two'}};
 try{
  globalThis.fetch=async(input,passed)=>{
   assert.equal(passed,undefined);
   const effective=new Request(input,passed);assert.equal(effective.url,new URL('market-data.json?revision=one',base).href);
   assert.equal(effective.method,'POST');assert.equal(effective.cache,'no-store');assert.equal(effective.headers.get('X-Override'),'two');assert.equal(effective.headers.get('X-Request'),null);assert.equal(await effective.text(),'original body');return new Response('ok');
  };
  const input=new Request(new URL('/market-data.json?revision=one',base),{method:'POST',headers:{'X-Request':'one'},body:'original body'});
  assert.equal((await publicFetch(input,options)).status,200);
  globalThis.fetch=async(input,passed)=>{assert.equal(passed,options);assert.equal(input.href,new URL('catalog.json?revision=two',base).href);return new Response('ok');};
  assert.equal((await publicFetch(new URL('/catalog.json?revision=two',base),options)).status,200);
 }finally{globalThis.fetch=original;}
});

test('Request body overrides survive repository routing even after the original body was consumed',async()=>{
 const original=globalThis.fetch,base=new URL('../public/',import.meta.url),request=new Request(new URL('/market-data.json',base),{method:'POST',body:'old body'});await request.text();
 try{globalThis.fetch=async input=>{assert.equal(input.url,new URL('market-data.json',base).href);assert.equal(input.method,'POST');assert.equal(await input.text(),'replacement body');return new Response('ok');};assert.equal((await publicFetch(request,{body:'replacement body'})).status,200);}finally{globalThis.fetch=original;}
});

test('already repository-scoped and external non-API requests retain their original input and options',async()=>{
 const original=globalThis.fetch,options={method:'GET',cache:'no-store'},inputs=[new URL('../public/catalog.json',import.meta.url),new URL('https://external.example/catalog.json'),'catalog.json','/api-notes.json'];
 try{
  for(const input of inputs){globalThis.fetch=async(value,passed)=>{assert.equal(passed,options);if(input==='/api-notes.json')assert.equal(value.href,new URL('../public/api-notes.json',import.meta.url).href);else assert.equal(value,input);return new Response('ok');};assert.equal((await publicFetch(input,options)).status,200);}
 }finally{globalThis.fetch=original;}
});
test('install manifest, icons and script imports are present',async()=>{const root=new URL('../public/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root)));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.ok((await readFile(new URL(icon.src,root))).length>100);for(const f of await readdir(root)){if(!/\.m?js$/.test(f))continue;const text=await readFile(new URL(f,root),'utf8');for(const m of text.matchAll(/from ['"](\.\/[^'"]+)['"]/g))await readFile(new URL(m[1],root));}});
