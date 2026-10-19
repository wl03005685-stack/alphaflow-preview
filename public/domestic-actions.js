// Until delivery is reconciled, share-count changes may be distributions rather than trades.
export function unresolvedShareActions(symbol,pair,data){
 return (data?.records??[]).filter(a=>a.symbol===symbol&&a.cash===null&&a.date<=pair.to&&(!a.availabilityDate||a.availabilityDate>pair.from));
}
export function auditStrategyActions(result,data){
 const impacts=[];
 for(const a of data.records){
  if(a.date<=result.from||a.date>result.to)continue;
  const previous=result.curve.filter(p=>p.date<a.date).at(-1),held=previous?.holdings.find(p=>p.symbol===a.symbol);
  if(held)impacts.push({...a,shares:held.shares,cashEntitlement:a.cash===null?null:held.shares*a.cash});
 }
 const knownCashEntitlement=impacts.reduce((n,a)=>n+(a.cashEntitlement??0),0),blocked=impacts.some(a=>a.cash===null),rangeCovered=result.from>=data.from&&result.to<=data.through;
 return {rangeCovered,coverageFrom:data.from,coverageThrough:data.through,scope:data.scope,impacts,blocked,knownCashEntitlement,knownCashAdjustedEnding:blocked||!rangeCovered?null:result.ending+knownCashEntitlement,knownCashAdjustedReturn:blocked||!rangeCovered?null:(result.ending+knownCashEntitlement)/result.capital-1,method:'Known cash rights accrued on ex-date to prior-day holdings; never reinvested; payment dates unverified. Rights require separate share delivery validation.'};
}
export function guardEventActions(audit,data,calendar){
 for(const e of audit.events){
  const actions=data.records.filter(a=>a.symbol===e.symbol),index=calendar.indexOf(e.entryDate),prior=calendar.slice(Math.max(0,index-6),index);
  e.corporateActionExclusions=[];
  if(prior.length&&actions.some(a=>a.date>prior[0]&&a.date<=prior.at(-1))){e.priorReturn=null;e.priorReturnStatus='corporate_action_unadjusted';}
  for(const [h,r] of Object.entries(e.returns)){if(!r)continue;const affected=actions.filter(a=>a.date>e.entryDate&&a.date<=r.date);if(affected.length){e.corporateActionExclusions.push({horizon:Number(h),actions:affected,reason:'corporate_action_unadjusted'});e.returns[h]=null;}}
 }
 return audit;
}
