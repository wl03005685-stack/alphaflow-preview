export async function holdingsDigest(s){
 const body=JSON.stringify({fundSymbol:s.fundSymbol,asOf:s.asOf,fundUnits:s.fundUnits,holdings:[...s.holdings].sort((a,b)=>a.symbol.localeCompare(b.symbol))});
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function attachObservedEvidence(f,audit,load){
 const snapshots=new Map();
 const dates=await Promise.all(f.dates.map(async d=>{
  const row={...d,observedEvidence:null},matches=(audit?.records??[]).filter(e=>e.fundSymbol===f.fundSymbol&&e.asOf===d.asOf);
  if(matches.length!==1||matches[0].hasContentConflict||!/^\/[a-zA-Z0-9-]+\.json$/.test(d.path??''))return row;
  const e=matches[0];
  try{const s=await load(d.path);if(s.fundSymbol!==f.fundSymbol||s.asOf!==d.asOf||s.sourceUrl!==e.sourceUrl||await holdingsDigest(s)!==e.holdingsSha256)return row;
   snapshots.set(d.asOf,s);row.observedEvidence={observedBy:e.earliestVerifiedObservation,holdingsSha256:e.holdingsSha256,sourceUrl:e.sourceUrl,runId:e.observations[0]?.runId??null};
  }catch{/* No fallback to dates without matching content. */}
  return row;
 }));
 const pairs=f.pairs.map(p=>{
  const a=snapshots.get(p.from),b=snapshots.get(p.to);let observationPairMatched=false;
  if(a&&b&&p.beforePath===f.dates.find(d=>d.asOf===p.from)?.path&&p.afterPath===f.dates.find(d=>d.asOf===p.to)?.path&&p.beforeUnits===a.fundUnits&&p.afterUnits===b.fundUnits){const A=new Map(a.holdings.map(r=>[r.symbol,r.shares])),B=new Map(b.holdings.map(r=>[r.symbol,r.shares])),symbols=new Set([...A.keys(),...B.keys()]);
   observationPairMatched=p.rows.length===symbols.size&&new Set(p.rows.map(r=>r.symbol)).size===symbols.size&&p.rows.every(r=>{const x=A.get(r.symbol)??0,y=B.get(r.symbol)??0,n=a.fundUnits&&b.fundUnits?(y/b.fundUnits-x/a.fundUnits)*1e6:null;return symbols.has(r.symbol)&&r.beforeShares===x&&r.afterShares===y&&r.delta===y-x&&(n===null?r.perMillionUnitsChange===null:Number.isFinite(r.perMillionUnitsChange)&&Math.abs(r.perMillionUnitsChange-n)<1e-8);});
  }
  return {...p,observationPairMatched};
 });
 return {...f,dates,pairs};
}
