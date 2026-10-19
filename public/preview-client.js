export function publicFetch(input,options={}) {
 const path=typeof input==='string'?input:'';
 if(path.startsWith('/api/'))return Promise.resolve(new Response(JSON.stringify({message:'朋友試用版不保存個人資料。請到正式站使用個人證據庫。'}),{status:403,headers:{'Content-Type':'application/json'}}));
 return globalThis.fetch(path.startsWith('/')?new URL('.'+path,import.meta.url):input,options);
}
