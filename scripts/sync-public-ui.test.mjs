import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {syncPublicUI,normalizeHostedIndex,uiDependencies} from './sync-public-ui.mjs';
import {verifyPreviewUI} from './verify-preview-ui.mjs';
const BASE='https://alphaflow-observation-lab.wl03005685.chatgpt.site';
const overlay={head:'<link rel="manifest" href="manifest.webmanifest">',banner:'<section>朋友試用版</section>',tail:'<dialog id="private-help"></dialog><script src="mobile.js"></script>'};
const html='<html><head><link rel="stylesheet" href="style.css?v=99"></head><body><header>Site</header><script type="module" src="app.js?v=99"></script></body></html>';
const files={'/index.html':html,'/style.css':"@import url('https://fonts.googleapis.com/css2?family=Example'); body{color:navy}",
 '/app.js':"import {value} from './nested/new.js?v=99'; export const load=()=>fetch('/tracking-data.json');",
 '/nested/new.js':"export {value} from '../data.mjs';",'/data.mjs':'export const value=2;',
 '/third-party-data.js':'export const schemaVersion=1;'};
async function fixture(run){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'af-preview-ui-')),pub=path.join(dir,'public');await fs.mkdir(pub);
 const overlayFile=path.join(dir,'overlay.json');await fs.writeFile(overlayFile,JSON.stringify(overlay));
 await fs.writeFile(path.join(pub,'sentinel.txt'),'original');
 try{await run({root:pathToFileURL(pub+'/'),pub,overlayFile:pathToFileURL(overlayFile)});}
 finally{await fs.rm(dir,{recursive:true,force:true});}
}
function fetcherFor(source=files){const requested=[];return {requested,fetcher:async url=>{const u=new URL(url);assert.equal(u.origin,BASE);requested.push(u.pathname);return new Response(source[u.pathname]??'missing',{status:source[u.pathname]===undefined?404:200});}};}

test('UI sync discovers new and nested modules, retains source revisions and protects repository paths before deployment',async()=>fixture(async options=>{
 const mock=fetcherFor(),s=await syncPublicUI({...options,...mock});
 assert.equal(s.files.length,6);assert.ok(mock.requested.includes('/nested/new.js'));assert.ok(mock.requested.includes('/data.mjs'));assert.ok(!mock.requested.some(s=>s.includes('fonts')));
 const index=await fs.readFile(path.join(options.pub,'index.html'),'utf8'),app=await fs.readFile(path.join(options.pub,'app.js'),'utf8');
 assert.match(index,/app.js\?v=99/);assert.match(index,/朋友試用版/);assert.match(index,/private-help/);assert.match(app,/publicFetch as fetch/);
 assert.ok(index.includes('ui='+s.sourceGraphSha256));assert.ok(app.includes('new.js?v=99&ui='+s.sourceGraphSha256));assert.ok(app.includes('preview-client.js?ui='+s.sourceGraphSha256));
 assert.equal(await fs.readFile(path.join(options.pub,'sentinel.txt'),'utf8'),'original');
 const row=s.files.find(f=>f.path==='/app.js');assert.notEqual(row.sourceSha256,row.publishedSha256);
 assert.equal(createHash('sha256').update(app).digest('hex'),row.publishedSha256);
}));

test('hosting-only request injection is excluded while application inline scripts remain intact',async()=>fixture(async options=>{
 let count=0;const mock=fetcherFor();
 const fetcher=async url=>new URL(url).pathname==='/index.html'?new Response(html.replace('</body>',"<script>window.__CF$cv$params={r:'"+(++count)+"'};const u='/cdn-cgi/challenge-platform/jsd';</script><script>window.appSetting=1;</script></body>")):mock.fetcher(url);
 await syncPublicUI({...options,fetcher});
 const index=await fs.readFile(path.join(options.pub,'index.html'),'utf8');assert.doesNotMatch(index,/__CF\$cv/);assert.match(index,/window.appSetting=1/);
 assert.equal(normalizeHostedIndex('<script>window.appSetting=2;</script>'),'<script>window.appSetting=2;</script>');
}));

for(const mode of ['missing','syntax','source-change','module-change','external','protected','data-script'])test('failed '+mode+' UI sync cannot replace the previous public output',async()=>fixture(async options=>{
 const source={...files};if(mode==='missing')delete source['/nested/new.js'];
 if(mode==='syntax')source['/data.mjs']='export const = broken;';
 if(mode==='external')source['/app.js']="import 'https://evil.example/script.js';";
 if(mode==='protected')source['/app.js']="import './preview-client.js';";
 if(mode==='data-script')source['/app.js']="import 'data:text/javascript,export default 1';";
 let count=0,moduleCount=0;const mock=fetcherFor(source),fetcher=async url=>mode==='source-change'&&new URL(url).pathname==='/index.html'&&++count===2?new Response(html.replace('v=99','v=100')):mode==='module-change'&&new URL(url).pathname==='/data.mjs'&&++moduleCount===2?new Response('export const value=3;'):mock.fetcher(url);
 await assert.rejects(syncPublicUI({...options,fetcher}));assert.deepEqual(await fs.readdir(options.pub),['sentinel.txt']);
}));

test('multiline and dynamic literal dependencies are followed, and cross-origin scripts are rejected',()=>{
 const deps=uiDependencies("import {\n thing\n} from './one.js'; const two=()=>import('./two.mjs');",new URL('/app.js',BASE),new URL(BASE));
 assert.deepEqual(deps.map(x=>x.pathname),['/one.js','/two.mjs']);
 assert.throws(()=>uiDependencies('<script src="https://evil.example/x.js"></script>',new URL('/index.html',BASE),new URL(BASE)),/External executable/);
});

test('pre-deploy UI verification rejects a modified module even when all JSON data succeeded',async()=>fixture(async options=>{
 await syncPublicUI({...options,...fetcherFor()});
 for(const name of ['mobile.js','sw.js','offline.html','preview.css','manifest.webmanifest','icon-192.png','icon-512.png'])await fs.writeFile(path.join(options.pub,name),'fixture');
 await fs.writeFile(path.join(options.pub,'preview-client.js'),await fs.readFile(new URL('../public/preview-client.js',import.meta.url),'utf8'));
 await verifyPreviewUI(options.root);await fs.appendFile(path.join(options.pub,'data.mjs'),'\n// changed');
 await assert.rejects(verifyPreviewUI(options.root),/hash mismatch/);
}));
