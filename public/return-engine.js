import {resolveSignalTiming} from './signal-timing.js';
import {unresolvedShareActions} from './domestic-actions.js';
export function simulateNav(points,{capital=100000,buyCost=0,sellCost=0}={}){
 if(!Number.isFinite(capital)||capital<=0||![buyCost,sellCost].every(x=>Number.isFinite(x)&&x>=0&&x<1))throw Error('Invalid simulation inputs');
 if(points.length<2)throw Error('Need two observations');
 for(let i=0;i<points.length;i++)if(!(points[i].nav>0)||!Number.isFinite(points[i].nav)||(i&&points[i].date<=points[i-1].date))throw Error('Invalid NAV series');
 const units=capital/(1+buyCost)/points[0].nav;let peak=capital,maxDrawdown=0;
 const curve=points.map((p,i)=>{const value=units*p.nav*(i===points.length-1?1-sellCost:1);peak=Math.max(peak,value);maxDrawdown=Math.min(maxDrawdown,value/peak-1);return {...p,value};});
 return {units,curve,ending:curve.at(-1).value,returnRate:curve.at(-1).value/capital-1,grossNavChange:points.at(-1).nav/points[0].nav-1,maxDrawdown};
}
export function simulateMarket(points,{capital=100000,buyCost=0,sellCost=0,dividends=[],splits=[]}={}){
 if(!Number.isFinite(capital)||capital<=0||![buyCost,sellCost].every(x=>Number.isFinite(x)&&x>=0&&x<1))throw Error('Invalid simulation inputs');
 if(points.length<2)throw Error('Need two observations');
 for(let i=0;i<points.length;i++)if(!(points[i].close>0)||!Number.isFinite(points[i].close)||(i&&points[i].date<=points[i-1].date))throw Error('Invalid market series');
 if(dividends.some(d=>!Number.isFinite(d.amount)||d.amount<0)||splits.some(s=>!Number.isFinite(s.ratio)||s.ratio<=0))throw Error('Invalid corporate action');
 const units=capital/(1+buyCost)/points[0].close,eligible=dividends.filter(d=>d.exDate>points[0].date&&d.exDate<=points.at(-1).date),appliedSplits=splits.filter(s=>s.date>points[0].date&&s.date<=points.at(-1).date);
 const actions=[...eligible.map(d=>({...d,date:d.exDate,type:'dividend'})),...appliedSplits.map(s=>({...s,type:'split'}))].sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='split'?-1:1));
 let peak=capital,maxDrawdown=0,distributionCash=0,heldUnits=units,cursor=0;
 const curve=points.map((p,i)=>{while(cursor<actions.length&&actions[cursor].date<=p.date){const a=actions[cursor++];if(a.type==='split')heldUnits*=a.ratio;else distributionCash+=heldUnits*a.amount;}const value=heldUnits*p.close*(i===points.length-1?1-sellCost:1)+distributionCash;peak=Math.max(peak,value);maxDrawdown=Math.min(maxDrawdown,value/peak-1);return {...p,value,heldUnits,distributionCash,cumulativeDistribution:distributionCash/units};});
 const grossPriceChange=(heldUnits/units)*points.at(-1).close/points[0].close-1,ending=curve.at(-1).value;
 return {units,endingUnits:heldUnits,curve,ending,returnRate:ending/capital-1,grossPriceChange,distributionPerUnit:distributionCash/units,distributionCash,maxDrawdown,dividends:eligible,splits:appliedSplits};
}
export function alignBenchmark(points,from,to){return from<to&&points.some(p=>p.date===from)&&points.some(p=>p.date===to)?points.filter(p=>p.date>=from&&p.date<=to):[];}
export function auditHoldingsMarketEvents(f,constituents,{horizons=[1,5,10],cutoff='9999-12-31',calendar=null,timingMode='announcement',signalLag=1,corporateActions=null}={}){
 const announcements=new Map(f.dates.map(d=>[d.asOf,d])),events=[],excluded=[];
 const sessions=[...new Set(calendar??Object.values(constituents).flatMap(s=>s.rows.map(r=>r.date)))].filter(d=>d<=cutoff).sort();
 const prices=new Map();
 for(const p of f.pairs){
  if(p.to>cutoff)continue;
  const timing=resolveSignalTiming(announcements.get(p.to)??{asOf:p.to},sessions,{timingMode,signalLag,priorRecord:announcements.get(p.from),observationPairMatched:p.observationPairMatched}),announcedOn=timing.announcedOn;
  for(const r of p.rows){
   if(!r.delta)continue;
   const evidence={fundSymbol:f.fundSymbol,symbol:r.symbol,name:r.name,from:p.from,to:p.to,...timing,announcedOn,beforePath:p.beforePath,afterPath:p.afterPath};
   const reject=reason=>excluded.push({...evidence,reason});
   if(timing.reason){reject(timing.reason);continue;}
   if(timing.signalDate>cutoff){reject('announcement_after_cutoff');continue;}
   const shareActions=unresolvedShareActions(r.symbol,p,corporateActions);
   if(shareActions.length){excluded.push({...evidence,reason:'unresolved_share_distribution',actions:shareActions});continue;}
   const series=constituents[r.symbol];if(!series){reject('missing_market');continue;}
   if(series.researchOnly||series.market&&!['TWSE','TPEx'].includes(series.market)){reject('overseas_research_only');continue;}
   const entryIndex=sessions.indexOf(timing.entryDate);
   if(entryIndex<0){reject('waiting_entry');continue;}
   if(!prices.has(r.symbol))prices.set(r.symbol,new Map(series.rows.filter(x=>x.date<=cutoff).map(x=>[x.date,x])));
   const byDate=prices.get(r.symbol),entry=byDate.get(sessions[entryIndex]);
   if(!(entry?.open>0)||entry.volume===0){reject('missing_entry_price');continue;}
   const lookback=sessions.slice(Math.max(0,entryIndex-6),entryIndex).map(d=>byDate.get(d));
   const priorReturn=lookback.length===6&&lookback.every(x=>x?.close>0)?lookback.at(-1).close/lookback[0].close-1:null,returns={};
   for(const h of horizons){
    const dates=sessions.slice(entryIndex,entryIndex+h),rows=dates.map(d=>byDate.get(d));
    // A missing session must not compress a five-session horizon or move an entry.
    returns[h]=dates.length===h&&rows.every(x=>x?.close>0)?{date:dates.at(-1),value:rows.at(-1).close/entry.open-1}:null;
   }
   events.push({...evidence,entryDate:entry.date,entryOpen:entry.open,delta:r.delta,perMillionUnitsChange:r.perMillionUnitsChange,priorReturn,returns});
  }
 }
 return {events,excluded,calendarBasis:calendar?'benchmark_observed_sessions':'union_observed_price_sessions'};
}
export function analyzeHoldingsMarketEvents(f,constituents,options={}){return auditHoldingsMarketEvents(f,constituents,options).events;}
export function analyzeValuationEvents(f,valuations){
 const byDate=new Map(valuations.map(v=>[v.date,new Map(v.rows.map(r=>[r.symbol,r]))])),cases=[];
 for(let i=0;i<f.pairs.length;i++){
  const p=f.pairs[i],next=f.pairs[i+1],start=byDate.get(p.from),at=byDate.get(p.to),end=next?.from===p.to?byDate.get(next.to):null;
  for(const r of p.rows){if(!r.delta)continue;const a=start?.get(r.symbol),b=at?.get(r.symbol),c=end?.get(r.symbol);
   const prior=a&&b?b.price/a.price-1:null,following=b&&c?c.price/b.price-1:null;
   cases.push({symbol:r.symbol,name:r.name,from:p.from,signalDate:p.to,endDate:next?.from===p.to?next.to:null,delta:r.delta,priorReturn:prior,followingReturn:following,
    clue:prior==null?'缺前期價格':prior===0?'前期估值不變':r.delta>0?(prior>0?'上漲區間增加':'下跌區間增加'):(prior>0?'上漲區間減少':'下跌區間減少'),
    normalizedOpposite:r.perMillionUnitsChange!=null&&Math.abs(r.perMillionUnitsChange)>1e-8&&Math.sign(r.perMillionUnitsChange)!==Math.sign(r.delta),
    beforePath:p.beforePath,signalPath:p.afterPath,endPath:next?.from===p.to?next.afterPath:null});
  }
 }
 return cases;
}
