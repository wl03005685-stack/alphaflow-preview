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
test('install manifest, icons and script imports are present',async()=>{const root=new URL('../public/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root)));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.ok((await readFile(new URL(icon.src,root))).length>100);for(const f of await readdir(root)){if(!/\.m?js$/.test(f))continue;const text=await readFile(new URL(f,root),'utf8');for(const m of text.matchAll(/from ['"](\.\/[^'"]+)['"]/g))await readFile(new URL(m[1],root));}});
