// Published annual schedule plus explicitly evidenced full-day closures.
// Never infer other emergency closures from absent price observations.
export const TWSE_CALENDAR_SOURCE='https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=html';
export const TWSE_CALENDAR_REVIEWED_ON='2026-09-25';
export const TWSE_REVIEWED_CLOSURES=Object.freeze([Object.freeze({
 date:'2026-10-23',reason:'薔琵颱風全日休市',announcedOn:'2026-10-22',reviewedOn:'2026-10-27',
 sourceUrl:'https://www.twse.com.tw/staticFiles/news/news/tsecnews/8a8216d6a0fa351b01a1638507940202.pdf',
 tpexRuleUrl:'https://www.tpex.org.tw/storage/eb_data/11205/112005916711-1.pdf'
})]);
const holidays2026={
 '01-01':'開國紀念日','02-12':'僅辦理結算交割','02-13':'僅辦理結算交割',
 '02-15':'春節','02-16':'春節','02-17':'春節','02-18':'春節','02-19':'春節','02-20':'春節補假',
 '02-27':'和平紀念日補假','02-28':'和平紀念日','04-03':'兒童節補假','04-04':'兒童節','04-05':'清明節','04-06':'清明節補假',
 '05-01':'勞動節','06-19':'端午節','09-25':'中秋節','09-28':'教師節','10-09':'國慶日補假','10-10':'國慶日',
 '10-25':'光復節','10-26':'光復節補假','12-25':'行憲紀念日'
};
export function twseSession(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Invalid calendar date');
 if(date.slice(0,4)!=='2026')return {known:false,open:null,reason:'年度日曆尚未核對'};
 const closure=TWSE_REVIEWED_CLOSURES.find(row=>row.date===date);
 if(closure)return {known:true,open:false,reason:closure.reason,sourceUrl:closure.sourceUrl};
 const holiday=holidays2026[date.slice(5)],weekend=[0,6].includes(new Date(date+'T00:00:00Z').getUTCDay());
 return {known:true,open:!holiday&&!weekend,reason:holiday??(weekend?'週末':'預定交易日')};
}
export function domesticDateTarget(now=new Date()){
 const local=new Date(now.getTime()+8*3600000),today=local.toISOString().slice(0,10),session=twseSession(today);
 let targetAsOf=null;
 if(session.known){for(let i=0;i<32;i++){const candidate=new Date(local.getTime()-i*86400000).toISOString().slice(0,10),state=twseSession(candidate);if(!state.known)break;if(state.open){targetAsOf=candidate;break;}}}
 const closures=targetAsOf?TWSE_REVIEWED_CLOSURES.filter(row=>row.date>targetAsOf&&row.date<=today):[];
 return {today,targetAsOf,closedToday:session.open===false,known:session.known,reason:session.reason,afterCollectionTime:local.getUTCHours()*60+local.getUTCMinutes()>=21*60+30,sourceUrl:TWSE_CALENDAR_SOURCE,reviewedOn:TWSE_CALENDAR_REVIEWED_ON,closures,limitation:'年度日曆與已核對的臨時休市；其他臨時變動、個股停牌及海外市場須另行核對'};
}
