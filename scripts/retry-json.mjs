const transientStatuses=new Set([408,429,500,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transientNetwork=error=>error?.name==='TimeoutError'||error?.name==='TypeError'||['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(error?.cause?.code);

// Only transport/server failures retry. Successful responses must still parse and
// pass the caller's publication/hash checks; those checks never get relaxed.
export async function getJsonWithRetry(url,{fetchFn=fetch,wait=sleep,maxAttempts=3,maxDelayMs=10000,timeoutMs=60000,now=Date.now,onRetry=()=>{}}={}){
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw Error('Invalid retry limit');
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  let response,text,error,delay=1000*2**(attempt-1);
  try{
   response=await fetchFn(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
   if(response.ok)text=await response.text();
  }catch(cause){if(!transientNetwork(cause))throw cause;error=cause;}
  if(!error&&response.ok)return {text,value:JSON.parse(text),attempts:attempt};
  if(!error){
   error=Error('HTTP '+response.status);
   if(!transientStatuses.has(response.status))throw error;
   const retryAfter=response.headers?.get('retry-after');
   if(retryAfter!==null&&retryAfter!==undefined){
    const seconds=/^\d+(?:\.\d+)?$/.test(retryAfter.trim())?Number(retryAfter)*1000:Date.parse(retryAfter)-now();
    if(Number.isFinite(seconds))delay=Math.max(delay,seconds);
   }
   if(response.body)await response.body.cancel();
  }
  if(attempt===maxAttempts)throw Error('Retry exhausted after '+attempt+' attempts: '+error.message,{cause:error});
  if(delay>maxDelayMs)throw Error('Retry-After exceeds bounded wait; stop without early retry',{cause:error});
  onRetry({attempt,nextAttempt:attempt+1,delayMs:delay,status:response?.status??null});
  await wait(delay);
 }
}
