import {fundNames} from './interval-report.js';
import {unresolvedShareActions} from './domestic-actions.js';
import {twseSession} from './trading-calendar.mjs?v=78';

// Holdings differences are observations, not executions. In-kind ETF creations
// can change holdings without an exchange trade (TWSE ETF issuing mechanism).
// TWSE's FMSRFK report defines its weighted price as turnover / share volume.
// Our collector normalizes TPEx's thousand-shares / thousand-TWD fields first.
export const COST_REFERENCE_SOURCES=[
 'https://www.twse.com.tw/zh/products/securities/etf/overview/issuing.html',
 'https://www.twse.com.tw/exchangeReport/FMSRFK?response=html&stockNo=2330',
 'https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pricing.html'
];
export const COST_REFERENCE_LIMITATIONS=[
 '價帶與均價來自持股異動期間的市場行情，不是 ETF 實際成交價格，也不是目前整體持倉的成本。',
 '日期採持股基準日前後的觀察區間；未取得逐筆交易或交割對照。申贖、公司行動及資料修正都可能改變股數。',
 '各期淨增加與淨減少分開加權；期間內互相抵銷的買賣無法還原。加權價帶不是機率區間，也不保證涵蓋實際成交。',
 '公司行動資料僅涵蓋已保存的除權息紀錄，尚非完整分割、減資或股份交付核對；本功能不估算損益。',
 '僅分析目前規模名單中的台股型 ETF 與台灣股票；全球型 ETF 的日期對照及海外行情尚未納入。'
];
const labels={
 invalid_pair:'持股日期或股數無效',unsupported_stock:'非已核對的台灣股票行情',
 calendar_unknown:'超出已核對交易日曆',no_sessions:'區間沒有預定交易日',
 missing_price:'區間行情缺日',invalid_price:'行情數值或日期重複，待核對',
 invalid_vwap:'成交金額與股數換算的均價待核對',action_coverage:'超出公司行動核對範圍',
 share_action:'配股或股份交付尚未核對',cash_action:'區間跨越除息，未合併估算',
 invalid_action:'公司行動紀錄待核對',missing_units:'基金單位數不足，規模影響待核對'
};
const reason=code=>({code,label:labels[code]});
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const positive=n=>finite(n)&&n>0;
const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const newest=(a,b)=>b.to.localeCompare(a.to)||b.from.localeCompare(a.from)||a.fund.localeCompare(b.fund);

export function latestPriceFor(symbol,market,to){
 if(!validDate(to))return null;
 const last=(market?.constituents?.[symbol]?.rows??[]).filter(r=>validDate(r.date)&&r.date<=to&&positive(r.close)).sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
 return last?{date:last.date,close:last.close}:null;
}

export function periodReference(pair,symbol,market){
 const series=market?.constituents?.[symbol];
 if(!/^\d{4,6}$/.test(symbol)||!['TWSE','TPEx'].includes(series?.market))return {reference:null,priceStatus:'unsupported_stock'};
 const expected=[];
 for(let d=shift(pair.from,1);d<=pair.to;d=shift(d,1)){
  const state=twseSession(d);
  if(!state.known)return {reference:null,priceStatus:'calendar_unknown'};
  if(state.open)expected.push(d);
 }
 if(!expected.length)return {reference:null,priceStatus:'no_sessions'};
 const selected=(series.rows??[]).filter(r=>typeof r.date==='string'&&r.date>pair.from&&r.date<=pair.to);
 const dates=new Set();
 for(const r of selected){
  if(!validDate(r.date)||dates.has(r.date)||!twseSession(r.date).open||!['open','high','low','close','volume','turnover'].every(k=>positive(r[k]))||r.low>r.high||r.open<r.low||r.open>r.high||r.close<r.low||r.close>r.high)return {reference:null,priceStatus:'invalid_price'};
  dates.add(r.date);
  // Never clamp an inconsistent ratio into the daily range to manufacture a price.
  const mean=r.turnover/r.volume,tolerance=Math.max(0.01,r.high*1e-6);
  if(mean<r.low-tolerance||mean>r.high+tolerance)return {reference:null,priceStatus:'invalid_vwap'};
 }
 if(expected.some(d=>!dates.has(d)))return {reference:null,priceStatus:'missing_price'};
 const volume=selected.reduce((n,r)=>n+r.volume,0),turnover=selected.reduce((n,r)=>n+r.turnover,0);
 if(!positive(volume)||!positive(turnover))return {reference:null,priceStatus:'invalid_price'};
 return {priceStatus:'ready',reference:{low:Math.min(...selected.map(r=>r.low)),high:Math.max(...selected.map(r=>r.high)),vwap:turnover/volume,firstDate:expected[0],lastDate:expected.at(-1),sessionCount:selected.length,expectedSessionCount:expected.length,sourceUrls:[...new Set((series.sourceUrls??[]).filter(u=>typeof u==='string'))]}};
}

