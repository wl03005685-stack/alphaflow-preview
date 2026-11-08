import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const fixtureCode=String.raw`
import fs from 'node:fs';import {createHash} from 'node:crypto';
const mode=process.env.SYNC_TEST_MODE,counts={};
const raw=JSON.stringify({fundSymbol:'00981A',asOf:'2026-11-06',holdings:[{symbol:'2330',shares:1000,weightPercent:10}]});
globalThis.fetch=async url=>{
 const name=new URL(url).pathname.slice(1);counts[name]=(counts[name]||0)+1;
 if(name==='snapshot.json'){
  if(mode==='503-always'||mode==='503-once'&&counts[name]===1)return new Response('unavailable',{status:503});
  if(mode==='403')return new Response('blocked',{status:403});
  if(mode==='invalid-json')return new Response('<html>error</html>');
  return new Response(raw);
 }
 if(name==='update-status.json')return new Response(JSON.stringify({contentId:mode==='mixed'&&counts[name]>=3?'version2':'version1',funds:[]}));
 if(name==='catalog.json')return new Response(JSON.stringify({snapshots:[{path:'/snapshot.json'}]}));
 if(name==='tracking-data.json')return new Response(JSON.stringify({snapshots:[{path:'/snapshot.json',sha256:mode==='bad-hash'?'bad':createHash('sha256').update(raw).digest('hex')}]}));
 throw Error('Unexpected URL '+url);
};
process.on('exit',()=>fs.writeFileSync(new URL('./counts.json',import.meta.url),JSON.stringify(counts)));
`;
function run(mode){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'af-preview-sync-'));fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(path.join(dir,'public'));
 for(const file of ['sync-public-data.mjs','retry-json.mjs'])fs.copyFileSync(new URL('./'+file,import.meta.url),path.join(dir,'scripts',file));
 fs.writeFileSync(path.join(dir,'scripts/public-files.json'),JSON.stringify(['update-status.json','catalog.json','tracking-data.json']));
 fs.writeFileSync(path.join(dir,'mock.mjs'),fixtureCode);fs.writeFileSync(path.join(dir,'public/sentinel.txt'),'original');
 const result=spawnSync(process.execPath,['--import',path.join(dir,'mock.mjs'),path.join(dir,'scripts/sync-public-data.mjs')],{encoding:'utf8',env:{...process.env,SYNC_TEST_MODE:mode}});
 return {dir,result,counts:JSON.parse(fs.readFileSync(path.join(dir,'counts.json'),'utf8'))};
}
test('complete sync recovers a503 and validates holdings before publishing files',()=>{
 const {dir,result,counts}=run('503-once');try{assert.equal(result.status,0,result.stderr);assert.equal(counts['snapshot.json'],2);const s=JSON.parse(fs.readFileSync(path.join(dir,'public/sync-status.json'),'utf8'));assert.equal(s.retryCount,1);assert.equal(s.sourceContentId,'version1');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'public/snapshot.json'),'utf8')).holdings[0].shares,1000);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
for(const mode of ['503-always','403','invalid-json','mixed','bad-hash'])test('failed '+mode+' sync preserves the previous complete output',()=>{
 const {dir,result,counts}=run(mode);try{assert.notEqual(result.status,0);assert.deepEqual(fs.readdirSync(path.join(dir,'public')),['sentinel.txt']);assert.equal(fs.readFileSync(path.join(dir,'public/sentinel.txt'),'utf8'),'original');if(mode==='503-always')assert.equal(counts['snapshot.json'],3);if(mode==='403'||mode==='invalid-json')assert.equal(counts['snapshot.json'],1);if(mode==='mixed')assert.match(result.stderr,/Source updated/);if(mode==='bad-hash')assert.match(result.stderr,/hash mismatch/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
