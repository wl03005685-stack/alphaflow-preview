import {publicFetch as fetch} from './preview-client.js';
// Overseas observations are a separately reviewed research snapshot, never a
// replacement for the collector's signed TWSE/TPEx observations.
export function validateOverseasData(data){
 const fail=()=>{throw Error('Invalid overseas research data');};
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(data?.schemaVersion!==1||data.provider!=='Yahoo Finance'||!Number.isFinite(Date.parse(data.generatedAt))||!data.constituents||Array.isArray(data.constituents))fail();
 for(const [symbol,s] of Object.entries(data.constituents)){
  if(!/^[A-Z0-9.-]+ (US|JP|KP|KS|HK|CH|GR|GY)$/.test(symbol)||s.symbol!==symbol||s.researchOnly!==true||s.instrumentType!=='EQUITY'||!s.providerSymbol||!s.providerName||!s.currency||!s.timeZone||!s.exchange||!/^[a-f0-9]{64}$/.test(s.captureSha256??''))fail();
  try{new Intl.DateTimeFormat('en',{timeZone:s.timeZone});}catch{fail();}
  if(s.sameDayFinalized){
   if(!['JPX','KSC','KOE','HKG','SHZ','NMS','NGM','NCM','NYQ'].includes(s.exchange)||!Number.isFinite(Date.parse(s.capturedAt)))fail();
   const d=new Intl.DateTimeFormat('en-CA',{timeZone:s.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.capturedAt));
   const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:s.timeZone,hour:'2-digit',hourCycle:'h23'}).format(new Date(s.capturedAt)));
   const minimum=['NMS','NGM','NCM','NYQ'].includes(s.exchange)?17:21;
   if(d!==s.localDateAtCapture||h<minimum)fail();
  }
  const unfinished=date=>date>s.localDateAtCapture||(date===s.localDateAtCapture&&!s.sameDayFinalized);
  const url=new URL(s.sourceUrl);if(url.origin!=='https://query1.finance.yahoo.com'||url.pathname!=='/v8/finance/chart/'+encodeURIComponent(s.providerSymbol))fail();
  if(s.historyUrl!=='https://finance.yahoo.com/quote/'+encodeURIComponent(s.providerSymbol)+'/history/')fail();
  if(!Array.isArray(s.rows)||!s.rows.length)fail();
  let previous='';for(const r of s.rows){
   if(!date(r.date)||r.date<=previous||unfinished(r.date)||!['open','high','low','close','volume'].every(k=>Number.isFinite(r[k])&&r[k]>=0)||r.low<=0||r.low>r.high||r.open<r.low||r.open>r.high||r.close<r.low||r.close>r.high||r.adjustedClose!==null&&!(Number.isFinite(r.adjustedClose)&&r.adjustedClose>0))fail();
   previous=r.date;
  }
  if(!date(s.localDateAtCapture)||!Array.isArray(s.dividends)||!Array.isArray(s.splits)||!Array.isArray(s.missingRows))fail();
  for(const r of s.missingRows)if(!date(r.date)||unfinished(r.date)||s.rows.some(x=>x.date===r.date))fail();
  for(const d of s.dividends)if(!date(d.date)||!Number.isFinite(d.amount)||d.amount<0)fail();
  for(const d of s.splits)if(!date(d.date)||!Number.isFinite(d.ratio)||d.ratio<=0)fail();
 }
 return data;
}
export function mergeOverseasData(market,data){
 validateOverseasData(data);
 for(const symbol of Object.keys(data.constituents))if(Object.hasOwn(market.constituents,symbol))throw Error('Overseas data must not replace existing observations');
 return {...market,constituents:{...market.constituents,...data.constituents},overseas:{generatedAt:data.generatedAt,provider:data.provider,limitations:data.limitations,refreshMode:data.refreshMode}};
}
export async function loadMarketData(fetcher=fetch){
 const response=await fetcher('/market-data.json',{cache:'no-store'});if(!response.ok)throw Error('Market data unavailable');
 const market=await response.json();
 try{const overseas=await fetcher('/overseas-market-data.json',{cache:'no-store'});if(!overseas.ok)throw Error();return mergeOverseasData(market,await overseas.json());}
 catch{return {...market,overseas:{unavailable:true}};}
}