export function actionReasons(symbol,pair,actions){
 const out=[];
 if(!validDate(actions?.from)||!validDate(actions?.through)||pair.from<actions.from||pair.to>actions.through||!Array.isArray(actions?.records))out.push(reason('action_coverage'));
 const records=Array.isArray(actions?.records)?actions.records:[];
 if(records.some(a=>a.symbol===symbol&&(!validDate(a.date)||(a.availabilityDate!=null&&!validDate(a.availabilityDate)))))out.push(reason('invalid_action'));
 if(unresolvedShareActions(symbol,pair,{records}).length)out.push(reason('share_action'));
 if(records.some(a=>a.symbol===symbol&&validDate(a.date)&&a.date>pair.from&&a.date<=pair.to&&finite(a.cash)))out.push(reason('cash_action'));
 return out;
}

function eventFor(fund,pair,row,market,actions){
 const validShares=finite(row.beforeShares)&&row.beforeShares>=0&&finite(row.afterShares)&&row.afterShares>=0;
 const delta=validShares?row.afterShares-row.beforeShares:row.delta;
 if(!finite(delta)||delta===0)return null;
 const validPair=validDate(pair.from)&&validDate(pair.to)&&pair.from<pair.to&&validShares;
 const priced=validPair?periodReference(pair,row.symbol,market):{reference:null,priceStatus:'invalid_pair'};
 const actionIssues=validPair?actionReasons(row.symbol,pair,actions):[];
 const reasons=[...(priced.priceStatus==='ready'?[]:[reason(priced.priceStatus)]),...actionIssues];
 const validUnits=positive(pair.beforeUnits)&&positive(pair.afterUnits),ratio=validUnits?pair.afterUnits/pair.beforeUnits:null;
 if(!validUnits)reasons.push(reason('missing_units'));
 const proportionalShares=validUnits&&validShares?row.beforeShares*(ratio-1):null;
 return {fund,symbol:row.symbol,name:row.name??row.symbol,from:pair.from,to:pair.to,delta,
  beforeShares:validShares?row.beforeShares:null,afterShares:validShares?row.afterShares:null,
  beforeUnits:positive(pair.beforeUnits)?pair.beforeUnits:null,afterUnits:positive(pair.afterUnits)?pair.afterUnits:null,
  unitChangePercent:validUnits?(ratio-1)*100:null,proportionalShares,residualShares:proportionalShares===null?null:delta-proportionalShares,
  beforePath:pair.beforePath??null,afterPath:pair.afterPath??null,...priced,eligible:reasons.length===0,reasons,
  actionStatus:actionIssues.length?'pending':'reviewed_scope'};
}

function sideSummary(events,direction){
 const all=events.filter(e=>Math.sign(e.delta)===direction),eligible=all.filter(e=>e.eligible),shares=all.reduce((n,e)=>n+Math.abs(e.delta),0);
 const complete=all.length>0&&eligible.length===all.length;
 const weighted=key=>complete?all.reduce((n,e)=>n+Math.abs(e.delta)*e.reference[key],0)/shares:null;
 const vwap=weighted('vwap');
 return {shares,eventCount:all.length,eligibleShares:eligible.reduce((n,e)=>n+Math.abs(e.delta),0),eligibleEventCount:eligible.length,pendingEventCount:all.length-eligible.length,complete,low:weighted('low'),high:weighted('high'),vwap,referenceAmount:complete?shares*vwap:null};
}
function groupSummary(events){
 const increase=sideSummary(events,1),decrease=sideSummary(events,-1);
 return {increaseShares:increase.shares,decreaseShares:decrease.shares,netShares:increase.shares-decrease.shares,increase,decrease};
}

