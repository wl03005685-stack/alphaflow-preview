import {auditStrategyActions,unresolvedShareActions} from './domestic-actions.js';
import {resolveSignalTiming} from './signal-timing.js';
// A funded, long-only hypothesis simulation. No inference of manager intent.
export function simulateFollowing(f, constituents, calendar, {
 from, to, capital=100000, slots=5, holdingDays=5, buyCost=0, sellCost=0,
 normalized=true, slippageBps=0, maxVolumeFraction=1, timingMode='announcement',signalLag=1,corporateActions=null
}={}) {
 if(!from||!to||from>=to||!Number.isFinite(capital)||capital<=0||
    !Number.isInteger(slots)||slots<1||slots>50||!Number.isInteger(holdingDays)||holdingDays<1||holdingDays>60||
    !Number.isFinite(slippageBps)||slippageBps<0||slippageBps>1000||!Number.isFinite(maxVolumeFraction)||maxVolumeFraction<=0||maxVolumeFraction>1||
    ![buyCost,sellCost].every(x=>Number.isFinite(x)&&x>=0&&x<1))throw Error('Invalid strategy settings');
 const days=calendar.filter(d=>d>=from&&d<=to);
 if(days.length<2||days.some((d,i)=>i&&d<=days[i-1]))throw Error('Invalid trading calendar');
 const dates=new Map(f.dates.map(d=>[d.asOf,d])), prices=new Map(), signals=new Map(), audit=[];
 const reject=(r,p,reason)=>audit.push({symbol:r.symbol,from:p.from,to:p.to,reason,beforePath:p.beforePath,afterPath:p.afterPath});
 for(const p of f.pairs){
  if(p.to>to)continue;
  const timing=resolveSignalTiming(dates.get(p.to)??{asOf:p.to},calendar,{timingMode,signalLag,priorRecord:dates.get(p.from),observationPairMatched:p.observationPairMatched}),announcement=timing.announcedOn;
  for(const r of p.rows){
   if(!r.delta)continue;
   if(timing.reason){reject(r,p,timing.reason);continue;}
   if(timing.signalDate>=to){reject(r,p,'waiting_entry');continue;}
   const entry=timing.entryDate;
   if(!entry||entry>to){reject(r,p,'waiting_entry');continue;}
   if(entry<from)continue;
   if(unresolvedShareActions(r.symbol,p,corporateActions).length){reject(r,p,'unresolved_share_distribution');continue;}
   const data=constituents[r.symbol];
   if(!data){reject(r,p,'missing_market');continue;}
   if(data.researchOnly||data.market&&!['TWSE','TPEx'].includes(data.market)){reject(r,p,'overseas_research_only');continue;}
   if(!prices.has(r.symbol))prices.set(r.symbol,new Map(data.rows.filter(x=>x.date<=to).map(x=>[x.date,x])));
   const direction=normalized?r.perMillionUnitsChange:r.delta;
   if(direction==null||!Number.isFinite(direction)){reject(r,p,'missing_normalized');continue;}
   if(Math.abs(direction)<1e-8){reject(r,p,'unchanged_normalized');continue;}
   const signal={...r,...timing,direction,announcedOn:announcement,entryDate:entry,from:p.from,to:p.to,beforePath:p.beforePath,afterPath:p.afterPath};
   if(!signals.has(entry))signals.set(entry,[]);
   signals.get(entry).push(signal);
  }
 }
 const volumeCap=(symbol,date)=>{const previous=calendar[calendar.indexOf(date)-1];return Math.floor((prices.get(symbol)?.get(previous)?.volume??0)*maxVolumeFraction);};
 const fillPrice=(row,base,side)=>{const price=base*(1+(side==='buy'?1:-1)*slippageBps/10000);return (Number.isFinite(row?.high)&&price>row.high)||(Number.isFinite(row?.low)&&price<row.low)?null:price;};
 let cash=capital,peak=capital,maxDrawdown=0,fees=0;
 const positions=new Map(),ledger=[],curve=[],valuationGaps=[];
 const sell=(symbol,price,date,reason,signal=null)=>{
  const p=positions.get(symbol),row=prices.get(symbol)?.get(date);
  if(p.shares>volumeCap(symbol,date)){audit.push({symbol,date,reason:'volume_limit_exit'});return;}
  price=fillPrice(row,price,'sell');if(price==null){audit.push({symbol,date,reason:'price_outside_daily_range'});return;}
  const gross=p.shares*price,fee=gross*sellCost;
  cash+=gross-fee;fees+=fee;positions.delete(symbol);
  ledger.push({side:'sell',symbol,date,price,shares:p.shares,fee,cash,reason,signal,
   entryDate:p.entryDate,pnl:gross-fee-p.outlay,returnRate:(gross-fee)/p.outlay-1});
 };
 for(let i=0;i<days.length;i++){
  const date=days[i],today=(signals.get(date)??[]).sort((a,b)=>a.symbol.localeCompare(b.symbol)||b.to.localeCompare(a.to));
  // Open sells happen before open buys. Closing proceeds are never spent at the same day's open.
  const negative=new Set(today.filter(s=>s.direction<0).map(s=>s.symbol));
  for(const symbol of negative){
   const row=prices.get(symbol)?.get(date),signal=today.find(s=>s.symbol===symbol&&s.direction<0);
   if(positions.has(symbol)&&row?.open>0&&row.volume>0)sell(symbol,row.open,date,'decrease_signal',signal);
   else audit.push({...signal,reason:positions.has(symbol)?'missing_exit_open':'no_position_to_sell'});
  }
  const candidates=today.filter(s=>s.direction>0),seen=new Set();
  for(const s of candidates){
   const skip=reason=>audit.push({...s,reason});
   if(seen.has(s.symbol)||negative.has(s.symbol)){skip('duplicate_or_conflicting_signal');continue;}seen.add(s.symbol);
   if(positions.has(s.symbol)){skip('already_held');continue;}
   if(positions.size>=slots){skip('position_limit');continue;}
   const row=prices.get(s.symbol)?.get(date);
   if(!(row?.open>0)||!(row.volume>0)){skip('missing_or_untradable_open');continue;}
   const price=fillPrice(row,row.open,'buy');if(price==null){skip('price_outside_daily_range');continue;}
   const cap=volumeCap(s.symbol,date);if(cap<1){skip('missing_prior_volume');continue;}
   const budget=Math.min(capital/slots,cash),shares=Math.min(cap,Math.floor(budget/(price*(1+buyCost))));
   if(shares<1){skip('insufficient_cash');continue;}
   const gross=shares*price,fee=gross*buyCost,outlay=gross+fee;
   cash-=outlay;fees+=fee;
   positions.set(s.symbol,{shares,entryDate:date,entryIndex:i,outlay,lastPrice:row.open,lastPriceDate:date});
   ledger.push({side:'buy',symbol:s.symbol,date,price,shares,fee,cash,reason:'increase_signal',signal:s});
  }
  for(const [symbol,p] of positions){
   const row=prices.get(symbol)?.get(date);
   if(row?.close>0){p.lastPrice=row.close;p.lastPriceDate=date;}
   else valuationGaps.push({symbol,date,lastPriceDate:p.lastPriceDate});
   if(i-p.entryIndex+1>=holdingDays||i===days.length-1){
    if(row?.close>0&&row.volume>0)sell(symbol,row.close,date,i===days.length-1?'end_of_period':'holding_period');
    else audit.push({symbol,date,reason:'missing_exit_close'});
   }
  }
  const holdings=[...positions].map(([symbol,p])=>({symbol,shares:p.shares,price:p.lastPrice,priceDate:p.lastPriceDate,value:p.shares*p.lastPrice}));
  const value=cash+holdings.reduce((n,p)=>n+p.value,0);
  peak=Math.max(peak,value);maxDrawdown=Math.min(maxDrawdown,value/peak-1);
  curve.push({date,cash,value,holdings});
 }
 const counts={};for(const a of audit)counts[a.reason]=(counts[a.reason]??0)+1;
 const result={fundSymbol:f.fundSymbol,from:days[0],to:days.at(-1),capital,slots,holdingDays,buyCost,sellCost,normalized,slippageBps,maxVolumeFraction,timingMode,signalLag,
  ending:curve.at(-1).value,returnRate:curve.at(-1).value/capital-1,cash,fees,maxDrawdown,
  ledger,curve,audit,counts,valuationGaps,openPositions:curve.at(-1).holdings,
  status:'hypothetical_unadjusted_stock_price_strategy',
  limitations:[timingMode==='holdings_scenario'?`持股日後第${signalLag}交易日進場的反事實情境；未驗證當時已公開，不能視為當時可執行策略。`:timingMode==='observed'?'兩期持股內容均與本機成功觀察證據相符，於較晚觀察日之後的交易日進場；非首次公告或前瞻績效驗證。':'公告日期延遲假設，非已驗證的歷史首次公開時間。','個股配息、分割及其他公司行動未齊，僅為未還原價格模擬。','不做空；同日訊號依股票代碼排序，不依後續報酬挑選。','固定雙向滑價；用前一交易日成交量限制部位。超過日高低價不成交，未模擬零股撮合及漲跌停排隊；容量不是開盤可成交量保證。','缺行情不補零；持倉沿用最後可用估值並列出日期，未能賣出者保持未平倉。']};
 if(corporateActions)result.corporateActionAudit=auditStrategyActions(result,corporateActions);
 return result;
}
