import {ASIAN_MARKETS,asianSession} from './asian-calendars.js';
// Bounded retrospective price research. This never feeds the TWD cash ledger.
export const US_CALENDAR={
 reviewedOn:'2026-09-30',from:'2026-06-29',through:'2026-09-30',
 sources:['https://www.nyse.com/trade/hours-calendars','https://www.nasdaq.com/market-activity/stock-market-holiday-schedule'],
 basis:'official_scheduled_regular_sessions',timeZone:'America/New_York'
};
const holidays=new Set(['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25']);
const early=new Set(['11-27','12-24']);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const nyFormat=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function nyTime(date,time){
 const desired=Date.parse(date+'T'+time+':00Z');let instant=desired;
 for(let i=0;i<3;i++){
  const p=Object.fromEntries(nyFormat.formatToParts(instant).map(p=>[p.type,p.value]));
  const local=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  const difference=desired-local;instant+=difference;if(!difference)return new Date(instant).toISOString();
 }
 throw Error('Unable to resolve New York session time');
}
export function usSession(date){
 if(!validDate(date))throw Error('Invalid session date');
 if(!date.startsWith('2026-'))return {known:false,date};
 const open=![0,6].includes(new Date(date+'T00:00:00Z').getUTCDay())&&!holidays.has(date.slice(5));
 return {known:true,date,open,...(open?{openAt:nyTime(date,'09:30'),closeAt:nyTime(date,early.has(date.slice(5))?'13:00':'16:00')}:{})};
}
const sessions=[];
for(let t=Date.parse(US_CALENDAR.from);t<=Date.parse(US_CALENDAR.through);t+=86400000){const s=usSession(new Date(t).toISOString().slice(0,10));if(s.open)sessions.push(s);}
const endTaipei=date=>Date.parse(date+'T23:59:59.999+08:00');
export function auditMarketEvents(f,constituents,{market='US',from='2026-06-29',to='2026-09-29',horizons=[1,5,10]}={}){
 if(!validDate(from)||!validDate(to)||from>to||!horizons.length||horizons.some(h=>!Number.isInteger(h)||h<1||h>60))throw Error('Invalid US event window');
 const profile=market==='US'?null:ASIAN_MARKETS[market];
 if(market!=='US'&&!profile)throw Error('Unreviewed market');
 const calendar=profile??US_CALENDAR,currency=profile?.currency??'USD';
 const marketSessions=profile?[]:sessions;
 if(profile)for(let t=Date.parse(calendar.from);t<=Date.parse(calendar.through);t+=86400000){const session=asianSession(market,new Date(t).toISOString().slice(0,10));if(session.open)marketSessions.push(session);}
 const cutoff=endTaipei(to),announcements=new Map(f.dates.map(d=>[d.asOf,d.announcementDate])),events=[],excluded=[];
 for(const pair of f.pairs){
  if(pair.to>to)continue;
  for(const row of pair.rows){
   if(!row.delta||!row.symbol.includes(' ')||(profile&&!row.symbol.endsWith(profile.suffix)))continue;
   const series=constituents[row.symbol],announcedOn=announcements.get(pair.to);
   const evidence={fundSymbol:f.fundSymbol,symbol:row.symbol,name:row.name,holdingDate:pair.to,announcedOn:announcedOn??null,beforePath:pair.beforePath,afterPath:pair.afterPath};
   const reject=reason=>excluded.push({...evidence,reason});
   if(!validDate(announcedOn)||announcedOn<pair.to){if(pair.to>=from)reject('missing_announcement');continue;}
   if(announcedOn>to){if(pair.to>=from)reject('announcement_after_cutoff');continue;}
   if(announcedOn<calendar.from||announcedOn>calendar.through){if(pair.to>=from)reject('outside_reviewed_calendar');continue;}
   const assumedAvailableAt=new Date(endTaipei(announcedOn)).toISOString();
   const index=marketSessions.findIndex(s=>Date.parse(s.openAt)>Date.parse(assumedAvailableAt));
   if(index<0){if(pair.to>=from)reject('outside_reviewed_calendar');continue;}
   const entrySession=marketSessions[index];if(entrySession.date<from)continue;
   if(Date.parse(entrySession.openAt)>cutoff){reject('waiting_entry');continue;}
   if(Date.parse(entrySession.closeAt)>cutoff){reject('entry_session_not_closed');continue;}
   if(!series){reject('missing_prices');continue;}
   if(profile?(series.exchange!==profile.exchange||series.currency!==currency||series.timeZone!==profile.timeZone||!!series.mappingNote):(!row.symbol.endsWith(' US')||!['NMS','NGM','NCM','NYQ'].includes(series.exchange)||series.currency!=='USD'||series.timeZone!=='America/New_York'||!!series.mappingNote)){reject('market_not_reviewed');continue;}
   if(series.instrumentType!=='EQUITY'||!Array.isArray(series.dividends)||!Array.isArray(series.splits)){reject('source_metadata_missing');continue;}
   const prices=new Map(series.rows.map(r=>[r.date,r])),entry=prices.get(entrySession.date);
   // Missing planned sessions never shift entry or compress a horizon.
   if(!(entry?.open>0)||!(entry.volume>0)){reject('missing_entry_price');continue;}
   const actions=[...series.dividends,...series.splits];
   const actionBetween=(start,end)=>actions.some(a=>a.date>=start&&a.date<=end);
   const returns={},outcomes={};
   for(const h of horizons){
    const window=marketSessions.slice(index,index+h),last=window.at(-1);
    let reason=null;
    if(window.length!==h)reason='outside_reviewed_calendar';
    else if(Date.parse(last.closeAt)>cutoff)reason='after_taipei_cutoff';
    else if(actionBetween(entrySession.date,last.date))reason='corporate_action_in_window';
    else if(window.some(s=>!(prices.get(s.date)?.close>0)||!(prices.get(s.date)?.volume>0)))reason='missing_session_price';
    returns[h]=reason?null:{date:last.date,closeAt:last.closeAt,value:prices.get(last.date).close/entry.open-1};
    outcomes[h]=reason??'complete';
   }
   // Prior returns use six completed closes strictly before the assumed signal availability.
   const prior=marketSessions.filter(s=>Date.parse(s.closeAt)<=Date.parse(assumedAvailableAt)).slice(-6);
   const priorReturn=prior.length===6&&prior.every(s=>prices.get(s.date)?.close>0)&&!actionBetween(prior[1].date,prior.at(-1).date)?prices.get(prior.at(-1).date).close/prices.get(prior[0].date).close-1:null;
   events.push({...evidence,currency,delta:row.delta,entryDate:entrySession.date,entryAt:entrySession.openAt,entryOpen:entry.open,assumedAvailableAt,priorReturn,returns,outcomes,sourceUrl:series.historyUrl});
  }
 }
 const reasons={};for(const x of excluded)reasons[x.reason]=(reasons[x.reason]??0)+1;
 const directionSummary=h=>['increase','decrease'].map(direction=>{const complete=events.filter(e=>(direction==='increase'?e.delta>0:e.delta<0)&&e.returns[h]!==null);return {direction,count:complete.length,mean:complete.length?complete.reduce((sum,e)=>sum+e.returns[h].value,0)/complete.length:null};});
 return {fundSymbol:f.fundSymbol,from,to,cutoffAt:new Date(cutoff).toISOString(),status:market==='US'?'retrospective_us_price_hypothesis':'retrospective_local_price_hypothesis',calendar,events,excluded,reasons,horizons:horizons.map(days=>{const complete=events.filter(e=>e.returns[days]!==null);return {days,complete:complete.length,pending:events.length-complete.length,byDirection:directionSummary(days),mean:complete.length?complete.reduce((sum,e)=>sum+e.returns[days].value,0)/complete.length:null};}),limitations:[...(profile?[profile.note]:[]),'公告日視為台灣時間當日結束後可得，是延遲情境假設，不是已核實首次公開時間或前瞻績效。','採所列市場交易時段與官方預定休市日，不推定個股停牌或臨時停市。缺任何應有交易日不順延。','結果為各市場原幣計價的價格變化，不含匯率、成本及股利；來源已列出的股利或分割落在觀察窗時停算該窗。公司行動覆蓋仍非完整驗收。','樣本重疊、同股票重複事件與事後資料修訂可能造成偏差；不代表經理人動機或可投資策略。']};
}

export function auditUSEvents(f,constituents,settings={}){return auditMarketEvents(f,constituents,{...settings,market:'US'});}
