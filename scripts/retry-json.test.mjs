import test from 'node:test';import assert from 'node:assert/strict';
import {getJsonWithRetry} from './retry-json.mjs';
test('a temporary503 retries the same URL and returns recovered JSON',async()=>{
 const calls=[],delays=[];const result=await getJsonWithRetry('https://example.test/data.json',{fetchFn:async url=>{calls.push(url);return calls.length===1?new Response('unavailable',{status:503}):new Response('{"ok":true}');},wait:async ms=>delays.push(ms)});
 assert.equal(result.value.ok,true);assert.equal(result.attempts,2);assert.deepEqual(delays,[1000]);assert.deepEqual(calls,['https://example.test/data.json','https://example.test/data.json']);
});
test('persistent503 stops at three attempts',async()=>{let count=0;const delays=[];await assert.rejects(getJsonWithRetry('x',{fetchFn:async()=>{count++;return new Response('',{status:503});},wait:async ms=>delays.push(ms)}),/exhausted after 3/);assert.equal(count,3);assert.deepEqual(delays,[1000,2000]);});
test('403 and404 stop immediately',async()=>{for(const status of [401,403,404]){let count=0;await assert.rejects(getJsonWithRetry('x',{fetchFn:async()=>{count++;return new Response('',{status});}}),new RegExp('HTTP '+status));assert.equal(count,1);}});
test('429 respects Retry-After and refuses waits beyond its bound',async()=>{
 let count=0;const delays=[];await getJsonWithRetry('x',{fetchFn:async()=>++count===1?new Response('',{status:429,headers:{'Retry-After':'4'}}):new Response('{}'),wait:async ms=>delays.push(ms)});assert.deepEqual(delays,[4000]);
 count=0;await assert.rejects(getJsonWithRetry('x',{fetchFn:async()=>{count++;return new Response('',{status:429,headers:{'Retry-After':'120'}});},wait:async()=>assert.fail('must not retry early')}),/bounded wait/);assert.equal(count,1);
});
test('network failure retries but invalid JSON and application errors do not',async()=>{
 let count=0;const result=await getJsonWithRetry('x',{fetchFn:async()=>{if(++count===1)throw new TypeError('fetch failed');return new Response('{}');},wait:async()=>{}});assert.equal(result.attempts,2);
 count=0;await assert.rejects(getJsonWithRetry('x',{fetchFn:async()=>{count++;return new Response('<html>not JSON</html>');}}),SyntaxError);assert.equal(count,1);
 count=0;await assert.rejects(getJsonWithRetry('x',{fetchFn:async()=>{count++;throw Error('application failure');}}),/application failure/);assert.equal(count,1);
});
test('body transport timeout retries before JSON parsing',async()=>{let count=0;const result=await getJsonWithRetry('x',{fetchFn:async()=>{if(++count===1)return {ok:true,text:async()=>{throw Object.assign(Error('body timeout'),{name:'TimeoutError'});}};return new Response('{}');},wait:async()=>{}});assert.equal(result.attempts,2);});
