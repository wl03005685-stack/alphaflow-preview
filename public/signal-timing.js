export function resolveSignalTiming(record,calendar,{timingMode='announcement',signalLag=1,priorRecord=null,observationPairMatched=false}={}){
 if(!['announcement','holdings_scenario','observed'].includes(timingMode)||![1,2,3].includes(signalLag))throw Error('Invalid signal timing');
 const announcedOn=record?.announcementDate??null;
 if(timingMode==='observed'){
  const evidence=[priorRecord,record].map(r=>r?.observedEvidence);
  if(evidence.some((e,i)=>!e||typeof e.observedBy!=='string'||!/Z$/.test(e.observedBy)||!Number.isFinite(Date.parse(e.observedBy))||new Date(Date.parse(e.observedBy)+8*3600000).toISOString().slice(0,10)<[priorRecord,record][i].asOf))return {reason:'missing_observation_evidence',announcedOn};
  if(!observationPairMatched)return {reason:'observation_content_mismatch',announcedOn};
  const observedBy=evidence.map(e=>e.observedBy).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1),signalDate=new Date(Date.parse(observedBy)+8*3600000).toISOString().slice(0,10);
  return {announcedOn,signalDate,observedBy,observationEvidence:evidence,timingBasis:'verified_local_observation',entryDate:calendar.find(d=>d>signalDate)??null};
 }
 if(timingMode==='announcement'){
  if(!announcedOn||announcedOn<record.asOf)return {reason:'missing_announcement',announcedOn};
  return {announcedOn,signalDate:announcedOn,timingBasis:'saved_announcement_date',entryDate:calendar.find(d=>d>announcedOn)??null};
 }
 const later=calendar.filter(d=>d>record.asOf);
 return {announcedOn,signalDate:record.asOf,timingBasis:'hypothetical_holdings_lag',signalLag,entryDate:later[signalLag-1]??null};
}
