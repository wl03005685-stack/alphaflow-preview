// Reviewed older observations extend the UI without rewriting the signed daily feed.
export function mergeReviewedHistory(market,history){
 const fail=()=>{throw Error('早期行情與來源核對未通過，暫不提供延長回測。');};
 if(history?.schemaVersion!==1||!Number.isFinite(Date.parse(history.checkedAt))||!history.fundPrices||Array.isArray(history.fundPrices))fail();
 const fundPrices={...market.fundPrices},coverage={};
 const fields=['volume','turnover','open','high','low','close','trades'];
 for(const [symbol,s] of Object.entries(history.fundPrices)){
  if(!['00991A','00992A','00984A','00406A','00407A','00400A','00985A','00980A','00999A'].includes(symbol)||s.symbol!==symbol||s.market!=='TWSE'||!Array.isArray(s.sourceUrls)||!s.sourceUrls.length||!Array.isArray(s.rows)||!s.rows.length)fail();
  const months=new Set();for(const url of s.sourceUrls){let u;try{u=new URL(url);}catch{fail();}if(u.origin!=='https://www.twse.com.tw'||u.pathname!=='/exchangeReport/STOCK_DAY'||u.searchParams.get('stockNo')!==symbol||!/^\d{6}01$/.test(u.searchParams.get('date')??''))fail();months.add(u.searchParams.get('date').slice(0,6));}
  let last='';for(const r of s.rows){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date||r.date<=last||r.date>history.checkedAt.slice(0,10)||!months.has(r.date.slice(0,7).replace('-',''))||!fields.every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>=0)||r.close<=0||r.low>r.high||r.open<r.low||r.open>r.high||r.close<r.low||r.close>r.high)fail();last=r.date;}
  const prior=market.fundPrices?.[symbol];if(!prior?.rows?.length)continue;
  if(prior.market!==s.market)fail();
  const current=new Map(prior.rows.map(r=>[r.date,r]));let overlaps=0;
  for(const r of s.rows){const existing=current.get(r.date);if(existing){overlaps++;if(fields.some(k=>r[k]!==existing[k]))fail();}}
  if(!overlaps)fail();
  const older=s.rows.filter(r=>r.date<prior.rows[0].date);
  fundPrices[symbol]={...prior,sourceUrls:[...new Set([...s.sourceUrls,...prior.sourceUrls])],rows:[...older,...prior.rows]};
  coverage[symbol]={first:fundPrices[symbol].rows[0].date,added:older.length,checkedAt:history.checkedAt};
 }
 return {...market,fundPrices,reviewedHistory:{checkedAt:history.checkedAt,coverage}};
}
