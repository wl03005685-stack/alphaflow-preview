export const THIRD_PARTY_00406A_SOURCE_ID='zdsetf.public.holdings';
export const THIRD_PARTY_00406A_URL='https://zdsetf.com/etf/00406A';
export const THIRD_PARTY_DATE_RULE='user_authorized_display_date_minus_one_calendar_day';
export const THIRD_PARTY_GLOBAL_DATE_RULE='source_explicit_holdings_date_no_offset';
const SUPPORTED_FUNDS=new Set(['00406A','00988A','00990A']);

// This feed deliberately stays outside the official snapshot catalog. Its date
// follows the user's provisional rule, and unknown fund totals stay unknown.
export function validateThirdPartyHoldings(input,{now=Date.now()}={}){
 const fail=message=>{throw Object.assign(new Error('Invalid third-party holdings: '+message),{status:422});};
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 if(input===undefined)return {};
 if(!object(input)||Object.keys(input).some(s=>!SUPPORTED_FUNDS.has(s)))fail('unsupported fund');
 const limit=Number(new Date(now));if(!Number.isFinite(limit))fail('invalid validation time');
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const out={};
 for(const [symbol,group] of Object.entries(input)){
  const provisionalFund=symbol==='00406A';
  if(!object(group)||group.schemaVersion!==1||group.fundSymbol!==symbol||group.sourceId!==THIRD_PARTY_00406A_SOURCE_ID||group.source!=='zdsetf.com'||group.sourceUrl!==`https://zdsetf.com/etf/${symbol}`||group.coverage!=='full_equity'||group.sharesBasis!=='actual_shares')fail('source or coverage');
  if(!Array.isArray(group.series)||!group.series.length||group.series.length>5000)fail('empty or oversized series');
  const seenDates=new Set();
  const series=group.series.map(s=>{
   if(!object(s)||!day(s.asOf)||!day(s.sourceDisplayedDate))fail('date');
   if(provisionalFund){
    const provisional=new Date(Date.parse(s.sourceDisplayedDate+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    if(s.asOf!==s.provisionalAsOf||s.asOf!==provisional||s.dateRule!==THIRD_PARTY_DATE_RULE||s.dateRuleConfirmedBySource!==false||s.dateConfidence!=='user_authorized_provisional')fail('provisional date rule');
   }else if(s.provisionalAsOf!==null||s.asOf!==s.sourceDisplayedDate||s.dateRule!==THIRD_PARTY_GLOBAL_DATE_RULE||s.dateRuleConfirmedBySource!==true||s.dateConfidence!=='source_labeled_holdings_date')fail('explicit source date rule');
   const retrieved=Date.parse(s.retrievedAt);
   if(typeof s.retrievedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s.retrievedAt)||!Number.isFinite(retrieved)||retrieved>limit+60000)fail('retrieval time');
   const retrievedDay=new Date(retrieved+8*3600000).toISOString().slice(0,10);
   if(s.asOf>retrievedDay)fail('future source date');
   const sourceDateAhead=s.sourceDisplayedDate>retrievedDay;
   if(seenDates.has(s.asOf))fail('duplicate date');seenDates.add(s.asOf);
   if(!(provisionalFund?['user_offset_unverified','user_offset_content_matched','same_date_official_verified','date_conflict']:['source_labeled']).includes(s.dateStatus))fail('date status');
   const weekend=[0,6].includes(new Date(s.asOf+'T00:00:00Z').getUTCDay());
   if(s.calendarReview!==(weekend?'weekend_requires_review':'holiday_status_not_verified'))fail('calendar marker');
   if(s.fundUnits!==null||s.netAssetsTwd!==null)fail('unknown fund totals must remain null');
   if(!/^[a-f0-9]{64}$/.test(s.sha256??''))fail('source hash');
   if(!Array.isArray(s.holdings)||s.holdings.length<1||s.holdings.length>2000||s.rowCount!==s.holdings.length)fail('row count');
   const seen=new Set();let total=0;
   const holdings=s.holdings.map(h=>{
    const symbolPattern=provisionalFund?/^\d{4}$/:/^(?:\d{4,6}|[A-Z0-9][A-Z0-9.:-]{0,24} (?:US|JP|KS|KP|HK|CH|LN|GR|FP|NA|AU|CN|SP|SW|CA))$/;
    if(!object(h)||!symbolPattern.test(h.symbol??'')||seen.has(h.symbol))fail('duplicate or invalid stock');seen.add(h.symbol);
    if(typeof h.name!=='string'||!h.name.trim()||h.name.length>200||!Number.isSafeInteger(h.shares)||h.shares<0||typeof h.weightPercent!=='number'||!Number.isFinite(h.weightPercent)||h.weightPercent<0||h.weightPercent>100)fail('holding values');
    total+=h.weightPercent;return {symbol:h.symbol,name:h.name,shares:h.shares,weightPercent:h.weightPercent};
   }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
   if(total>101)fail('weight total');
   if(!Array.isArray(s.contentMatchesOfficialDates)||s.contentMatchesOfficialDates.some(d=>!day(d)))fail('content match dates');
   return {asOf:s.asOf,provisionalAsOf:s.provisionalAsOf,sourceDisplayedDate:s.sourceDisplayedDate,sourceDateAhead,retrievedAt:s.retrievedAt,dateConfidence:s.dateConfidence,dateRule:s.dateRule,dateRuleConfirmedBySource:s.dateRuleConfirmedBySource,dateStatus:s.dateStatus,calendarReview:s.calendarReview,rowCount:holdings.length,holdings,fundUnits:null,netAssetsTwd:null,sha256:s.sha256,contentMatchesOfficialDates:[...new Set(s.contentMatchesOfficialDates)].sort()};
  }).sort((a,b)=>a.asOf.localeCompare(b.asOf));
  out[symbol]={schemaVersion:1,fundSymbol:symbol,sourceId:group.sourceId,source:group.source,sourceUrl:group.sourceUrl,coverage:'full_equity',sharesBasis:'actual_shares',series};
 }
 return out;
}

export function validateThirdPartyHoldingsAppend(before,after,options){
 const prior=validateThirdPartyHoldings(before,options),next=validateThirdPartyHoldings(after,options);
 for(const [symbol,group] of Object.entries(prior))for(const old of group.series){
  const fresh=next[symbol]?.series.find(s=>s.asOf===old.asOf);
  if(!fresh||Date.parse(fresh.retrievedAt)<Date.parse(old.retrievedAt)||(Date.parse(fresh.retrievedAt)===Date.parse(old.retrievedAt)&&JSON.stringify(fresh)!==JSON.stringify(old)))throw Object.assign(new Error('Cannot remove or regress third-party holdings history'),{status:409});
 }
 return next;
}