export function buildCostReport(data,market,actions,{from='',to='',query='',fund='all'}={}){
 const allFunds=Array.isArray(data?.funds)?data.funds:[],domestic=allFunds.filter(f=>Object.hasOwn(fundNames,f.fundSymbol)&&(fund==='all'||fund===f.fundSymbol));
 const latest=domestic.flatMap(f=>(f.dates??[]).map(d=>d.asOf)).filter(validDate).sort().at(-1)??'';
 const end=to||latest,start=from||(validDate(end)?shift(end,-29):'');
 const report={from:start,to:end,defaultWindow:!from,query,fund,error:null,actionReview:validDate(actions?.from)&&validDate(actions?.through)?{from:actions.from,through:actions.through,reviewedOn:validDate(actions.reviewedOn)?actions.reviewedOn:null}:null,boundaryPairs:0,excludedFunds:[...new Set(allFunds.filter(f=>!Object.hasOwn(fundNames,f.fundSymbol)).map(f=>f.fundSymbol))],coverage:[],stocks:[],events:[],summary:{stockCount:0,eventCount:0,eligibleEventCount:0,pendingEventCount:0,pendingReasons:[]},limitations:[...COST_REFERENCE_LIMITATIONS],sources:[...COST_REFERENCE_SOURCES]};
 if(!validDate(start)||!validDate(end)){report.error='請選擇有效的起迄日期；目前名單需有已保存的持股日期。';return report;}
 if(start>end){report.error='起日不能晚於迄日';return report;}
 const search=String(query).trim().toLowerCase(),fundOrder=new Map(domestic.map((f,i)=>[f.fundSymbol,i]));
 for(const f of domestic){
  const pairs=(f.pairs??[]).filter(p=>validDate(p.from)&&validDate(p.to)&&p.from>=start&&p.to<=end&&p.from<p.to).sort((a,b)=>a.from.localeCompare(b.from));
  report.boundaryPairs+=(f.pairs??[]).filter(p=>validDate(p.from)&&validDate(p.to)&&p.from<start&&p.to>start&&p.to<=end).length;
  const continuous=pairs.every((p,i)=>i===0||pairs[i-1].to===p.from);
  report.coverage.push({fund:f.fundSymbol,from:pairs[0]?.from??null,to:pairs.at(-1)?.to??null,comparisons:pairs.length,complete:pairs.length>0&&continuous&&pairs[0].from===start&&pairs.at(-1).to===end});
  for(const p of pairs)for(const row of p.rows??[]){
   if(![row.symbol,row.name,f.fundSymbol,fundNames[f.fundSymbol]].join(' ').toLowerCase().includes(search))continue;
   const event=eventFor(f.fundSymbol,p,row,market,actions);if(event)report.events.push(event);
  }
 }
 report.events.sort(newest);
 const byStock=new Map();
 for(const event of report.events){const group=byStock.get(event.symbol)??[];group.push(event);byStock.set(event.symbol,group);}
 for(const [symbol,events] of byStock){
  const byFund=new Map();for(const e of events){const group=byFund.get(e.fund)??[];group.push(e);byFund.set(e.fund,group);}
  const funds=[...byFund].map(([fund,events])=>({fund,...groupSummary(events),events})).sort((a,b)=>fundOrder.get(a.fund)-fundOrder.get(b.fund));
  report.stocks.push({symbol,name:events[0].name,...groupSummary(events),funds,events,latestPrice:latestPriceFor(symbol,market,end)});
 }
 report.stocks.sort((a,b)=>b.increaseShares-a.increaseShares||b.decreaseShares-a.decreaseShares||a.symbol.localeCompare(b.symbol));
 const counts=new Map();for(const e of report.events)for(const r of e.reasons)counts.set(r.code,(counts.get(r.code)??0)+1);
 report.summary={stockCount:report.stocks.length,eventCount:report.events.length,eligibleEventCount:report.events.filter(e=>e.eligible).length,pendingEventCount:report.events.filter(e=>!e.eligible).length,pendingReasons:[...counts].map(([code,count])=>({...reason(code),count}))};
 return report;
}
