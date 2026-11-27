function privateApiPath(url){
 let path=url.pathname;
 for(let round=0;round<16;round++){
  path=path.replaceAll('\\','/');
  if(/(?:^|\/)api(?:\/|$)/i.test(path))return true;
  let decoded;try{decoded=decodeURIComponent(path);}catch{decoded=path.replace(/%([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));}
  if(decoded===path)return false;
  path=decoded;
 }
 // Do not pass an ambiguously deep encoded path through to a different origin.
 return true;
}

export function publicFetch(input,options={}) {
 const request=typeof Request!=='undefined'&&input instanceof Request;
 let url;try{url=new URL(request?input.url:String(input),import.meta.url);}catch{return globalThis.fetch(input,options);}
 if(privateApiPath(url))return Promise.resolve(new Response(JSON.stringify({message:'朋友試用版不保存個人資料。請到正式站使用個人證據庫。'}),{status:403,headers:{'Content-Type':'application/json'}}));
 const base=new URL('./',import.meta.url),absoluteInput=request||input instanceof URL||typeof input==='string'&&input.startsWith('/')&&!input.startsWith('//');
 if(absoluteInput&&url.protocol===base.protocol&&url.origin===base.origin&&!url.pathname.startsWith(base.pathname)){
  const pathname=url.protocol==='file:'?url.pathname.replace(/^\/[A-Za-z]:(?=\/)/,''):url.pathname;
  const mapped=new URL('.'+pathname+url.search+url.hash,base);
  // Apply RequestInit overrides before copying the body: a replacement body
  // can be valid even when the original request body has already been used.
  if(request)return globalThis.fetch(new Request(mapped,new Request(input,options)));
  return globalThis.fetch(mapped,options);
 }
 return globalThis.fetch(input,options);
}
