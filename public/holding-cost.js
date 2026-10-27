import {fundNames} from './interval-report.js?v=71';
import {periodReference,actionReasons,latestPriceFor} from './cost-basis.js?v=78';

const issuers={ezmoney:'統一投信',yuanta:'元大投信',fubon:'富邦投信',capital:'群益投信',allianz:'安聯投信',fuhhwa:'復華投信',ctbc:'中信投信',taishin:'台新投信',mega:'兆豐投信',kgi:'凱基投信',first:'第一金投信',sinopac:'永豐投信',cathay:'國泰投信',nomura:'野村投信'};
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const validShares=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const positive=n=>validShares(n)&&n>0;
const priorDate=d=>new Date(Date.parse(d+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const key=(a,b)=>a+'|'+b;

// Build complete observed inventories, including unchanged and zero positions.
// Empty rows in a complete snapshot mean absent holdings, never a missing price.
function observations(f,snapshots,to){
 const dates=new Map(),links=new Map(),conflictedSymbols=new Set();
 function add(date,path,units,holdings){
  if(!validDate(date)||date>to)return;
  const rows=new Map(),seen=new Map();
  for(const r of holdings){
   if(!validShares(r.shares)||(seen.has(r.symbol)&&seen.get(r.symbol)!==r.shares))conflictedSymbols.add(r.symbol);
   seen.set(r.symbol,r.shares);
   if(positive(r.shares))rows.set(r.symbol,{...r});
  }
  const old=dates.get(date);
  if(old){const symbols=new Set([...old.rows.keys(),...rows.keys()]);for(const s of symbols)if((old.rows.get(s)?.shares??0)!==(rows.get(s)?.shares??0))conflictedSymbols.add(s);return;}
  dates.set(date,{date,path,units,rows});
 }
 for(const p of f.pairs??[]){
  if(!validDate(p.from)||!validDate(p.to)||p.from>=p.to)continue;
  add(p.from,p.beforePath,p.beforeUnits,(p.rows??[]).map(r=>({symbol:r.symbol,name:r.name,shares:r.beforeShares})));
  add(p.to,p.afterPath,p.afterUnits,(p.rows??[]).map(r=>({symbol:r.symbol,name:r.name,shares:r.afterShares})));
  if(p.to<=to)links.set(key(p.from,p.to),p);
 }
 for(const s of snapshots.filter(s=>s?.fundSymbol===f.fundSymbol&&(!s.sourceId||s.sourceId===f.sourceId)))add(s.asOf,s.path,s.fundUnits,s.holdings??[]);
 return {points:[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)),links,conflictedSymbols};
}

function estimate(f,symbol,obs,market,actions,opening){
 const {points,links,conflictedSymbols}=obs,first=points[0],last=points.at(-1);
 let shares=first.rows.get(symbol)?.shares??0,covered=0,cost=0,low=0,high=0,seeded=0;
 const warnings=new Set(),history=[];
 function clear(){covered=0;cost=0;low=0;high=0;seeded=0;}
 if(shares>0){
  if(opening==='market'){
   const seed=periodReference({from:priorDate(first.date),to:first.date},symbol,market).reference;
   if(seed){covered=shares;seeded=shares;cost=shares*seed.vwap;low=shares*seed.low;high=shares*seed.high;warnings.add('含期初當日市價假設');}
   else warnings.add('期初當日行情不足');
  }else warnings.add('期初持股買價未知');
 }
 const openingPoint={to:first.date,shares,coveredShares:covered,average:covered>0?cost/covered:null,status:shares===0?'尚未持有':seeded>0?'期初市價情境':opening==='market'?'期初行情不足':'期初成本未知'};
 for(let i=1;i<points.length;i++){
  const prev=points[i-1],next=points[i],before=prev.rows.get(symbol)?.shares??0,after=next.rows.get(symbol)?.shares??0,pair=links.get(key(prev.date,next.date));
  const delta=after-before;let status='股數不變',ref=null;
  if(!pair){clear();warnings.add('快照比較不連續，成本重新列為未知');status='比較不連續';}
  else{
   const issues=actionReasons(symbol,pair,actions);
   for(const r of issues)warnings.add(r.label);
   if(issues.some(r=>r.code==='share_action'||r.code==='invalid_action')){clear();status='股份變動待核對';}
   else if(delta<0){
    // Moving-average assumption: remove priced and unknown components pro rata.
    const ratio=before>0?after/before:0;covered*=ratio;cost*=ratio;low*=ratio;high*=ratio;seeded*=ratio;status='依平均成本比例減持';
   }else if(delta>0){
    const priced=periodReference(pair,symbol,market),units=positive(pair.beforeUnits)&&positive(pair.afterUnits);
    ref=priced.reference;
    if(ref&&issues.length===0&&units){covered+=delta;cost+=delta*ref.vwap;low+=delta*ref.low;high+=delta*ref.high;status='新增部位納入估算';}
    else {status='新增部位成本未知';if(!ref)warnings.add('增持期間行情不足或不一致');if(!units)warnings.add('基金單位數不足');}
   }
  }
  shares=after;if(shares===0)clear();
  history.push({from:prev.date,to:next.date,delta,shares,coveredShares:covered,average:covered>0?cost/covered:null,status});
 }
 if(conflictedSymbols.has(symbol)){
  clear();warnings.add('同日持股資料不一致');
  // A disputed observation cannot support a reliable cost path. Keep the
  // observed share history, but invalidate all modeled prices for this stock.
  for(const point of [openingPoint,...history]){point.coveredShares=0;point.average=null;point.status='同日持股資料不一致，成本未知';}
 }
 const unknown=Math.max(0,shares-covered),complete=shares>0&&unknown<1e-6,average=covered>1e-9?cost/covered:null;
 return {fund:f.fundSymbol,issuer:issuers[(f.sourceId??'').split('.')[0]]??'投信待核對',sourceId:f.sourceId,symbol,name:last.rows.get(symbol)?.name??first.rows.get(symbol)?.name??symbol,
  from:first.date,asOf:last.date,path:last.path,shares,coveredShares:covered,unknownShares:unknown,coverage:shares>0?covered/shares:0,seededShares:seeded,average,low:covered>1e-9?low/covered:null,high:covered>1e-9?high/covered:null,
  fullAverage:complete?average:null,complete,opening,openingPoint,warnings:[...warnings],history:history.reverse()};
}

export function buildHoldingCostReport(data,market,actions,{to='',query='',fund='all',opening='unknown',snapshots=[]}={}){
 const all=data?.funds??[],funds=all.filter(f=>Object.hasOwn(fundNames,f.fundSymbol)&&(fund==='all'||fund===f.fundSymbol));
 const end=to||funds.flatMap(f=>(f.dates??[]).map(d=>d.asOf)).filter(validDate).sort().at(-1)||'';
 const result={to:end,opening:opening==='market'?'market':'unknown',stocks:[],error:null,unavailableFunds:[],excludedFunds:all.filter(f=>!Object.hasOwn(fundNames,f.fundSymbol)).map(f=>f.fundSymbol)};
 if(!validDate(end)){result.error='請選擇有效的截止日期。';return result;}
 const map=new Map(),search=query.trim().toLowerCase();
 for(const f of funds){
  const obs=observations(f,snapshots,end);if(!obs.points.length){result.unavailableFunds.push(f.fundSymbol);continue;}
  const last=obs.points.at(-1);
  for(const [symbol,row] of last.rows){
   if(!/^\d{4,6}$/.test(symbol))continue;
   const issuer=issuers[(f.sourceId??'').split('.')[0]]??'';
   if(![symbol,row.name,f.fundSymbol,fundNames[f.fundSymbol],issuer].join(' ').toLowerCase().includes(search))continue;
   const entry=estimate(f,symbol,obs,market,actions,result.opening),stock=map.get(symbol)??{symbol,name:row.name??symbol,latestPrice:latestPriceFor(symbol,market,end),funds:[]};stock.funds.push(entry);map.set(symbol,stock);
  }
 }
 result.stocks=[...map.values()].sort((a,b)=>b.funds.length-a.funds.length||a.symbol.localeCompare(b.symbol));
 return result;
}
