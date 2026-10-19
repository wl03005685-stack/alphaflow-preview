// Calendar coverage is independent of approval to calculate a price return.
export const PENDING_MARKETS={
 KR:{label:'韓國',currency:'KRW',suffixes:[' KP',' KS'],from:'2026-06-29',through:'2026-09-30',timeZone:'Asia/Seoul',holidays:['2026-07-17','2026-08-17','2026-09-24','2026-09-25'],regularHours:'09:00–15:30',issue:'來源時段標記為 09:00–15:00，與 KRX 正常收盤 15:30 不符；尚未證明歷史日行情是否包含完整收盤。',next:'逐日對照 KRX 歷史開收盤與成交量，確認來源時段標記是否過時。單日收盤抽查相符不足以啟用全部歷史。',sources:['https://global.krx.co.kr/contents/GLB/06/0602/0602010201/GLB0602010201T1.jsp','https://global.krx.co.kr/contents/GLB/06/0602/0602020204/GLB0602020204T1.jsp','https://www.kasi.re.kr/kor/post/newsMaterial/32031','https://www.mofa.go.kr/us-newyork-ko/brd/m_4237/view.do?seq=1348072']},
 DE:{label:'德國',currency:'EUR',suffixes:[' GR',' GY'],from:'2026-06-29',through:'2026-09-30',timeZone:'Europe/Berlin',holidays:[],regularHours:'09:00–17:30',issue:'來源正常時段標記吻合 Xetra，但不能據此證明歷史日行情是否包含延長零售交易至 22:00。IFX GR 的原持股成交場所也未確認。',next:'核對日行情開收盤的交易時段定義、補九月二十八日缺價，並獨立核對 IFX GR 場所。',sources:['https://www.cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours']}
};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function pendingMarketDay(market,date){
 const p=PENDING_MARKETS[market];if(!p||!validDate(date))throw Error('Invalid calendar request');
 if(date<p.from||date>p.through)return {date,known:false};
 return {date,known:true,open:![0,6].includes(new Date(date).getUTCDay())&&!p.holidays.includes(date)};
}
export function auditPendingMarkets(f,constituents,{from='2026-06-29',to='2026-09-29'}={}){
 if(!validDate(from)||!validDate(to)||from>to)throw Error('Invalid review interval');
 return Object.entries(PENDING_MARKETS).map(([market,p])=>{
  const matches=s=>p.suffixes.some(suffix=>s.endsWith(suffix));
  const events=f.pairs.filter(pair=>pair.to>=from&&pair.to<=to).flatMap(pair=>pair.rows.filter(r=>r.delta&&matches(r.symbol)).map(r=>({symbol:r.symbol,holdingDate:pair.to,delta:r.delta,status:'session_scope_unverified'})));
  const symbols=[...new Set(f.pairs.filter(pair=>pair.to<=to).flatMap(pair=>pair.rows.filter(r=>matches(r.symbol)).map(r=>r.symbol)))];
  const dates=[];for(let t=Date.parse(p.from>from?p.from:from);t<=Date.parse(p.through<to?p.through:to);t+=86400000){const date=new Date(t).toISOString().slice(0,10);if(pendingMarketDay(market,date).open)dates.push(date);}
  const listings=symbols.map(symbol=>{const s=constituents[symbol],rows=new Map((s?.rows??[]).map(r=>[r.date,r]));return {symbol,providerSymbol:s?.providerSymbol??null,currency:s?.currency??p.currency,missingDates:dates.filter(d=>!rows.has(d)),unexpectedDates:(s?.rows??[]).filter(r=>r.date>=from&&r.date<=to&&pendingMarketDay(market,r.date).known&&!pendingMarketDay(market,r.date).open).map(r=>r.date),mappingNote:s?.mappingNote??null,historyUrl:s?.historyUrl??null};});
  return {market,label:p.label,from,to,calendarFrom:p.from,calendarThrough:p.through,calendarStatus:'scheduled_days_reviewed',priceStudyStatus:'session_scope_unverified',eligibleEvents:0,events,listings,expectedDays:dates.length,issue:p.issue,next:p.next,sources:p.sources};
 });
}
